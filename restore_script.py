import sys

content_to_append = '''
from pydantic import BaseModel
from typing import Optional, List, Any
from app.services.video_service import render_video
import asyncio

class ExportSettings(BaseModel):
    file_id: str
    resolution: str = "1080p"
    fps: int = 30
    quality: str = "high"
    format: str = "mp4_h264"
    audio_bitrate: str = "192k"
    edits: Optional[List[Any]] = None
    edl: Optional[Any] = None
    font: Optional[str] = "Montserrat Bold"
    font_size: Optional[int] = 100
    font_color: Optional[str] = "white"
    use_outline: Optional[bool] = True
    template_id: Optional[str] = None

RESOLUTION_MAP = {
    "720p":  (1280, 720),
    "1080p": (1920, 1080),
    "4k":    (3840, 2160),
}

QUALITY_MAP = {
    "high":   (18, "slow"),
    "medium": (23, "medium"),
    "fast":   (28, "fast"),
}

FORMAT_MAP = {
    "mp4_h264": {"vcodec": "libx264", "ext": "mp4"},
    "mp4_h265": {"vcodec": "libx265", "ext": "mp4"},
    "webm":     {"vcodec": "libvpx-vp9", "ext": "webm"},
}

async def run_export_task(file_id: str, settings: ExportSettings):
    \"\"\"Background task: export final video with user-chosen settings via FFmpeg.\"\"\"
    render_lock = os.path.join(UPLOAD_DIR, f"{file_id}.rendering")
    open(render_lock, "w").close()
    log_progress(file_id, f"🎬 Экспорт начат: {settings.resolution} / {settings.fps}fps / {settings.quality} / {settings.format}")

    try:
        source = None
        for f in os.listdir(UPLOAD_DIR):
            if f.startswith(file_id) and not any(x in f for x in ["_rendered", "_transcript", "_visual", ".log", ".mp3", ".rendering", ".ass"]):
                ext_lower = os.path.splitext(f)[1].lower()
                if ext_lower in [".mp4", ".mov", ".avi", ".mkv", ".webm"]:
                    source = os.path.join(UPLOAD_DIR, f)
                    break

        if not source:
            log_progress(file_id, "❌ Исходный видеофайл не найден.")
            return

        resolution = RESOLUTION_MAP.get(settings.resolution, (1920, 1080))
        crf, preset = QUALITY_MAP.get(settings.quality, (23, "medium"))
        fmt = FORMAT_MAP.get(settings.format, {"vcodec": "libx264", "ext": "mp4"})
        out_path = os.path.join(UPLOAD_DIR, f"{file_id}_rendered.{fmt['ext']}")

        transcript = None
        transcript_path = os.path.join(UPLOAD_DIR, f"{file_id}_transcript.json")
        if os.path.exists(transcript_path):
            with open(transcript_path, "r", encoding="utf-8") as f:
                import json
                transcript = json.load(f)

        log_progress(file_id, f"⚙️ FFmpeg рендерит: {resolution[0]}x{resolution[1]}, CRF={crf}, пресет={preset}...")

        await asyncio.to_thread(
            render_video,
            source, out_path,
            transcript_data=transcript,
            edits=settings.edits or [],
            edl=settings.edl,
            font=settings.font or "Montserrat Bold",
            font_size=settings.font_size or 100,
            use_outline=settings.use_outline if settings.use_outline is not None else True,
            font_color=settings.font_color or "white",
        )
        log_progress(file_id, f"✅ Экспорт завершён! Файл готов к скачиванию.")
    except Exception as e:
        log_progress(file_id, f"❌ Ошибка экспорта: {e}")
        import traceback
        log_progress(file_id, traceback.format_exc())
    finally:
        if os.path.exists(render_lock):
            os.remove(render_lock)

@router.post("/export")
async def export_video(settings: ExportSettings, background_tasks: BackgroundTasks):
    \"\"\"Trigger final FFmpeg export with user-chosen quality settings.\"\"\"
    render_lock = os.path.join(UPLOAD_DIR, f"{settings.file_id}.rendering")
    if os.path.exists(render_lock):
        raise HTTPException(status_code=409, detail="Рендер уже запущен")
    background_tasks.add_task(run_export_task, settings.file_id, settings)
    return {"status": "started", "message": "Экспорт запущен в фоне"}
'''

with open('backend/app/api/video.py', 'a', encoding='utf-8') as f:
    f.write(content_to_append)
