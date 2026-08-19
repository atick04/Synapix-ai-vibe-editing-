import logging
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.auth.config import (
    SESSION_COOKIE_NAME,
    cookie_domain,
    cookie_samesite,
    cookie_secure,
    login_rate_limit,
    session_days,
)
from app.auth.deps import (
    _public_user,
    authenticate_password_user,
    confirm_user_email,
    get_current_user,
    list_user_projects,
    register_password_user,
    update_user_profile,
    upsert_google_user,
)
from app.auth.mail import send_verification_code
from app.auth.passwords import normalize_email, valid_email
from app.auth.sessions import create_session, revoke_session
from app.auth.tokens import create_access_token, decode_access_token
from app.auth.verify import issue_email_code, reveal_dev_code, verify_email_code

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])

_login_hits: dict[str, deque[float]] = defaultdict(deque)


class GoogleLoginRequest(BaseModel):
    id_token: str


class PasswordAuthRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class EmailCodeRequest(BaseModel):
    email: str
    code: str = ""


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    company: str | None = None
    bio: str | None = None
    current_password: str | None = None
    new_password: str | None = None


def _google_client_id() -> str:
    import os

    return (os.getenv("GOOGLE_CLIENT_ID") or os.getenv("NEXT_PUBLIC_GOOGLE_CLIENT_ID") or "").strip()


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def _enforce_login_rate(request: Request) -> None:
    limit, window = login_rate_limit()
    ip = _client_ip(request)
    now = time.time()
    bucket = _login_hits[ip]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(status_code=429, detail="login_rate_limited")
    bucket.append(now)


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=session_days() * 24 * 60 * 60,
        httponly=True,
        secure=cookie_secure(),
        samesite=cookie_samesite(),
        domain=cookie_domain(),
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        domain=cookie_domain(),
        secure=cookie_secure(),
        httponly=True,
        samesite=cookie_samesite(),
    )


def issue_session(response: Response, user: dict) -> dict:
    sid = create_session(user["id"])
    token = create_access_token(user, jti=sid)
    set_session_cookie(response, token)
    return _public_user(user)


def verify_google_id_token(token: str) -> dict:
    client_id = _google_client_id()
    if not client_id:
        raise HTTPException(status_code=500, detail="google_client_id_missing")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="google_auth_not_installed") from exc

    try:
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=client_id,
            clock_skew_in_seconds=600,
        )
    except TypeError:
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), audience=client_id)
    except Exception as exc:
        logger.warning("Google token verify failed: %s", exc)
        raise HTTPException(status_code=403, detail="google_token_invalid") from exc

    if idinfo.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=403, detail="google_token_invalid")
    return idinfo


@router.get("/config")
async def auth_config():
    client_id = _google_client_id()
    from app.auth.mail import mail_configured

    return {
        "google_client_id": client_id,
        "google_enabled": bool(client_id),
        "cookie_auth": True,
        "mail_configured": mail_configured(),
    }


@router.post("/google")
async def login_with_google(req: GoogleLoginRequest, request: Request, response: Response):
    _enforce_login_rate(request)
    try:
        idinfo = verify_google_id_token(req.id_token)
        user = upsert_google_user(idinfo)
        public = issue_session(response, user)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Google login failed")
        raise HTTPException(status_code=500, detail="google_login_failed") from exc
    return {
        "user": public,
        "created": user.get("registered_at") == user.get("last_seen_at"),
    }


def _send_signup_code(email: str) -> str:
    code = issue_email_code(email)
    try:
        send_verification_code(email, code)
    except Exception:
        logger.exception("Failed to send verification email to %s", email)
        raise HTTPException(status_code=500, detail="email_send_failed")
    return code


@router.post("/register")
async def register_with_password(req: PasswordAuthRequest, request: Request):
    _enforce_login_rate(request)
    register_password_user(req.email, req.password, req.name)
    email = normalize_email(req.email)
    code = _send_signup_code(email)
    payload = {
        "pending": True,
        "email": email,
        "created": True,
    }
    dev_code = reveal_dev_code(code)
    if dev_code:
        payload["dev_code"] = dev_code
    return payload


@router.post("/verify-email")
async def verify_signup_email(req: EmailCodeRequest, request: Request, response: Response):
    _enforce_login_rate(request)
    email = normalize_email(req.email)
    if not valid_email(email):
        raise HTTPException(status_code=400, detail="invalid_email")
    verify_email_code(email, req.code)
    user = confirm_user_email(email)
    return {"user": issue_session(response, user), "created": True}


@router.post("/resend-code")
async def resend_verification_code(req: EmailCodeRequest, request: Request):
    _enforce_login_rate(request)
    email = normalize_email(req.email)
    if not valid_email(email):
        raise HTTPException(status_code=400, detail="invalid_email")
    from app.api.admin import load_store

    store = load_store()
    user = next((u for u in store.get("users") or [] if (u.get("email") or "").lower() == email), None)
    linking = bool(user and user.get("pending_password_hash"))
    unverified = bool(user and user.get("email_verified") is False)
    if not user or (not linking and not unverified):
        return {"ok": True, "email": email}
    code = _send_signup_code(email)
    payload = {"ok": True, "email": email}
    dev_code = reveal_dev_code(code)
    if dev_code:
        payload["dev_code"] = dev_code
    return payload


@router.post("/login")
async def login_with_password(req: PasswordAuthRequest, request: Request, response: Response):
    _enforce_login_rate(request)
    user = authenticate_password_user(req.email, req.password)
    return {"user": issue_session(response, user), "created": False}


@router.get("/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return {"user": user}


@router.patch("/profile")
async def auth_update_profile(req: ProfileUpdateRequest, user: dict = Depends(get_current_user)):
    updated = update_user_profile(
        user["id"],
        name=req.name,
        email=req.email,
        company=req.company,
        bio=req.bio,
        current_password=req.current_password,
        new_password=req.new_password,
    )
    return {"user": _public_user(updated)}


@router.get("/projects")
async def auth_projects(user: dict = Depends(get_current_user)):
    return {"projects": list_user_projects(user["id"])}


@router.post("/logout")
async def auth_logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE_NAME) or ""
    payload = decode_access_token(token) if token else None
    if payload and payload.get("jti"):
        revoke_session(payload["jti"])
    clear_session_cookie(response)
    return {"ok": True}
