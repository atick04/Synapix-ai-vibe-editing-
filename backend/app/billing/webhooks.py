from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
from typing import Any

from fastapi import HTTPException

from app.billing.config import dodo_webhook_secret

logger = logging.getLogger(__name__)

ACTIVE = {"active", "trialing", "trial"}
HOLD = {"on_hold", "paused", "pending"}
ENDED = {"cancelled", "canceled", "expired", "failed"}


def verify_dodo_signature(payload: bytes, headers: dict[str, str]) -> None:
    secret = dodo_webhook_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="billing_webhook_not_configured")
    webhook_id = headers.get("webhook-id") or ""
    timestamp = headers.get("webhook-timestamp") or ""
    signature_header = headers.get("webhook-signature") or ""
    if not webhook_id or not timestamp or not signature_header:
        raise HTTPException(status_code=401, detail="invalid_webhook_signature")

    key = secret.encode("utf-8")
    if secret.startswith("whsec_"):
        try:
            key = base64.b64decode(secret[6:])
        except Exception as exc:
            raise HTTPException(status_code=503, detail="billing_webhook_not_configured") from exc

    signed = f"{webhook_id}.{timestamp}.{payload.decode('utf-8')}".encode("utf-8")
    digest = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode("ascii")
    tokens: list[str] = []
    for part in signature_header.replace(",", " ").split():
        token = part.strip()
        if not token:
            continue
        tokens.append(token)
        if token.startswith("v1"):
            tokens.append(token[2:].lstrip())
    if not any(hmac.compare_digest(token, digest) for token in tokens):
        raise HTTPException(status_code=401, detail="invalid_webhook_signature")


def parse_event(payload: bytes) -> dict[str, Any]:
    try:
        data = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="invalid_webhook") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="invalid_webhook")
    return data


def _nested_customer(data: dict) -> dict:
    customer = data.get("customer")
    return customer if isinstance(customer, dict) else {}


def extract_user_hints(event: dict) -> dict[str, str]:
    data = event.get("data") if isinstance(event.get("data"), dict) else event
    meta = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    customer = _nested_customer(data)
    customer_meta = customer.get("metadata") if isinstance(customer.get("metadata"), dict) else {}
    email = (customer.get("email") or data.get("customer_email") or meta.get("email") or "").strip().lower()
    return {
        "user_id": str(meta.get("user_id") or customer_meta.get("user_id") or "").strip(),
        "email": email,
        "customer_id": str(
            customer.get("customer_id") or customer.get("id") or data.get("customer_id") or ""
        ).strip(),
        "subscription_id": str(data.get("subscription_id") or data.get("id") or "").strip(),
        "product_id": str(data.get("product_id") or "").strip(),
        "status": str(data.get("status") or "").strip().lower(),
        "next_billing_date": str(data.get("next_billing_date") or data.get("expires_at") or "").strip(),
    }


def plan_from_event(event_type: str, hints: dict[str, str]) -> dict:
    kind = (event_type or "").lower()
    status = hints.get("status") or ""
    if kind.endswith("on_hold") or status in HOLD:
        plan_status = "on_hold"
        plan = "pro"
    elif kind.endswith("cancelled") or kind.endswith("canceled") or kind.endswith("expired") or kind.endswith("failed"):
        plan_status = "cancelled" if "cancel" in kind or status in {"cancelled", "canceled"} else status or "cancelled"
        plan = "free"
    elif kind.endswith("active") or kind.endswith("renewed") or status in ACTIVE:
        plan_status = "trialing" if status in {"trial", "trialing"} else "active"
        plan = "pro"
    elif status in ACTIVE:
        plan_status = "trialing" if status in {"trial", "trialing"} else "active"
        plan = "pro"
    else:
        plan_status = status or "active"
        plan = "pro" if plan_status in {"active", "trialing", "on_hold"} else "free"
    return {
        "plan": plan,
        "plan_status": plan_status,
        "dodo_customer_id": hints.get("customer_id") or "",
        "dodo_subscription_id": hints.get("subscription_id") or "",
        "dodo_product_id": hints.get("product_id") or "",
        "plan_renews_at": hints.get("next_billing_date") or "",
    }
