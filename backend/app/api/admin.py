import os
import json
import shutil
import threading
import contextvars
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Header, Depends, Request, status
from app.core.paths import ADMIN_STORE_PATH, UPLOAD_DIR, ensure_data_dirs

router = APIRouter(prefix="/api/admin", tags=["Admin"])

STORE_PATH = str(ADMIN_STORE_PATH)
ADMIN_SECRET_KEY = os.getenv("ADMIN_SECRET_KEY", "admin123")

current_access_key_var = contextvars.ContextVar("current_access_key", default=None)


_store_lock = threading.RLock()


def _ensure_store_shape(data: dict) -> dict:
    data.setdefault("keys", [])
    data.setdefault("users", [])
    data.setdefault("projects", [])
    data.setdefault("sessions", [])
    data.setdefault("email_codes", [])
    data.setdefault("webhook_events", [])
    return data

def _empty_store() -> dict:
    return {"keys": [], "users": [], "projects": [], "sessions": [], "email_codes": [], "webhook_events": []}


def _read_store() -> dict:
    ensure_data_dirs()
    if not os.path.exists(STORE_PATH):
        initial_data = _empty_store()
        _write_store(initial_data)
        return initial_data
    try:
        with open(STORE_PATH, "r", encoding="utf-8") as f:
            return _ensure_store_shape(json.load(f))
    except Exception:
        return _empty_store()


def _write_store(data: dict):
    ensure_data_dirs()
    payload = json.dumps(_ensure_store_shape(data), indent=2, ensure_ascii=False)
    tmp_path = f"{STORE_PATH}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(payload)
    os.replace(tmp_path, STORE_PATH)


def load_store() -> dict:
    with _store_lock:
        return _read_store()


def save_store(data: dict):
    with _store_lock:
        _write_store(data)


@contextmanager
def store_edit():
    with _store_lock:
        data = _read_store()
        yield data
        _write_store(data)

# Admin Auth Dependency
async def verify_admin_token(x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token")):
    if not x_admin_token or x_admin_token != ADMIN_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный пароль администратора"
        )
    return x_admin_token

async def validate_user_access_key(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    from app.auth.deps import resolve_current_user
    from app.auth.config import SESSION_COOKIE_NAME

    return resolve_current_user(authorization, request.cookies.get(SESSION_COOKIE_NAME))

# PROTECTED: Get Admin Dashboard Stats
@router.get("/stats")
async def get_admin_stats(admin_token: str = Depends(verify_admin_token)):
    store = load_store()
    
    # Calculate online users (active in the last 5 minutes)
    now = datetime.utcnow()
    online_timeout = timedelta(minutes=5)
    
    online_count = 0
    users_with_status = []
    
    for u in store["users"]:
        status_str = "offline"
        try:
            last_seen = datetime.fromisoformat(u["last_seen_at"])
            if now - last_seen <= online_timeout:
                status_str = "online"
                online_count += 1
        except ValueError:
            pass
            
        auth_kind = u.get("auth") or ("google" if u.get("google_sub") else "password")
        auth_label = "Google" if auth_kind == "google" else "Email"
        tokens_used = int(u.get("tokens_used") or 0)
        
        users_with_status.append({
            "id": u.get("id"),
            "login": u.get("email") or u.get("login") or "",
            "name": u.get("name") or "",
            "auth": auth_kind,
            "key_label": auth_label,
            "tokens_used": tokens_used,
            "tokens_limit": 0,
            "registered_at": u.get("registered_at"),
            "last_seen_at": u.get("last_seen_at"),
            "status": status_str,
            "plan": u.get("plan") or "free",
            "plan_status": u.get("plan_status") or "none",
            "projects": len([p for p in store.get("projects") or [] if p.get("owner_id") == u.get("id")]),
        })
        
    # Disk Usage
    try:
        total, used, free = shutil.disk_usage(str(UPLOAD_DIR))
        disk_free_gb = round(free / (2**30), 2)
        disk_total_gb = round(total / (2**30), 2)
        disk_used_pct = round((used / total) * 100, 1)
    except Exception:
        disk_free_gb, disk_total_gb, disk_used_pct = 0.0, 0.0, 0.0
        
    # Uploads / Projects Count & Size (persistent volume)
    uploads_dir = str(UPLOAD_DIR)
    project_count = 0
    total_size_bytes = 0
    if os.path.exists(uploads_dir):
        # We count folders or root files that have log/session suffixes
        for entry in os.scandir(uploads_dir):
            if entry.is_file():
                total_size_bytes += entry.stat().st_size
                if entry.name.endswith(".log"):
                    project_count += 1
            elif entry.is_dir():
                # Count files inside subdirectories
                project_count += 1
                for root, dirs, files in os.walk(entry.path):
                    for f in files:
                        total_size_bytes += os.path.getsize(os.path.join(root, f))
                        
    total_size_mb = round(total_size_bytes / (2**20), 2)

    return {
        "total_users": len(store["users"]),
        "online_users": online_count,
        "disk_free_gb": disk_free_gb,
        "disk_total_gb": disk_total_gb,
        "disk_used_pct": disk_used_pct,
        "active_projects": project_count,
        "media_library_size_mb": total_size_mb,
        "users": users_with_status
    }
