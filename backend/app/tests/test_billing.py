import base64
import hashlib
import hmac
import json
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _sign(secret_raw: bytes, webhook_id: str, timestamp: str, body: bytes) -> str:
    digest = hmac.new(secret_raw, f"{webhook_id}.{timestamp}.{body.decode()}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def test_webhook_activates_subscription(tmp_path, monkeypatch):
    from app.api import admin as admin_api
    from app.api.auth import router as auth_router
    from app.api.billing import router as billing_router

    monkeypatch.setattr(admin_api, "STORE_PATH", str(tmp_path / "store.json"))
    admin_api.save_store({
        "keys": [],
        "users": [{
            "id": "usr_anna",
            "email": "anna@example.com",
            "name": "Anna",
            "plan": "free",
            "plan_status": "none",
        }],
        "projects": [],
        "sessions": [],
        "email_codes": [],
        "webhook_events": [],
    })
    secret = b"dodo-test-secret"
    monkeypatch.setenv("DODO_WEBHOOK_SECRET", "whsec_" + base64.b64encode(secret).decode())
    monkeypatch.setenv("DODO_PAYMENTS_API_KEY", "")

    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(billing_router)
    client = TestClient(app)

    body = json.dumps({
        "type": "subscription.active",
        "data": {
            "subscription_id": "sub_1",
            "customer_id": "cus_1",
            "product_id": "pdt_pro",
            "status": "active",
            "next_billing_date": "2026-09-16",
            "metadata": {"user_id": "usr_anna"},
            "customer": {"customer_id": "cus_1", "email": "anna@example.com"},
        },
    }).encode()
    webhook_id = "msg_1"
    timestamp = str(int(time.time()))
    signature = _sign(secret, webhook_id, timestamp, body)
    res = client.post(
        "/api/billing/webhook",
        content=body,
        headers={
            "webhook-id": webhook_id,
            "webhook-timestamp": timestamp,
            "webhook-signature": signature,
        },
    )
    assert res.status_code == 200
    store = admin_api.load_store()
    user = store["users"][0]
    assert user["plan"] == "pro"
    assert user["plan_status"] == "active"
    assert user["dodo_subscription_id"] == "sub_1"

    again = client.post(
        "/api/billing/webhook",
        content=body,
        headers={
            "webhook-id": webhook_id,
            "webhook-timestamp": timestamp,
            "webhook-signature": signature,
        },
    )
    assert again.json()["duplicate"] is True


def test_checkout_requires_auth(tmp_path, monkeypatch):
    from app.api import admin as admin_api
    from app.api.billing import router as billing_router

    monkeypatch.setattr(admin_api, "STORE_PATH", str(tmp_path / "store.json"))
    admin_api.save_store({"keys": [], "users": [], "projects": [], "sessions": []})
    monkeypatch.setenv("DODO_PAYMENTS_API_KEY", "")
    app = FastAPI()
    app.include_router(billing_router)
    client = TestClient(app)
    res = client.post("/api/billing/checkout", json={})
    assert res.status_code == 403


def test_free_reel_locks_second_project(tmp_path, monkeypatch):
    from fastapi import HTTPException
    from app.api import admin as admin_api
    from app.billing.entitlements import assert_can_use_ai, claim_free_project, has_paid_plan

    monkeypatch.setattr(admin_api, "STORE_PATH", str(tmp_path / "store.json"))
    admin_api.save_store({
        "keys": [],
        "users": [{"id": "usr_1", "email": "a@b.com", "plan": "free", "plan_status": "none"}],
        "projects": [],
        "sessions": [],
    })
    user = {"id": "usr_1"}
    claim_free_project(user, "reel-1")
    assert_can_use_ai(user, "reel-1")
    try:
        assert_can_use_ai(user, "reel-2")
        raise AssertionError("second reel must be blocked")
    except HTTPException as exc:
        assert exc.status_code == 402
        assert exc.detail == "free_reel_used"
    store = admin_api.load_store()
    store["users"][0]["plan_status"] = "trialing"
    admin_api.save_store(store)
    assert has_paid_plan(store["users"][0])
    assert_can_use_ai({"id": "usr_1"}, "reel-2")


def test_unlimited_email_skips_paywall(tmp_path, monkeypatch):
    from app.api import admin as admin_api
    from app.billing.entitlements import assert_can_use_ai, has_paid_plan

    monkeypatch.setattr(admin_api, "STORE_PATH", str(tmp_path / "store.json"))
    monkeypatch.setenv("UNLIMITED_EMAILS", "aitmatov2005@gmail.com")
    admin_api.save_store({
        "keys": [],
        "users": [{
            "id": "usr_founder",
            "email": "aitmatov2005@gmail.com",
            "plan": "free",
            "plan_status": "none",
            "free_project_id": "reel-1",
        }],
        "projects": [],
        "sessions": [],
    })
    row = admin_api.load_store()["users"][0]
    assert has_paid_plan(row)
    assert_can_use_ai({"id": "usr_founder"}, "reel-2")
