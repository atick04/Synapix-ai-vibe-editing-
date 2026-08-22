"""Cover-crop 16:9 talking-head into Instagram Reels 9:16."""

from __future__ import annotations

import json
import subprocess
from typing import Any, Dict, Optional, Tuple


REELS_RATIO = 9.0 / 16.0
REELS_SIZE = (1080, 1920)


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def display_size(width: int, height: int, rotation: float = 0.0) -> Tuple[int, int]:
    """Swap axes when the file is landscape pixels with 90/270 rotation metadata."""
    rot = abs(int(rotation)) % 360
    if rot in (90, 270) and width > 0 and height > 0:
        return int(height), int(width)
    return int(width), int(height)


def needs_vertical_reframe(width: int, height: int, rotation: float = 0.0) -> bool:
    w, h = display_size(width, height, rotation)
    if w <= 0 or h <= 0:
        return False
    return (w / h) > (REELS_RATIO + 0.04)


def cover_crop(
    src_w: int,
    src_h: int,
    target_ratio: float = REELS_RATIO,
    focus_x: float = 0.5,
    focus_y: float = 0.45,
) -> Dict[str, float]:
    """Source-pixel window that fills target_ratio (cover). focus 0..1 = pan."""
    src_w = max(1, int(src_w))
    src_h = max(1, int(src_h))
    fx, fy = clamp01(focus_x), clamp01(focus_y)
    src_ratio = src_w / src_h
    if src_ratio > target_ratio:
        crop_w = src_h * target_ratio
        crop_h = float(src_h)
        x = (src_w - crop_w) * fx
        y = 0.0
    elif src_ratio < target_ratio:
        crop_w = float(src_w)
        crop_h = src_w / target_ratio
        x = 0.0
        y = (src_h - crop_h) * fy
    else:
        crop_w, crop_h, x, y = float(src_w), float(src_h), 0.0, 0.0
    return {
        "x": round(x, 2),
        "y": round(y, 2),
        "w": round(crop_w, 2),
        "h": round(crop_h, 2),
        "uv_x": round(x / src_w, 4),
        "uv_y": round(y / src_h, 4),
        "uv_w": round(crop_w / src_w, 4),
        "uv_h": round(crop_h / src_h, 4),
    }


def layout_from_edits(edits: Optional[list]) -> Dict[str, Any]:
    """fit=cover fills the 9:16 frame; fit=contain letterboxes 16:9 inside it."""
    for e in edits or []:
        if e.get("action") != "change_format":
            continue
        raw = str(e.get("fit") or e.get("mode") or "cover").lower()
        fit = "contain" if raw in ("contain", "letterbox", "fit", "horizontal", "16:9") else "cover"
        scale = float(e.get("scale") or 1.0)
        if fit == "contain":
            scale = max(0.45, min(1.0, scale))
        else:
            scale = max(1.0, min(2.2, scale))
        return {
            "fit": fit,
            "scale": scale,
            "focus_x": clamp01(e.get("focus_x", 0.5)),
            "focus_y": clamp01(e.get("focus_y", 0.5 if fit == "contain" else 0.45)),
        }
    return {"fit": "cover", "scale": 1.0, "focus_x": 0.5, "focus_y": 0.45}


def focus_from_edits(edits: Optional[list]) -> Tuple[float, float]:
    lay = layout_from_edits(edits)
    return lay["focus_x"], lay["focus_y"]


def probe_video_display_size(path: str) -> Tuple[int, int, float]:
    """Return (display_width, display_height, rotation_degrees)."""
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height:stream_tags=rotate:stream_side_data=rotation",
        "-of", "json", path,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if res.returncode != 0:
        return 0, 0, 0.0
    data = json.loads(res.stdout or "{}")
    streams = data.get("streams") or []
    if not streams:
        return 0, 0, 0.0
    st = streams[0]
    width = int(st.get("width") or 0)
    height = int(st.get("height") or 0)
    rotation = 0.0
    tags = st.get("tags") or {}
    if tags.get("rotate") not in (None, ""):
        try:
            rotation = float(tags["rotate"])
        except (TypeError, ValueError):
            rotation = 0.0
    for sd in st.get("side_data_list") or []:
        if sd.get("rotation") not in (None, ""):
            try:
                rotation = float(sd["rotation"])
            except (TypeError, ValueError):
                pass
    dw, dh = display_size(width, height, rotation)
    return dw, dh, rotation


def format_edit(
    focus_x: float = 0.5,
    focus_y: float = 0.45,
    fit: str = "cover",
    scale: float = 1.0,
) -> Dict[str, Any]:
    fit_n = "contain" if fit in ("contain", "letterbox", "fit", "horizontal") else "cover"
    return {
        "action": "change_format",
        "format": "9:16",
        "fit": fit_n,
        "scale": round(float(scale), 3),
        "focus_x": round(clamp01(focus_x), 3),
        "focus_y": round(clamp01(focus_y), 3),
    }
