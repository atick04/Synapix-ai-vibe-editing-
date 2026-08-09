"""
Rotoscoping Service — Robust Video Matting (RVM) Integration.
https://github.com/PeterL1n/RobustVideoMatting

Removes background from speaker video with high-quality alpha matte.
Outputs:
  - WebM with alpha channel (for overlay compositing)
  - MP4 with custom background color/gradient
"""

import os
import logging
import subprocess
import tempfile
import uuid
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

_rvm_model = None
_rvm_failed = False


def _init_rvm():
    """Lazy load RVM model (mobilenetv3 variant for CPU compatibility)."""
    global _rvm_model, _rvm_failed
    if _rvm_model is not None:
        return _rvm_model
    # Allow retry after deps were installed without process restart
    if _rvm_failed:
        _rvm_failed = False

    try:
        import torch
        from app.services.rvm_core import MattingNetwork
        model = MattingNetwork('mobilenetv3')

        from app.core.paths import rvm_weights_path, ensure_data_dirs
        ensure_data_dirs()
        weights_path = str(rvm_weights_path())

        if not os.path.exists(weights_path):
            # One-shot download onto the persistent volume
            downloaded = download_rvm_weights()
            weights_path = downloaded or weights_path
        if not os.path.exists(weights_path):
            logger.warning(f"⚠️ RVM weights not found at {weights_path}. Run: python setup_rvm.py")
            _rvm_failed = True
            return None

        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        try:
            state = torch.load(weights_path, map_location=device, weights_only=True)
        except TypeError:
            state = torch.load(weights_path, map_location=device)
        model.load_state_dict(state)
        model = model.eval().to(device)
        _rvm_model = (model, device)
        logger.info(f"✅ RVM Model loaded on {device}")
        return _rvm_model
    except ImportError as e:
        logger.warning(f"⚠️ RVM dependencies missing ({e}). Install into the SAME venv as uvicorn: pip install torch torchvision")
        _rvm_failed = True
        return None
    except Exception as e:
        logger.error(f"⚠️ RVM init failed: {e}")
        _rvm_failed = True
        return None


def download_rvm_weights():
    """Downloads RVM MobileNetV3 weights (~28MB) onto the persistent data volume."""
    from app.core.paths import rvm_weights_path, ensure_data_dirs, RVM_WEIGHTS_FALLBACK_DIR
    ensure_data_dirs()
    weights_path = str(rvm_weights_path())

    if os.path.exists(weights_path) and os.path.getsize(weights_path) > 1024 * 1024:
        logger.info(f"✅ RVM weights already present: {weights_path}")
        return weights_path

    # Copy from image fallback if present (faster than network)
    fallback = RVM_WEIGHTS_FALLBACK_DIR / "rvm_mobilenetv3.pth"
    if fallback.exists() and fallback.stat().st_size > 1024 * 1024:
        try:
            import shutil
            shutil.copy2(str(fallback), weights_path)
            logger.info(f"✅ RVM weights copied to volume: {weights_path}")
            return weights_path
        except Exception as e:
            logger.warning(f"Could not copy fallback RVM weights: {e}")

    url = "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3.pth"
    logger.info(f"⬇️  Downloading RVM weights from GitHub (~28MB)...")
    try:
        import requests
        r = requests.get(url, stream=True, timeout=180)
        r.raise_for_status()
        os.makedirs(os.path.dirname(weights_path), exist_ok=True)
        with open(weights_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        logger.info(f"✅ RVM weights saved to {weights_path}")
        return weights_path
    except Exception as e:
        logger.error(f"❌ Failed to download RVM weights: {e}")
        return None


def remove_background_rvm(
    input_video_path: str,
    output_path: Optional[str] = None,
    bg_color: str = "transparent",   # 'transparent', '#1a1a2e', 'gradient'
    downsample_ratio: float = 0.25,  # Lower = faster, higher = sharper
) -> Optional[str]:
    """
    Remove background from video using Robust Video Matting (RVM).
    
    Args:
        input_video_path: Path to input video (MP4)
        output_path: Where to save the result. If None, auto-generates path.
        bg_color: 'transparent' = WebM with alpha, or hex color for solid bg
        downsample_ratio: 0.25 is fast & good. 0.5 is higher quality but slower.
    
    Returns:
        Path to output file, or None if failed.
    """
    if not os.path.exists(input_video_path):
        logger.error(f"❌ Input video not found: {input_video_path}")
        return None

    # Generate output path
    if not output_path:
        ext = "webm" if bg_color == "transparent" else "mp4"
        output_path = input_video_path.replace(".mp4", f"_rvm.{ext}")

    rvm_result = _run_rvm_native(input_video_path, output_path, bg_color, downsample_ratio)
    
    if rvm_result:
        logger.info(f"✅ RVM rotoscoping completed: {output_path}")
        return output_path
    
    # Fallback: rembg frame-by-frame
    logger.warning("⚠️ RVM native failed. Falling back to rembg frame-by-frame processing.")
    return _rembg_fallback(input_video_path, output_path, bg_color)


def _run_rvm_opencv(
    input_path: str,
    output_path: str,
    bg_color: str,
    downsample_ratio: float,
    model,
    device: str,
) -> bool:
    """Stream frames with OpenCV → RVM → FFmpeg (memory-friendly, MP4 for preview)."""
    try:
        import cv2
        import torch
        import numpy as np
        from PIL import Image
        import shutil

        want_alpha = bg_color == "transparent" and output_path.lower().endswith(".webm")
        composite_bg = bg_color if bg_color and bg_color != "transparent" else "#0a0a14"

        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            return False

        fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
        ds = float(downsample_ratio) if downsample_ratio and downsample_ratio > 0 else 0.25

        tmp_dir = tempfile.mkdtemp(prefix="rvm_frames_")
        rec = [None] * 4
        idx = 0
        bg_t = None if want_alpha else _hex_to_tensor(composite_bg, device)
        # Canvas-friendly grayscale matte (VP8 WebM alpha is unreliable in browsers)
        if want_alpha:
            if "_rvm_alpha" in output_path:
                mask_out = output_path.replace("_rvm_alpha.webm", "_rvm_mask.mp4").replace(
                    "_rvm_alpha.WEBM", "_rvm_mask.mp4"
                )
            else:
                mask_out = os.path.splitext(output_path)[0] + "_mask.mp4"
        else:
            mask_out = None

        try:
            with torch.no_grad():
                while True:
                    ok, frame_bgr = cap.read()
                    if not ok:
                        break
                    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                    src = torch.from_numpy(rgb).float().div_(255.0).permute(2, 0, 1).unsqueeze(0).to(device)
                    fgr, pha, *rec = model(src, *rec, downsample_ratio=ds)

                    # Always restore source resolution (downsample_ratio can leave low-res tensors)
                    _, _, src_h, src_w = src.shape
                    if fgr.shape[-2] != src_h or fgr.shape[-1] != src_w:
                        fgr = torch.nn.functional.interpolate(
                            fgr, size=(src_h, src_w), mode="bilinear", align_corners=False
                        )
                        pha = torch.nn.functional.interpolate(
                            pha, size=(src_h, src_w), mode="bilinear", align_corners=False
                        )

                    if want_alpha:
                        # Preview compositing only needs the grayscale matte (canvas luma→alpha).
                        # Skipping RGBA WebM saves a lot of disk/CPU at full HD.
                        mask = (pha.squeeze(0).squeeze(0).clamp(0, 1).cpu().numpy() * 255).astype(np.uint8)
                        Image.fromarray(mask, mode="L").save(os.path.join(tmp_dir, f"mask_{idx:06d}.png"))
                    else:
                        composite = (fgr * pha + bg_t * (1 - pha)).squeeze(0).clamp(0, 1).cpu()
                        arr = (composite.permute(1, 2, 0).numpy() * 255).astype(np.uint8)
                        bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
                        cv2.imwrite(os.path.join(tmp_dir, f"frame_{idx:06d}.png"), bgr)
                    idx += 1
        finally:
            cap.release()

        if idx == 0:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            return False

        # Ensure browser-playable MP4 for non-alpha preview
        final_out = output_path
        if not want_alpha and not final_out.lower().endswith(".mp4"):
            final_out = os.path.splitext(final_out)[0] + ".mp4"

        if want_alpha and mask_out:
            mask_cmd = [
                "ffmpeg", "-y", "-framerate", str(fps),
                "-i", os.path.join(tmp_dir, "mask_%06d.png"),
                "-c:v", "libx264", "-preset", "fast", "-crf", "14",
                "-pix_fmt", "yuv420p",
                "-vf", "format=gray,format=yuv420p",
                mask_out, "-loglevel", "error",
            ]
            subprocess.run(mask_cmd, check=True, timeout=600)
            logger.info(f"✅ RVM mask (canvas-safe) written: {mask_out}")
            # Optional tiny stub so callers expecting .webm path don't error on exists checks
            try:
                if final_out.lower().endswith(".webm") and not os.path.exists(final_out):
                    # Point "result" at mask — copy not needed; create empty marker sidecar
                    with open(final_out + ".mask_only", "w", encoding="utf-8") as f:
                        f.write(mask_out)
            except Exception:
                pass
            shutil.rmtree(tmp_dir, ignore_errors=True)
            ok = os.path.exists(mask_out) and os.path.getsize(mask_out) > 0
            if ok:
                logger.info(f"✅ RVM OpenCV wrote {idx} mask frames → {mask_out}")
            return ok

        if want_alpha:
            ffmpeg_cmd = [
                "ffmpeg", "-y", "-framerate", str(fps),
                "-i", os.path.join(tmp_dir, "frame_%06d.png"),
                "-c:v", "libvpx", "-auto-alt-ref", "0",
                "-pix_fmt", "yuva420p", "-b:v", "2M",
                final_out, "-loglevel", "error",
            ]
        else:
            ffmpeg_cmd = [
                "ffmpeg", "-y", "-framerate", str(fps),
                "-i", os.path.join(tmp_dir, "frame_%06d.png"),
                "-i", input_path,
                "-map", "0:v:0", "-map", "1:a:0?",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                final_out, "-loglevel", "error",
            ]

        subprocess.run(ffmpeg_cmd, check=True, timeout=600)

        shutil.rmtree(tmp_dir, ignore_errors=True)

        if final_out != output_path and os.path.exists(final_out):
            # Caller may expect .mp4 path for preview
            if output_path.lower().endswith(".mp4"):
                shutil.copy2(final_out, output_path)
            else:
                # Update caller's expected path by renaming reference via copy
                shutil.copy2(final_out, output_path) if os.path.splitext(output_path)[1] else None

        ok = os.path.exists(final_out)
        if ok:
            logger.info(f"✅ RVM OpenCV wrote {idx} frames → {final_out}")
        return ok

    except Exception as e:
        logger.warning(f"RVM OpenCV path failed ({e}), will try torchvision fallback")
        return False


def _run_rvm_native(
    input_path: str,
    output_path: str,
    bg_color: str,
    downsample_ratio: float,
) -> bool:
    """Run RVM model via OpenCV streaming (torchvision.io.read_video is gone in recent builds)."""
    try:
        rvm = _init_rvm()
        if not rvm:
            return False

        model, device = rvm
        logger.info(f"🎭 Starting RVM inference on {input_path} (device={device})")

        result = _run_rvm_opencv(input_path, output_path, bg_color, downsample_ratio, model, device)
        if result:
            return True

        logger.error("❌ RVM OpenCV path returned no output")
        return False

    except Exception as e:
        logger.error(f"❌ RVM native inference failed: {e}")
        return False


def _save_alpha_webm(frames_tensor, output_path: str, fps: float, audio):
    """Save RGBA frames as WebM with VP8 alpha channel via FFmpeg pipe."""
    import torch
    import numpy as np

    tmp_rgba_dir = tempfile.mkdtemp(prefix="rvm_rgba_")
    try:
        for i, frame in enumerate(frames_tensor):
            rgba = (frame.permute(1, 2, 0).numpy() * 255).astype(np.uint8)
            from PIL import Image
            img = Image.fromarray(rgba, mode='RGBA')
            img.save(os.path.join(tmp_rgba_dir, f"frame_{i:06d}.png"))

        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", os.path.join(tmp_rgba_dir, "frame_%06d.png"),
            "-c:v", "libvpx", "-auto-alt-ref", "0",
            "-pix_fmt", "yuva420p",
            "-b:v", "2M",
            output_path, "-loglevel", "error"
        ]
        subprocess.run(ffmpeg_cmd, check=True, timeout=300)
        return True
    except Exception as e:
        logger.error(f"❌ Alpha WebM save failed: {e}")
        return False
    finally:
        import shutil
        shutil.rmtree(tmp_rgba_dir, ignore_errors=True)


def _rembg_fallback(input_path: str, output_path: str, bg_color: str) -> Optional[str]:
    """Fast fallback: frame-by-frame background removal using rembg library."""
    try:
        from rembg import remove
        from PIL import Image
        import cv2
        import numpy as np

        logger.info("🎭 [rembg Fallback] Processing video frame-by-frame...")
        cap = cv2.VideoCapture(input_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        tmp_rgba_dir = tempfile.mkdtemp(prefix="rembg_rgba_")
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            result = remove(img)  # RGBA
            if bg_color and bg_color != "transparent":
                hex_color = bg_color.lstrip("#")
                if len(hex_color) == 6:
                    br = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
                    bg = Image.new("RGBA", result.size, (*br, 255))
                    result = Image.alpha_composite(bg, result).convert("RGB")
                    result.save(os.path.join(tmp_rgba_dir, f"frame_{frame_idx:06d}.png"))
                else:
                    result.save(os.path.join(tmp_rgba_dir, f"frame_{frame_idx:06d}.png"))
            else:
                result.save(os.path.join(tmp_rgba_dir, f"frame_{frame_idx:06d}.png"))
            frame_idx += 1
        cap.release()

        if bg_color and bg_color != "transparent":
            final = output_path if output_path.lower().endswith(".mp4") else os.path.splitext(output_path)[0] + ".mp4"
            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-framerate", str(fps),
                "-i", os.path.join(tmp_rgba_dir, "frame_%06d.png"),
                "-i", input_path,
                "-map", "0:v:0", "-map", "1:a:0?",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                final, "-loglevel", "error",
            ]
            subprocess.run(ffmpeg_cmd, check=True, timeout=600)
            import shutil
            shutil.rmtree(tmp_rgba_dir, ignore_errors=True)
            if final != output_path and os.path.exists(final) and output_path.lower().endswith(".mp4"):
                shutil.copy2(final, output_path)
                return output_path
            return final if os.path.exists(final) else None

        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", os.path.join(tmp_rgba_dir, "frame_%06d.png"),
            "-c:v", "libvpx", "-auto-alt-ref", "0",
            "-pix_fmt", "yuva420p", "-b:v", "2M",
            output_path, "-loglevel", "error"
        ]
        subprocess.run(ffmpeg_cmd, check=True, timeout=600)
        
        import shutil
        shutil.rmtree(tmp_rgba_dir, ignore_errors=True)

        return output_path if os.path.exists(output_path) else None

    except ImportError as e:
        logger.error(f"❌ rembg import failed: {e}. Run: pip install rembg onnxruntime")
        return None
    except Exception as e:
        logger.error(f"❌ rembg fallback failed: {e}")
        return None


def _hex_to_tensor(hex_color: str, device: str):
    """Convert hex color string to normalized float tensor [1, 3, 1, 1]."""
    import torch
    hex_color = hex_color.lstrip('#')
    r, g, b = [int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    return torch.tensor([r, g, b], device=device).reshape(1, 3, 1, 1)


def composite_on_background(
    rvm_webm_path: str,
    background_path: str,
    output_path: str,
    start: float = 0.0,
    end: Optional[float] = None,
) -> Optional[str]:
    """
    Composite the RVM alpha-masked speaker on top of a background video/image using FFmpeg.
    
    Args:
        rvm_webm_path: Path to rotoscoped WebM with alpha
        background_path: Path to background video or image
        output_path: Output MP4 path
        start: Start time offset in background
        end: End time in background (None = full)
    """
    try:
        duration_arg = ["-t", str(end - start)] if end else []
        
        cmd = [
            "ffmpeg", "-y",
            "-i", background_path,
            "-i", rvm_webm_path,
            "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto[outv]",
            "-map", "[outv]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            *duration_arg,
            output_path, "-loglevel", "error"
        ]
        result = subprocess.run(cmd, timeout=300, capture_output=True)
        if result.returncode == 0 and os.path.exists(output_path):
            logger.info(f"[RVM] Speaker composited on background: {output_path}")
            return output_path
        else:
            logger.error(f"[RVM] FFmpeg composite failed: {result.stderr.decode()[:200]}")
            return None
    except Exception as e:
        logger.error(f"[RVM] Composite failed: {e}")
        return None


def create_text_background(
    output_path: str,
    duration: float,
    width: int = 1080,
    height: int = 1920,
    bg_color: str = "#0a0a14",
    text: Optional[str] = None,
    text_color: str = "white",
    text_opacity: float = 0.12,
    font_size: int = 220,
    gradient_color2: Optional[str] = None,
    fps: float = 30.0,
) -> Optional[str]:
    """
    Generate a background video using FFmpeg lavfi source.
    Supports solid color, gradient, and big text overlaid on the background.
    
    Args:
        output_path: Where to save the background MP4
        duration: Duration of the background video in seconds
        width/height: Frame dimensions (default 1080x1920 for 9:16)
        bg_color: Background fill color (hex or color name)
        text: Optional large text to display behind speaker
        text_color: Color of the background text
        text_opacity: Opacity of the text (0.0 - 1.0), default 0.12 (subtle)
        font_size: Font size for background text
        gradient_color2: If set, creates a top-to-bottom gradient blend with bg_color
        fps: Frames per second
    
    Returns:
        Path to generated background video, or None on failure.
    """
    try:
        # Convert hex to ffmpeg color format
        def hex_to_ffmpeg(h: str) -> str:
            return h.lstrip('#') if h.startswith('#') else h

        bg_hex = hex_to_ffmpeg(bg_color)

        # Step 1: Create base color background
        vf_filters = []

        if gradient_color2:
            # Create two-tone gradient via vstack trick
            bg2_hex = hex_to_ffmpeg(gradient_color2)
            base_filter = (
                f"color=c=#{bg_hex}:size={width}x{height // 2}:rate={fps}[top];"
                f"color=c=#{bg2_hex}:size={width}x{height // 2}:rate={fps}[bot];"
                f"[top][bot]vstack[bg]"
            )
            input_filter = base_filter
            current_stream = "[bg]"
        else:
            input_filter = f"color=c=#{bg_hex}:size={width}x{height}:rate={fps}"
            current_stream = ""

        # Step 2: Overlay text if provided
        if text:
            # Clean text for FFmpeg (escape special chars)
            safe_text = (
                text.replace("'", "\\'")
                    .replace(":", "\\:")
                    .replace("\\", "\\\\")
            )
            # Convert opacity to alpha (FFmpeg uses 0x00-0xff)
            alpha_hex = format(int(text_opacity * 255), '02x')
            text_color_alpha = f"{hex_to_ffmpeg(text_color.lstrip('#'))}@{text_opacity:.2f}"

            if gradient_color2:
                # Complex filtergraph with gradient
                drawtext_filter = (
                    f"{input_filter};"
                    f"{current_stream}drawtext="
                    f"text='{safe_text}':"
                    f"fontsize={font_size}:"
                    f"fontcolor={text_color}@{text_opacity:.2f}:"
                    f"x=(w-text_w)/2:y=(h-text_h)/2:"
                    f"font=Sans"
                )
                cmd = [
                    "ffmpeg", "-y",
                    "-f", "lavfi", "-i", f"color=c=#{bg_hex}:size={width}x{height}:rate={fps}",
                    "-vf", (
                        f"drawtext="
                        f"text='{safe_text}':"
                        f"fontsize={font_size}:"
                        f"fontcolor={text_color}@{text_opacity:.2f}:"
                        f"x=(w-text_w)/2:y=(h-text_h)/2:"
                        f"font=Sans"
                    ),
                    "-t", str(duration),
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20",
                    output_path, "-loglevel", "error"
                ]
            else:
                cmd = [
                    "ffmpeg", "-y",
                    "-f", "lavfi",
                    "-i", f"color=c=#{bg_hex}:size={width}x{height}:rate={fps}",
                    "-vf", (
                        f"drawtext="
                        f"text='{safe_text}':"
                        f"fontsize={font_size}:"
                        f"fontcolor={text_color}@{text_opacity:.2f}:"
                        f"x=(w-text_w)/2:y=(h-text_h)/2:"
                        f"font=Sans"
                    ),
                    "-t", str(duration),
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20",
                    output_path, "-loglevel", "error"
                ]
        else:
            # Pure solid color background (no text)
            cmd = [
                "ffmpeg", "-y",
                "-f", "lavfi",
                "-i", f"color=c=#{bg_hex}:size={width}x{height}:rate={fps}",
                "-t", str(duration),
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20",
                output_path, "-loglevel", "error"
            ]

        result = subprocess.run(cmd, timeout=120, capture_output=True)
        if result.returncode == 0 and os.path.exists(output_path):
            logger.info(f"[TextBG] Background video created: {output_path} ({duration:.1f}s)")
            return output_path
        else:
            logger.error(f"[TextBG] FFmpeg background generation failed: {result.stderr.decode()[:300]}")
            return None

    except Exception as e:
        logger.error(f"[TextBG] Background creation error: {e}")
        return None


def process_roto_preview(
    input_video_path: str,
    output_path: str,
    action: str = "remove_background",
    bg_color: str = "#0a0a14",
    text: Optional[str] = None,
    text_color: str = "white",
    text_opacity: float = 0.12,
    font_size: int = 220,
    gradient_color2: Optional[str] = None,
    bg_video_path: Optional[str] = None,
    downsample_ratio: float = 0.25,
) -> Optional[str]:
    """
    Preview-oriented RVM pipeline. Always produces browser-playable MP4
    (composited speaker on color / text / stock background).
    """
    if not os.path.exists(input_video_path):
        logger.error(f"[RotoPreview] Input not found: {input_video_path}")
        return None

    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)

    # Normalize transparent → solid for <video> preview
    color = bg_color if bg_color and bg_color != "transparent" else "#0a0a14"

    if action == "set_video_background" or text or gradient_color2:
        result = apply_text_behind_speaker(
            input_video_path=input_video_path,
            output_path=output_path,
            text=text,
            bg_color=color,
            text_color=text_color,
            text_opacity=text_opacity,
            font_size=font_size,
            gradient_color2=gradient_color2,
            downsample_ratio=downsample_ratio,
        )
        return result if result and os.path.exists(result) else None

    # remove_background → composite on color (or stock video)
    if bg_video_path and os.path.exists(bg_video_path):
        webm_tmp = output_path.replace(".mp4", "_alpha.webm")
        roto = remove_background_rvm(
            input_video_path=input_video_path,
            output_path=webm_tmp,
            bg_color="transparent",
            downsample_ratio=downsample_ratio,
        )
        if not roto:
            return None
        composited = composite_on_background(roto, bg_video_path, output_path)
        try:
            if os.path.exists(webm_tmp):
                os.remove(webm_tmp)
        except Exception:
            pass
        return composited if composited and os.path.exists(composited) else None

    return remove_background_rvm(
        input_video_path=input_video_path,
        output_path=output_path,
        bg_color=color,
        downsample_ratio=downsample_ratio,
    )


def apply_text_behind_speaker(
    input_video_path: str,
    output_path: str,
    text: Optional[str] = None,
    bg_color: str = "#0a0a14",
    text_color: str = "white",
    text_opacity: float = 0.12,
    font_size: int = 220,
    gradient_color2: Optional[str] = None,
    downsample_ratio: float = 0.25,
) -> Optional[str]:
    """
    Full pipeline: removes speaker background + composites on a generated text/color background.
    
    Flow:
      1. Generate background video (FFmpeg lavfi + drawtext)
      2. RVM rotoscope the speaker video -> WebM with alpha
      3. Composite speaker WebM over background MP4
    
    Args:
        input_video_path: Original speaker video (MP4)
        output_path: Final output MP4 path
        text: Text to display behind speaker (large, subtle)
        bg_color: Background fill hex color
        text_color: Color of the background text
        text_opacity: Opacity of text (0.05 - 0.25 for subtle effect)
        font_size: Font size of background text
        gradient_color2: Optional second gradient color
        downsample_ratio: RVM quality (0.25=fast, 0.5=high quality)
    
    Returns:
        Final composited video path or None on failure.
    """
    if not os.path.exists(input_video_path):
        logger.error(f"[TextBehind] Input video not found: {input_video_path}")
        return None

    # Probe video duration and dimensions
    try:
        probe_cmd = [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_format", "-show_streams", input_video_path
        ]
        probe = subprocess.run(probe_cmd, capture_output=True, timeout=30)
        import json as _json
        probe_data = _json.loads(probe.stdout)
        duration = float(probe_data["format"]["duration"])
        vs = next((s for s in probe_data["streams"] if s.get("codec_type") == "video"), {})
        width = int(vs.get("width", 1080))
        height = int(vs.get("height", 1920))
        fps = eval(vs.get("r_frame_rate", "30/1"))
    except Exception as e:
        logger.warning(f"[TextBehind] Probe failed ({e}), using defaults")
        duration, width, height, fps = 30.0, 1080, 1920, 30.0

    base = output_path.replace(".mp4", "")
    bg_path = base + "_textbg.mp4"
    roto_path = base + "_rvm.webm"

    # Step 1: Generate text background
    logger.info(f"[TextBehind] Step 1/3 — Generating text background (text={repr(text)}, bg={bg_color})")
    bg_result = create_text_background(
        output_path=bg_path,
        duration=duration,
        width=width,
        height=height,
        bg_color=bg_color,
        text=text,
        text_color=text_color,
        text_opacity=text_opacity,
        font_size=font_size,
        gradient_color2=gradient_color2,
        fps=float(fps),
    )
    if not bg_result:
        logger.error("[TextBehind] Background generation failed")
        return None

    # Step 2: RVM rotoscope (remove speaker background)
    logger.info(f"[TextBehind] Step 2/3 — RVM rotoscoping speaker...")
    roto_result = remove_background_rvm(
        input_video_path=input_video_path,
        output_path=roto_path,
        bg_color="transparent",
        downsample_ratio=downsample_ratio,
    )
    if not roto_result:
        logger.error("[TextBehind] RVM rotoscoping failed")
        # Cleanup
        if os.path.exists(bg_path):
            os.remove(bg_path)
        return None

    # Step 3: Composite speaker over background
    logger.info(f"[TextBehind] Step 3/3 — Compositing speaker over text background...")
    final = composite_on_background(roto_result, bg_result, output_path)

    # Cleanup temp files
    for tmp in [bg_path, roto_path]:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass

    if final and os.path.exists(final):
        logger.info(f"[TextBehind] Done! Output: {output_path}")
        return final

    logger.error("[TextBehind] Final compositing failed")
    return None

