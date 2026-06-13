from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks
import os
import uuid
import shutil
import json
import subprocess
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
            if f.startswith(file_id) and not any(x in f for x in ["_rendered", "_transcript", "_visual", ".log", ".mp3", ".rendering", ".ass", "_media_library"]):
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
async def recommend_audio_endpoint(file_id: str, req: RecommendAudioRequest):
    from app.services.audio_recommendation_service import get_audio_recommendation
    try:
        rec = await get_audio_recommendation(file_id, req.template_id)
        return rec
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AutoComposeRequest(BaseModel):
    template_id: str = "promotional"

@router.post("/{file_id}/auto_compose")
async def auto_compose_endpoint(file_id: str, req: AutoComposeRequest):
    import time
    from app.services.audio_recommendation_service import get_audio_recommendation
    from app.services.stable_audio_service import generate_audio_via_replicate
    from app.services.asset_manager import resolve_asset_query
    from app.services.template_service import get_template
    
    try:
        # 1. Получаем ИИ-рекомендации
        rec = await get_audio_recommendation(file_id, req.template_id)
        bgm_prompt = rec.get("bgm_prompt", "Ambient premium lofi music")
        bgm_duration = rec.get("bgm_duration", 10)
        sfx_events = rec.get("sfx_events", [])
        
        # 2. Получаем настройки громкости из шаблона
        tpl = get_template(req.template_id) or get_template("promotional")
        ducking_vol = -12.0
        if tpl and tpl.sound_design:
            ducking_vol = float(tpl.sound_design.background_music.ducking_volume_db)
            
        # 3. Генерируем аудио через Replicate
        try:
            audio_url = generate_audio_via_replicate(bgm_prompt, bgm_duration)
            
            # 4. Скачиваем фоновую музыку на сервер
            asset_id = f"ai_audio_{int(time.time())}"
            local_path = download_stock_asset(asset_id, audio_url)
            if not local_path:
                raise RuntimeError("Failed to download replicate audio")
        except Exception as e:
            print(f"[AutoCompose] Stable Audio generation failed: {e}. Falling back to local premium lofi music track...")
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
                print(f"[AutoCompose] Successfully copied fallback track: {selected_track}")
                bgm_prompt = f"Lofi Fallback ({selected_track.split(' - ')[-1].replace('.mp3', '')})"
            else:
                raise HTTPException(status_code=500, detail=f"Stable Audio failed and no fallback music is available: {str(e)}")
            
        # 5. Регистрируем в медиабиблиотеке
        add_to_media_library(
            file_id=file_id,
            asset_id=asset_id,
            filename=f"AI: {bgm_prompt[:30]}",
            path=local_path.replace("\\", "/"),
            duration=float(bgm_duration)
        )
        
        # 6. Формируем список правок на таймлайне
        applied_edits = []
        
        # Вычисляем длительность субтитров на основе Whisper-транскрипта
        transcript_duration = 300.0
        transcript_path = os.path.join("uploads", f"{file_id}_transcript.json")
        if os.path.exists(transcript_path):
            try:
                import json
                with open(transcript_path, "r", encoding="utf-8") as f:
                    t_data = json.load(f)
                    words_data = t_data.get("words", [])
                    if words_data:
                        transcript_duration = float(words_data[-1].get("end", 300.0)) + 5.0
            except Exception as e:
                print(f"[AutoCompose] Error loading transcript for duration: {e}")
            
        # Добавляем субтитры с полными настройками из шаблона
        sub_font = "Inter"
        sub_size = 58
        sub_accent_color = "#F2E16A"
        sub_color = "#F5F5F7"
        sub_position = "bottom"
        sub_use_shadow = True
        sub_shadow_blur = 18
        sub_text_case = "Sentence_Case"
        sub_max_words = 3

        if tpl and tpl.subtitles:
            sub = tpl.subtitles
            if sub.font_management:
                sub_font = sub.font_management.base_sans_font.replace("-Medium.ttf", "").replace(".ttf", "")
                sub_size = sub.font_management.font_size_px
            if sub.color_palette:
                if sub.color_palette.text_main:
                    sub_color = sub.color_palette.text_main
                if sub.color_palette.text_accent:
                    sub_accent_color = sub.color_palette.text_accent
            if sub.layout:
                sub_use_shadow = bool(sub.layout.use_shadow)
                sub_shadow_blur = sub.layout.shadow_blur_px or 18
                sub_text_case = sub.layout.text_case or "Sentence_Case"
                sub_max_words = sub.layout.max_words_per_screen or 3

        applied_edits.append({
            "action": "add_subtitles",
            "start": 0,
            "end": transcript_duration,
            "font": sub_font,
            "font_size": sub_size,
            "font_color": sub_color,
            "accent_color": sub_accent_color,
            "position": sub_position,
            "use_outline": False,
            "use_shadow": sub_use_shadow,
            "shadow_blur": sub_shadow_blur,
            "text_case": sub_text_case,
            "max_words": sub_max_words,
        })
        
        # Добавляем фоновую музыку
        applied_edits.append({
            "action": "add_asset",
            "start": 0,
            "end": bgm_duration,
            "asset_query": f"AI: {bgm_prompt[:30]}",
            "resolved_path": local_path.replace("\\", "/"),
            "asset_type": "audio",
            "volume": ducking_vol,
            "is_bgm": True
        })
        
        # Добавляем SFX
        for sfx in sfx_events:
            ev_type = sfx.get("event", "video_hard_cut")
            t_sec = float(sfx.get("time_sec", 0.0))
            vol = float(sfx.get("volume_scale", 0.5))
            
            # Подбираем звук
            query = "whoosh" if "cut" in ev_type.lower() else "click" if "popup" in ev_type.lower() else "swipe"
            resolved = resolve_asset_query(query)
            if resolved:
                import math
                vol_db = -10.0
                if vol > 0:
                    vol_db = max(-45.0, min(0.0, 20.0 * math.log10(vol)))

                applied_edits.append({
                    "action": "add_asset",
                    "start": max(0.0, t_sec - 0.25),
                    "end": t_sec + 0.75,
                    "asset_query": query,
                    "resolved_path": resolved.get("rel_path"),
                    "asset_type": "audio",
                    "volume": vol_db
                })
                
        return {
            "status": "success",
            "bgm_asset_id": asset_id,
            "bgm_filename": f"AI: {bgm_prompt[:30]}",
            "bgm_url": f"/uploads/{os.path.basename(local_path)}",
            "bgm_duration": float(bgm_duration),
            "edits": applied_edits
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
