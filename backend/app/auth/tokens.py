from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from app.auth.config import auth_secret, session_days

AUTH_ALG = "HS256"


def create_access_token(user: dict, jti: Optional[str] = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"],
        "email": user.get("email") or "",
        "auth": user.get("auth") or "google",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=session_days())).timestamp()),
    }
    if jti:
        payload["jti"] = jti
    return jwt.encode(payload, auth_secret(), algorithm=AUTH_ALG)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(
            token,
            auth_secret(),
            algorithms=[AUTH_ALG],
            leeway=60,
        )
    except jwt.PyJWTError:
        return None
