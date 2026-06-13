"""
Tool Registry — Declarative editing tools for the Persistent Cinematic Operating System.
Defines MCP-compatible input schemas and functional logic for modifying timeline states.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.workflows.timeline_state import TimelineState

from app.workflows.production_memory import ProductionMemory
from app.workflows import event_bus
from app.services.asset_manager import resolve_asset_query

# ═══════════════════════════════════════════════════════════════════════════
# PYDANTIC ARGUMENT SCHEMAS (MCP / Tool Calling Standard)
# ═══════════════════════════════════════════════════════════════════════════

class CutClipArgs(BaseModel):
    start_time: float = Field(description="Время начала вырезаемого фрагмента в секундах")
    end_time: float = Field(description="Время окончания вырезаемого фрагмента в секундах")

class AddBrollArgs(BaseModel):
    start_time: float = Field(description="Начало отображения стокового видео в секундах")
    end_time: float = Field(description="Конец отображения стокового видео в секундах")
    query: str = Field(description="Английский поисковый запрос стока Pexels (например: 'cyberpunk city neon')")

class CreateSceneArgs(BaseModel):
    start_time: float = Field(description="Таймкод начала сцены в секундах")
    duration: float = Field(description="Длительность сцены в секундах")
    scene_template: str = Field(description="Шаблон сцены (например: 'cause_effect', 'timeline', 'comparison', 'concept_explainer')")
    mood: str = Field(default="neutral", description="Настроение сцены (например: 'analytical', 'energetic', 'dramatic')")
    energy: float = Field(default=0.5, description="Уровень энергии от 0.0 до 1.0")
    entities: List[Dict[str, Any]] = Field(description="Список сущностей. Должен включать id, type, text/asset_id и visual_role")
    relations: Optional[List[Dict[str, str]]] = Field(default=None, description="Связи между сущностями. Список объектов с полями from, to, type")

class KineticTypographyArgs(BaseModel):
    font: str = Field(default="Montserrat-ExtraBold", description="Имя шрифта. Доступные значения: 'Montserrat-ExtraBold' (универсальный жирный), 'Inter_24pt-Bold' (технологичный), 'BebasNeue-Regular' (TikTok/блогерский), 'Rubik-Bold' (скругленный), 'Oswald-Bold' (строгий сжатый), 'Manrope-Bold' (современный геометричный), 'JetBrainsMono-Bold' (моноширинный), 'Comfortaa-Bold' (мягкий округлый)")
    font_size: int = Field(default=80, description="Размер шрифта в пикселях. Для вертикального 9:16 видео: 75-100px (базовый 80). Для горизонтального 16:9: 36-55px (базовый 40). Чтобы сделать крупнее — увеличь значение.")
    font_color: str = Field(default="#FFFFFF", description="Основной цвет текста в hex-формате. Примеры: '#FFFFFF' (белый), '#FACC15' (желтый TikTok), '#FF3B30' (красный), '#00E5FF' (неоновый голубой).")
    accent_color: str = Field(default="#FACC15", description="Цвет выделения АКТИВНОГО (текущего) слова в hex-формате. Это слово будет подсвечено другим цветом в момент произнесения. Примеры: '#FACC15' (золотой), '#FF3B30' (красный акцент), '#7CFC00' (неоновый зеленый).")
    use_outline: bool = Field(default=True, description="Если True — рисует темную обводку вокруг текста для лучшей читаемости на любом фоне.")
    use_shadow: bool = Field(default=False, description="Если True — применяет мягкую тень под текстом вместо жесткой обводки. Рекомендуется для более кинематографичного и премиального вида.")
    shadow_blur: int = Field(default=18, description="Радиус размытия тени в пикселях (если use_shadow=True). Диапазон: 10-35. Большие значения — мягче и атмосфернее.")
    animation_style: str = Field(default="pop", description="Стиль анимации появления субтитров: 'pop' (мгновенное появление с пульсацией), 'slide_up' (плавный сдвиг снизу вверх), 'glow' (неоновое свечение), 'bounce' (веселое подпрыгивание слов).")
    position: str = Field(default="bottom", description="Вертикальное положение субтитров: 'bottom' (внизу, стандарт TikTok/Reels), 'center' (посередине экрана), 'top' (вверху экрана).")
    text_case: str = Field(default="UPPER", description="Регистр текста субтитров: 'UPPER' (ЗАГЛАВНЫЕ БУКВЫ — как у Manas/MrBeast, максимальный impact), 'Sentence_Case' (как предложение), 'lower' (строчные).")
    max_words: int = Field(default=3, description="Максимальное количество слов, показываемых одновременно на экране. 2-3 слова — стандарт для shorts/TikTok. 4-6 — для YouTube горизонтальных видео.")
    font_pairing: Optional[str] = Field(default=None, description="Второй (акцентный) шрифт для попарного сочетания (например: 'Lobster', 'BebasNeue')")
    word_styles: Optional[str] = Field(default=None, description="JSON-строка с пословной стилизацией и компоновкой (например, переносы строк, индивидуальные цвета)")
    inactive_opacity: Optional[float] = Field(default=None, description="Прозрачность неактивных слов во время караоке (от 0.0 до 1.0, например 0.45)")
    active_scale: Optional[float] = Field(default=None, description="Масштаб увеличения активного слова при караоке-анимации (например 1.25)")
    x: Optional[float] = Field(default=None, description="Горизонтальное положение текста/субтитров на экране в процентах (0-100). Пример: 50 для центра, 20 для левого края, 80 для правого.")
    y: Optional[float] = Field(default=None, description="Вертикальное положение текста/субтитров на экране в процентах (0-100). Пример: 50 для центра, 15 для верха, 85 для низа.")

class SelectBgmArgs(BaseModel):
    asset_query: str = Field(description="Запрос для поиска фоновой музыки в библиотеке (например: 'lofi', 'trap', 'acoustic')")
    volume: float = Field(default=-22, description="Громкость фоновой дорожки в dB")

class AudioDuckingArgs(BaseModel):
    duck_points: List[Dict[str, Any]] = Field(description="Точки понижения громкости на звуковых акцентах")

class ZoomArgs(BaseModel):
    start_time: float = Field(description="Начало наезда камеры в секундах")
    end_time: float = Field(description="Конец наезда камеры в секундах")
    type: str = Field(default="zoom_in", description="Тип зума: 'zoom_in' или 'zoom_out'")

class TransitionArgs(BaseModel):
    start_time: float = Field(description="Таймкод срабатывания перехода")
    transition_type: str = Field(default="swoosh", description="Тип перехода: 'whoosh', 'glitch', 'film'")

class ModifyClipArgs(BaseModel):
    clip_id: str = Field(description="Уникальный ID или префикс-индекс изменяемого клипа (например: 'V2-Broll-0', 'M1-Music-2')")
    start_time: Optional[float] = Field(default=None, description="Новое время начала клипа в секундах")
    end_time: Optional[float] = Field(default=None, description="Новое время окончания клипа в секундах")
    volume: Optional[float] = Field(default=None, description="Новый уровень громкости в dB")
    text: Optional[str] = Field(default=None, description="Новый текст субтитров или графического элемента")
    query: Optional[str] = Field(default=None, description="Новый поисковый запрос (для B-roll или саундтрека)")
    position: Optional[str] = Field(default=None, description="Новая позиция элемента на экране ('bottom', 'center', 'top')")
    color: Optional[str] = Field(default=None, description="Новый цвет текста в hex-формате (например: '#FF3B30')")
    style: Optional[str] = Field(default=None, description="Новый стиль анимации или оформления (например: 'pop', 'slide_up')")
    font_size: Optional[int] = Field(default=None, description="Новый размер шрифта в пикселях")
    delete: Optional[bool] = Field(default=None, description="Если True, этот клип будет полностью удален с таймлайна")
    font_pairing: Optional[str] = Field(default=None, description="Второй (акцентный) шрифт для титра (например: 'Lobster')")
    word_styles: Optional[str] = Field(default=None, description="JSON-строка с пословной стилизацией титра")
    inactive_opacity: Optional[float] = Field(default=None, description="Прозрачность неактивных слов")
    active_scale: Optional[float] = Field(default=None, description="Масштаб активного слова")
    x: Optional[float] = Field(default=None, description="Новая горизонтальная координата текста на экране в процентах (0-100)")
    y: Optional[float] = Field(default=None, description="Новая вертикальная координата текста на экране в процентах (0-100)")

class ChangeFormatArgs(BaseModel):
    format: str = Field(description="Требуемый формат видео: '9:16' (vertical/TikTok) или '16:9' (horizontal/YouTube)")

class StitchVideoClipArgs(BaseModel):
    asset_id: str = Field(description="Уникальный ID загруженного исходного видеоролика из медиа-библиотеки (например: 'additional_uuid' или 'main')")
    start_time: float = Field(description="Таймкод начала фрагмента в исходном видеоролике в секундах")
    end_time: float = Field(description="Таймкод окончания фрагмента в исходном видеоролике в секундах")

class SearchAndAddMusicArgs(BaseModel):
    query: str = Field(description="Поисковый запрос для подбора фоновой музыки (например: lofi, synthwave, acoustic)")
    start_time: float = Field(default=0.0, description="Таймкод начала проигрывания музыки в секундах")
    end_time: Optional[float] = Field(default=None, description="Таймкод окончания музыки (если не указано, играет до конца)")
    volume: float = Field(default=-22.0, description="Громкость аудиодорожки в децибелах (например, -22)")

class SearchAndAddStickerArgs(BaseModel):
    query: str = Field(description="Поисковый запрос для стикера или эмодзи (например: fire, subscribe, arrow, cool)")
    start_time: float = Field(description="Таймкод начала отображения стикера в секундах")
    duration: float = Field(default=3.0, description="Длительность отображения стикера в секундах")
    position: str = Field(default="center", description="Позиция стикера на экране: 'center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'")
    scale: float = Field(default=0.3, description="Масштаб стикера относительно высоты видео (значение от 0.1 до 1.0)")

class GenerateAudioArgs(BaseModel):
    prompt: str = Field(description="Английское текстовое описание звука или музыки (например: 'cinematic boom explosion', 'chill lofi hip hop loop')")
    duration: float = Field(default=10.0, description="Длительность генерируемого аудио в секундах (от 3 до 45)")
    start_time: float = Field(default=0.0, description="Таймкод начала воспроизведения на таймлайне в секундах")
    is_bgm: bool = Field(default=False, description="True если это фоновая музыка (на дорожку M1), False если это короткий SFX эффект (на дорожку SFX)")
    volume: float = Field(default=-15.0, description="Громкость аудиодорожки в dB (например, -20.0 для музыки, -8.0 для SFX)")

# ═══════════════════════════════════════════════════════════════════════════
# TOOL RUNNERS
# ═══════════════════════════════════════════════════════════════════════════

def search_and_add_music(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    file_id = memory.session.get("project_id")
    if not file_id:
        return "Ошибка: Не найден ID проекта во временной памяти сессии"
        
    query = args["query"]
    start = args["start_time"]
    end = args.get("end_time")
    volume = args["volume"]
    
    from app.services.stock_provider_service import search_stock_music, download_stock_asset
    from app.api.video import add_to_media_library
    
    tracks = search_stock_music(query)
    if not tracks:
        tracks = search_stock_music("lofi")
        if not tracks:
            return "Ошибка: Не удалось найти подходящие музыкальные треки по вашему запросу."
            
    track = tracks[0]
    asset_id = f"stock_music_{track['id']}"
    
    local_path = download_stock_asset(asset_id, track["url"])
    if not local_path:
        return f"Ошибка: Не удалось скачать музыкальный трек '{track['title']}'."
        
    add_to_media_library(
        file_id=file_id,
        asset_id=asset_id,
        filename=track["title"],
        path=local_path.replace("\\", "/"),
        duration=track["duration"]
    )
    
    timeline.add_asset(start=start, end=end, asset_query=track["title"], volume=volume, is_bgm=True)
    
    # Enrich the edit item with resolved_path
    for edit in timeline.edits:
        if edit.get("action") == "add_asset" and edit.get("asset_query") == track["title"]:
            edit["resolved_path"] = local_path.replace("\\", "/")
            edit["asset_type"] = "audio"
            
    event_bus.emit("tool_completed", {"tool": "search_and_add_music", "message": f"Добавлена музыка '{track['title']}'"})
    return f"Успешно добавлен стоковый музыкальный трек '{track['title']}' от {track['artist']} на таймлайн ({start}s)."

def search_and_add_sticker(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    file_id = memory.session.get("project_id")
    if not file_id:
        return "Ошибка: Не найден ID проекта во временной памяти сессии"
        
    query = args["query"]
    start = args["start_time"]
    duration = args["duration"]
    position = args.get("position", "center")
    scale = args.get("scale", 0.3)
    
    from app.services.stock_provider_service import search_stock_stickers, download_stock_asset
    from app.api.video import add_to_media_library
    
    stickers = search_stock_stickers(query)
    if not stickers:
        stickers = search_stock_stickers("fire")
        if not stickers:
            return "Ошибка: Не удалось найти подходящие стикеры или эмодзи."
            
    sticker = stickers[0]
    asset_id = f"stock_sticker_{sticker['id']}"
    
    local_path = download_stock_asset(asset_id, sticker["url"])
    if not local_path:
        return f"Ошибка: Не удалось скачать стикер '{sticker['name']}'."
        
    add_to_media_library(
        file_id=file_id,
        asset_id=asset_id,
        filename=sticker["name"],
        path=local_path.replace("\\", "/"),
        duration=0.0
    )
    
    edit = {
        "action": "add_sticker",
        "sticker_id": asset_id,
        "resolved_path": local_path.replace("\\", "/"),
        "start": round(start, 2),
        "end": round(start + duration, 2),
        "position": position,
        "scale": scale
    }
    
    timeline.edits.append(edit)
    
    event_bus.emit("tool_completed", {"tool": "search_and_add_sticker", "message": f"Добавлен стикер '{sticker['name']}' на {start}s"})
    return f"Успешно добавлен графический стикер '{sticker['name']}' на таймлайн ({start} - {start+duration}s, позиция: {position})."

def generate_audio(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    file_id = memory.session.get("project_id")
    if not file_id:
        return "Ошибка: Не найден ID проекта во временной памяти сессии"
        
    prompt = args["prompt"]
    duration = int(args.get("duration", 10))
    start = args.get("start_time", 0.0)
    is_bgm = args.get("is_bgm", False)
    volume = args.get("volume", -15.0)

    import time
    from app.services.stable_audio_service import generate_audio_via_replicate
    from app.services.stock_provider_service import download_stock_asset
    from app.api.video import add_to_media_library

    try:
        # 1. Генерация аудио через Replicate
        audio_url = generate_audio_via_replicate(prompt, duration)
        
        # 2. Скачивание сгенерированного файла
        asset_id = f"ai_audio_{int(time.time())}"
        local_path = download_stock_asset(asset_id, audio_url)
        if not local_path:
            return "Ошибка: Не удалось скачать сгенерированный аудиофайл на сервер."

        # 3. Регистрация ассета в медиабиблиотеке проекта
        add_to_media_library(
            file_id=file_id,
            asset_id=asset_id,
            filename=f"AI: {prompt[:30]}",
            path=local_path.replace("\\", "/"),
            duration=float(duration)
        )

        # 4. Добавление на таймлайн
        timeline.add_asset(start=start, end=start + duration, asset_query=f"AI: {prompt[:30]}", volume=volume, is_bgm=is_bgm)
        
        # Установка пути к файлу для корректной сборки
        for edit in timeline.edits:
            if edit.get("action") == "add_asset" and edit.get("asset_query") == f"AI: {prompt[:30]}":
                edit["resolved_path"] = local_path.replace("\\", "/")
                edit["asset_type"] = "audio"

        event_bus.emit("tool_completed", {"tool": "generate_audio", "message": f"Сгенерирован звук: '{prompt}'"})
        return f"Успешно сгенерирован и добавлен на таймлайн аудиоклип '{prompt}' ({duration}s)."
    except Exception as e:
        return f"Ошибка генерации аудио через Replicate: {str(e)}"

def stitch_video_clip(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    asset_id = args["asset_id"]
    start = args["start_time"]
    end = args["end_time"]
    
    edit = {
        "action": "stitch_clip",
        "source": asset_id,
        "start": round(start, 2),
        "end": round(end, 2)
    }
    timeline.edits.append(edit)
    event_bus.emit("tool_completed", {"tool": "stitch_video_clip", "message": f"Склеено видео '{asset_id}' фрагмент {start} - {end}s"})
    return f"Успешно добавлен фрагмент видео '{asset_id}' с {start} по {end}s"

def cut_clip(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    end = args["end_time"]
    timeline.add_cut(start, end)
    event_bus.emit("tool_completed", {"tool": "cut_clip", "message": f"Вырезан фрагмент {start} - {end}s"})
    return f"Успешно вырезан фрагмент {start} - {end}s"

def add_broll(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    end = args["end_time"]
    query = args["query"]
    timeline.add_broll(start, end, query)
    event_bus.emit("tool_completed", {"tool": "add_broll", "message": f"Вставлен B-roll '{query}' на {start} - {end}s"})
    return f"Успешно вставлен B-roll по теме '{query}' на {start} - {end}s"

def create_scene(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    duration = args["duration"]
    
    scene_data = {
        "scene_template": args["scene_template"],
        "mood": args.get("mood", "neutral"),
        "energy": args.get("energy", 0.5),
        "entities": args["entities"],
        "relations": args.get("relations", [])
    }
    
    # Passing the raw semantic JSON object instead of compiled HTML
    timeline.add_graphics(start, duration, scene_data, "semantic_scene")
    
    event_bus.emit("graphics_generated", {"style": args["scene_template"], "message": f"Создана семантическая сцена '{args['scene_template']}' на {start}s"})
    return f"Успешно создана семантическая сцена '{args['scene_template']}' на {start}s"


def build_kinetic_typography(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    # Direct dictionary get without hardcoded defaults so that incremental updates can merge cleanly
    font = args.get("font")
    font_size = args.get("font_size")
    font_color = args.get("font_color")
    accent_color = args.get("accent_color")
    outline = args.get("use_outline")
    use_shadow = args.get("use_shadow")
    shadow_blur = args.get("shadow_blur")
    style = args.get("animation_style") or args.get("style")
    position = args.get("position")
    text_case = args.get("text_case")
    max_words = args.get("max_words")
    font_pairing = args.get("font_pairing")
    word_styles = args.get("word_styles")
    inactive_opacity = args.get("inactive_opacity")
    active_scale = args.get("active_scale")
    x = args.get("x")
    y = args.get("y")
    
    merged = timeline.set_subtitles(
        font=font,
        font_size=font_size,
        font_color=font_color,
        use_outline=outline,
        animation_style=style,
        position=position,
        accent_color=accent_color,
        use_shadow=use_shadow,
        shadow_blur=shadow_blur,
        text_case=text_case,
        max_words=max_words,
        font_pairing=font_pairing,
        word_styles=word_styles,
        inactive_opacity=inactive_opacity,
        active_scale=active_scale,
        x=x,
        y=y
    )
    
    f_val = merged.get("font", "Montserrat-ExtraBold")
    fs_val = merged.get("font_size", 80)
    tc_val = merged.get("text_case", "UPPER")
    s_val = merged.get("animation_style", "pop")
    p_val = merged.get("position", "bottom")
    ac_val = merged.get("accent_color", "#FACC15")
    mw_val = merged.get("max_words", 3)
    x_val = merged.get("x")
    y_val = merged.get("y")
    
    pos_str = f"x={x_val}%, y={y_val}%" if (x_val is not None or y_val is not None) else f"позиция {p_val}"
    event_bus.emit("tool_completed", {"tool": "build_kinetic_typography", "message": f"Применены субтитры: {f_val} ({fs_val}px, {tc_val}, стиль {s_val}, {pos_str}, акцент {ac_val})"})
    return f"Успешно настроены субтитры: шрифт={f_val}, размер={fs_val}px, цвет={merged.get('font_color')}, акцент={ac_val}, анимация={s_val}, координаты=({x_val}%, {y_val}%), позиция={p_val}, регистр={tc_val}, слов на экране={mw_val}"

def select_bgm(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    query = args["asset_query"]
    vol = args.get("volume", -22)
    
    # Check production memory anti-repetition gate
    if memory.is_soundtrack_repeated(query):
        event_bus.emit("retention_warning", {"message": f"Soundtrack matching '{query}' was recently played. Swapping style profile."})
        logger.warning(f"Anti-Repetition Gate: soundtrack '{query}' repeated, swapping choice.")
        
    # Resolve assets against index catalog
    resolved = resolve_asset_query(query)
    resolved_path = resolved["rel_path"] if resolved else None
    
    # Mutate timeline state
    edit = timeline.add_asset(start=0.0, end=None, asset_query=query, volume=vol, is_bgm=True)
    if resolved_path:
        edit["resolved_path"] = resolved_path
        edit["asset_type"] = "audio"
        
    memory.record_soundtrack(query)
    event_bus.emit("soundtrack_selected", {"soundtrack": query, "message": f"Выбран саундтрек '{query}' ({vol}dB)"})
    return f"Успешно добавлен саундтрек '{query}' с уровнем громкости {vol}дБ"

def create_zoom(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    end = args["end_time"]
    z_type = args.get("type", "zoom_in")
    
    # Check spacing density gate in production memory
    if memory.check_zoom_density(start):
        logger.warning(f"Anti-Repetition Spacing Gate: zooms are too dense at {start}s. Adjusting delay.")
        start += 1.0
        end += 1.0
        
    timeline.add_zoom(start, end, z_type)
    memory.record_zoom(start, z_type)
    event_bus.emit("tool_completed", {"tool": "create_zoom", "message": f"Применен зум '{z_type}' на {start} - {end}s"})
    return f"Успешно применен зум '{z_type}' на {start} - {end}s"

def build_transition(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    t_type = args.get("transition_type", "swoosh")
    
    # Dynamic sound transition resolution
    query = f"{t_type} transition"
    resolved = resolve_asset_query(query)
    resolved_path = resolved["rel_path"] if resolved else None
    
    edit = timeline.add_asset(start=start, end=start + 1.5, asset_query=query, volume=-12)
    if resolved_path:
        edit["resolved_path"] = resolved_path
        edit["asset_type"] = "audio"
        
    memory.record_transition(t_type)
    event_bus.emit("tool_completed", {"tool": "build_transition", "message": f"Добавлен переход '{t_type}' на {start}s со звуковым эффектом"})
    return f"Успешно добавлен переход '{t_type}' на {start}s со звуком"

def modify_clip(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    import re
    clip_id = args["clip_id"]
    delete = args.get("delete", False)
    start_time = args.get("start_time")
    end_time = args.get("end_time")
    volume = args.get("volume")
    text = args.get("text")
    query = args.get("query")
    position = args.get("position")
    color = args.get("color")
    style = args.get("style")
    font_size = args.get("font_size")
    x = args.get("x")
    y = args.get("y")
    
    target_idx = -1
    
    try:
        if clip_id.startswith('V2-Broll-'):
            idx = int(clip_id.replace('V2-Broll-', ''))
            broll_indices = [i for i, e in enumerate(timeline.edits) if e.get("action") == "add_broll"]
            if 0 <= idx < len(broll_indices):
                target_idx = broll_indices[idx]
        elif clip_id.startswith('M1-Music-') or clip_id.startswith('SFX-Asset-'):
            prefix = 'M1-Music-' if clip_id.startswith('M1-Music-') else 'SFX-Asset-'
            idx = int(clip_id.replace(prefix, ''))
            if 0 <= idx < len(timeline.edits):
                target_idx = idx
        elif clip_id.startswith('T1-Sub-'):
            idx = int(clip_id.replace('T1-Sub-', ''))
            
            # Subtitle Focus Mode Modification
            if delete:
                timeline.edits.append({
                    "action": "subtitle_override",
                    "chunk_index": idx,
                    "deleted": True
                })
                event_bus.emit("tool_completed", {"tool": "modify_clip", "message": f"Удален субтитр '{clip_id}'"})
                return f"Субтитр '{clip_id}' успешно скрыт."
            
            # 1) Override original subtitle chunk (hide it)
            timeline.edits.append({
                "action": "subtitle_override",
                "chunk_index": idx,
                "deleted": True
            })
            
            # 2) Extract it into an independent text_overlay graphic
            graphic_edit = {
                "action": "add_text_overlay",
                "id": f"G1-Graphic-Sub-{idx}",
                "start": start_time or 0.0,
                "end": end_time or 1.0,
                "text": text or "Custom Title",
                "font_color": color or "#FFFFFF",
                "position": position or "center",
                "animation_style": style or "pop",
                "font_size": font_size or 90,
                "font_pairing": font_pairing,
                "word_styles": word_styles,
                "inactive_opacity": inactive_opacity,
                "active_scale": active_scale,
                "x": x,
                "y": y
            }
            graphic_edit = {k: v for k, v in graphic_edit.items() if v is not None}
            timeline.edits.append(graphic_edit)
            
            event_bus.emit("tool_completed", {"tool": "modify_clip", "message": f"Субтитр '{clip_id}' конвертирован в Graphic Title"})
            return f"Субтитр '{clip_id}' успешно преобразован в стилизованный титр."
        elif clip_id.startswith('G1-Graphic-'):
            parts = clip_id.split('-')
            idx = int(parts[-1])
            g_indices = []
            for i, e in enumerate(timeline.edits):
                is_graphic = e.get("action") in ("canvas_overlay", "hyperframes_html", "add_hyperframes_graphics", 
                                                 "add_motion_graphic", "add_dynamic_graphic", "add_text_overlay")
                if is_graphic:
                    g_indices.append(i)
            if 0 <= idx < len(g_indices):
                target_idx = g_indices[idx]
        elif clip_id.startswith('S1-Scene-'):
            idx = int(clip_id.replace('S1-Scene-', ''))
            s_indices = [i for i, e in enumerate(timeline.edits) if e.get("action") == "scene_override"]
            if 0 <= idx < len(s_indices):
                target_idx = s_indices[idx]
    except Exception as e:
        logger.error(f"Error parsing clip_id: {e}")
        return f"Ошибка парсинга clip_id '{clip_id}': {e}"

    if target_idx == -1:
        for i, e in enumerate(timeline.edits):
            if e.get("id") == clip_id:
                target_idx = i
                break
                
    if target_idx == -1:
        return f"Элемент с ID '{clip_id}' не найден на таймлайне."

    target_edit = timeline.edits[target_idx]
    
    if delete:
        timeline.edits.pop(target_idx)
        event_bus.emit("tool_completed", {"tool": "modify_clip", "message": f"Удален элемент '{clip_id}' с таймлайна"})
        return f"Элемент '{clip_id}' успешно удален."
        
    modifications = []
    if start_time is not None:
        target_edit["start"] = round(start_time, 2)
        modifications.append(f"start={start_time}s")
    if end_time is not None:
        target_edit["end"] = round(end_time, 2)
        modifications.append(f"end={end_time}s")
    if volume is not None:
        target_edit["volume"] = volume
        modifications.append(f"volume={volume} dB")
    if text is not None:
        if "text" in target_edit:
            target_edit["text"] = text
        elif "html_content" in target_edit:
            target_edit["html_content"] = re.sub(r'(>)[^<>]*(</)', rf'\1{text}\2', target_edit["html_content"])
        modifications.append(f"text='{text}'")
    if query is not None:
        if "query" in target_edit:
            target_edit["query"] = query
        elif "asset_query" in target_edit:
            target_edit["asset_query"] = query
        modifications.append(f"query='{query}'")
    if position is not None:
        target_edit["position"] = position
        modifications.append(f"position='{position}'")
    if color is not None:
        target_edit["font_color"] = color
        target_edit["color"] = color
        modifications.append(f"color='{color}'")
    if style is not None:
        if "animation_style" in target_edit:
            target_edit["animation_style"] = style
        else:
            target_edit["style"] = style
        modifications.append(f"style='{style}'")
    if font_size is not None:
        target_edit["font_size"] = font_size
        target_edit["fontsize"] = font_size
        modifications.append(f"font_size={font_size}px")
    if font_pairing is not None:
        target_edit["font_pairing"] = font_pairing
        modifications.append(f"font_pairing='{font_pairing}'")
    if word_styles is not None:
        target_edit["word_styles"] = word_styles
        modifications.append("word_styles=updated")
    if inactive_opacity is not None:
        target_edit["inactive_opacity"] = inactive_opacity
        modifications.append(f"inactive_opacity={inactive_opacity}")
    if active_scale is not None:
        target_edit["active_scale"] = active_scale
        modifications.append(f"active_scale={active_scale}")
    if x is not None:
        target_edit["x"] = x
        modifications.append(f"x={x}%")
    if y is not None:
        target_edit["y"] = y
        modifications.append(f"y={y}%")

    msg = f"Изменен элемент '{clip_id}': " + ", ".join(modifications)
    event_bus.emit("tool_completed", {"tool": "modify_clip", "message": msg})
    return msg

# ═══════════════════════════════════════════════════════════════════════════
# REGISTRY DEFINITION
# ═══════════════════════════════════════════════════════════════════════════

TOOLS_REGISTRY = {}

_LOCAL_RUNNERS = {
    "cut_clip": {
        "schema": CutClipArgs,
        "runner": cut_clip
    },
    "add_broll": {
        "schema": AddBrollArgs,
        "runner": add_broll
    },
    "create_scene": {
        "schema": CreateSceneArgs,
        "runner": create_scene
    },
    "build_kinetic_typography": {
        "schema": KineticTypographyArgs,
        "runner": build_kinetic_typography
    },
    "select_bgm": {
        "schema": SelectBgmArgs,
        "runner": select_bgm
    },
    "create_zoom": {
        "schema": ZoomArgs,
        "runner": create_zoom
    },
    "build_transition": {
        "schema": TransitionArgs,
        "runner": build_transition
    },
    "modify_clip": {
        "schema": ModifyClipArgs,
        "runner": modify_clip
    },
    "change_format": {
        "schema": ChangeFormatArgs,
        "runner": lambda t, m, a: t.edits.append({"action": "change_format", "format": a["format"]}) or event_bus.emit("tool_completed", {"tool": "change_format", "message": f"Изменен формат видео на {a['format']}"}) or f"Формат видео изменен на {a['format']}"
    },
    "stitch_video_clip": {
        "schema": StitchVideoClipArgs,
        "runner": stitch_video_clip
    },
    "search_and_add_music": {
        "schema": SearchAndAddMusicArgs,
        "runner": search_and_add_music
    },
    "search_and_add_sticker": {
        "schema": SearchAndAddStickerArgs,
        "runner": search_and_add_sticker
    },
    "generate_audio": {
        "schema": GenerateAudioArgs,
        "runner": generate_audio
    }
}

_TOOL_DESCRIPTIONS = {
    "cut_clip": "Вырезает тишину, паузы или неудачные дубли из видео в указанном временном диапазоне.",
    "add_broll": "Добавляет релевантное стоковое видео (B-roll) поверх основной дорожки.",
    "create_scene": "Создает семантическую структуру визуальной сцены (инфографики), описывая сущности (entities), их роли и связи (relations) между ними.",
    "build_kinetic_typography": "Настраивает стилистику, шрифт, размер, цвет и анимацию кинетических субтитров.",
    "select_bgm": "Выбирает фоновый саундтрек из каталога и настраивает уровень его громкости.",
    "create_zoom": "Создает наезды или отдаления камеры для расстановки акцентов и удержания внимания.",
    "build_transition": "Вставляет звуковой и визуальный переход (whoosh, glitch, film) на склейках.",
    "modify_clip": "Изменяет параметры (начало, конец, громкость, текст, поисковый запрос) или полностью удаляет (delete=True) конкретный выделенный клип на таймлайне.",
    "change_format": "Обрезает оригинальное видео в нужный формат (9:16 для TikTok, 16:9 для YouTube).",
    "stitch_video_clip": "Склеивает (добавляет) фрагмент из загруженного дополнительного видеоролика в проект.",
    "search_and_add_music": "Ищет в стоковой библиотеке фоновую музыку по текстовому запросу, скачивает её на сервер и накладывает на таймлайн проекта.",
    "search_and_add_sticker": "Ищет в стоковой библиотеке графический стикер или эмодзи, скачивает его на сервер и накладывает поверх видеоряда в указанные координаты.",
    "generate_audio": "Генерирует фоновую музыку или звуковой эффект (SFX) по текстовому промпту с помощью ИИ-модели Stable Audio 2.5 на Replicate и накладывает на таймлайн."
}

# Auto-populate TOOLS_REGISTRY for AI Cinematic Director
for name, runner_meta in _LOCAL_RUNNERS.items():
    schema = runner_meta["schema"]
    desc = _TOOL_DESCRIPTIONS.get(name, f"Инструмент монтажа {name}")
    TOOLS_REGISTRY[name] = {
        "schema": schema,
        "description": desc,
        "runner": runner_meta["runner"]
    }

def get_mcp_tools() -> Dict[str, Any]:
    """Dynamically registers discovered MCP desktop video editor tools."""
    from app.services.mcp_client import mcp_client
    mcp_tools = {}
    for t in mcp_client.tools:
        name = t.get("name")
        if not name:
            continue
        desc = t.get("description", "External MCP action.")
        schema = t.get("inputSchema", {"type": "object", "properties": {}})
        
        mcp_tools[name] = {
            "is_mcp": True,
            "description": desc,
            "inputSchema": schema,
            "runner": None
        }
    return mcp_tools

