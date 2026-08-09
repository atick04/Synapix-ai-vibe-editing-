#!/bin/sh
set -e

# Railway / Docker entrypoint — keep user data on the mounted volume.
cd /app/backend

export DATA_DIR="${DATA_DIR:-/app/backend/uploads}"
mkdir -p "$DATA_DIR" "$DATA_DIR/rvm_weights"

echo "[entrypoint] DATA_DIR=$DATA_DIR"
echo "[entrypoint] PORT=${PORT:-8000}"

# Best-effort RVM weights on the volume (non-fatal if offline)
python - <<'PY' || true
from app.core.paths import ensure_data_dirs
ensure_data_dirs()
try:
    from app.services.rotoscope_service import download_rvm_weights
    print("[entrypoint] RVM:", download_rvm_weights())
except Exception as e:
    print("[entrypoint] RVM bootstrap:", e)
PY

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
