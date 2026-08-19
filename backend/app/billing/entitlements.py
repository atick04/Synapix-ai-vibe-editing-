from __future__ import annotations

import os

from fastapi import HTTPException

PAID_STATUSES = {"active", "trialing", "unlimited"}
DEFAULT_UNLIMITED_EMAILS = "aitmatov2005@gmail.com"


def unlimited_emails() -> set[str]:
    raw = os.getenv("UNLIMITED_EMAILS", DEFAULT_UNLIMITED_EMAILS)
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def has_paid_plan(user: dict | None) -> bool:
    if not user:
        return False
    if (user.get("plan_status") or "").lower() in PAID_STATUSES:
        return True
    email = (user.get("email") or user.get("login") or "").strip().lower()
    return bool(email) and email in unlimited_emails()


def full_user(user: dict | None) -> dict:
    from app.auth.deps import user_by_id

    if not user:
        return {}
    return user_by_id(user.get("id") or "") or user


def free_project_id(user: dict | None) -> str:
    return str((full_user(user) or {}).get("free_project_id") or "")


def can_use_free_or_paid(user: dict | None, file_id: str) -> bool:
    row = full_user(user)
    if has_paid_plan(row):
        return True
    claimed = str(row.get("free_project_id") or "")
    if not claimed:
        return True
    return claimed == file_id


def assert_can_use_ai(user: dict | None, file_id: str) -> None:
    if can_use_free_or_paid(user, file_id):
        return
    raise HTTPException(status_code=402, detail="free_reel_used")


def claim_free_project(user: dict | None, file_id: str) -> None:
    from app.api.admin import store_edit

    if not user or not file_id:
        return
    user_id = user.get("id")
    with store_edit() as store:
        row = next((item for item in store.get("users") or [] if item.get("id") == user_id), None)
        if not row or has_paid_plan(row):
            return
        if not row.get("free_project_id"):
            row["free_project_id"] = file_id
