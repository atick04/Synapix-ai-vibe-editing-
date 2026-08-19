from __future__ import annotations

import contextvars
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Header, HTTPException, Request, status

from app.auth.config import (
    SESSION_COOKIE_NAME,
    allow_legacy_jwt,
    allow_legacy_project_claim,
)
from app.auth.passwords import hash_password, normalize_email, valid_email, verify_password
from app.auth.sessions import session_is_active
from app.auth.tokens import decode_access_token

current_user_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_user_id", default=None
)


def _now() -> str:
    return datetime.utcnow().isoformat()


def _public_user(user: dict) -> dict:
    from app.billing.entitlements import has_paid_plan

    paid = has_paid_plan(user)
    status = (user.get("plan_status") or "none").lower()
    if paid and status not in ("active", "trialing", "unlimited"):
        status = "unlimited"
    plan = user.get("plan") or "free"
    if paid and plan in ("", "free", None):
        plan = "pro"
    return {
        "id": user.get("id"),
        "email": user.get("email") or "",
        "name": user.get("name") or user.get("login") or "",
        "picture": user.get("picture") or "",
        "auth": user.get("auth") or ("google" if user.get("google_sub") else "password"),
        "login": user.get("login") or user.get("email") or "",
        "brand_id": user.get("id"),
        "company": user.get("company") or "",
        "bio": user.get("bio") or "",
        "has_password": bool(user.get("password_hash")),
        "email_verified": bool(user.get("google_sub")) or user.get("email_verified") is not False,
        "tokens_used": int(user.get("tokens_used") or 0),
        "registered_at": user.get("registered_at"),
        "plan": plan,
        "plan_status": status,
        "plan_renews_at": user.get("plan_renews_at") or "",
        "has_subscription": bool(user.get("dodo_subscription_id")) or paid,
        "free_project_id": user.get("free_project_id") or "",
        "free_reel_available": paid or not user.get("free_project_id"),
    }


def upsert_google_user(idinfo: dict) -> dict:
    from app.api.admin import store_edit

    sub = idinfo.get("sub")
    email = (idinfo.get("email") or "").strip().lower()
    if not sub or not email:
        raise HTTPException(status_code=400, detail="google_profile_incomplete")
    if idinfo.get("email_verified") is False:
        raise HTTPException(status_code=403, detail="google_email_unverified")

    with store_edit() as store:
        store.setdefault("users", [])
        store.setdefault("projects", [])

        user = next((u for u in store["users"] if u.get("google_sub") == sub), None)
        if not user and email:
            user = next(
                (u for u in store["users"] if (u.get("email") or "").lower() == email),
                None,
            )

        now = _now()
        if not user:
            user = {
                "id": f"usr_{uuid.uuid4().hex[:16]}",
                "google_sub": sub,
                "email": email,
                "name": idinfo.get("name") or email.split("@")[0],
                "picture": idinfo.get("picture") or "",
                "login": email,
                "auth": "google",
                "email_verified": True,
                "status": "active",
                "tokens_used": 0,
                "registered_at": now,
                "last_seen_at": now,
            }
            store["users"].append(user)
        else:
            if not user.get("id"):
                user["id"] = f"usr_{uuid.uuid4().hex[:16]}"
            user["google_sub"] = sub
            user["email"] = email
            user["name"] = idinfo.get("name") or user.get("name") or email.split("@")[0]
            user["picture"] = idinfo.get("picture") or user.get("picture") or ""
            user["login"] = email
            user["auth"] = "google"
            user["email_verified"] = True
            user["status"] = user.get("status") or "active"
            user["last_seen_at"] = now
            user.setdefault("tokens_used", 0)
            user.setdefault("registered_at", now)
        return dict(user)


def register_password_user(email: str, password: str, name: str = "") -> dict:
    from app.api.admin import store_edit

    email = normalize_email(email)
    if not valid_email(email):
        raise HTTPException(status_code=400, detail="invalid_email")
    if len(password or "") < 8:
        raise HTTPException(status_code=400, detail="password_too_short")
    if len(password) > 128:
        raise HTTPException(status_code=400, detail="password_too_long")

    display = (name or "").strip() or email.split("@")[0]
    now = _now()
    with store_edit() as store:
        store.setdefault("users", [])
        existing = next(
            (u for u in store["users"] if (u.get("email") or "").lower() == email),
            None,
        )
        if existing:
            google_only = bool(existing.get("google_sub")) and not existing.get("password_hash")
            pending_signup = existing.get("email_verified") is False and not existing.get("google_sub")
            if google_only:
                existing["pending_password_hash"] = hash_password(password)
                if display:
                    existing["name"] = display
                existing["last_seen_at"] = now
                return dict(existing)
            if pending_signup:
                existing["name"] = display
                existing["password_hash"] = hash_password(password)
                existing["status"] = "pending"
                existing["email_verified"] = False
                existing["last_seen_at"] = now
                return dict(existing)
            raise HTTPException(status_code=409, detail="email_taken")
        user = {
            "id": f"usr_{uuid.uuid4().hex[:16]}",
            "email": email,
            "name": display,
            "login": email,
            "picture": "",
            "auth": "password",
            "password_hash": hash_password(password),
            "email_verified": False,
            "status": "pending",
            "tokens_used": 0,
            "registered_at": now,
            "last_seen_at": now,
        }
        store["users"].append(user)
        return dict(user)


def authenticate_password_user(email: str, password: str) -> dict:
    from app.api.admin import load_store

    email = normalize_email(email)
    store = load_store()
    user = next(
        (u for u in store.get("users") or [] if (u.get("email") or "").lower() == email),
        None,
    )
    if not user:
        raise HTTPException(status_code=403, detail="invalid_credentials")
    if user.get("status") == "pending" or user.get("email_verified") is False:
        raise HTTPException(status_code=403, detail="email_unverified")
    if user.get("status") and user["status"] not in ("active",):
        raise HTTPException(status_code=403, detail="account_disabled")
    stored = user.get("password_hash") or ""
    if not stored:
        if user.get("google_sub"):
            raise HTTPException(status_code=403, detail="account_exists_google")
        raise HTTPException(status_code=403, detail="invalid_credentials")
    if not verify_password(password or "", stored):
        raise HTTPException(status_code=403, detail="invalid_credentials")
    _touch_user(user)
    return user


def confirm_user_email(email: str) -> dict:
    from app.api.admin import store_edit

    email = normalize_email(email)
    with store_edit() as store:
        user = next(
            (u for u in store.get("users") or [] if (u.get("email") or "").lower() == email),
            None,
        )
        if not user:
            raise HTTPException(status_code=403, detail="invalid_code")
        pending = user.pop("pending_password_hash", None)
        if pending:
            user["password_hash"] = pending
        user["email_verified"] = True
        user["status"] = "active"
        user["last_seen_at"] = _now()
        return dict(user)


def update_user_profile(
    user_id: str,
    *,
    name: Optional[str] = None,
    email: Optional[str] = None,
    company: Optional[str] = None,
    bio: Optional[str] = None,
    current_password: Optional[str] = None,
    new_password: Optional[str] = None,
) -> dict:
    from app.api.admin import store_edit

    with store_edit() as store:
        user = next((u for u in store.get("users") or [] if u.get("id") == user_id), None)
        if not user:
            raise HTTPException(status_code=403, detail="session_invalid")

        if name is not None:
            cleaned = name.strip()
            if not cleaned:
                raise HTTPException(status_code=400, detail="name_required")
            if len(cleaned) > 80:
                raise HTTPException(status_code=400, detail="name_too_long")
            user["name"] = cleaned

        if email is not None:
            next_email = normalize_email(email)
            if not valid_email(next_email):
                raise HTTPException(status_code=400, detail="invalid_email")
            if user.get("google_sub") and next_email != (user.get("email") or "").lower():
                raise HTTPException(status_code=400, detail="google_email_locked")
            taken = next(
                (
                    u
                    for u in store.get("users") or []
                    if u.get("id") != user_id and (u.get("email") or "").lower() == next_email
                ),
                None,
            )
            if taken:
                raise HTTPException(status_code=409, detail="email_taken")
            user["email"] = next_email
            user["login"] = next_email

        if company is not None:
            user["company"] = company.strip()[:120]
        if bio is not None:
            user["bio"] = bio.strip()[:280]

        if new_password:
            if len(new_password) < 8:
                raise HTTPException(status_code=400, detail="password_too_short")
            if len(new_password) > 128:
                raise HTTPException(status_code=400, detail="password_too_long")
            stored = user.get("password_hash") or ""
            if stored and not verify_password(current_password or "", stored):
                raise HTTPException(status_code=403, detail="invalid_credentials")
            user["password_hash"] = hash_password(new_password)
            if user.get("auth") != "google":
                user["auth"] = "password"

        return dict(user)


def _touch_user(user: dict) -> None:
    last = user.get("last_seen_at")
    if last:
        try:
            if datetime.utcnow() - datetime.fromisoformat(last) < timedelta(seconds=60):
                return
        except ValueError:
            pass
    from app.api.admin import store_edit

    with store_edit() as store:
        row = next((u for u in store.get("users") or [] if u.get("id") == user.get("id")), None)
        if row:
            row["last_seen_at"] = _now()


def user_by_id(user_id: str) -> Optional[dict]:
    from app.api.admin import load_store

    store = load_store()
    return next((u for u in store.get("users") or [] if u.get("id") == user_id), None)


def register_project(user: dict, file_id: str, filename: str) -> None:
    from app.api.admin import store_edit

    with store_edit() as store:
        store.setdefault("projects", [])
        now = _now()
        existing = next((p for p in store["projects"] if p.get("id") == file_id), None)
        if existing:
            if not existing.get("owner_id"):
                existing["owner_id"] = user["id"]
            existing["filename"] = filename or existing.get("filename")
            existing["updated_at"] = now
        else:
            store["projects"].append(
                {
                    "id": file_id,
                    "owner_id": user["id"],
                    "filename": filename,
                    "created_at": now,
                    "updated_at": now,
                }
            )


def list_user_projects(user_id: str) -> list:
    from app.api.admin import load_store

    store = load_store()
    items = [p for p in store.get("projects") or [] if p.get("owner_id") == user_id]
    items.sort(key=lambda p: p.get("updated_at") or p.get("created_at") or "", reverse=True)
    return items


def _project_files_exist(file_id: str) -> bool:
    try:
        from app.core.paths import UPLOAD_DIR

        root = Path(UPLOAD_DIR)
    except Exception:
        root = Path("uploads")
    if not file_id or not root.exists():
        return False
    return any(root.glob(f"{file_id}*"))


def assert_project_access(file_id: str, user: dict) -> None:
    if not file_id or not user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="project_forbidden")

    from app.api.admin import load_store, store_edit

    store = load_store()
    project = next((p for p in store.get("projects") or [] if p.get("id") == file_id), None)

    if project and project.get("owner_id"):
        if project["owner_id"] != user.get("id"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="project_forbidden")
        return

    if project is None and not (allow_legacy_project_claim() and _project_files_exist(file_id)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")
    if project is not None and not allow_legacy_project_claim():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="project_forbidden")

    with store_edit() as editable:
        editable.setdefault("projects", [])
        row = next((p for p in editable["projects"] if p.get("id") == file_id), None)
        if row and row.get("owner_id"):
            if row["owner_id"] != user.get("id"):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="project_forbidden")
            return
        if row is None:
            if allow_legacy_project_claim() and _project_files_exist(file_id):
                editable["projects"].append(
                    {
                        "id": file_id,
                        "owner_id": user["id"],
                        "filename": file_id,
                        "created_at": _now(),
                        "updated_at": _now(),
                        "legacy": True,
                    }
                )
                return
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")
        if allow_legacy_project_claim() and not row.get("owner_id"):
            row["owner_id"] = user["id"]
            row["updated_at"] = _now()
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="project_forbidden")


def _user_from_token(token: str) -> dict:
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="session_invalid")

    jti = payload.get("jti")
    if jti:
        if not session_is_active(jti, payload["sub"]):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="session_invalid")
    elif not allow_legacy_jwt():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="session_invalid")

    user = user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="session_invalid")
    _touch_user(user)
    return user


def resolve_current_user(
    authorization: Optional[str] = None,
    cookie_token: Optional[str] = None,
) -> dict:
    bearer = ""
    if authorization and isinstance(authorization, str) and authorization.lower().startswith("bearer "):
        bearer = authorization.split(" ", 1)[1].strip()

    token = bearer or (cookie_token or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="auth_required")

    user = _user_from_token(token)
    if user.get("status") and user["status"] not in ("active",):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="account_disabled")

    current_user_id_var.set(user["id"])
    return _public_user(user)


def try_resolve_user(request: Request) -> Optional[dict]:
    try:
        return resolve_current_user(
            request.headers.get("authorization"),
            request.cookies.get(SESSION_COOKIE_NAME),
        )
    except HTTPException:
        return None


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
) -> dict:
    return resolve_current_user(authorization, request.cookies.get(SESSION_COOKIE_NAME))
