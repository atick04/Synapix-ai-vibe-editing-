from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException

from app.auth.config import auth_secret, is_production
from app.auth.mail import mail_configured

CODE_TTL_MINUTES = 10
RESEND_SECONDS = 45
MAX_ATTEMPTS = 5


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def hash_code(email: str, code: str) -> str:
    return hmac.new(
        auth_secret().encode("utf-8"),
        f"{email}:{code}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def issue_email_code(email: str) -> str:
    from app.api.admin import store_edit

    code = f"{secrets.randbelow(1_000_000):06d}"
    now = _now()
    with store_edit() as store:
        codes = store.setdefault("email_codes", [])
        previous = next((row for row in codes if row.get("email") == email), None)
        if previous:
            sent = _parse(previous.get("sent_at") or "")
            if sent and (now - sent).total_seconds() < RESEND_SECONDS:
                raise HTTPException(status_code=429, detail="code_resent_too_soon")
        store["email_codes"] = [row for row in codes if row.get("email") != email]
        store["email_codes"].append(
            {
                "email": email,
                "code_hash": hash_code(email, code),
                "expires_at": (now + timedelta(minutes=CODE_TTL_MINUTES)).isoformat(),
                "sent_at": now.isoformat(),
                "attempts": 0,
            }
        )
    return code


def verify_email_code(email: str, code: str) -> None:
    from app.api.admin import store_edit

    cleaned = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(cleaned) != 6:
        raise HTTPException(status_code=400, detail="invalid_code")

    with store_edit() as store:
        codes = store.setdefault("email_codes", [])
        row = next((item for item in codes if item.get("email") == email), None)
        if not row:
            raise HTTPException(status_code=403, detail="invalid_code")
        expires = _parse(row.get("expires_at") or "")
        if not expires or expires < _now():
            store["email_codes"] = [item for item in codes if item.get("email") != email]
            raise HTTPException(status_code=403, detail="code_expired")
        attempts = int(row.get("attempts") or 0)
        if attempts >= MAX_ATTEMPTS:
            raise HTTPException(status_code=403, detail="code_attempts_exceeded")
        if not hmac.compare_digest(row.get("code_hash") or "", hash_code(email, cleaned)):
            row["attempts"] = attempts + 1
            raise HTTPException(status_code=403, detail="invalid_code")
        store["email_codes"] = [item for item in codes if item.get("email") != email]


def reveal_dev_code(code: str) -> Optional[str]:
    if is_production() or mail_configured():
        return None
    return code
