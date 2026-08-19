from __future__ import annotations

from typing import Optional

from app.auth.passwords import normalize_email


def already_processed(store: dict, webhook_id: str) -> bool:
    events = store.setdefault("webhook_events", [])
    return any(item.get("id") == webhook_id for item in events)


def remember_webhook(store: dict, webhook_id: str, event_type: str) -> None:
    events = store.setdefault("webhook_events", [])
    events.append({"id": webhook_id, "type": event_type})
    store["webhook_events"] = events[-300:]


def find_user(store: dict, *, user_id: str = "", email: str = "", customer_id: str = "") -> Optional[dict]:
    users = store.get("users") or []
    if user_id:
        match = next((u for u in users if u.get("id") == user_id), None)
        if match:
            return match
    if customer_id:
        match = next((u for u in users if u.get("dodo_customer_id") == customer_id), None)
        if match:
            return match
    if email:
        email = normalize_email(email)
        match = next((u for u in users if (u.get("email") or "").lower() == email), None)
        if match:
            return match
    return None


def apply_plan(user: dict, plan: dict) -> None:
    user["plan"] = plan.get("plan") or "free"
    user["plan_status"] = plan.get("plan_status") or "none"
    if plan.get("dodo_customer_id"):
        user["dodo_customer_id"] = plan["dodo_customer_id"]
    if plan.get("dodo_subscription_id"):
        user["dodo_subscription_id"] = plan["dodo_subscription_id"]
    if plan.get("dodo_product_id"):
        user["dodo_product_id"] = plan["dodo_product_id"]
    user["plan_renews_at"] = plan.get("plan_renews_at") or user.get("plan_renews_at") or ""
