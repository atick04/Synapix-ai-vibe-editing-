from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks, Depends
from app.api.admin import validate_user_access_key
import os
import uuid
import shutil
import json
import subprocess
from app.services.video_service import extract_audio
from app.services.ai_service import transcribe_audio
from app.services.vlm_service import analyze_video_scenes, format_visual_context, VLM_MODEL

router = APIRouter(prefix="/api/video", tags=["Video"])

from app.core.paths import UPLOAD_DIR as _UPLOAD_PATH, ensure_data_dirs

ensure_data_dirs()
UPLOAD_DIR = str(_UPLOAD_PATH)
os.makedirs(UPLOAD_DIR, exist_ok=True)

def log_progress(file_id: str, message: str):
    log_path = os.path.join(UPLOAD_DIR, f"{file_id}.log")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(message + "\n")

def ensure_web_compatible_mp4(file_path: str, file_id: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".mp4":
        return file_path
        
    mp4_path = os.path.splitext(file_path)[0] + ".mp4"
    if os.path.exists(mp4_path):
        return mp4_path
        
    log_progress(file_id, f"⚙️ Конвертируем исходный медиа файл {os.path.basename(file_path)} в MP4 для веб-просмотра...")
    cmd = [
        "ffmpeg", "-y", "-i", file_path,
        "-c:v", "libx264", "-preset", "superfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        mp4_path
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log_progress(file_id, "✅ Конвертация завершена успешно.")
        
        # Update media library path from .mov to .mp4
        project_id = file_id.split("_")[0]
        lib_path = os.path.join(UPLOAD_DIR, f"{project_id}_media_library.json")
        if os.path.exists(lib_path):
            try:
                with open(lib_path, "r", encoding="utf-8") as f:
                    library = json.load(f)
                modified = False
                for item in library:
                    if item.get("path") == file_path.replace("\\", "/"):
                        item["path"] = mp4_path.replace("\\", "/")
                        modified = True
                if modified:
                    with open(lib_path, "w", encoding="utf-8") as f:
                        json.dump(library, f, ensure_ascii=False, indent=2)
            except Exception:
                pass
                
        try:
            os.remove(file_path)
        except Exception:
            pass
        return mp4_path
    except Exception as e:
        log_progress(file_id, f"⚠️ Ошибка при конвертации в MP4: {e}. Видео может не воспроизводиться в браузере.")
        return file_path

async def process_video_pipeline(video_path: str, audio_path: str, file_id: str):
    """Фоновая задача: достать аудио, распознать текст и сделать визуальный анализ"""
    video_path = ensure_web_compatible_mp4(video_path, file_id)
    
    # Создаем прокси-файл (480p) для мобильных устройств
    dir_name = os.path.dirname(video_path)
    base_name = os.path.basename(video_path)
    name, ext = os.path.splitext(base_name)
    proxy_path = os.path.join(dir_name, f"{name}_proxy.mp4")
    
    log_progress(file_id, "⚙️ Создаем легковесный прокси-файл для мобильных устройств (480p)...")
    proxy_cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vf", "scale=-2:480",
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "fastdecode",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k",
        proxy_path
    ]
    try:
        subprocess.run(proxy_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log_progress(file_id, "✅ Прокси-видео успешно создано.")
    except Exception as e:
        log_progress(file_id, f"⚠️ Ошибка при создании прокси-видео: {e}")
        
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
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...), _key=Depends(validate_user_access_key)):
    ext = os.path.splitext(file.filename)[1].lower()
    c_type = file.content_type or ""
    # We allow any file here to prevent strict browser rejections. 
    # FFmpeg will naturally fail if it's not a valid media file.
    
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

def add_to_media_library(file_id: str, asset_id: str, filename: str, path: str, duration: float = 0.0):
    lib_path = os.path.join(UPLOAD_DIR, f"{file_id}_media_library.json")
    library = []
    if os.path.exists(lib_path):
        try:
            with open(lib_path, "r", encoding="utf-8") as f:
                library = json.load(f)
        except Exception:
            pass
    # Check if already exists
    for item in library:
        if item.get("id") == asset_id:
            item["filename"] = filename
            item["path"] = path
            item["duration"] = duration
            break
    else:
        library.append({
            "id": asset_id,
            "filename": filename,
            "path": path,
            "duration": duration
        })
    with open(lib_path, "w", encoding="utf-8") as f:
        json.dump(library, f, ensure_ascii=False, indent=2)

@router.get("/{file_id}/media_library")
async def get_media_library(file_id: str):
    lib_path = os.path.join(UPLOAD_DIR, f"{file_id}_media_library.json")
    library = []
    if os.path.exists(lib_path):
        try:
            with open(lib_path, "r", encoding="utf-8") as f:
                library = json.load(f)
        except Exception:
            pass
            
    if not library:
        # If doesn't exist, find the main video (prioritize web-compatible mp4/webm formats)
        main_filename = None
        ext_priority = [".mp4", ".webm", ".mov", ".avi", ".mkv"]
        candidate_files = []
        for f in os.listdir(UPLOAD_DIR):
            if f.startswith(file_id) and not any(x in f for x in ["_rendered", "_transcript", "_visual", ".log", ".mp3", ".rendering", ".ass", "_media_library", "_proxy"]):
                ext_lower = os.path.splitext(f)[1].lower()
                if ext_lower in ext_priority:
                    candidate_files.append((f, ext_priority.index(ext_lower)))
        if candidate_files:
            candidate_files.sort(key=lambda x: x[1])
            main_filename = candidate_files[0][0]
                    
        if not main_filename:
            main_filename = f"{file_id}.mp4"
            
        main_path = os.path.join(UPLOAD_DIR, main_filename)
        main_duration = 0.0
        if os.path.exists(main_path):
            try:
                cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", main_path]
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
                main_duration = float(res.stdout.strip())
            except Exception:
                pass
                
        library = [{
            "id": "main",
            "filename": "Original Video",
            "path": main_path.replace("\\", "/"),
            "duration": main_duration
        }]
        
        with open(lib_path, "w", encoding="utf-8") as f:
            json.dump(library, f, ensure_ascii=False, indent=2)

    # Enrich library items with transcripts/visuals if they exist
    for item in library:
        asset_id = item.get("id")
        if asset_id == "main":
            trans_path = os.path.join(UPLOAD_DIR, f"{file_id}_transcript.json")
            vis_path = os.path.join(UPLOAD_DIR, f"{file_id}_visual.json")
        else:
            trans_path = os.path.join(UPLOAD_DIR, f"{file_id}_{asset_id}_transcript.json")
            vis_path = os.path.join(UPLOAD_DIR, f"{file_id}_{asset_id}_visual.json")
            
        if os.path.exists(trans_path):
            try:
                with open(trans_path, "r", encoding="utf-8") as tf:
                    trans_data = json.load(tf)
                    item["transcript"] = trans_data.get("text", "")
            except Exception:
                pass
        if os.path.exists(vis_path):
            try:
                with open(vis_path, "r", encoding="utf-8") as vf:
                    vis_data = json.load(vf)
                    item["visual_analysis"] = vis_data
            except Exception:
                pass
                
        # Enrich with proxy information if available
        item_path = item.get("path", "")
        if item_path:
            dir_name = os.path.dirname(item_path)
            base_name = os.path.basename(item_path)
            name, ext = os.path.splitext(base_name)
            proxy_file = f"{name}_proxy.mp4"
            proxy_filepath = os.path.join(dir_name, proxy_file)
            if os.path.exists(proxy_filepath):
                item["proxy_path"] = proxy_filepath.replace("\\", "/")
                
    return library

@router.post("/{file_id}/upload_additional")
async def upload_additional_video(file_id: str, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    asset_uuid = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    asset_id = f"additional_{asset_uuid}"
    filename = f"{file_id}_{asset_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    duration = 0.0
    if os.path.exists(file_path):
        try:
            cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file_path]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            duration = float(res.stdout.strip())
        except Exception:
            pass
            
    add_to_media_library(file_id, asset_id, file.filename, file_path.replace("\\", "/"), duration)
    
    audio_path = os.path.join(UPLOAD_DIR, f"{file_id}_{asset_id}.mp3")
    background_tasks.add_task(process_video_pipeline, file_path, audio_path, f"{file_id}_{asset_id}")
    
    return await get_media_library(file_id)

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

@router.get("/{file_id}/session")
async def get_project_session(file_id: str):
    from app.workflows.production_session import load_session
    try:
        session = load_session(file_id)
        return session
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки сессии: {str(e)}")


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
    brand_id: Optional[str] = None

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
            template_id=settings.template_id,
            brand_id=settings.brand_id,
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

# --- Stock Provider Endpoints ---
from app.services.stock_provider_service import search_stock_stickers, search_stock_music, download_stock_asset

class DownloadAssetReq(BaseModel):
    asset_id: str
    url: str
    type: str # 'sticker' | 'music'
    file_id: Optional[str] = None

@router.get("/search_stickers")
async def search_stickers(query: str):
    return search_stock_stickers(query)

@router.get("/search_music")
async def search_music(query: str):
    return search_stock_music(query)

@router.post("/download_asset")
async def download_asset(req: DownloadAssetReq):
    local_path = download_stock_asset(req.asset_id, req.url)
    if not local_path:
        raise HTTPException(status_code=500, detail="Не удалось скачать ассет")
    
    if req.file_id:
        # Register in media library
        filename = req.asset_id.replace("stock_sticker_", "").replace("stock_music_", "")
        filename = filename.replace("_", " ").capitalize()
        
        # Determine duration
        duration = 0.0
        if req.type == 'music':
            # Run ffprobe to get duration if possible
            try:
                cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", local_path]
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
                duration = float(res.stdout.strip())
            except Exception:
                duration = 300.0  # Fallback duration for music
                
        add_to_media_library(
            file_id=req.file_id,
            asset_id=req.asset_id,
            filename=filename,
            path=local_path.replace("\\", "/"),
            duration=duration
        )
        
    return {
        "status": "success",
        "local_path": local_path.replace("\\", "/"),
        "url": f"/uploads/{os.path.basename(local_path)}"
    }

class GenerateAudioRequest(BaseModel):
    prompt: str
    duration: int
    is_bgm: bool
    start_time: float = 0.0
    volume: float = -15.0

@router.post("/{file_id}/generate_audio")
async def generate_audio_endpoint(file_id: str, req: GenerateAudioRequest):
    import time
    from app.services.stable_audio_service import generate_audio_via_replicate
    try:
        # 1.  через Replicate
        try:
            audio_url = generate_audio_via_replicate(req.prompt, req.duration)
            
            # 2. Скачивание файла на сервер
            asset_id = f"ai_audio_{int(time.time())}"
            local_path = download_stock_asset(asset_id, audio_url)
            if not local_path:
                raise RuntimeError("Не удалось скачать файл от Replicate")
        except Exception as e:
            print(f"[GenerateAudio] Stable Audio generation failed: {e}. Falling back to local premium lofi music track...")
            import shutil
            import random
            bg_dir = os.path.join("assets", "Music", "Background")
            if os.path.exists(bg_dir):
                tracks = [f for f in os.listdir(bg_dir) if f.lower().endswith(".mp3")]
            else:
                tracks = []
            
            asset_id = f"ai_audio_{int(time.time())}"
            local_path = os.path.join("uploads", f"{asset_id}.mp3")
            if tracks:
                selected_track = random.choice(tracks)
                shutil.copy(os.path.join(bg_dir, selected_track), local_path)
                print(f"[GenerateAudio] Successfully copied fallback track: {selected_track}")
            else:
                raise HTTPException(status_code=500, detail=f"Stable Audio failed and no fallback music is available: {str(e)}")
            
        # 3. Регистрация в медиабиблиотеке
        add_to_media_library(
            file_id=file_id,
            asset_id=asset_id,
            filename=f"AI: {req.prompt[:30]}",
            path=local_path.replace("\\", "/"),
            duration=float(req.duration)
        )
        
        return {
            "status": "success",
            "asset_id": asset_id,
            "filename": f"AI: {req.prompt[:30]}",
            "local_path": local_path.replace("\\", "/"),
            "url": f"/uploads/{os.path.basename(local_path)}",
            "duration": float(req.duration),
            "is_bgm": req.is_bgm
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RecommendAudioRequest(BaseModel):
    template_id: str = "promotional"

@router.post("/{file_id}/recommend_audio")
async def recommend_audio_endpoint(file_id: str, req: RecommendAudioRequest, _key=Depends(validate_user_access_key)):
    from app.services.audio_recommendation_service import get_audio_recommendation
    try:
        rec = await get_audio_recommendation(file_id, req.template_id)
        return rec
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AutoComposeRequest(BaseModel):
    template_id: str = "promotional"

@router.post("/{file_id}/auto_compose")
async def auto_compose_endpoint(file_id: str, req: AutoComposeRequest, _key=Depends(validate_user_access_key)):
    import time
    import os
    from app.services.template_service import get_template
    
    try:
        tpl = get_template(req.template_id) or get_template("promotional")
        
        # 1. Update session with template settings so the AI Director behaves according to the template
        sub_font = "Montserrat-ExtraBold"
        sub_accent_color = "#FACC15"
        if tpl and tpl.subtitles:
            sub = tpl.subtitles
            if sub.font_management:
                sub_font = sub.font_management.base_sans_font.replace("-Medium.ttf", "").replace(".ttf", "")
            if sub.color_palette and sub.color_palette.text_accent:
                sub_accent_color = sub.color_palette.text_accent

        try:
            from app.workflows.production_session import update_session
            session_updates = {
                "creative_goal": tpl.description or "Сделать динамичное и вовлекающее видео с профессиональным ритмом монтажа.",
                "visual_identity": {
                    "dominant_color": sub_accent_color,
                    "font_family": sub_font,
                    "graphics_template": "dynamic_ai_generation"
                },
                "editing_strategy": {
                    "zoom_frequency": "adaptive",
                    "broll_frequency": "adaptive",
                    "pacing": "adaptive"
                },
                "style_profile": {
                    "font_family": sub_font,
                    "bg_color": "rgba(22, 22, 24, 0.8)",
                    "border_color": "rgba(255,255,255,0.15)",
                    "color_accent": sub_accent_color,
                    "glow_color": "rgba(255,255,255,0.05)",
                    "camera_motion": "adaptive"
                }
            }
            update_session(file_id, session_updates)
            print(f"[AutoCompose] Updated production session with {req.template_id} settings.")
        except Exception as e:
            print(f"[AutoCompose] Failed to update session settings: {e}")

        # 2. Run the LangGraph Cinematic Reasoning Workflow (the AI Director!) to dynamically build the timeline
        from app.workflows.graph import editor_graph
        initial_state = {
            "file_id": file_id,
            "user_message": f"Сделай авто-монтаж ролика по шаблону {req.template_id}: проанализируй речь, расставь наезды камеры (zoom), выдели хук в начале с помощью графики, добавь подходящую фоновую музыку и SFX переходы, настроить кинетическую караоке-типографику.",
            "is_evaluation": False,
            "template_id": req.template_id,
            "active_edits": [],
            "critic_retry_count": 0,
            "focused_item": None
        }
        
        final_state = await editor_graph.ainvoke(initial_state)
        applied_edits = final_state.get("active_edits", [])
        
        # 3. Extract the BGM details if added by the agent, for frontend compatibility
        bgm_edit = next((e for e in applied_edits if e.get("action") == "add_asset" and e.get("asset_type") == "audio" and e.get("is_bgm")), None)
        if bgm_edit:
            asset_id = bgm_edit.get("asset_id", f"bgm_{int(time.time())}")
            bgm_prompt = bgm_edit.get("asset_query", "AI Sound Track")
            local_path = bgm_edit.get("resolved_path", "")
            bgm_duration = bgm_edit.get("end", 30.0) - bgm_edit.get("start", 0.0)
            if bgm_duration <= 0 or bgm_duration > 1000:
                bgm_duration = 30.0
        else:
            asset_id = "bgm_default"
            bgm_prompt = "Silent Mood"
            local_path = ""
            bgm_duration = 0.0
            
        print(f"[AutoCompose] Dynamically generated {len(applied_edits)} edits via AI Cinematic Director.")
        
        return {
            "status": "success",
            "bgm_asset_id": asset_id,
            "bgm_filename": f"AI: {bgm_prompt[:30]}",
            "bgm_url": f"/uploads/{os.path.basename(local_path)}" if local_path else "",
            "bgm_duration": float(bgm_duration),
            "edits": applied_edits
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/brand/{brand_id}/upload_font")
async def upload_brand_font(brand_id: str, file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".ttf", ".otf"]:
        raise HTTPException(status_code=400, detail="Only .ttf and .otf font files are supported")
    
    brand_dir = os.path.join(UPLOAD_DIR, "brands", brand_id, "fonts")
    os.makedirs(brand_dir, exist_ok=True)
    
    file_path = os.path.join(brand_dir, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save font: {str(e)}")
        
    return {
        "message": "Font uploaded successfully",
        "name": os.path.splitext(file.filename)[0],
        "filename": file.filename,
        "path": f"uploads/brands/{brand_id}/fonts/{file.filename}".replace("\\", "/")
    }

@router.post("/brand/{brand_id}/upload_lut")
async def upload_brand_lut(brand_id: str, file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext != ".cube":
        raise HTTPException(status_code=400, detail="Only .cube LUT files are supported")
        
    brand_dir = os.path.join(UPLOAD_DIR, "brands", brand_id, "luts")
    os.makedirs(brand_dir, exist_ok=True)
    
    file_path = os.path.join(brand_dir, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save LUT: {str(e)}")
        
    return {
        "message": "LUT uploaded successfully",
        "name": os.path.splitext(file.filename)[0],
        "filename": file.filename,
        "path": f"uploads/brands/{brand_id}/luts/{file.filename}".replace("\\", "/")
    }

@router.post("/brand/{brand_id}/upload_music")
async def upload_brand_music(brand_id: str, file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext != ".mp3":
        raise HTTPException(status_code=400, detail="Only .mp3 audio files are supported")
        
    brand_dir = os.path.join(UPLOAD_DIR, "brands", brand_id, "music")
    os.makedirs(brand_dir, exist_ok=True)
    
    file_path = os.path.join(brand_dir, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save music: {str(e)}")
        
    return {
        "message": "Music uploaded successfully",
        "name": os.path.splitext(file.filename)[0],
        "filename": file.filename,
        "path": f"uploads/brands/{brand_id}/music/{file.filename}".replace("\\", "/")
    }

@router.get("/brand/{brand_id}/assets")
async def get_brand_assets(brand_id: str):
    brand_dir = os.path.join(UPLOAD_DIR, "brands", brand_id)
    fonts_dir = os.path.join(brand_dir, "fonts")
    luts_dir = os.path.join(brand_dir, "luts")
    music_dir = os.path.join(brand_dir, "music")
    
    fonts = []
    if os.path.exists(fonts_dir):
        for f in os.listdir(fonts_dir):
            if os.path.isfile(os.path.join(fonts_dir, f)) and os.path.splitext(f)[1].lower() in [".ttf", ".otf"]:
                fonts.append({
                    "name": os.path.splitext(f)[0],
                    "filename": f,
                    "path": f"uploads/brands/{brand_id}/fonts/{f}".replace("\\", "/")
                })
                
    luts = []
    if os.path.exists(luts_dir):
        for f in os.listdir(luts_dir):
            if os.path.isfile(os.path.join(luts_dir, f)) and os.path.splitext(f)[1].lower() == ".cube":
                luts.append({
                    "name": os.path.splitext(f)[0],
                    "filename": f,
                    "path": f"uploads/brands/{brand_id}/luts/{f}".replace("\\", "/")
                })

    music = []
    if os.path.exists(music_dir):
        for f in os.listdir(music_dir):
            if os.path.isfile(os.path.join(music_dir, f)) and os.path.splitext(f)[1].lower() == ".mp3":
                music.append({
                    "name": os.path.splitext(f)[0],
                    "filename": f,
                    "path": f"uploads/brands/{brand_id}/music/{f}".replace("\\", "/")
                })
                
    return {
        "fonts": fonts,
        "luts": luts,
        "music": music
    }

@router.post("/{file_id}/smart_cut")
async def run_smart_cut(file_id: str):
    """Analyze Whisper transcript to automatically detect bad takes, pauses, and filler words."""
    transcript_path = os.path.join(UPLOAD_DIR, f"{file_id}_transcript.json")
    if not os.path.exists(transcript_path):
        raise HTTPException(status_code=404, detail="Транскрипт не найден. Сначала загрузите видео.")
        
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript_data = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения транскрипта: {str(e)}")
        
    from app.services.smart_cut_service import suggest_smart_cuts
    cuts = suggest_smart_cuts(transcript_data)
    return {"status": "success", "cuts": cuts}


@router.post("/{file_id}/topic_transitions")
async def detect_topic_transitions(
    file_id: str,
    use_llm: bool = False,
    min_gap_sec: float = 5.0,
):
    """Detect topic-change moments in speech for montage transitions."""
    transcript_path = os.path.join(UPLOAD_DIR, f"{file_id}_transcript.json")
    if not os.path.exists(transcript_path):
        raise HTTPException(status_code=404, detail="Транскрипт не найден. Сначала загрузите видео.")

    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript_data = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения транскрипта: {str(e)}")

    from app.services.topic_transition_service import (
        detect_topic_boundaries,
        detect_topic_boundaries_llm,
        boundaries_to_transition_edits,
    )

    if use_llm:
        boundaries = await detect_topic_boundaries_llm(
            transcript_data, min_gap_sec=min_gap_sec
        )
    else:
        boundaries = detect_topic_boundaries(
            transcript_data, min_gap_sec=min_gap_sec
        )

    edits = boundaries_to_transition_edits(boundaries)
    return {
        "status": "success",
        "count": len(boundaries),
        "boundaries": boundaries,
        "edits": edits,
    }


def _resolve_source_video(file_id: str, *, prefer_full_res: bool = False) -> Optional[str]:
    """Pick source for RVM. Full-res for quality mattes; proxy only when explicitly allowed."""
    proxy = os.path.join(UPLOAD_DIR, f"{file_id}_proxy.mp4")

    def from_library() -> Optional[str]:
        lib_path = os.path.join(UPLOAD_DIR, f"{file_id}_media_library.json")
        if not os.path.exists(lib_path):
            return None
        try:
            with open(lib_path, "r", encoding="utf-8") as f:
                library = json.load(f)
            main = next((x for x in library if x.get("id") == "main"), None)
            if main and main.get("path"):
                p = main["path"]
                if not os.path.isabs(p):
                    p = os.path.join(UPLOAD_DIR, os.path.basename(p))
                if os.path.exists(p) and os.path.getsize(p) > 0:
                    return p
        except Exception:
            pass
        return None

    def from_upload() -> Optional[str]:
        skip = ("_rendered", "_rvm", "_transcript", "_visual", ".log", ".mp3",
                ".rendering", ".roto", ".ass", "_media_library", "_proxy", "_mask", "_text")
        for f in os.listdir(UPLOAD_DIR):
            if not f.startswith(file_id):
                continue
            if any(x in f for x in skip):
                continue
            if os.path.splitext(f)[1].lower() in (".mp4", ".mov", ".avi", ".mkv", ".webm"):
                path = os.path.join(UPLOAD_DIR, f)
                if os.path.getsize(path) > 0:
                    return path
        return None

    # Quality path: never use 270x480 proxy for rotoscope mattes
    if prefer_full_res:
        return from_library() or from_upload() or (
            proxy if os.path.exists(proxy) and os.path.getsize(proxy) > 0 else None
        )

    if os.path.exists(proxy) and os.path.getsize(proxy) > 0:
        return proxy
    return from_library() or from_upload()


class RotoPreviewRequest(BaseModel):
    action: str = "remove_background"  # or set_video_background / behind_speaker
    mode: str = "composite"  # "composite" = baked MP4, "alpha" = WebM speaker cutout for live layers
    bg_color: str = "#0a0a14"
    text: Optional[str] = None
    text_color: str = "white"
    text_opacity: float = 0.12
    font_size: int = 220
    gradient_color2: Optional[str] = None
    bg_video_query: Optional[str] = None


def _roto_artifact_names(file_id: str, mode: str):
    """Return primary preview artifact (+ optional alpha webm for alpha mode)."""
    if mode == "alpha":
        # Grayscale H.264 matte — reliable with canvas destination-in (unlike VP8 WebM alpha)
        return f"{file_id}_rvm_mask.mp4", f"{file_id}_rvm_alpha.webm"
    return f"{file_id}_rvm_preview.mp4", None


def _run_roto_preview_task(file_id: str, req: RotoPreviewRequest):
    lock = os.path.join(UPLOAD_DIR, f"{file_id}.roto")
    mode = (req.mode or "composite").lower()
    out_name, alpha_name = _roto_artifact_names(file_id, mode)
    out_path = os.path.join(UPLOAD_DIR, out_name)
    alpha_path = os.path.join(UPLOAD_DIR, alpha_name) if alpha_name else None
    status_path = os.path.join(UPLOAD_DIR, f"{file_id}_roto_status.json")

    def write_status(status: str, **extra):
        payload = {}
        if os.path.exists(status_path):
            try:
                with open(status_path, "r", encoding="utf-8") as f:
                    payload = json.load(f)
            except Exception:
                payload = {}
        payload.update(extra)
        payload["status"] = status
        payload["mode"] = mode
        payload["asset_version"] = 3
        payload["filename"] = out_name if status == "ready" else None
        if status == "ready" and mode == "alpha":
            payload["mask_filename"] = out_name
            # Only advertise legacy WebM alpha when the file actually exists on disk
            if alpha_name and alpha_path and os.path.exists(alpha_path) and os.path.getsize(alpha_path) > 1024:
                payload["alpha_filename"] = alpha_name
            else:
                payload.pop("alpha_filename", None)
        try:
            with open(status_path, "w", encoding="utf-8") as f:
                json.dump(payload, f)
        except Exception:
            pass

    try:
        write_status("processing", message=f"RVM {mode} started", action=req.action)
        log_progress(file_id, f"🎭 RVM preview ({mode}): обработка началась…")

        source = _resolve_source_video(file_id, prefer_full_res=True)
        if not source:
            write_status("error", message="Source video not found")
            log_progress(file_id, "❌ RVM preview: исходное видео не найдено")
            return

        from app.services.rotoscope_service import process_roto_preview, remove_background_rvm

        log_progress(file_id, f"🎭 RVM source: {os.path.basename(source)}")

        if mode == "alpha":
            # Full-res matte (mask). Skip heavy WebM alpha for preview — canvas uses mask.
            # downsample 0.4 ≈ sharp edges on 1080p without full native cost
            result = remove_background_rvm(
                input_video_path=source,
                output_path=alpha_path or out_path,
                bg_color="transparent",
                downsample_ratio=0.4,
            )
            mask_ok = os.path.exists(out_path) and os.path.getsize(out_path) > 0
            if result and mask_ok:
                write_status("ready", message="RVM mask ready (full-res)", action=req.action)
                log_progress(file_id, f"✅ RVM preview готов: {out_name}")
            elif result and not mask_ok:
                write_status("error", message="RVM mask missing after alpha pass")
                log_progress(file_id, "❌ RVM preview: маска не создалась")
            else:
                write_status("error", message="RVM processing failed")
                log_progress(file_id, "❌ RVM preview: обработка не удалась")
            return
        else:
            bg_video_path = None
            if req.bg_video_query:
                try:
                    from app.services.pexels_service import download_broll
                    bg_video_path = download_broll(req.bg_video_query)
                except Exception as e:
                    log_progress(file_id, f"⚠️ RVM preview: сток-фон не скачался ({e})")

            result = process_roto_preview(
                input_video_path=source,
                output_path=out_path,
                action=req.action,
                bg_color=req.bg_color or "#0a0a14",
                text=req.text,
                text_color=req.text_color or "white",
                text_opacity=float(req.text_opacity or 0.12),
                font_size=int(req.font_size or 220),
                gradient_color2=req.gradient_color2,
                bg_video_path=bg_video_path,
                downsample_ratio=0.4,
            )

        if result and os.path.exists(result):
            if os.path.abspath(result) != os.path.abspath(out_path):
                shutil.copy2(result, out_path)
            write_status("ready", message="RVM preview ready", action=req.action)
            log_progress(file_id, f"✅ RVM preview готов: {out_name}")
        else:
            write_status("error", message="RVM processing failed")
            log_progress(file_id, "❌ RVM preview: обработка не удалась")
    except Exception as e:
        write_status("error", message=str(e))
        log_progress(file_id, f"❌ RVM preview error: {e}")
    finally:
        try:
            if os.path.exists(lock):
                os.remove(lock)
        except Exception:
            pass


@router.post("/{file_id}/roto_preview")
async def start_roto_preview(
    file_id: str,
    req: RotoPreviewRequest,
    background_tasks: BackgroundTasks,
    _key=Depends(validate_user_access_key),
):
    """Start async RVM rotoscoping for live preview (not full export)."""
    lock = os.path.join(UPLOAD_DIR, f"{file_id}.roto")
    mode = (req.mode or "composite").lower()
    out_name, alpha_name = _roto_artifact_names(file_id, mode)
    out_path = os.path.join(UPLOAD_DIR, out_name)
    status_path = os.path.join(UPLOAD_DIR, f"{file_id}_roto_status.json")

    if os.path.exists(lock):
        return {"status": "processing", "filename": None, "mode": mode, "message": "Already processing"}

    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        try:
            with open(status_path, "r", encoding="utf-8") as f:
                prev = json.load(f)
            same = (
                prev.get("action") == req.action
                and prev.get("mode") == mode
                and prev.get("bg_color") == req.bg_color
                and prev.get("text") == req.text
                and prev.get("gradient_color2") == req.gradient_color2
                and prev.get("bg_video_query") == req.bg_video_query
                and prev.get("asset_version") == 3
            )
            if same and prev.get("status") == "ready":
                payload = {"status": "ready", "filename": out_name, "mode": mode}
                if mode == "alpha":
                    payload["mask_filename"] = out_name
                    alpha_path = os.path.join(UPLOAD_DIR, alpha_name) if alpha_name else None
                    if alpha_path and os.path.exists(alpha_path) and os.path.getsize(alpha_path) > 1024:
                        payload["alpha_filename"] = alpha_name
                return payload
        except Exception:
            pass

    open(lock, "w").close()
    with open(status_path, "w", encoding="utf-8") as f:
        json.dump({
            "status": "processing",
            "filename": None,
            "mode": mode,
            "action": req.action,
            "bg_color": req.bg_color,
            "text": req.text,
            "gradient_color2": req.gradient_color2,
            "bg_video_query": req.bg_video_query,
            "asset_version": 3,
        }, f)

    background_tasks.add_task(_run_roto_preview_task, file_id, req)
    return {"status": "processing", "filename": None, "mode": mode}


@router.get("/{file_id}/roto_status")
async def get_roto_status(file_id: str, _key=Depends(validate_user_access_key)):
    """Poll RVM preview job status."""
    lock = os.path.join(UPLOAD_DIR, f"{file_id}.roto")
    status_path = os.path.join(UPLOAD_DIR, f"{file_id}_roto_status.json")

    data = {}
    if os.path.exists(status_path):
        try:
            with open(status_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}

    mode = data.get("mode") or "composite"
    out_name, alpha_name = _roto_artifact_names(file_id, mode)
    if data.get("filename"):
        out_name = data["filename"]
    out_path = os.path.join(UPLOAD_DIR, out_name)

    def _ready_payload(name: str):
        payload = {"status": "ready", "filename": name, "mode": mode, "message": data.get("message")}
        if mode == "alpha":
            mask_name = name if str(name).endswith("_rvm_mask.mp4") else (data.get("mask_filename") or f"{file_id}_rvm_mask.mp4")
            payload["mask_filename"] = mask_name
            # Prefer mask-only preview; never point clients at a missing WebM
            candidate = data.get("alpha_filename") or alpha_name
            if candidate:
                alpha_path = os.path.join(UPLOAD_DIR, candidate)
                if os.path.exists(alpha_path) and os.path.getsize(alpha_path) > 1024:
                    payload["alpha_filename"] = candidate
        return payload

    if os.path.exists(lock):
        return {"status": "processing", "filename": None, "mode": mode, "message": data.get("message")}
    if data.get("status") == "ready" and os.path.exists(out_path):
        return _ready_payload(out_name)
    if data.get("status") == "error":
        return {"status": "error", "filename": None, "mode": mode, "message": data.get("message")}
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        return _ready_payload(out_name)
    # Mask may exist even if status JSON is stale / points at missing alpha
    mask_fallback = os.path.join(UPLOAD_DIR, f"{file_id}_rvm_mask.mp4")
    if os.path.exists(mask_fallback) and os.path.getsize(mask_fallback) > 0:
        return _ready_payload(f"{file_id}_rvm_mask.mp4")
    return {"status": "idle", "filename": None, "mode": mode}



