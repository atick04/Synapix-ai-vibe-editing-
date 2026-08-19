from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.auth.config import session_days


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def create_session(user_id: str) -> str:
    from app.api.admin import store_edit

    sid = secrets.token_urlsafe(32)
    now = _now()
    expires = now + timedelta(days=session_days())
    with store_edit() as store:
        sessions = store.setdefault("sessions", [])
        cutoff = now - timedelta(days=1)
        store["sessions"] = [
            s
            for s in sessions
            if not s.get("revoked")
            and (_parse_dt(s.get("expires_at") or "") or cutoff) > cutoff
        ]
        store["sessions"].append(
            {
                "id": sid,
                "user_id": user_id,
                "created_at": now.isoformat(),
                "expires_at": expires.isoformat(),
                "revoked": False,
            }
        )
    return sid


def session_is_active(session_id: str, user_id: str) -> bool:
    from app.api.admin import load_store

    if not session_id or not user_id:
        return False
    store = load_store()
    row = next((s for s in store.get("sessions") or [] if s.get("id") == session_id), None)
    if not row or row.get("revoked") or row.get("user_id") != user_id:
        return False
    expires = _parse_dt(row.get("expires_at") or "")
    return bool(expires and expires > _now())


def revoke_session(session_id: str) -> None:
    if not session_id:
        return
    from app.api.admin import store_edit

    with store_edit() as store:
        for row in store.get("sessions") or []:
            if row.get("id") == session_id:
                row["revoked"] = True
                row["revoked_at"] = _now().isoformat()
                break
