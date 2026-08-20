import app.core.env_patch  # Apply dotenv patch first
from pathlib import Path
from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=_BACKEND_DIR / ".env", override=True)
load_dotenv(dotenv_path=_BACKEND_DIR / ".env.local", override=True)

import asyncio
from contextlib import asynccontextmanager
import mimetypes
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import re
from app.api import video, chat, templates, admin, auth, billing
from app.auth.config import cors_origins, is_production
from app.services.mcp_client import mcp_client

# Initialize and register media MIME types for proper streaming on Windows
mimetypes.init()
mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("video/quicktime", ".mov")
mimetypes.add_type("video/webm", ".webm")
mimetypes.add_type("audio/mpeg", ".mp3")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Persistent data root (Railway volume) + RVM weights bootstrap
    try:
        from app.core.paths import ensure_data_dirs, DATA_DIR, ADMIN_STORE_PATH
        ensure_data_dirs()
        print(f"[boot] DATA_DIR={DATA_DIR}")
        print(f"[boot] admin_store={ADMIN_STORE_PATH} exists={ADMIN_STORE_PATH.exists()}")
        print(f"[boot] google_oauth={'on' if os.getenv('GOOGLE_CLIENT_ID') else 'OFF — set GOOGLE_CLIENT_ID in backend/.env'}")
        from app.auth.mail import mail_configured
        print(f"[boot] mail={'on' if mail_configured() else 'OFF — set RESEND_API_KEY or SMTP_HOST to email signup codes'}")
        from app.billing.config import dodo_configured, dodo_environment
        print(f"[boot] dodo={'on:' + dodo_environment() if dodo_configured() else 'OFF — set DODO_PAYMENTS_API_KEY'}")
        print(f"[boot] env={'prod' if is_production() else 'dev'} cors={','.join(cors_origins())}")
        from app.services.object_store import enabled as r2_enabled, bucket_name as r2_bucket, ping as r2_ping
        if r2_enabled():
            print(f"[boot] r2={'ok' if r2_ping() else 'FAIL'} bucket={r2_bucket()}")
        else:
            print("[boot] r2=OFF — set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME")
    except Exception as e:
        print(f"[boot] ensure_data_dirs failed: {e}")

    if is_production():
        from app.auth.config import auth_secret
        from app.auth.mail import assert_production_mail, mail_from
        auth_secret()
        assert_production_mail()
        print(f"[boot] prod_mail={mail_from()}")

    if os.getenv("SKIP_RVM_BOOTSTRAP", "").lower() not in ("1", "true", "yes"):
        try:
            from app.services.rotoscope_service import download_rvm_weights
            path = download_rvm_weights()
            print(f"[boot] RVM weights: {path or 'MISSING'}")
        except Exception as e:
            print(f"[boot] RVM bootstrap skipped/failed: {e}")

    # Start the MCP Client bridge connection
    asyncio.create_task(mcp_client.start())
    yield
    # Shut down the MCP Client subprocess
    await mcp_client.stop()

app = FastAPI(
    title="Montage AI API",
    description="API for automated video editing",
    version="1.0.0",
    lifespan=lifespan
)

_CORS_ORIGINS = cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["Authorization", "Content-Type", "X-Admin-Token"],
)


@app.middleware("http")
async def assert_trusted_origin(request: Request, call_next):
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return await call_next(request)
    origin = (request.headers.get("origin") or "").rstrip("/")
    if not origin:
        return await call_next(request)
    if origin not in _CORS_ORIGINS:
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "origin_forbidden"}, status_code=403)
    return await call_next(request)

app.include_router(video.router)
app.include_router(chat.router)
app.include_router(templates.router)
app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(billing.router)

def _stream_r2(key: str, request: Request, meta: dict, file_headers: dict):
    from app.services.object_store import iter_object

    file_size = int(meta.get("ContentLength") or 0)
    mime_type = meta.get("ContentType") or mimetypes.guess_type(key)[0] or "application/octet-stream"
    if request.method == "HEAD":
        from fastapi.responses import Response
        return Response(
            status_code=200,
            headers={**file_headers, "Content-Length": str(file_size), "Content-Type": mime_type},
        )
    range_header = request.headers.get("range")
    start, end = 0, file_size - 1 if file_size else 0
    status = 200
    if range_header and file_size:
        range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if range_match:
            start = int(range_match.group(1))
            end = int(range_match.group(2)) if range_match.group(2) else file_size - 1
            end = min(end, file_size - 1)
            status = 206
    chunks, slice_len, ctype = iter_object(key, start, end if status == 206 or start > 0 else None)
    headers = {**file_headers, "Content-Length": str(slice_len or (end - start + 1))}
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    return StreamingResponse(chunks, status_code=status, headers=headers, media_type=ctype or mime_type)


def _cors_file_headers(request: Request) -> dict:
    origin = (request.headers.get("origin") or "").rstrip("/")
    headers = {"Vary": "Origin", "Accept-Ranges": "bytes"}
    if origin and origin in _CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return headers


_UPLOAD_UUID_RE = re.compile(
    r"^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.I,
)


def _authorize_upload(path: str, request: Request) -> None:
    from app.auth.deps import assert_project_access, try_resolve_user

    user = try_resolve_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="auth_required")
    match = _UPLOAD_UUID_RE.match(os.path.basename(path))
    if match:
        assert_project_access(match.group(1), user)


# Custom /uploads endpoint with Range Request (206 Partial Content) support for smooth video streaming & seeking
@app.api_route("/uploads/{path:path}", methods=["GET", "HEAD"])
async def get_upload_file(path: str, request: Request):
    # Prevent directory traversal attacks
    safe_path = os.path.normpath(path)
    if safe_path.startswith("..") or os.path.isabs(safe_path):
        raise HTTPException(status_code=400, detail="Invalid path")

    _authorize_upload(safe_path, request)
    file_headers = _cors_file_headers(request)
        
    try:
        from app.core.paths import UPLOAD_DIR
        uploads_root = str(UPLOAD_DIR)
    except Exception:
        uploads_root = "uploads"
    file_path = os.path.join(uploads_root, safe_path)
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        fallback_path = os.path.join("uploads", safe_path)
        if os.path.exists(fallback_path) and os.path.isfile(fallback_path):
            file_path = fallback_path
        else:
            from app.services.object_store import enabled as r2_enabled, head_object
            if r2_enabled():
                meta = head_object(safe_path.replace("\\", "/"))
                if meta:
                    return _stream_r2(safe_path.replace("\\", "/"), request, meta, file_headers)
            raise HTTPException(status_code=404, detail="File not found")

    if request.method == "HEAD":
        return FileResponse(file_path, headers=file_headers)
    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(file_path, headers=file_headers)
        
    file_size = os.path.getsize(file_path)
    range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
    if not range_match:
        return FileResponse(file_path, headers=file_headers)
        
    start = int(range_match.group(1))
    end = range_match.group(2)
    end = int(end) if end else file_size - 1
    end = min(end, file_size - 1)
    chunk_size = end - start + 1
    
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "application/octet-stream"
        
    def file_generator():
        with open(file_path, "rb") as f:
            f.seek(start)
            bytes_left = chunk_size
            while bytes_left > 0:
                chunk = f.read(min(1024 * 1024, bytes_left))
                if not chunk:
                    break
                bytes_left -= len(chunk)
                yield chunk

    headers = {
        **file_headers,
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(chunk_size),
    }
    
    return StreamingResponse(
        file_generator(),
        status_code=206,
        headers=headers,
        media_type=mime_type
    )

app.mount("/assets", StaticFiles(directory="assets"), name="assets")

@app.get("/")
async def root():
    return {"message": "Welcome to Montage AI API"}

@app.get("/health")
async def health_check():
    try:
        from app.core.paths import DATA_DIR, ADMIN_STORE_PATH, rvm_weights_path, ensure_data_dirs
        ensure_data_dirs()
        weights = rvm_weights_path()
        from app.services.object_store import enabled as r2_enabled, ping as r2_ping
        return {
            "status": "healthy",
            "data_dir": str(DATA_DIR),
            "admin_store": ADMIN_STORE_PATH.exists(),
            "rvm_weights": weights.exists() and weights.stat().st_size > 1024 * 1024,
            "r2": (r2_ping() if r2_enabled() else False),
        }
    except Exception as e:
        return {"status": "healthy", "warning": str(e)}
