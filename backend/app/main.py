import app.core.env_patch  # Apply dotenv patch first
import asyncio
from contextlib import asynccontextmanager
import mimetypes
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import re
from app.api import video, chat, templates, admin
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
    except Exception as e:
        print(f"[boot] ensure_data_dirs failed: {e}")

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

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local dev
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video.router)
app.include_router(chat.router)
app.include_router(templates.router)
app.include_router(admin.router)

# Custom /uploads endpoint with Range Request (206 Partial Content) support for smooth video streaming & seeking
@app.get("/uploads/{path:path}")
async def get_upload_file(path: str, request: Request):
    # Prevent directory traversal attacks
    safe_path = os.path.normpath(path)
    if safe_path.startswith("..") or os.path.isabs(safe_path):
        raise HTTPException(status_code=400, detail="Invalid path")
        
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
            raise HTTPException(status_code=404, detail="File not found")
        
    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(file_path, headers={
            "Access-Control-Allow-Origin": "*",
            "Vary": "Origin",
        })
        
    file_size = os.path.getsize(file_path)
    range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
    if not range_match:
        return FileResponse(file_path, headers={
            "Access-Control-Allow-Origin": "*",
            "Vary": "Origin",
        })
        
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
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_size),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
        "Vary": "Origin",
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
        return {
            "status": "healthy",
            "data_dir": str(DATA_DIR),
            "admin_store": ADMIN_STORE_PATH.exists(),
            "rvm_weights": weights.exists() and weights.stat().st_size > 1024 * 1024,
        }
    except Exception as e:
        return {"status": "healthy", "warning": str(e)}
