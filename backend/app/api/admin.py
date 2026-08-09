import os
import json
import uuid
import shutil
import contextvars
from datetime import datetime, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Header, Query, Depends, status
from app.core.paths import ADMIN_STORE_PATH, UPLOAD_DIR, ensure_data_dirs

router = APIRouter(prefix="/api/admin", tags=["Admin"])

STORE_PATH = str(ADMIN_STORE_PATH)
ADMIN_SECRET_KEY = os.getenv("ADMIN_SECRET_KEY", "admin123")
# Default trial window / budget for closed beta keys
DEFAULT_TRIAL_DAYS = int(os.getenv("TRIAL_KEY_DAYS", "7"))
DEFAULT_TRIAL_TOKENS = int(os.getenv("TRIAL_TOKENS_LIMIT", "250000"))

current_access_key_var = contextvars.ContextVar("current_access_key", default=None)

# Pydantic schemas
class KeyCreateRequest(BaseModel):
    label: str
    tokens_limit: int = Field(default_factory=lambda: DEFAULT_TRIAL_TOKENS)
    days: int = Field(default_factory=lambda: DEFAULT_TRIAL_DAYS, description="Срок действия ключа в днях")

class KeyResponse(BaseModel):
    id: str
    label: str
    created_at: str
    expires_at: str
    tokens_limit: int
    tokens_used: int
    status: str

# Helper to load and save storage (always on the persistent volume)
def load_store() -> dict:
    ensure_data_dirs()
    if not os.path.exists(STORE_PATH):
        initial_data = {
            "keys": [],
            "users": []
        }
        with open(STORE_PATH, "w", encoding="utf-8") as f:
            json.dump(initial_data, f, indent=2, ensure_ascii=False)
        return initial_data
    
    try:
        with open(STORE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"keys": [], "users": []}

def save_store(data: dict):
    ensure_data_dirs()
    with open(STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# Admin Auth Dependency
async def verify_admin_token(x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token")):
    if not x_admin_token or x_admin_token != ADMIN_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный пароль администратора"
        )
    return x_admin_token

# User Access Key Verification Dependency
async def validate_user_access_key(
    x_access_key: Optional[str] = Header(None, alias="X-Access-Key"),
    x_user_login: Optional[str] = Header(None, alias="X-User-Login")
):
    if not x_access_key or not x_user_login:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="access_key_required"
        )
    
    import urllib.parse
    x_user_login = urllib.parse.unquote(x_user_login)
    
    store = load_store()
    
    # Find the key
    key_entry = next((k for k in store["keys"] if k["id"] == x_access_key), None)
    if not key_entry:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="access_key_invalid"
        )
    
    if key_entry["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"access_key_{key_entry['status']}"
        )
    
    # Check expiration date
    try:
        expires_at = datetime.fromisoformat(key_entry["expires_at"])
        if datetime.utcnow() > expires_at:
            key_entry["status"] = "expired"
            save_store(store)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="access_key_expired"
            )
    except ValueError:
        pass
    
    # Check token limits if applicable
    if key_entry["tokens_limit"] > 0 and key_entry["tokens_used"] >= key_entry["tokens_limit"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="access_key_limit_reached"
        )

    # Register/Update user last seen
    now_str = datetime.utcnow().isoformat()
    user_entry = next((u for u in store["users"] if u["login"] == x_user_login), None)
    if not user_entry:
        user_entry = {
            "login": x_user_login,
            "key_id": x_access_key,
            "registered_at": now_str,
            "last_seen_at": now_str
        }
        store["users"].append(user_entry)
    else:
        user_entry["last_seen_at"] = now_str
        user_entry["key_id"] = x_access_key  # update key association in case they changed it
    
    save_store(store)
    current_access_key_var.set(x_access_key)
    return key_entry

# PUBLIC ENDPOINT: Validate User Access Key and Login
@router.get("/validate-key")
async def validate_key_endpoint(
    key: str = Query(...),
    login: str = Query(...)
):
    try:
        await validate_user_access_key(x_access_key=key, x_user_login=login)
        store = load_store()
        key_entry = next((k for k in store["keys"] if k["id"] == key), None)
        return {
            "valid": True,
            "expires_at": key_entry["expires_at"] if key_entry else "",
            "tokens_used": key_entry["tokens_used"] if key_entry else 0,
            "tokens_limit": key_entry["tokens_limit"] if key_entry else 0
        }
    except HTTPException as e:
        return {
            "valid": False,
            "reason": e.detail
        }

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
            
        # Find associated key label
        key_entry = next((k for k in store["keys"] if k["id"] == u["key_id"]), None)
        key_label = key_entry["label"] if key_entry else "Неизвестный ключ"
        
        users_with_status.append({
            "login": u["login"],
            "key_label": key_label,
            "tokens_used": key_entry["tokens_used"] if key_entry else 0,
            "tokens_limit": key_entry["tokens_limit"] if key_entry else 0,
            "registered_at": u["registered_at"],
            "last_seen_at": u["last_seen_at"],
            "status": status_str
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
        "active_keys": len([k for k in store["keys"] if k["status"] == "active"]),
        "users": users_with_status
    }

# PROTECTED: Get all Access Keys
@router.get("/keys", response_model=List[KeyResponse])
async def get_access_keys(admin_token: str = Depends(verify_admin_token)):
    store = load_store()
    return store["keys"]

# PROTECTED: Create 7-day Access Key
@router.post("/keys", response_model=KeyResponse)
async def create_access_key(req: KeyCreateRequest, admin_token: str = Depends(verify_admin_token)):
    store = load_store()
    
    # Generate unique vibe- prefixed key (default = closed-beta trial window)
    new_id = f"vibe-{uuid.uuid4().hex[:16]}"
    days = max(1, min(int(req.days or DEFAULT_TRIAL_DAYS), 90))
    tokens = max(1000, int(req.tokens_limit or DEFAULT_TRIAL_TOKENS))
    now_str = datetime.utcnow().isoformat()
    expires_str = (datetime.utcnow() + timedelta(days=days)).isoformat()
    
    new_key = {
        "id": new_id,
        "label": req.label,
        "created_at": now_str,
        "expires_at": expires_str,
        "tokens_limit": tokens,
        "tokens_used": 0,
        "status": "active",
        "trial_days": days,
    }
    
    store["keys"].append(new_key)
    save_store(store)
    return new_key

# PROTECTED: Revoke/Delete Access Key
@router.delete("/keys/{key_id}")
async def revoke_access_key(key_id: str, admin_token: str = Depends(verify_admin_token)):
    store = load_store()
    key_entry = next((k for k in store["keys"] if k["id"] == key_id), None)
    if not key_entry:
        raise HTTPException(status_code=404, detail="Ключ не найден")
        
    key_entry["status"] = "revoked"
    save_store(store)
    return {"message": "Ключ успешно отозван", "key_id": key_id}
