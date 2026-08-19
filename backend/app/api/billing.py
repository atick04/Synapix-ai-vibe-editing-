from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.auth.deps import get_current_user
from app.billing.config import (
    checkout_return_url,
    dodo_configured,
    dodo_environment,
    dodo_product_id,
    dodo_trial_days,
    frontend_origin,
)
from app.billing.dodo import create_checkout_session, create_customer_portal, list_products, public_product
from app.billing.store import already_processed, apply_plan, find_user, remember_webhook
from app.billing.webhooks import extract_user_hints, parse_event, plan_from_event, verify_dodo_signature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["Billing"])


class CheckoutRequest(BaseModel):
    product_id: str = ""


def billing_public(user: dict) -> dict:
    from app.billing.entitlements import has_paid_plan

    paid = has_paid_plan(user)
    status = (user.get("plan_status") or "none").lower()
    if paid and status not in ("active", "trialing", "unlimited"):
        status = "unlimited"
    plan = user.get("plan") or "free"
    if paid and plan in ("", "free", None):
        plan = "pro"
    return {
        "configured": dodo_configured(),
        "environment": dodo_environment(),
        "plan": plan,
        "plan_status": status,
        "plan_renews_at": user.get("plan_renews_at") or "",
        "has_subscription": bool(user.get("dodo_subscription_id")) or paid,
        "can_manage": bool(user.get("dodo_customer_id")),
        "free_project_id": user.get("free_project_id") or "",
        "free_reel_available": paid or not user.get("free_project_id"),
    }


@router.get("/config")
async def billing_config():
    return {
        "configured": dodo_configured(),
        "environment": dodo_environment(),
        "trial_days": dodo_trial_days(),
    }


@router.get("/plans")
async def billing_plans():
    if not dodo_configured():
        return {"plans": []}
    try:
        products = [public_product(item) for item in list_products() if public_product(item).get("id")]
    except HTTPException:
        configured = dodo_product_id()
        products = [{"id": configured, "name": "Synapix Pro", "recurring": True}] if configured else []
    preferred = dodo_product_id()
    rank = {"starter": 0, "pro": 1, "enterprise": 2}

    def _sort_key(item: dict) -> tuple:
        name = (item.get("name") or "").lower()
        return (0 if item["id"] == preferred else 1, rank.get(name, 9), name)

    products.sort(key=_sort_key)
    return {"plans": products, "trial_days": dodo_trial_days(), "default_product_id": preferred}


@router.get("/me")
async def billing_me(user: dict = Depends(get_current_user)):
    from app.auth.deps import user_by_id

    full = user_by_id(user["id"]) or user
    return billing_public(full)


@router.post("/checkout")
async def billing_checkout(req: CheckoutRequest, user: dict = Depends(get_current_user)):
    product_id = (req.product_id or dodo_product_id()).strip()
    if not product_id and dodo_configured():
        products = list_products()
        product_id = next((public_product(item)["id"] for item in products if public_product(item)["id"]), "")
    if not product_id:
        raise HTTPException(status_code=503, detail="billing_product_missing")

    payload: dict = {
        "product_cart": [{"product_id": product_id, "quantity": 1}],
        "customer": {
            "email": user.get("email") or "",
            **({"name": user["name"]} if user.get("name") else {}),
        },
        "return_url": checkout_return_url(),
        "metadata": {"user_id": user["id"], "email": user.get("email") or ""},
        "feature_flags": {"allow_discount_code": True},
    }
    trial = dodo_trial_days()
    if trial:
        payload["subscription_data"] = {"trial_period_days": trial}

    session = create_checkout_session(payload)
    url = session.get("checkout_url") or session.get("url")
    if not url:
        raise HTTPException(status_code=502, detail="billing_request_failed")
    return {"checkout_url": url, "session_id": session.get("session_id") or session.get("id") or ""}


@router.post("/portal")
async def billing_portal(user: dict = Depends(get_current_user)):
    from app.auth.deps import user_by_id

    full = user_by_id(user["id"]) or {}
    customer_id = full.get("dodo_customer_id") or ""
    if not customer_id:
        raise HTTPException(status_code=400, detail="billing_no_customer")
    session = create_customer_portal(customer_id, f"{frontend_origin()}/account")
    url = session.get("link") or session.get("url")
    if not url:
        raise HTTPException(status_code=502, detail="billing_request_failed")
    return {"portal_url": url}


@router.post("/webhook")
async def billing_webhook(request: Request):
    payload = await request.body()
    verify_dodo_signature(
        payload,
        {
            "webhook-id": request.headers.get("webhook-id") or "",
            "webhook-timestamp": request.headers.get("webhook-timestamp") or "",
            "webhook-signature": request.headers.get("webhook-signature") or "",
        },
    )
    event = parse_event(payload)
    event_type = str(event.get("type") or event.get("event_type") or "")
    webhook_id = request.headers.get("webhook-id") or ""

    from app.api.admin import store_edit

    with store_edit() as store:
        if webhook_id and already_processed(store, webhook_id):
            return {"ok": True, "duplicate": True}
        if webhook_id:
            remember_webhook(store, webhook_id, event_type)
        if not event_type.startswith(("subscription.", "payment.succeeded")):
            return {"ok": True, "ignored": event_type}

        hints = extract_user_hints(event)
        user = find_user(
            store,
            user_id=hints["user_id"],
            email=hints["email"],
            customer_id=hints["customer_id"],
        )
        if not user:
            logger.warning("Dodo webhook %s had no matching user (%s)", event_type, hints)
            return {"ok": True, "unmatched": True}

        if event_type == "payment.succeeded" and not (
            hints.get("subscription_id") or (event.get("data") or {}).get("subscription_id")
        ):
            apply_plan(user, {
                "plan": "pro",
                "plan_status": "active",
                "dodo_customer_id": hints.get("customer_id") or "",
                "dodo_subscription_id": "",
                "dodo_product_id": hints.get("product_id") or "",
                "plan_renews_at": "",
            })
        else:
            apply_plan(user, plan_from_event(event_type, hints))
    return {"ok": True}
