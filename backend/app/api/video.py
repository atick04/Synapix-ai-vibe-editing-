from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks
import os
import uuid
import shutil
import json
from app.services.video_service import extract_audio
from app.services.ai_service import transcribe_audio
from app.services.vlm_service import analyze_video_scenes, format_visual_context, VLM_MODEL

router = APIRouter(prefix="/api/video", tags=["Video"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def log_progress(file_id: str, message: str):
    log_path = os.path.join(UPLOAD_DIR, f"{file_id}.log")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(message + "\n")

async def process_video_pipeline(video_path: str, audio_path: str, file_id: str):
    """Фоновая задача: достать аудио, распознать текст и сделать визуальный анализ"""
    log_progress(file_id, "⚙️ Извлекаем аудио дорожку (FFmpeg)...")
    extract_audio(video_path, audio_path)
    
    log_progress(file_id, "🧠 ИИ расшифровывает речь (Whisper via Groq)...")
    transcript = await transcribe_audio(audio_path)
    
    if transcript:
        transcript_path = os.path.join(UPLOAD_DIR, f"{file_id}_transcript.json")
        with open(transcript_path, "w", encoding="utf-8") as f:
            json.dump(transcript, f, ensure_ascii=False, indent=2)
        log_progress(file_id, "✅ Транскрипция успешно сохранена! Вы можете общаться с ИИ агентом.")
    else:
        log_progress(file_id, "❌ Ошибка при транскрипции Whisper.")
    
    # VLM Visual Analysis
    log_progress(file_id, f"👁️ Визуальный анализ кадров видео ({VLM_MODEL})...")
    scenes = await analyze_video_scenes(video_path, fps=0.5)
    if scenes:
        visual_path = os.path.join(UPLOAD_DIR, f"{file_id}_visual.json")
        with open(visual_path, "w", encoding="utf-8") as f:
            json.dump(scenes, f, ensure_ascii=False, indent=2)
        log_progress(file_id, f"🎬 Визуальный анализ готов! Обнаружено {len(scenes)} сцен.")
    else:
        log_progress(file_id, f"⚠️ Визуальный анализ пропущен (нет кадров или ошибка VLM ({VLM_MODEL})).")

@router.post("/upload")
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")
    
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    filename = f"{file_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    log_progress(file_id, "📥 Файл загружен на сервер.")
    
    audio_path = os.path.join(UPLOAD_DIR, f"{file_id}.mp3")
    background_tasks.add_task(process_video_pipeline, file_path, audio_path, file_id)
    
    return {
        "message": "Video uploaded successfully", 
        "file_id": file_id, 
        "filename": filename,
        "path": file_path
    }

@router.get("/{file_id}/status")
async def get_video_status(file_id: str):
    rendered_path = os.path.join(UPLOAD_DIR, f"{file_id}_rendered.mp4")
    log_path = os.path.join(UPLOAD_DIR, f"{file_id}.log")
    render_lock_path = os.path.join(UPLOAD_DIR, f"{file_id}.rendering")
    
    logs = []
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8") as f:
            logs = f.read().strip().split("\n")
    
    # If a render lock file exists, render is actively in progress
    is_rendering = os.path.exists(render_lock_path)
    is_ready = os.path.exists(rendered_path) and not is_rendering
    updated_at = os.stat(rendered_path).st_mtime if os.path.exists(rendered_path) else 0
    
    if is_rendering:
        status = "processing"
    elif is_ready:
        status = "ready"
    else:
        status = "editing"

    return {
        "status": status,
        "filename": f"{file_id}_rendered.mp4" if is_ready else None,
        "updated_at": updated_at,
        "logs": [l for l in logs if l]
    }

@router.get("/{file_id}/transcript")
async def get_transcript(file_id: str):
    transcript_path = os.path.join(UPLOAD_DIR, f"{file_id}_transcript.json")
    if os.path.exists(transcript_path):
        try:
            with open(transcript_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            return {"status": "error", "detail": str(e)}
    return {"status": "processing"}

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
    "high":   (18, "fast"),
    "medium": (23, "veryfast"),
    "fast":   (28, "ultrafast"),
}

FORMAT_MAP = {
    "mp4_h264": {"vcodec": "libx264", "ext": "mp4"},
    "mp4_h265": {"vcodec": "libx265", "ext": "mp4"},
    "webm":     {"vcodec": "libvpx-vp9", "ext": "webm"},
}

async def run_export_task(file_id: str, settings: ExportSettings):
    """Background task: export final video with user-chosen settings via FFmpeg."""
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
    """Trigger final FFmpeg export with user-chosen quality settings."""
    render_lock = os.path.join(UPLOAD_DIR, f"{settings.file_id}.rendering")
    if os.path.exists(render_lock):
        raise HTTPException(status_code=409, detail="Рендер уже запущен")
    background_tasks.add_task(run_export_task, settings.file_id, settings)
    return {"status": "started", "message": "Экспорт запущен в фоне"}
