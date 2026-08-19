from app.auth.config import SESSION_COOKIE_NAME, auth_secret, is_production
from app.auth.deps import (
    _public_user,
    assert_project_access,
    list_user_projects,
    register_project,
    upsert_google_user,
)
from app.auth.sessions import create_session, revoke_session, session_is_active
from app.auth.tokens import create_access_token, decode_access_token
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient


def test_jwt_roundtrip():
    user = {"id": "usr_abc", "email": "a@b.com", "auth": "google"}
    token = create_access_token(user)
    payload = decode_access_token(token)
    assert payload["sub"] == "usr_abc"
    assert payload["email"] == "a@b.com"
    assert decode_access_token("not-a-token") is None


def test_google_upsert_and_project_isolation(tmp_path, monkeypatch):
    from app.api import admin as admin_api

    monkeypatch.setattr(admin_api, "STORE_PATH", str(tmp_path / "store.json"))
    admin_api.save_store({"keys": [], "users": [], "projects": [], "sessions": []})

    alice = upsert_google_user({
        "sub": "g-alice",
        "email": "alice@gmail.com",
        "name": "Alice",
        "picture": "https://example.com/a.jpg",
    })
    bob = upsert_google_user({
        "sub": "g-bob",
        "email": "bob@gmail.com",
        "name": "Bob",
    })
    assert alice["id"] != bob["id"]
    again = upsert_google_user({"sub": "g-alice", "email": "alice@gmail.com", "name": "Alice 2"})
    assert again["id"] == alice["id"]
    assert again["name"] == "Alice 2"

    register_project(_public_user(alice), "proj-1", "reel.mp4")
    assert [p["id"] for p in list_user_projects(alice["id"])] == ["proj-1"]
    assert list_user_projects(bob["id"]) == []

    assert_project_access("proj-1", _public_user(alice))
    try:
        assert_project_access("proj-1", _public_user(bob))
        raise AssertionError("bob should not see alice project")
    except HTTPException as exc:
        assert exc.status_code == 403
        assert exc.detail == "project_forbidden"

    try:
        assert_project_access("missing-proj", _public_user(alice))
        raise AssertionError("unknown project must not be claimed")
    except HTTPException as exc:
        assert exc.status_code == 404
        assert exc.detail == "project_not_found"


def test_unverified_google_email_rejected(tmp_path, monkeypatch):
    from app.api import admin as admin_api

    monkeypatch.setattr(admin_api, "STORE_PATH", str(tmp_path / "store.json"))
    admin_api.save_store({"keys": [], "users": [], "projects": [], "sessions": []})
    try:
        upsert_google_user({
            "sub": "g-bad",
            "email": "bad@gmail.com",
            "email_verified": False,
        })
        raise AssertionError("unverified email must fail")
    except HTTPException as exc:
        assert exc.status_code == 403
        assert exc.detail == "google_email_unverified"


def test_session_revoke(tmp_path, monkeypatch):
    from app.api import admin as admin_api

    monkeypatch.setattr(admin_api, "STORE_PATH", str(tmp_path / "store.json"))
    admin_api.save_store({"keys": [], "users": [], "projects": [], "sessions": []})
    sid = create_session("usr_abc")
    assert session_is_active(sid, "usr_abc")
    assert not session_is_active(sid, "usr_other")
    revoke_session(sid)
    assert not session_is_active(sid, "usr_abc")


def test_password_register_login_and_cookie(tmp_path, monkeypatch):
    from app.api import admin as admin_api
    from app.api.auth import router

    monkeypatch.setattr(admin_api, "STORE_PATH", str(tmp_path / "store.json"))
    admin_api.save_store({"keys": [], "users": [], "projects": [], "sessions": []})

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    res = client.post("/api/auth/register", json={
        "email": "anna@example.com",
        "password": "secret123",
        "name": "Anna",
    })
    assert res.status_code == 200
    assert res.json()["pending"] is True
    assert SESSION_COOKIE_NAME not in res.cookies
    code = res.json()["dev_code"]
    blocked = client.post("/api/auth/login", json={"email": "anna@example.com", "password": "secret123"})
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "email_unverified"
    verified = client.post("/api/auth/verify-email", json={"email": "anna@example.com", "code": code})
    assert verified.status_code == 200
    assert verified.json()["user"]["email"] == "anna@example.com"
    assert SESSION_COOKIE_NAME in verified.cookies
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["name"] == "Anna"

    taken = client.post("/api/auth/register", json={
        "email": "anna@example.com",
        "password": "secret123",
        "name": "Anna",
    })
    assert taken.status_code == 409

    client.post("/api/auth/logout")
    bad = client.post("/api/auth/login", json={"email": "anna@example.com", "password": "wrongpass"})
    assert bad.status_code == 403
    ok = client.post("/api/auth/login", json={"email": "anna@example.com", "password": "secret123"})
    assert ok.status_code == 200
    assert ok.json()["user"]["email"] == "anna@example.com"

    profile = client.patch("/api/auth/profile", json={
        "name": "Anna Edit",
        "company": "Synapix",
        "bio": "Reels editor",
        "current_password": "secret123",
        "new_password": "secret456",
    })
    assert profile.status_code == 200
    assert profile.json()["user"]["name"] == "Anna Edit"
    assert profile.json()["user"]["company"] == "Synapix"
    client.post("/api/auth/logout")
    relogin = client.post("/api/auth/login", json={"email": "anna@example.com", "password": "secret456"})
    assert relogin.status_code == 200


def test_google_user_can_link_password(tmp_path, monkeypatch):
    from app.api import admin as admin_api
    from app.api.auth import router

    monkeypatch.setattr(admin_api, "STORE_PATH", str(tmp_path / "store.json"))
    admin_api.save_store({"keys": [], "users": [], "projects": [], "sessions": []})
    google_user = upsert_google_user({
        "sub": "g-anna",
        "email": "anna@gmail.com",
        "name": "Anna G",
    })

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    res = client.post("/api/auth/register", json={
        "email": "anna@gmail.com",
        "password": "secret123",
        "name": "Anna",
    })
    assert res.status_code == 200
    assert res.json()["pending"] is True
    blocked = client.post("/api/auth/login", json={"email": "anna@gmail.com", "password": "secret123"})
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "account_exists_google"
    verified = client.post("/api/auth/verify-email", json={
        "email": "anna@gmail.com",
        "code": res.json()["dev_code"],
    })
    assert verified.status_code == 200
    assert verified.json()["user"]["id"] == google_user["id"]
    assert verified.json()["user"]["has_password"] is True
    client.post("/api/auth/logout")
    ok = client.post("/api/auth/login", json={"email": "anna@gmail.com", "password": "secret123"})
    assert ok.status_code == 200
    assert ok.json()["user"]["id"] == google_user["id"]


def test_register_hides_dev_code_when_mail_configured(tmp_path, monkeypatch):
    from app.api import admin as admin_api
    from app.api.auth import router

    monkeypatch.setattr(admin_api, "STORE_PATH", str(tmp_path / "store.json"))
    admin_api.save_store({"keys": [], "users": [], "projects": [], "sessions": []})
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr("app.api.auth.send_verification_code", lambda email, code: None)

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    res = client.post("/api/auth/register", json={
        "email": "new@example.com",
        "password": "secret123",
        "name": "New",
    })
    assert res.status_code == 200
    assert res.json()["pending"] is True
    assert "dev_code" not in res.json()


def test_code_email_goes_to_user_address():
    from app.auth.mail import build_code_message

    message = build_code_message("user@example.com", "Код подтверждения Synapix", "123456")
    assert message["To"] == "user@example.com"
    assert message["From"].startswith("Synapix")
    assert "123456" in message.get_body(preferencelist=("plain",)).get_content()
    html = message.get_body(preferencelist=("html",)).get_content()
    assert "bgcolor=\"#F3F4F7\"" in html
    assert "1 2 3 4 5 6" in html
    assert "cid:synapix-logo" in html


def test_production_mail_requires_resend_and_brand_from(monkeypatch):
    from app.auth import mail as mail_mod

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    try:
        mail_mod.assert_production_mail()
        raise AssertionError("production must require mail")
    except RuntimeError as exc:
        assert "RESEND_API_KEY" in str(exc)

    monkeypatch.setenv("RESEND_API_KEY", "re_prod_key")
    monkeypatch.setenv("SMTP_FROM", "Synapix <opendevss@gmail.com>")
    try:
        mail_mod.mail_from()
        raise AssertionError("gmail sender must fail in production")
    except RuntimeError as exc:
        assert "synapix.ai" in str(exc)

    monkeypatch.setenv("SMTP_FROM", "Synapix <noreply@synapix.ai>")
    mail_mod.assert_production_mail()
    assert mail_mod.mail_from() == "Synapix <noreply@synapix.ai>"
    assert mail_mod.mail_logo_src() == "https://synapix.ai/logo.png"


def test_auth_secret_required_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    assert is_production()
    try:
        auth_secret()
        raise AssertionError("weak secret must fail in production")
    except RuntimeError:
        pass
    monkeypatch.setenv("AUTH_SECRET", "prod-secret-must-be-at-least-32-chars!!")
    assert auth_secret().startswith("prod-secret")
