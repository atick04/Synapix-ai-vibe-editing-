from __future__ import annotations

import os

from app.auth.config import cors_origins, is_production


def dodo_api_key() -> str:
    return (
        os.getenv("DODO_PAYMENTS_API_KEY")
        or os.getenv("DODO_API_KEY")
        or ""
    ).strip()


def dodo_webhook_secret() -> str:
    return (
        os.getenv("DODO_PAYMENTS_WEBHOOK_KEY")
        or os.getenv("DODO_WEBHOOK_SECRET")
        or ""
    ).strip()


def dodo_environment() -> str:
    raw = (os.getenv("DODO_PAYMENTS_ENVIRONMENT") or os.getenv("DODO_ENV") or "").strip().lower()
    if raw in ("live", "live_mode", "prod", "production"):
        return "live"
    if raw in ("test", "test_mode", "sandbox"):
        return "test"
    return "live" if is_production() else "test"


def dodo_base_url() -> str:
    if dodo_environment() == "live":
        return "https://live.dodopayments.com"
    return "https://test.dodopayments.com"


def dodo_configured() -> bool:
    return bool(dodo_api_key())


def dodo_product_id() -> str:
    return (os.getenv("DODO_PRODUCT_ID") or os.getenv("DODO_PRODUCT_PRO") or "").strip()


def dodo_trial_days() -> int:
    raw = (os.getenv("DODO_TRIAL_DAYS") or "7").strip()
    try:
        return max(0, min(int(raw), 10000))
    except ValueError:
        return 7


def frontend_origin() -> str:
    explicit = (os.getenv("FRONTEND_ORIGIN") or "").strip().rstrip("/")
    if explicit:
        return explicit
    origins = cors_origins()
    for item in origins:
        if "3001" in item or "synapix.ai" in item:
            return item
    return origins[0] if origins else "http://localhost:3001"


def checkout_return_url() -> str:
    explicit = (os.getenv("DODO_RETURN_URL") or "").strip()
    if explicit:
        return explicit
    return f"{frontend_origin()}/account?billing=success"
