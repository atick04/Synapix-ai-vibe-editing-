"""
Persistent data paths for local + Railway.

On Railway mount the volume at /app/backend/uploads (or set DATA_DIR).
Everything users need across redeploys lives under DATA_DIR:
  - videos / masks / transcripts
  - admin_store.json (access keys + users)
  - rvm_weights/ (model weights)
"""

from __future__ import annotations

import os
from pathlib import Path

# Backend package root: .../backend
BACKEND_ROOT = Path(__file__).resolve().parents[2]

# Prefer explicit DATA_DIR; else the uploads folder next to the app (WORKDIR=/app/backend)
_raw = os.getenv("DATA_DIR") or os.getenv("UPLOAD_DIR") or str(BACKEND_ROOT / "uploads")
DATA_DIR = Path(_raw).expanduser().resolve()

UPLOAD_DIR = DATA_DIR  # videos, masks, logs, admin store
ADMIN_STORE_PATH = DATA_DIR / "admin_store.json"
RVM_WEIGHTS_DIR = DATA_DIR / "rvm_weights"
# Bundled/fallback weights inside the image (non-persistent)
RVM_WEIGHTS_FALLBACK_DIR = BACKEND_ROOT / "rvm_weights"


def ensure_data_dirs() -> None:
    """Create persistent directories on boot (safe to call many times)."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RVM_WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    # Keep a marker so ops can verify the volume is mounted
    marker = DATA_DIR / ".synapix_data"
    if not marker.exists():
        marker.write_text(
            "Synapix persistent data root. Do not delete.\n",
            encoding="utf-8",
        )


def rvm_weights_path() -> Path:
    """Return path to rvm_mobilenetv3.pth (prefer persistent volume)."""
    primary = RVM_WEIGHTS_DIR / "rvm_mobilenetv3.pth"
    if primary.exists():
        return primary
    fallback = RVM_WEIGHTS_FALLBACK_DIR / "rvm_mobilenetv3.pth"
    if fallback.exists():
        return fallback
    return primary  # download target on the volume
