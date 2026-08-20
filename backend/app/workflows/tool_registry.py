"""
Tool Registry — Declarative editing tools for the Persistent Cinematic Operating System.
Defines MCP-compatible input schemas and functional logic for modifying timeline states.
"""

import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.workflows.timeline_state import TimelineState

from app.workflows.production_memory import ProductionMemory
from app.workflows import event_bus
from app.services.asset_manager import resolve_asset_query

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# PYDANTIC ARGUMENT SCHEMAS (MCP / Tool Calling Standard)
# ═══════════════════════════════════════════════════════════════════════════

class CutClipArgs(BaseModel):
    start_time: float = Field(description="Время начала вырезаемого фрагмента в секундах")
    end_time: float = Field(description="Время окончания вырезаемого фрагмента в секундах")

class AddBrollArgs(BaseModel):
    start_time: float = Field(description="Начало отображения B-roll в секундах")
    end_time: float = Field(description="Конец отображения B-roll в секундах")
    query: str = Field(description="Имя своего файла или английский запрос стока. Если пользователь загрузил клипы — пиши имя файла или asset_id, не Pexels.")
    asset_id: Optional[str] = Field(
        default=None,
        description="ID клипа из медиатеки пользователя (например additional_uuid). Если задан — берём свой файл, не сток."
    )

class CreateSceneArgs(BaseModel):
    start_time: float = Field(description="Таймкод начала сцены в секундах")
    duration: float = Field(description="Длительность сцены в секундах. Overlay: 2–4с. Fullscreen TITLE: 2–4с (макс 5с).")
    scene_template: Optional[str] = Field(default=None, description="Шаблон: 'abstract' — слово + геометрия вокруг лица. 'stat_card' — плашка для цифры. 'kinetic_title' — fullscreen TITLE. 'idea_map' — overlay мысли (rail/split/stack/thesis). Не bento.")
    mood: str = Field(default="neutral", description="Настроение сцены (например: 'analytical', 'energetic', 'dramatic', 'cozy') для подбора Apple-style палитры")
    energy: float = Field(default=0.5, description="Уровень энергии от 0.0 до 1.0")
    entities: Optional[List[Dict[str, Any]]] = Field(default=None, description="Максимум 2 текстовых сущности: headline + ключ (stat или короткая фраза) и опционально icon. Не списки и не сетки.")
    relations: Optional[List[Dict[str, str]]] = Field(default=None, description="Не используй на overlay: стрелки перегружают. Оставь пустым, кроме редкого split.")
    style_profile: Optional[Dict[str, Any]] = Field(default=None, description="Профиль стилей: 'font_family' (кириллические шрифты: 'Inter', 'Montserrat', 'Rubik', 'Manrope', 'Unbounded', 'Comfortaa', 'JetBrains Mono', 'Playfair Display'), 'bg_color' (полупрозрачный фон Apple-glass, например 'rgba(20,20,25,0.65)'), 'border_color' ('rgba(255,255,255,0.15)'), 'color_accent' (цвет полосы загрузки/акцентов, например '#0A84FF')")
    concept_prompt: Optional[str] = Field(default=None, description="Overlay: 'ФРАЗА | ключ'. Plate: 'ЗАГОЛОВОК | 80%'. TITLE: 2–5 слов. idea_map: 'MAP:path | узел → узел' — схема мысли, не плашка.")
    layout: Optional[str] = Field(
        default=None,
        description="ОБЯЗАТЕЛЬНО. 'overlay' — акцент поверх лица (в т.ч. idea_map). 'fullscreen' — TITLE на весь кадр. 'split' — лицо сверху / графика снизу."
    )
    mode: Optional[str] = Field(
        default=None,
        description="Синоним layout для совместимости: 'overlay' | 'full_broll' | 'fullscreen' | 'split'. Если задан layout — layout приоритетнее при отсутствии mode."
    )
    idea_map: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Спека карты мысли: {kind, nodes, seed}. Если задана — scene_template=idea_map, узлы из речи ЭТОГО ролика.",
    )

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
    x: Optional[float] = Field(default=None, description="Горизонтальное положение текста/субтитров на экране в процентах (0-100). Пример: 50 для центра, 20 для левого края, 80 для правого.")
    y: Optional[float] = Field(default=None, description="Вертикальное положение текста/субтитров на экране в процентах (0-100). Пример: 50 для центра, 15 для верха, 85 для низа.")
    behind_speaker: Optional[bool] = Field(default=False, description="Если True — переносит весь текст/субтитры речи на задний план за спикера с помощью ротоскопинга RVM.")
    subtitle_preset: Optional[str] = Field(
        default=None,
        description="Пак в духе DaVinci Resolve Text+: 'resolve_stacked' (стек + жёлтый скрипт), 'resolve_dropcap' (розовая буквица + капс с видео-заливкой), 'resolve_classic' (толстая обводка), 'resolve_boxed' (плашка), 'resolve_cinema' (тень), 'resolve_neon', 'resolve_karaoke', 'resolve_bar' (линия снизу), 'resolve_pill', 'resolve_minimal'."
    )


class SelectBgmArgs(BaseModel):
    asset_query: str = Field(description="Запрос для поиска фоновой музыки в библиотеке (например: 'lofi', 'trap', 'acoustic')")
    volume: float = Field(default=-22, description="Громкость фоновой дорожки в dB")

class DesignSoundArgs(BaseModel):
    mood: Optional[str] = Field(
        default=None,
        description="Краткое настроение кровати (например: 'calm lofi', 'reels energy'). Таймкоды не указывай — агент читает таймлайн сам."
    )
    skip_bgm: bool = Field(
        default=False,
        description="True — не ставить новую кровать, только SFX и ducking на уже существующий BGM."
    )

class AudioDuckingArgs(BaseModel):
    duck_points: List[Dict[str, Any]] = Field(description="Точки понижения громкости на звуковых акцентах")

class ZoomArgs(BaseModel):
    start_time: float = Field(description="Начало наезда камеры в секундах")
    end_time: float = Field(description="Конец наезда камеры в секундах")
    type: str = Field(
        default="zoom_in",
        description="Тип зума: 'zoom_in' (punch с мягким settle), 'zoom_out', 'zoom_hold' (удержание с мягкими краями). НЕ обрывай зум резко — длительность 1.2–2.5с."
    )
    intensity: float = Field(
        default=1.14,
        description="Пиковый масштаб 1.08–1.25 (по умолчанию 1.14). Больше 1.25 — слишком агрессивно для talking-head."
    )

class TransitionArgs(BaseModel):
    start_time: float = Field(description="Таймкод срабатывания перехода")
    transition_type: str = Field(
        default="whoosh",
        description="Тип перехода/SFX: 'whoosh' (склейка/появление плашки), 'glitch' (tech), 'film' (мягкий), 'impact' (удар на тезис), 'riser' (подводка к мысли)"
    )

class ApplyColorGradeArgs(BaseModel):
    preset: str = Field(
        default="cinema",
        description="Пресет цветокора: 'cinema', 'warm', 'cold', 'vibrant', 'teal_orange', 'cyberpunk', 'vintage', 'monochrome'"
    )
    start_time: float = Field(default=0.0, description="Начало цветокора в секундах")
    end_time: Optional[float] = Field(default=None, description="Конец (по умолчанию — весь ролик)")
    brightness: Optional[float] = Field(default=None, description="Яркость 0–200 (100 = нейтрально)")
    contrast: Optional[float] = Field(default=None, description="Контраст 0–200")
    saturation: Optional[float] = Field(default=None, description="Насыщенность 0–200")
    hue: Optional[float] = Field(default=None, description="Сдвиг оттенка в градусах")

class ApplyTopicTransitionsArgs(BaseModel):
    transition_type: Optional[str] = Field(
        default=None,
        description="Тип перехода для всех точек смены темы: 'whoosh', 'glitch', 'film'. Если не указан — берётся suggested_type каждой точки."
    )
    min_gap_sec: float = Field(
        default=5.0,
        description="Минимальный интервал между соседними переходами в секундах."
    )

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

class RemoveBackgroundArgs(BaseModel):
    bg_color: str = Field(default="transparent", description="Цвет замены фона: 'transparent' (прозрачный WebM), или HEX-цвет заливки (например: '#0a0a1a' тёмно-чёрный, '#1a1a3e' синий бренд).")
    bg_video_query: Optional[str] = Field(default=None, description="Если указан — поиск фонового видео для замены фона (например: 'cityscape night neon').")

class SetVideoBackgroundArgs(BaseModel):
    bg_color: str = Field(default="#0a0a14", description="Цвет фона за спикером в HEX (например: '#0a0a14' тёмный, '#0d1b2a' ночной синий, '#1a0a2e' пурпурный). Фон ПОЛНОСТЬЮ заменяет окружение спикера.")
    text: Optional[str] = Field(default=None, description="Большой текст на фоне ЗА спикером (например: 'WHY?' или 'ВАЖНО' или 'x10'). Текст будет гигантским и полупрозрачным — как декоративный элемент позади спикера.")
    text_color: str = Field(default="white", description="Цвет текста на фоне (например: 'white', '#6366F1', '#FACC15').")
    text_opacity: float = Field(default=0.12, description="Прозрачность декоративного текста на фоне от 0.0 до 1.0. 0.08-0.15 — едва заметный фоновый эффект, 0.3-0.5 — явный текст.")
    font_size: int = Field(default=220, description="Размер шрифта декоративного фонового текста в пикселях. 180-280 для гигантских фоновых надписей.")
class AddMotionPresetArgs(BaseModel):
    preset: str = Field(default="BlurText", description="Название эффекта из библиотеки ReactBits: 'BlurText' (размытие при появлении слов), 'ShinyText' (переливающийся золотой/неоновый блеск), 'DecryptedText' (хакерский эффект матричного шрифта), 'TrueFocus' (плавающая неоновая рамка фокуса).")
    text: str = Field(description="Текст или заголовок для анимации.")
    start_time: float = Field(default=0.0, description="Время появления на таймлайне в секундах.")
    duration: float = Field(default=4.0, description="Длительность показа в секундах.")
    color: str = Field(default="#FFFFFF", description="Основной цвет текста в hex-формате.")
    font_size: int = Field(default=72, description="Размер шрифта в пикселях.")
    speed: Optional[float] = Field(default=None, description="Скорость анимации.")

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
    dur = float(memory.session.get("duration", 99999.0))
    start = max(0.0, min(float(args["start_time"]), dur - 0.1))
    end = max(start + 0.1, min(float(args["end_time"]), dur))
    timeline.add_cut(start, end)
    event_bus.emit("tool_completed", {"tool": "cut_clip", "message": f"Вырезан фрагмент {start:.1f} - {end:.1f}s"})
    return f"Успешно вырезан фрагмент {start:.1f} - {end:.1f}s"

def add_broll(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    dur = float(memory.session.get("duration", 99999.0))
    start = max(0.0, min(float(args["start_time"]), dur - 0.5))
    end = max(start + 0.5, min(float(args["end_time"]), dur))
    if end - start > 3.5:
        end = start + 3.5
    if end - start < 1.5:
        end = min(dur, start + 1.5)
    query = args["query"]
    layout = args.get("layout", "full")
    file_id = memory.session.get("project_id")
    used = [e.get("resolved_path") for e in timeline.edits if e.get("action") == "add_broll"]
    clip = None
    if file_id:
        from app.api.video import resolve_user_broll
        clip = resolve_user_broll(
            file_id,
            query=query,
            asset_id=args.get("asset_id"),
            used_paths=used,
        )
    if clip:
        edit = timeline.add_broll(
            start,
            end,
            query or clip.get("filename") or "user broll",
            layout=layout,
            resolved_path=clip.get("path"),
            asset_id=clip.get("id"),
            media_type=clip.get("media_type"),
            source="user",
        )
        label = clip.get("filename") or clip.get("id")
        event_bus.emit("tool_completed", {"tool": "add_broll", "message": f"Вставлен свой B-roll «{label}» на {start:.1f}–{end:.1f}s"})
        return f"Вставлен свой B-roll «{label}» на {start:.1f}–{end:.1f}s"
    timeline.add_broll(start, end, query, layout=layout)
    event_bus.emit("tool_completed", {"tool": "add_broll", "message": f"Вставлен B-roll '{query}' на {start:.1f} - {end:.1f}s"})
    return f"Успешно вставлен B-roll по теме '{query}' на {start:.1f} - {end:.1f}s"

async def create_scene(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    duration = args["duration"]
    layout = args.get("layout") or args.get("mode") or "overlay"
    tmpl = str(args.get("scene_template") or "").lower().replace(" ", "_")
    concept = str(args.get("concept_prompt") or "")
    is_idea_map = tmpl in ("idea_map", "diagram", "map", "thought_map") or concept.upper().startswith("MAP:")
    if is_idea_map:
        duration = max(2.6, min(float(duration), 4.6))
        args["scene_template"] = "idea_map"
        layout = "overlay"
        args["layout"] = "overlay"
    elif layout in ("fullscreen", "cover", "full", "full_broll"):
        duration = max(2.0, min(float(duration), 5.0))
        if not args.get("scene_template"):
            args["scene_template"] = "kinetic_title"
    else:
        duration = max(1.5, min(float(duration), 4.5))
    concept_prompt = args.get("concept_prompt")
    aspect_ratio = memory.session.get("aspect_ratio") or memory.session.get("video_format") or "9:16"
    for edit in timeline.edits:
        if edit.get("action") == "change_format":
            aspect_ratio = edit.get("format", aspect_ratio)


    # If no concept_prompt, try to construct one from entities — headline | key only
    if not concept_prompt and args.get("entities"):
        ents = args["entities"]
        headline = next((e for e in ents if e.get("type") == "headline"), None)
        key_ent = next(
            (e for e in ents if e.get("type") in ("stat_card", "stat", "key", "metric") and e is not headline),
            None,
        )
        if not key_ent:
            others = [e for e in ents if e is not headline and (e.get("text") or "").strip()]
            key_ent = others[0] if others else None
        h_text = ((headline or {}).get("text") or (ents[0].get("text") if ents else "") or "").strip()
        k_text = ((key_ent or {}).get("text") or "").strip()
        concept_prompt = f"{h_text} | {k_text}".strip(" |") if k_text else h_text

    if not concept_prompt:
        concept_prompt = "КЛЮЧЕВОЕ"

    # Find visual context for the current frame
    visual_scenes = memory.session.get("visual_scenes", [])
    current_scene_info = None
    if visual_scenes:
        closest_scene = min(visual_scenes, key=lambda s: abs(s.get("time_sec", 0.0) - start))
        scene_desc = closest_scene.get("scene", "Говорящая голова")
        safe_zone = closest_scene.get("safe_zone", "none")
        current_scene_info = f"В этот момент в кадре: '{scene_desc}'. Рекомендованная безопасная зона для размещения графики: '{safe_zone}'."
        logger.info(f"📹 VLM Context for create_scene at {start}s: {current_scene_info}")

    # Transcript is context for the designer, not copy to dump on the plate
    transcript_data = memory.session.get("transcript_data", {})
    mood = memory.get_style_profile().get("mood", "") if hasattr(memory, "get_style_profile") else ""
    transcript_snippet = ""
    if transcript_data:
        words = transcript_data.get("words", []) or []
        nearby_words = [
            w.get("word", w.get("text", "")) for w in words
            if abs(float(w.get("start", 0)) - start) <= 5.0
        ]
        if nearby_words:
            transcript_snippet = " ".join(nearby_words[:12]).strip()
    if current_scene_info and transcript_snippet:
        current_scene_info = f"{current_scene_info} Речь рядом: «{transcript_snippet}»."
    elif transcript_snippet:
        current_scene_info = f"Речь рядом: «{transcript_snippet}»."
    if mood and current_scene_info:
        current_scene_info = f"{current_scene_info} Настроение: {mood}."

    look = memory.get_content_look() if hasattr(memory, "get_content_look") else None
    idea_spec = args.get("idea_map") if isinstance(args.get("idea_map"), dict) else None
    if is_idea_map:
        from app.services.idea_map import parse_idea_map, build_idea_map, concept_from_map
        if not (idea_spec and idea_spec.get("nodes")):
            idea_spec = parse_idea_map(concept_prompt or "", look) or build_idea_map(
                transcript_snippet or concept_prompt or "", look
            )
        if idea_spec:
            args["idea_map"] = idea_spec
            concept_prompt = concept_from_map(idea_spec)

    mode = args.get("mode") or args.get("scene_mode")
    if not mode:
        if layout in ("fullscreen", "cover", "full", "full_broll"):
            mode = "full_broll"
        elif layout == "split":
            mode = "split"
        else:
            mode = "overlay"  # plates on top of talking-head
    # Normalize agent aliases → graphics_developer vocabulary
    if mode in ("fullscreen", "cover", "full"):
        mode = "full_broll"

    # Invoke the Generative Graphics Developer Agent to write clean HTML/GSAP/Three.js code dynamically
    from app.workflows.graphics_developer import generate_custom_graphics_code
    from app.workflows.reasoning_manager import ReasoningManager

    mode_label = {
        "overlay": "плашка поверх спикера",
        "full_broll": "полноэкранный графический B-roll",
        "split": "split-композиция (лицо + графика)",
    }.get(mode, mode)
    if is_idea_map:
        mode_label = "карта мысли (графический B-roll)"
    short_concept = (concept_prompt or "сцена")[:90]
    if len(concept_prompt or "") > 90:
        short_concept += "…"
    activity_step = f"GRAPHICS: {short_concept}"
    end_t = round(start + duration, 2)

    logger.info(
        f"🎨 Generative Graphics Agent: Creating custom animated code for conceptual prompt: "
        f"'{concept_prompt}' (Mode: {mode}, Layout: {layout}, AR: {aspect_ratio})"
    )
    event_bus.emit("log", {
        "message": f"🎨 Генерация графики [{mode_label}] «{short_concept}» @ {start:.1f}–{end_t:.1f}s ({aspect_ratio})"
    })
    ReasoningManager.emit_activity(
        activity_step,
        f"Генерирую графическую сцену — {mode_label}.\n"
        f"Формат {aspect_ratio}, layout={layout}, интервал {start:.1f}–{end_t:.1f}с.\n"
        f"Концепт: {short_concept}",
        status="running",
        agent="Graphics Developer",
        progress=0.72,
    )
    if current_scene_info:
        ReasoningManager.emit_activity(
            "REASONING: Зрительный контекст кадра",
            current_scene_info,
            status="done",
            agent="Cinematic Brain",
            progress=0.7,
        )

    graphics_res = await generate_custom_graphics_code(
        concept_prompt=concept_prompt,
        layout=layout,
        aspect_ratio=aspect_ratio,
        start_time=start,
        duration=duration,
        visual_frame_context=current_scene_info,
        mode=mode,
        activity_step=activity_step,
        scene_template=args.get("scene_template"),
        look=look,
        idea_map=idea_spec,
    )
    html_content = graphics_res.get("html_content", "")
    explanation = graphics_res.get("explanation", "Анимационная сцена сгенерирована ИИ.")
    
    # Register the custom dynamic HTML canvas overlay on the timeline (persist mode!)
    timeline.add_graphics(
        start, duration, html_content, "hyperframes_html",
        mode=mode, layout=layout, design_aspect=aspect_ratio,
        graphic_kind="map" if is_idea_map else None,
    )

    done_details = (
        f"Готово: {explanation}\n"
        f"Тип: {mode_label} · {start:.1f}–{end_t:.1f}с · {aspect_ratio}"
    )
    event_bus.emit("log", {"message": f"✅ Графика готова: {explanation} ({start:.1f}–{end_t:.1f}s)"})
    event_bus.emit("graphics_generated", {
        "style": "custom_generative_html",
        "step": activity_step,
        "status": "done",
        "message": done_details,
        "details": done_details,
        "agent": "Graphics Developer",
        "progress": 0.88,
    })
    
    return (
        f"Создана графика «{short_concept}» ({mode_label}) на {start:.1f}–{end_t:.1f}с. "
        f"{explanation}"
    )


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
    behind_speaker = args.get("behind_speaker")
    subtitle_preset = args.get("subtitle_preset")
    if position == "behind_speaker":
        behind_speaker = True

    
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
        y=y,
        behind_speaker=behind_speaker,
        subtitle_preset=subtitle_preset,
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

async def design_sound(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    """One-pass sound designer: bed + sparse SFX + ducking metadata."""
    from app.workflows.sound_designer import run_sound_design
    return await run_sound_design(timeline, memory, args)

def create_zoom(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    dur = float(memory.session.get("duration", 99999.0))
    start = max(0.0, min(float(args["start_time"]), dur - 0.5))
    end = max(start + 0.5, min(float(args["end_time"]), dur))
    # Soft punch needs enough room to settle — pad short zooms
    if end - start < 1.0:
        end = min(start + 1.4, dur)
    z_type = args.get("type", "zoom_in")
    if args.get("intensity") is None:
        look = memory.get_content_look() if hasattr(memory, "get_content_look") else {}
        intensity = float((look.get("montage") or {}).get("zoom_intensity") or 1.12)
    else:
        intensity = float(args.get("intensity") or 1.14)
    intensity = max(1.06, min(1.28, intensity))
    
    # Check spacing density gate in production memory
    if memory.check_zoom_density(start):
        logger.warning(f"Anti-Repetition Spacing Gate: zooms are too dense at {start}s. Adjusting delay.")
        start = min(start + 1.0, dur - 0.5)
        end = min(end + 1.0, dur)
        
    timeline.add_zoom(start, end, z_type, intensity=intensity)
    memory.record_zoom(start, z_type)
    event_bus.emit("tool_completed", {"tool": "create_zoom", "message": f"Применен зум '{z_type}' ×{intensity:.2f} на {start:.1f} - {end:.1f}s"})
    return f"Успешно применен зум '{z_type}' (intensity={intensity:.2f}) на {start:.1f} - {end:.1f}s"

def apply_color_grade(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    """Add color_correction edit for talking-head grade (preview + export)."""
    dur = float(memory.session.get("duration", 99999.0))
    start = max(0.0, float(args.get("start_time", 0.0) or 0.0))
    end = args.get("end_time")
    end = float(end) if end is not None else dur
    end = max(start + 0.1, min(end, dur))
    preset = (args.get("preset") or "").strip().lower()
    if not preset:
        look = memory.get_content_look() if hasattr(memory, "get_content_look") else {}
        preset = str((look.get("montage") or {}).get("lut") or "cinema").strip().lower()
    allowed = {"cinema", "warm", "cold", "vibrant", "teal_orange", "cyberpunk", "vintage", "monochrome"}
    if preset not in allowed:
        preset = "cinema"

    edit = {
        "action": "color_correction",
        "preset": preset,
        "start": round(start, 2),
        "end": round(end, 2),
    }
    for key in ("brightness", "contrast", "saturation", "hue"):
        if args.get(key) is not None:
            edit[key] = args[key]

    # Replace overlapping color grades
    timeline.edits = [
        e for e in timeline.edits
        if not (
            e.get("action") == "color_correction"
            and float(e.get("start", 0)) < end
            and float(e.get("end", 0)) > start
        )
    ]
    timeline.edits.append(edit)
    event_bus.emit("tool_completed", {"tool": "apply_color_grade", "message": f"Цветокор '{preset}' на {start:.1f}-{end:.1f}s"})
    return f"Успешно применён цветокор '{preset}' на {start:.1f}-{end:.1f}s"

def build_transition(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    file_id = memory.session.get("project_id")
    if not file_id:
        return "Ошибка: Не найден ID проекта во временной памяти сессии"
        
    start = args["start_time"]
    t_type = args.get("transition_type", "swoosh")
    
    from app.services.stock_provider_service import search_freesound_sfx, download_stock_asset, FALLBACK_SFX_MAP
    from app.api.video import add_to_media_library
    import time
    
    # 1. Search Freesound
    query = f"{t_type} transition"
    sfx_results = search_freesound_sfx(query)
    
    download_url = None
    asset_title = f"{t_type} transition"
    
    if sfx_results:
        download_url = sfx_results[0]["url"]
        asset_title = sfx_results[0]["title"]
        print(f"[build_transition] Found SFX on Freesound: {asset_title}")
    else:
        # Fallback to map
        fallback_url = FALLBACK_SFX_MAP.get(t_type.lower()) or FALLBACK_SFX_MAP.get("whoosh")
        download_url = fallback_url
        print(f"[build_transition] Freesound search returned nothing. Using fallback: {download_url}")
        
    asset_id = f"sfx_transition_{t_type}_{int(time.time())}"
    local_path = None
    
    if download_url:
        local_path = download_stock_asset(asset_id, download_url)
        
    if not local_path:
        # If everything fails, use the hardcoded local default if resolve_asset_query works
        from app.services.asset_manager import resolve_asset_query
        resolved = resolve_asset_query(query)
        resolved_path = resolved["rel_path"] if resolved else None
        local_path = resolved_path
        
    if local_path:
        # Register in media library
        add_to_media_library(
            file_id=file_id,
            asset_id=asset_id,
            filename=asset_title,
            path=local_path.replace("\\", "/"),
            duration=1.5
        )
        
        edit = timeline.add_asset(start=start, end=start + 1.5, asset_query=asset_title, volume=-12)
        edit["resolved_path"] = local_path.replace("\\", "/")
        edit["asset_type"] = "audio"
    else:
        return "Ошибка: Не удалось найти или загрузить звуковой эффект для перехода."
        
    # Add the visual transition marker to timeline edits list
    visual_edit = {
        "action": "build_transition",
        "start": round(start, 2),
        "end": round(start + 0.8, 2),
        "transition_type": t_type
    }
    timeline.edits.append(visual_edit)
    memory.record_transition(t_type)
    event_bus.emit("tool_completed", {"tool": "build_transition", "message": f"Добавлен переход '{t_type}' на {start}s со звуковым эффектом"})
    return f"Успешно добавлен переход '{t_type}' на {start}s со звуком"

def apply_topic_transitions(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    """Detect topic-change moments and place build_transition on each boundary."""
    import os
    import json

    file_id = memory.session.get("project_id")
    if not file_id:
        return "Ошибка: Не найден ID проекта во временной памяти сессии"

    transcript_path = os.path.join("uploads", f"{file_id}_transcript.json")
    if not os.path.exists(transcript_path):
        return "Ошибка: Транскрипт не найден. Сначала дождитесь распознавания речи."

    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript_data = json.load(f)
    except Exception as e:
        return f"Ошибка чтения транскрипта: {e}"

    from app.services.topic_transition_service import detect_topic_boundaries

    min_gap = float(args.get("min_gap_sec", 5.0) or 5.0)
    force_type = args.get("transition_type")
    boundaries = detect_topic_boundaries(transcript_data, min_gap_sec=min_gap)

    if not boundaries:
        return "Смены темы не найдены — переходы не добавлены."

    # Avoid stacking duplicates near existing transitions
    existing_times = []
    for e in timeline.edits:
        if e.get("action") == "build_transition":
            t = e.get("start", e.get("start_time"))
            if t is not None:
                existing_times.append(float(t))

    added = 0
    messages = []
    for b in boundaries:
        t = float(b["time"])
        if any(abs(t - et) < 0.5 for et in existing_times):
            continue
        t_type = force_type or b.get("suggested_type") or "whoosh"
        msg = build_transition(timeline, memory, {
            "start_time": t,
            "transition_type": t_type,
        })
        if msg.startswith("Успешно"):
            added += 1
            existing_times.append(t)
            messages.append(f"{t}s/{t_type}")

    event_bus.emit("tool_completed", {
        "tool": "apply_topic_transitions",
        "message": f"Поставлено переходов на смены темы: {added}"
    })
    if added == 0:
        return "Подходящие точки смены темы уже покрыты переходами или не найдены."
    return f"Добавлено {added} переходов на смены темы: {', '.join(messages)}"

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
    font_pairing = args.get("font_pairing")
    word_styles = args.get("word_styles")
    inactive_opacity = args.get("inactive_opacity")
    active_scale = args.get("active_scale")
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
                                                 "add_motion_graphic", "add_dynamic_graphic", "add_text_overlay", "semantic_scene")
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

def remove_background(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    """
    Rotoscoping tool: removes background from the main speaker video using RVM.
    Emits a rotoscope edit action that video_service processes during export.
    """
    bg_color = args.get("bg_color", "transparent")
    bg_video_query = args.get("bg_video_query")

    edit = {
        "action": "remove_background",
        "bg_color": bg_color,
        "bg_video_query": bg_video_query,
    }
    timeline.edits.append(edit)

    if bg_video_query:
        msg = f"Запущен ротоскопинг: фон спикера будет заменён на стоковое видео по запросу '{bg_video_query}'"
    elif bg_color == "transparent":
        msg = "Запущен ротоскопинг: фон спикера будет удалён (прозрачный WebM)"
    else:
        msg = f"Запущен ротоскопинг: фон спикера будет заменён цветом {bg_color}"

    event_bus.emit("tool_completed", {"tool": "remove_background", "message": msg})
    return msg

def set_video_background(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    """
    Places custom text/color background BEHIND the speaker using RVM rotoscoping.
    Queues a 'set_video_background' edit that video_service processes during export.
    """
    bg_color = args.get("bg_color", "#0a0a14")
    text = args.get("text")
    text_color = args.get("text_color", "white")
    text_opacity = args.get("text_opacity", 0.12)
    font_size = args.get("font_size", 220)
    gradient_color2 = args.get("gradient_color2")

    edit = {
        "action": "set_video_background",
        "bg_color": bg_color,
        "text": text,
        "text_color": text_color,
        "text_opacity": text_opacity,
        "font_size": font_size,
        "gradient_color2": gradient_color2,
    }
    timeline.edits.append(edit)

    if text:
        msg = f"Фон за спикером заменён: цвет {bg_color}, текст '{text}' (opacity={text_opacity:.0%})"
    elif gradient_color2:
        msg = f"Фон за спикером заменён на градиент {bg_color} → {gradient_color2}"
    else:
        msg = f"Фон за спикером заменён на цвет {bg_color}"

    event_bus.emit("tool_completed", {"tool": "set_video_background", "message": msg})
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
    "design_sound": {
        "schema": DesignSoundArgs,
        "runner": design_sound
    },
    "create_zoom": {
        "schema": ZoomArgs,
        "runner": create_zoom
    },
    "apply_color_grade": {
        "schema": ApplyColorGradeArgs,
        "runner": apply_color_grade
    },
    "build_transition": {
        "schema": TransitionArgs,
        "runner": build_transition
    },
    "apply_topic_transitions": {
        "schema": ApplyTopicTransitionsArgs,
        "runner": apply_topic_transitions
    },
    "modify_clip": {
        "schema": ModifyClipArgs,
        "runner": modify_clip
    },
    "change_format": {
        "schema": ChangeFormatArgs,
        "runner": lambda t, m, a: t.edits.append({"action": "change_format", "format": "9:16"}) or event_bus.emit("tool_completed", {"tool": "change_format", "message": "Формат зафиксирован: Instagram Reels 9:16"}) or "Формат видео: Instagram Reels 9:16"
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
    },
    "remove_background": {
        "schema": RemoveBackgroundArgs,
        "runner": remove_background
    },
    "set_video_background": {
        "schema": SetVideoBackgroundArgs,
        "runner": set_video_background
    }
}

def add_motion_preset(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:

    preset = args.get("preset", "BlurText")
    text = args.get("text", "PRESET TEXT")
    start = float(args.get("start_time", 0.0))
    duration = float(args.get("duration", 4.0))
    color = args.get("color", "#FFFFFF")
    font_size = int(args.get("font_size", 72))
    speed = args.get("speed")

    edit = {
        "action": "reactbits_preset",
        "preset": preset,
        "text": text,
        "start": round(start, 2),
        "end": round(start + duration, 2),
        "color": color,
        "font_size": font_size,
        "speed": speed
    }
    timeline.edits.append(edit)
    event_bus.emit("tool_completed", {"tool": "add_motion_preset", "message": f"Добавлен ReactBits пресет '{preset}': '{text}'"})
    return f"Успешно наложен кинетический пресет ReactBits '{preset}' на {start}s ({duration}s)"

_TOOL_DESCRIPTIONS = {
    "cut_clip": "Вырезает тишину, паузы или неудачные дубли из видео в указанном временном диапазоне.",
    "add_broll": "Накладывает B-roll: сначала свои загруженные клипы (asset_id), иначе сток по query.",
    "create_scene": "Создает графическую сцену: overlay-акцент, TITLE или idea_map — overlay мысли (rail/split/stack/thesis) из речи этого бита.",
    "build_kinetic_typography": "Настраивает стилистику, шрифт, размер, цвет и анимацию кинетических субтитров.",
    "select_bgm": "Выбирает фоновый саундтрек из каталога и настраивает уровень его громкости. Только точечно («добавь музыку»). Для полного автомонтажа используй design_sound.",
    "design_sound": "Один проход саунд-дизайна в конце автомонтажа: кровать BGM на весь ролик, редкие SFX на склейки/плашки/TITLE/сток (не на зумы) и ducking под голос. Не указывай таймкоды — агент читает таймлайн. Не вызывай вместе с пачкой build_transition.",
    "create_zoom": "Создает наезды или отдаления камеры для расстановки акцентов и удержания внимания.",
    "apply_color_grade": "Накладывает цветокор (cinema/warm/cold/vibrant…) на весь ролик или отрезок.",
    "build_transition": "Вставляет звуковой и визуальный переход (whoosh, glitch, film) на склейках.",
    "apply_topic_transitions": "Автоматически находит смены темы в речи спикера по транскрипту и ставит монтажные переходы (whoosh/glitch/film) на эти таймкоды.",
    "modify_clip": "Изменяет параметры (начало, конец, громкость, текст, поисковый запрос) или полностью удаляет (delete=True) конкретный выделенный клип на таймлайне.",
    "change_format": "Всегда обрезает видео в Instagram Reels 9:16 (единственный формат продукта).",
    "stitch_video_clip": "Склеивает (добавляет) фрагмент из загруженного дополнительного видеоролика в проект.",
    "search_and_add_music": "Ищет в стоковой библиотеке фоновую музыку по текстовому запросу, скачивает её на сервер и накладывает на таймлайн проекта.",
    "search_and_add_sticker": "Ищет в стоковой библиотеке графический стикер или эмодзи, скачивает его на сервер и накладывает поверх видеоряда в указанные координаты.",
    "generate_audio": "Генерирует фоновую музыку или звуковой эффект (SFX) по текстовому промпту с помощью ИИ-модели Stable Audio 2.5 на Replicate и накладывает на таймлайн.",
    "remove_background": "Ротоскопинг — удаляет фон за спикером через Robust Video Matting (RVM). Позволяет заменить фон на прозрачный, заливочный цвет или стоковое видео.",
    "set_video_background": "Полная замена фона с текстом ПОЗАДИ спикера.",
    "add_motion_preset": "Накладывает кинетический пресет анимированного текста из библиотеки ReactBits: 'BlurText' (размытие слов), 'ShinyText' (золотой/неоновый перелив), 'DecryptedText' (хакерский матричный шифр), 'TrueFocus' (неоновая подсветка фокуса на ключевых словах)."
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

