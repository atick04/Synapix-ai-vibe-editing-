"""Auth / CORS settings that work locally and on Railway without a rewrite."""

from __future__ import annotations

import os

WEAK_SECRETS = {
    "",
    "change-me",
    "change-me-strong-admin-password",
    "admin123",
    "synapix-dev-auth-secret-min-32b",
}

_LOCAL_ORIGINS = (
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
)

_PROD_ORIGINS = (
    "https://synapix.ai",
    "https://www.synapix.ai",
)

SESSION_COOKIE_NAME = "synapix_session"


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def is_production() -> bool:
    explicit = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
    if explicit in ("production", "prod"):
        return True
    if explicit in ("development", "dev", "local", "test"):
        return False
    railway = (os.getenv("RAILWAY_ENVIRONMENT") or "").strip().lower()
    return railway == "production"


def auth_secret() -> str:
    secret = (os.getenv("AUTH_SECRET") or "").strip()
    if is_production():
        if len(secret) < 32 or secret in WEAK_SECRETS:
            raise RuntimeError(
                "AUTH_SECRET must be a random 32+ character value in production"
            )
        return secret
    if not secret:
        secret = (os.getenv("ADMIN_SECRET_KEY") or "synapix-dev-auth-secret-min-32b").strip()
    if len(secret) < 32:
        secret = (secret + "0" * 32)[:32]
    return secret


def session_days() -> int:
    return max(1, int(os.getenv("AUTH_TOKEN_DAYS", "30")))


def cookie_secure() -> bool:
    raw = os.getenv("AUTH_COOKIE_SECURE")
    if raw is not None:
        return env_flag("AUTH_COOKIE_SECURE")
    return is_production()


def cookie_samesite() -> str:
    raw = (os.getenv("AUTH_COOKIE_SAMESITE") or "").strip().lower()
    if raw in ("lax", "strict", "none"):
        return raw
    # Frontend and API are different sites in prod (synapix.ai → Railway).
    return "none" if is_production() else "lax"


def cookie_domain() -> str | None:
    raw = (os.getenv("AUTH_COOKIE_DOMAIN") or "").strip()
    return raw or None


def cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS") or os.getenv("FRONTEND_ORIGIN") or ""
    origins = [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]
    if origins:
        return origins
    out = list(_LOCAL_ORIGINS)
    if is_production():
        out.extend(_PROD_ORIGINS)
    return out


def allow_legacy_jwt() -> bool:
    return env_flag("AUTH_ALLOW_LEGACY_JWT", default=not is_production())


def allow_legacy_project_claim() -> bool:
    return env_flag("AUTH_LEGACY_CLAIM", default=not is_production())


def login_rate_limit() -> tuple[int, int]:
    return (
        max(1, int(os.getenv("AUTH_LOGIN_RATE_LIMIT", "12"))),
        max(30, int(os.getenv("AUTH_LOGIN_RATE_WINDOW", "300"))),
    )
