#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Setup script for Robust Video Matting (RVM) model weights.
Run this once after installation to download model weights.

Usage:
    cd backend
    python setup_rvm.py
"""

import os
import sys

# Force UTF-8 output for Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


def download_weights():
    """Download RVM MobileNetV3 weights (~28MB) onto persistent DATA_DIR when set."""
    try:
        from app.core.paths import ensure_data_dirs, rvm_weights_path
        ensure_data_dirs()
        weights_path = str(rvm_weights_path())
        weights_dir = os.path.dirname(weights_path)
    except Exception:
        weights_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "rvm_weights")
        )
        weights_path = os.path.join(weights_dir, "rvm_mobilenetv3.pth")
    os.makedirs(weights_dir, exist_ok=True)

    if os.path.exists(weights_path):
        size_mb = os.path.getsize(weights_path) / (1024 * 1024)
        print(f"[OK] RVM weights already present: {weights_path} ({size_mb:.1f} MB)")
        return weights_path

    url = "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3.pth"
    print(f"[DL] Downloading RVM MobileNetV3 weights (~28MB)...")
    print(f"     URL: {url}")
    print(f"     Target: {weights_path}")

    try:
        import requests
        r = requests.get(url, stream=True, timeout=120)
        r.raise_for_status()
        total = int(r.headers.get('content-length', 0))
        downloaded = 0

        with open(weights_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
                downloaded += len(chunk)
                if total > 0:
                    pct = downloaded / total * 100
                    print(f"\r     Progress: {pct:.1f}% ({downloaded // 1024 // 1024}MB / {total // 1024 // 1024}MB)", end='', flush=True)

        print(f"\n[OK] RVM weights saved to {weights_path}")
        return weights_path
    except Exception as e:
        print(f"\n[ERROR] Failed to download RVM weights: {e}")
        print("   Please manually download from:")
        print(f"   {url}")
        print(f"   and place in: {weights_path}")
        return None


def verify_installation():
    """Verify that PyTorch and RVM can be loaded."""
    print("\n[CHECK] Verifying PyTorch installation...")
    try:
        import torch
        print(f"   [OK] PyTorch {torch.__version__}")
        cuda_available = torch.cuda.is_available()
        device = "cuda" if cuda_available else "cpu"
        if cuda_available:
            print("   [OK] CUDA available - GPU acceleration enabled!")
        else:
            print("   [INFO] CPU only (slower processing, still works fine)")
        print(f"   Device: {device.upper()}")
    except ImportError:
        print("   [ERROR] PyTorch not installed. Run: pip install torch torchvision")
        return False

    print("\n[CHECK] Verifying OpenCV installation...")
    try:
        import cv2
        print(f"   [OK] OpenCV {cv2.__version__}")
    except ImportError:
        print("   [ERROR] OpenCV not installed. Run: pip install opencv-python-headless")
        return False

    print("\n[CHECK] Verifying rembg (fallback) installation...")
    try:
        import rembg
        print("   [OK] rembg available (fallback ready)")
    except ImportError:
        print("   [WARN] rembg not installed (optional fallback). Run: pip install rembg")

    return True


if __name__ == "__main__":
    print("=" * 55)
    print("  RVM Rotoscoping Setup")
    print("  Robust Video Matting for VibeEdit AI")
    print("=" * 55)

    ok = verify_installation()
    if not ok:
        print("\n[ERROR] Setup incomplete. Please install missing dependencies first:")
        print("   pip install torch torchvision opencv-python-headless rembg requests")
        sys.exit(1)

    path = download_weights()
    if not path:
        print("\n[WARN] Weight download failed. Rotoscoping will use rembg fallback.")
        sys.exit(1)

    print("\n" + "=" * 55)
    print("  [DONE] RVM Setup Complete!")
    print("  The Director AI can now use 'remove_background' tool")
    print("  to apply professional rotoscoping to any video.")
    print("=" * 55)
