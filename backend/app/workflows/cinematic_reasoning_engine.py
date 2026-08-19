"""
Cinematic Reasoning Engine — Single persistent reasoning LLM for VibeEdit AI.
Replaces multi-agent loop with standard tool calling and declarative visual direction.
"""

import json
import re
import logging
from typing import Dict, Any, List
from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from app.agents.base_agent import invoke_llm, FONT_PRESETS
from app.workflows.state import VideoEditingState
from app.workflows import event_bus
from app.workflows.timeline_state import TimelineState
from app.workflows.production_memory import ProductionMemory
from app.workflows.narrative_pacing import NarrativePacing
from app.workflows.tool_registry import TOOLS_REGISTRY

logger = logging.getLogger(__name__)

# ─── System Prompt ──────────────────────────────────────────────────────────
# Define base system instructions template with dynamic aspect ratio and resolution capabilities
SYSTEM_INSTRUCTIONS_TEMPLATE = """Ты — РЕЖИССЁР АВТОМОНТАЖА INSTAGRAM REELS в Synapix AI.
Единственный продукт: вертикальные Instagram Reels 9:16 (talking-head 15–60 сек).
НЕ монтируй YouTube Long / 16:9 / подкасты / SaaS demo. Всегда Reels.

⚡ ХАРАКТЕРИСТИКИ ЭТОГО ПРОЕКТА:
- Разрешение: {width}x{height}
- Соотношение сторон (Aspect Ratio): {aspect_ratio} (всегда целимся в 9:16 Reels)
- Если формат ещё не 9:16 — вызови `change_format` с format="9:16" в начале монтажа.

⚡ ЗОЛОТЫЕ СТАНДАРТЫ МОНТАЖА REELS:
1. ДИНАМИЧНЫЙ ТЕМП И ШАБЛОНЫ УДЕРЖАНИЯ (Pattern Interrupts):
   - Удержание внимания требует визуального изменения каждые 2.5 - 3.5 секунды! Говорящая голова без перебивок усыпляет зрителя.
   - Разделяй таймлайн на отрезки и чередуй: [Speaker Zoom In] → [B-roll] → [Infographics / Graphics Overlay] → [Speaker Zoom Out].
   - Используй отчет темпа речи (Pacing) как творческий ориентир: на эмоциональных пиках (`peaks`) или логических акцентах ты полностью волен расставлять наезды камеры (`create_zoom`) любой длительности и масштаба, которые посчитаешь нужными.

2. ДИНАМИЧЕСКОЕ УПРАВЛЕНИЕ И СТИЛИЗАЦИЯ СУБТИТРОВ (Kinetic Subtitles Customization):
   - Всегда настраивай профессиональные субтитры через `build_kinetic_typography`.
   - Если пользователь просит изменить стиль, шрифт, цвет, размер или анимацию субтитров, ты ОБЯЗАН вызвать `build_kinetic_typography` с соответствующими параметрами!
   - ДОСТУПНЫЕ ШРИФТЫ (СТРОГО используй только эти точные имена в поле `font`):
     - `Montserrat-ExtraBold` (жирный, универсальный — подходит для большинства видео)
     - `Inter_24pt-Bold` (технологичный, чистый)
     - `BebasNeue-Regular` (высокий конденсированный, TikTok/блогерский — как у Manas)
     - `Rubik-Bold` (аккуратный скругленный)
     - `Oswald-Bold` (строгий, сжатый)
     - `Manrope-Bold` (современный, геометричный)
     - `JetBrainsMono-Bold` (моноширинный, кодерский стиль)
     - `Comfortaa-Bold` (мягкий, округлый)
   - ПОЛНЫЙ СПИСОК ПАРАМЕТРОВ `build_kinetic_typography` (ТЫ ИМЕЕШЬ ПОЛНЫЙ КОНТРОЛЬ НАД ВСЕМИ):
      - `font` — шрифт из списка выше
      - `font_size` — размер шрифта в px. Для Reels 9:16: 75–100px (базовый 84). Не используй размеры под 16:9.
      - `font_color` — цвет НЕАКТИВНЫХ слов в hex (например: "#FFFFFF", "#FACC15", "#FF3B30", "#00E5FF")
      - `accent_color` — цвет АКТИВНОГО (произносимого в данный момент) слова — это ключевой элемент karaoke-эффект! "#FACC15" золотой стандарт, "#FF3B30" красный, "#7CFC00" неоновый зеленый
      - `use_outline` — true/false: тёмная обводка вокруг текста для читаемости
      - `use_shadow` — true/false: мягкая тень вместо жёсткой обводки (более премиально)
      - `shadow_blur` — размытие тени в px (10–35, актуально при use_shadow=true)
      - `animation_style` — "pop", "slide_up", "glow", "bounce"
      - `position` — "bottom", "center", "top"
      - `x` — число/процент от 0 до 100 для горизонтального позиционирования (50 - центр, 10-20 - слева, 80-90 - справа)
      - `y` — число/процент от 0 до 100 для вертикального позиционирования (50 - центр, 15 - вверху, 80-85 - внизу)
      - `text_case` — "UPPER" (ЗАГЛАВНЫЕ — стандарт Reels, максимальный impact!), "Sentence_Case", "lower"
      - `max_words` — 2–3 слова на экране (стандарт Instagram Reels). Не ставь 4–6 как для YouTube.
      - `font_pairing` — акцентный шрифт (например: 'Lobster', 'BebasNeue-Regular') для комбинированных стилей
      - `subtitle_preset` — пак в духе DaVinci Resolve: `resolve_stacked` (стек + жёлтый скрипт сквозь строки), `resolve_dropcap` (крупная розовая буквица + жирный капс, видео внутри букв, неон-скрипт), `resolve_classic`, `resolve_boxed`, `resolve_cinema`, `resolve_neon`, `resolve_karaoke`, `resolve_bar`, `resolve_pill`, `resolve_minimal`. Если пользователь просит «как в Resolve / красивые субтитры / плашка / неон / скрипт / буквица» — выбери пресет, не собирай стиль с нуля. Если просит просто «добавь субтитры» — вызови `build_kinetic_typography` с `resolve_classic` или `resolve_karaoke`. `resolve_dropcap` ставь ТОЛЬКО когда явно просят буквицу / видео в тексте / инверсию.
      - `inactive_opacity` — прозрачность неактивных слов (например, 0.45 или 0.7)
      - `active_scale` — размер/зум активного слова (например, 1.25)
      - `word_styles` — JSON-строка (список словарей) для точной пословной стилизации. Поддерживает ключи:
         * 'font': переопределить шрифт слова (например, 'Lobster')
         * 'size': коэффициент масштаба слова (например, 1.5 для выделения крупным размером, 0.8 для маленького)
         * 'color': цвет в hex (например, '#00E5FF' для неоново-голубого свечения)
         * 'italic': true/false (курсив)
         * 'bold': true/false (жирный — выделяет слово)
       - Комбинация `word_styles` + `inactive_opacity` + `active_scale` дают вирусный karaoke-эффект. По умолчанию для всех Reels!
3. ЗВУКОВОЙ ДИЗАЙН (один проход, не россыпь):
   - Полный автомонтаж: в КОНЦЕ (после графики, склеек, зумов, цветокора) вызови РОВНО ОДИН `design_sound`. Агент сам поставит кровать, редкие SFX и ducking. НЕ указывай таймкоды.
   - ЗАПРЕЩЕНО на полном монтаже сыпать десяток `build_transition` / `apply_topic_transitions` / отдельно `select_bgm`. Это даёт тишину или кашу.
   - Точечно «добавь музыку» / «поставь lofi» — по-прежнему `select_bgm` (asset_query + громкость −20…−24 dB).
   - Точечно «whoosh на 12с» — `build_transition`. Не вызывай `design_sound` для одной склейки.
   - Зумы не озвучиваются. SFX только на склейки, TITLE, плашки и вход стока — это делает `design_sound`.

    4. РИТМ REELS — СТОРИТЕЛЛИНГ СЛОЯМИ ПО BEAT SHEET:
    Сетка битов в контексте — закон. На бит РОВНО ОДИН ход. Между акцентами лицо ≥3с.
    Сначала picture lock (склейки, зумы), потом coverage (title/overlay/broll по job), потом звук и цвет.
    Цель на 30–45с: ~55% talking-head, ~20% abstract accent, ~15% TITLE, ~10% сток.
    Графика — Synapix Optical Cut (регистрационные риски + волосяная линия + один accent из Content Look).
    Не копируй чужие UI-киты. Не ставь indigo/cyan/gold, если их нет в Content Look.

    A) `create_scene` + `layout='overlay'` + `scene_template='abstract'` — ДЕФОЛТ.
       Слово/фраза БЕЗ glass-card + угловые риски / линия вокруг спикера.
       `concept_prompt`: `"ФРАЗА | ключ"`. Пример: `"ПОДКЛЮЧИ СЕРВЕР | готово"`.
       Длительность 2–3.5с. Лицо 25–70% свободно.
    B) `create_scene` + `layout='overlay'` + `scene_template='stat_card'` — только цифра / имя / закон.
       Плашка. Пример: `"ОШИБКА ДАННЫХ | 80%"`.
    C) `create_scene` + `layout='fullscreen'` + `scene_template='kinetic_title'` — TITLE на весь кадр.
       Хук / главный тезис. 2–5 слов. 2–4с (макс 5с). Первый title не раньше 2с.
    D) `add_broll` — 1.5–3.5с. Если в медиатеке есть СВОИ клипы пользователя — ставь ИХ (`asset_id` или имя файла в `query`). Pexels только если своих нет И Content Look разрешает сток.

    - ЗАПРЕЩЕНО: все сцены только плашками; overlay+fullscreen на одном таймкоде; fullscreen >5с.
    - Чередуй A и C. Плашку (B) ставь редко — когда есть число.
    - `concept_prompt` короткий. ⛔ списки, bento, простыни.
    - `layout='split'` — редко: лицо сверху, графика снизу.
    - КИРИЛЛИЦА: текст графики и субтитров на русском. Шрифты: Unbounded, Montserrat, Inter, Rubik, Manrope, Comfortaa, JetBrains Mono, Playfair Display, Marck Script. Не Bebas Neue / Lobster для кириллицы.
    - Субтитры: `build_kinetic_typography` с `subtitle_preset` из Content Look (не всегда karaoke-gold).
    - Финальный цветокор: `apply_color_grade` с preset из Content Look.

5. КАМЕРА, ЦВЕТ, ЗВУК (Talking-head polish):
   - `create_zoom`: длительность 1.2–2.5с, type=`zoom_in` (мягкий punch с settle — без резкого обрыва!), или `zoom_hold` для удержания. intensity бери из Content Look (обычно 1.10–1.16).
   - В финале авто-монтажа вызови `apply_color_grade` с preset из Content Look на весь ролик, затем ОДИН `design_sound`.
   - Точечно «добавь музыку» — `select_bgm` (−20…−24 dB). Не дублируй `select_bgm` в том же ходе, что и `design_sound`.

6. ЭТАП ЗРИТЕЛЬНОГО АНАЛИЗА (Visual Reasoning):
   - Перед каждым вызовом инструмента создания графической сцены `create_scene`, ты ОБЯЗАН провести зрительный анализ (Visual Reasoning) в своем блоке `<think>` и в JSON-ответе под ключом `"visual_reasoning"`.
   - В ходе Visual Reasoning ты должен ответить на 4 критически важных вопроса:
     1. Что говорит спикер? (Краткое обобщение текущей мысли или фразы спикера)
     2. Что главное? (Выделенный ключевой тезис, инсайт или числовое значение)
     3. Что должен понять зритель? (Какое ключевое знание или визуальный образ должен отложиться в голове у зрителя)
     4. Что должно привлечь внимание? (Один акцент: цифра или 2–5 слов. Не композиция из многих блоков.)
   - Если ты не планируешь вызывать `create_scene`, ключ `"visual_reasoning"` в JSON-ответе должен быть равен null.

7. ВЫЯВЛЕНИЕ ИНТЕРЕСНЫХ МОМЕНТОВ И ФОРМАТИРОВАНИЕ (YouTube vs Social Media):
   - Ты обязан выявлять самый вовлекающий, интересный или ключевой фрагмент видео по транскрипту (например, важную мысль, инсайт или эмоциональное высказывание).
   - В приветственном сообщении (`INIT_PLAN`) или первом ответе обязательно предложи пользователю обрезать ролик под этот конкретный отрезок (назови таймкоды начала и конца и процитируй суть) и спроси напрямую: «Вы монтируете это видео для соцсетей (динамичный ролик до 1 минуты) или для YouTube (убрав слова-паразиты и длинные паузы, но сохранив полную версию)?».
   - Если пользователь выбирает «для соцсетей» или «для Shorts/Reels/TikTok», предложи или примени план обрезки видео (с помощью `cut_clip`), чтобы сократить ролик строго до 60 секунд (или меньше), оставив только выделенный интересный отрезок. Если «для YouTube» — сохрани полную версию, аккуратно удалив слова-паразиты и длинные паузы.

{music_catalog_desc}

==== ДОСТУПНЫЕ ИНСТРУМЕНТЫ МОНТАЖА (STRICT TOOLS REGISTRY) ====
Используй СТРОГО и ТОЛЬКО инструменты из этого списка. Категорически запрещено выдумывать другие названия!
{tools_desc}

🔥 КРИТИЧЕСКИЕ ПРАВИЛА ВЫПОЛНЕНИЯ:
1. РАБОТАЙ СТРОГО ЧЕРЕЗ ИНСТРУМЕНТЫ. Тебе запрещено генерировать raw edit logic напрямую. Всегда вызывай соответствующие функции из списка.
2. СТРОГО ТОЧЕЧНОЕ ВЫПОЛНЕНИЕ (Targeted Single-Tool Execution):
   - Если пользователь просит КОНКРЕТНУЮ операцию (например, "добавь музыку", "сделай зум", "поставь текст позади", "поменяй шрифт"), вызови СТРОГО 1 ИНСТРУМЕНТ, выполняющий именно эту задачу! КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО генерировать массовые цепочки из 5-7 вызовов или перезапускать полный авто-монтаж, если пользователь не просил "полный монтаж" или "сделай всё сам".
   - Если пользователь дает общую команду ("сделай авто-монтаж", "начинай", "поехали" или согласился с полным планом), тогда вызови несколько инструментов за один ход (субтитры + зумы + графика + цветокор) и ОБЯЗАТЕЛЬНО заверши ход одним `design_sound`.
   - Категорически запрещено выдумывать несуществующие инструменты (`match_cut`, `add_kinetic_zoom`, `add_graphics`, `add_transition`, `speaker_masking`). СТРОГО используй имена из списка ниже!
3. СТРОГИЕ ОБЯЗАТЕЛЬНЫЕ АРГУМЕНТЫ ИНСТРУМЕНТОВ:
   - `search_and_add_music`: ОБЯЗАТЕЛЬНЫЙ аргумент `query` (строка, например: 'lofi chill beat').
   - `add_broll`: `query` обязателен. Если есть свои клипы — `asset_id` из списка USER B-ROLL. Не ищи сток, пока свои не расставлены.
   - `select_bgm`: ОБЯЗАТЕЛЬНЫЙ аргумент `asset_query` (строка, например: 'lofi'). Только точечный запрос музыки, не полный монтаж.
   - `design_sound`: без таймкодов. Один вызов в конце полного автомонтажа.
   - `create_zoom`: ОБЯЗАТЕЛЬНЫЕ аргументы `start_time` и `end_time` (числа в секундах).
   - `create_scene`: ОБЯЗАТЕЛЬНЫЕ аргументы `start_time` и `duration` (числа в секундах).
4. СТРОГИЙ ЗАПРЕТ НА ТЕХНИЧЕСКИЙ ДЕБАГ В ЧАТЕ (UI Simplicity & Non-Technical Constraint):
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать пользователю в поле 'reply' о системных ошибках, недоступных инструментах, неудачных вызовах, аудите или отклонённых аргументах!
   - Никогда не оправдывайся и не пиши фразы вроде: "Инструмент недоступен", "Ввиду системных ограничений...", "К сожалению, функция не сработала".
   - Пользователь должен видеть ТОЛЬКО профессиональный, лаконичный и позитивный результат монтажа.
5. РОТОСКОПИНГ, ТЕКСТ НА ФОНЕ И КИНЕТИЧЕСКИЕ ПРЕСЕТЫ REACTBITS (Dynamic Text & Motion Presets):
   - Если пользователь просит переместить ВЕСЬ ТЕКСТ РЕЧИ / ВСЕ СУБТИТРЫ на задний фон (например: "перенеси весь текст на задний фон", "поставь все субтитры за спикера"), вызови `build_kinetic_typography` с аргументами `position="behind_speaker"` и `behind_speaker=true`!
   - Когда пользователь просит добавить конкретный кастомный текст, заголовок или слово на фон за спикером (например: "добавь текст 'УСПЕХ' на фон", "поставь слово 'FOCUS' за спикером"), вызови `set_video_background` с этим текстом!
   - Для наложения эффектных кинетических заголовков, титров и ключевых плашек используй `add_motion_preset` с компонентами из библиотеки ReactBits: 'BlurText' (размытие при появлении), 'ShinyText' (золотой/неоновый перелив), 'DecryptedText' (хакерский матричный код), 'TrueFocus' (неоновая рамка фокуса на словах)!

   - В аргумент `text` передай СТРОГО ИМЕННО ТУ ТОЧНУЮ СТРОКУ, которую назвал пользователь в своём сообщении!
   - Инструмент автоматически применяет RVM-ротоскопинг: вырезает спикера на передний план и помещает текст речи или надпись на задний слой ПОЗАДИ спикера!

6. МАКСИМАЛЬНАЯ КРАТКОСТЬ И ЛАКОНИЧНОСТЬ ОТВЕТА (Strict 1-2 Sentence Reply):
   - Ответ в поле 'reply' должен состоять СТРОГО из 1-2 коротких предложений (максимум 20-30 слов)!
   - Формат ответа:
     1. Что именно сделано (1 короткое предложение): *"Добавил плашку с тезисом на 12–15с и полноэкранную графику на ключевую мысль."*
     2. Короткий совет или следующий шаг (1 короткое предложение): *"Могу сменить текст, цвет или поставить ещё одну перебивку."*
   - Если вызывал create_scene — назови тип (абстрактный акцент / плашка / TITLE) и о чём сцена.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать огромные простыни текста, аудиты, пункты с галочками, списки или повторные приветствия!
   - ВСЕ СВОИ МЫСЛИ И АНАЛИЗ ПИШИ СТРОГО в блоке <think>...</think> в самом начале ответа! В 'reply' — только чистая суть.
   - СТРОГО БЕЗ ЭМОДЗИ и смайликов! Без двойных кавычек внутри строки (используй кавычки-елочки « » или одиночные ' ').



Для максимальной надежности в ЛЮБЫХ окружениях, верни ответ СТРОГО в формате JSON с ключами:
- "plan": ["пошаговый производственный план монтажа на русском языке"]
- "reply": "супер-короткий ответ из 1-2 предложений без эмодзи и без двойных кавычек (пример: 'Добавил тёмный фон с текстом FREEDOM позади спикера. Хотите настроить субтитры?')"
- "visual_reasoning": null (или объект с ответами на 4 вопроса, если ты вызываешь create_scene):
  {{
    "what_speaker_says": "краткое обобщение речи спикера в этот момент",
    "what_is_main": "выделенный ключевой тезис или число",
    "what_viewer_should_understand": "главный вывод, который должен остаться у зрителя в голове",
    "what_should_attract_attention": "акцентный элемент, иконка, прогресс-бар или текст"
  }}
- "tool_calls": [
    {{"name": "имя_инструмента", "arguments": {{"аргумент_1": "значение"}}}}
  ]
}}
"""


async def cinematic_reasoning_agent(state: VideoEditingState) -> Dict[str, Any]:
    ...















async def cinematic_reasoning_agent(state: VideoEditingState) -> Dict[str, Any]:
    """LangGraph Node: The main orchestrator/agent that analyzes context and selects tools."""
    logger.info("🎬 Cinematic Reasoning Agent turn started...")
    
    messages = list(state.get("messages", []))
    is_evaluation = state.get("is_evaluation", False)
    user_message = state.get("user_message", "")
    transcript_text = state.get("transcript_text", "")
    visual_context = state.get("visual_context", "")
    active_edits = state.get("active_edits", []) or []

    # Read aspect ratio & dimensions detected in prepare_context
    aspect_ratio = state.get("aspect_ratio", "vertical")
    width = state.get("width", 1080)
    height = state.get("height", 1920)

    # Initialize states & pacing for initial prompt context
    memory = ProductionMemory(state.get("production_session", {}))
    pacing_report = NarrativePacing.analyze_transcript(transcript_text)
    style_info = memory.get_style_profile()
    from app.services.content_look import director_look_contract
    from app.services.beat_sheet import director_beat_contract, is_full_montage
    look_context = director_look_contract(memory.get_content_look())
    full_montage = is_full_montage(user_message)
    beat_context = director_beat_contract(memory.get_beat_sheet(), full=full_montage)

    # Extract hook details from the production session
    narrative_arc = memory.session.get("narrative_arc", {})
    hook = narrative_arc.get("hook", "")
    hook_start = narrative_arc.get("hook_start")
    hook_end = narrative_arc.get("hook_end")
    
    hook_context = ""
    if hook:
        hook_context = f"""
==== АВТО-ДЕТЕКТИРОВАННЫЙ ХУК (HOOK DETECTED) ====
В начале видео обнаружена завлекающая фраза (хук):
- Текст хука: "{hook}"
- Таймкоды: {hook_start} сек. - {hook_end} сек.

ПРАВИЛО ДЛЯ ХУКА:
Закрой хук битом из Beat Sheet (обычно бит 1). Не дублируй второй TITLE на ту же фразу.
"""

    topic_boundaries = state.get("topic_boundaries") or []
    user_broll_clips = []
    file_id = state.get("file_id")
    if file_id:
        try:
            from app.api.video import list_user_broll
            user_broll_clips = list_user_broll(file_id)
        except Exception:
            user_broll_clips = []
    if not user_broll_clips:
        for item in (state.get("media_library") or []):
            cid = item.get("id") or ""
            if cid == "main" or cid.startswith(("stock_", "sfx_", "ai_audio_", "bgm_")):
                continue
            path = (item.get("path") or "").lower()
            if path.endswith((".mp3", ".wav", ".m4a", ".aac", ".ogg")):
                continue
            if cid.startswith("additional_") or item.get("kind") in ("user_broll", "additional", "broll") or item.get("source") == "user":
                user_broll_clips.append(item)
    user_broll_context = ""
    if user_broll_clips:
        lines = []
        for clip in user_broll_clips[:16]:
            lines.append(
                f"- asset_id=`{clip.get('id')}` «{clip.get('filename')}» "
                f"{float(clip.get('duration') or 0):.1f}s {clip.get('media_type') or 'video'}"
            )
        user_broll_context = f"""
==== USER B-ROLL (СВОИ ФАЙЛЫ — ПРИОРИТЕТ) ====
Пользователь загрузил клипы. При add_broll сначала ставь ИХ:
{chr(10).join(lines)}
Вызывай add_broll с asset_id из списка. Pexels/сток — только если своих не хватает.
"""
    topic_context = ""
    if topic_boundaries:
        lines = []
        for b in topic_boundaries[:12]:
            lines.append(
                f"- {b.get('time')}s [{b.get('suggested_type', 'whoosh')}] "
                f"«{b.get('from_topic', '')}» → «{b.get('to_topic', '')}» "
                f"({b.get('reason', '')})"
            )
        topic_context = f"""
==== TOPIC BOUNDARIES (СМЕНЫ ТЕМЫ → ПЕРЕХОДЫ) ====
Обнаружены моменты смены темы. На этих таймкодах нужен монтажный переход:
{chr(10).join(lines)}

ПРАВИЛО: при полном монтаже или просьбе про переходы используй `apply_topic_transitions`
или точечно вызывай `build_transition` на этих таймкодах.
"""

    from app.workflows.tool_registry import get_mcp_tools
    mcp_tools = get_mcp_tools()
    
    tools_desc_lines = []
    for name, meta in TOOLS_REGISTRY.items():
        tools_desc_lines.append(f"- '{name}': {meta['description']} Schema: {meta['schema'].model_json_schema()}")
    for name, meta in mcp_tools.items():
        tools_desc_lines.append(f"- '{name}': {meta['description']} Schema: {json.dumps(meta['inputSchema'], ensure_ascii=False)}")
    tools_desc = "\n".join(tools_desc_lines)

    # Construct the descriptive music tracks catalog
    music_catalog_desc = """Доступные в системе музыкальные треки по настроениям (используй точные названия в параметре `asset_query`):
1. СПОКОЙНЫЕ, ВДОХНОВЛЯЮЩИЕ, ДЛЯ ПРИРОДЫ И ЛЕСА (Спокойное пианино, эмбиент, нежный лоу-фай):
   - "Yehezkel Raz - As Long as in the Heart" (Невероятно глубокое спокойное пианино Yehezkel Raz, шедевр для лесных прогулок и душевных разговоров)
   - "Moonlight" (Нежное, медленное классическое пианино Domitori Taranofu)
   - "Silence inside" (Глубокий, тихий, расслабряющий эмбиент chirrrex)
   - "Arakawa River" (Мягкий гитарно-акустический спокойный трек Domitori Taranofu)
   - "Favorite Books" (Warm calm acoustic Domitori Taranofu)
   - "relax time" (Спокойный, мягкий классический лоу-фай dj akeeni)
   - "my favorite coffee shop" (Уютный, согревающий лоу-фай для кофейной атмосферы dj akeeni)
   - "pink wood" (Органический, неторопливый мягкий лоу-фай shiruku)
2. РАССЛАБЛЯЮЩИЕ, СРЕДНЕТЕМПОВЫЕ (Классический lofi-хип-хоп для учебы/диалогов):
   - "Fall season" (Ностальгический оенний лоу-фай chirrrex)
   - "Just chill it out" (Классический чилловый лоу-фай с мягким битом chirrrex)
   - "autumn melody" (Мелодичный, теплый лоу-фай dj akeeni)
   - "midnight mood" (Ночной расслабляющий лоу-фай dj akeeni)
   - "now it_s over" (Спокойный lofi-бит shiruku)
3. АКТИВНЫЕ, ДИНАМИЧНЫЕ (Мощный трап и электроника для спорта, игр, технологий):
   - "Turn It Up" (Энергичный, взрывной электронный трап Anikdote)
   - "Bleed" (Эпичный, мощный вокальный трап Axol & The Tech Thieves)
   - "Jump" (Быстрый, бодрый динамичный бит Content Sounds)
   - "Arena" (Стадионный, мотивирующий спортивный трап NOIXES)
   - "Assassins" (Темный, технологичный киберпанк-трап SYNC, NOIXES)
4. ТРЕНДОВЫЕ ДЛЯ RETENTION (Популярный TikTok-фонк и замедленный бит):
   - "METAMORPHOSIS" (Легендарный разрывной TikTok-фонк INTERWORLD)
   - "METAMORPHOSIS (Slowed + Reverb)" (Атмосферный, глубокий замедленный фонк)
   - "Imperius (Ultra Slowed)" (Загадочный замедленный хип-хоп бит Caleb Bryant)
"""

    # Compile the final dynamic system instructions
    dynamic_system_instructions = SYSTEM_INSTRUCTIONS_TEMPLATE.format(
        width=width,
        height=height,
        aspect_ratio=aspect_ratio,
        music_catalog_desc=music_catalog_desc,
        tools_desc=tools_desc
    )


    # 1. First turn: initialize message history
    if not messages:
        if user_message == "INIT_PLAN":
            user_prompt = f"""
==== ПЕРВЫЙ ЗАПУСК ПРОЕКТА ====
Это первая инициализация проекта. На данном этапе тебе СТРОГО ЗАПРЕЩЕНО вызывать какие-либо инструменты монтажа (поле 'tool_calls' должно быть абсолютно пустым: "tool_calls": []).
Твоя цель сейчас — проанализировать исходные материалы и предложить пользователю план действий.

Проанализируй исходные материалы:
Стилевой профиль проекта: {json.dumps(style_info, ensure_ascii=False)}
{look_context}
{beat_context}
Отчет темпа речи (Pacing): {json.dumps(pacing_report, ensure_ascii=False)}
Визуальный контекст (VLM): "{visual_context}"
Разрешение видео: {width}x{height} (формат: {aspect_ratio})
{hook_context}
{topic_context}
{user_broll_context}
Полный транскрипт с таймкодами:
========================
{transcript_text}
========================

Напиши МАКСИМАЛЬНО короткий, лаконичный и понятный ответ в поле 'reply' на русском языке (СТРОГО БЕЗ воды, БЕЗ эмодзи, не более 3-4 предложений).
1. Представься коротко: «Привет! Я ИИ-монтажер Synapix.» Подтверди успешную загрузку сырого видео.
2. В одном коротком предложении скажи, о чем это видео на основе транскрипта и визуального контекста (VLM).
3. Задай прямой вопрос для выбора формата: «Как будем монтировать: YouTube-версию (убрать паузы и слова-паразиты, сохранив полную версию) или динамичный Shorts/Reels (ролик до 1 минуты с зумами)?»
УБЕРИ любой вывод концепций, музыкальных треков, B-roll или планов на этом этапе, чтобы не перегружать пользователя.

            ПОДЧЕРКИВАЕМ: ТЕБЕ СТРОГО ЗАПРЕЩЕНО ВЫЗЫВАТЬ ЛЮБЫЕ ИНСТРУМЕНТЫ (например, create_zoom, build_kinetic_typography, select_bgm и др.) В ЭТОМ ХОДУ. Поле 'tool_calls' должно быть пустым: "tool_calls": [].
            """
        else:
            user_prompt = f"""
==== ИНСТРУКЦИЯ ДЛЯ ВЫПОЛНЕНИЯ ====
Пользователь прислал конкретный запрос на монтаж: "{user_message}"
Ты ДОЛЖЕН сразу же проанализировать этот запрос и вызвать соответствующие инструменты из Tools Registry для его выполнения на основе транскрипта и pacing-отчета!
Не пиши пустой список "tool_calls" и не задавай лишних вопросов, если пользователь дал четкую команду (например: добавить музыку -> вызови `select_bgm`; сделать зум -> вызови `create_zoom` на таймкод из pacing peaks или транскрипта; полный автомонтаж -> СНАЧАЛА заполни Beat Sheet: picture lock → coverage → finish, в конце `design_sound`).

==== ТЕКУЩИЙ КОНТЕКСТ ====
1. Запрос пользователя: "{user_message}"
2. Текущие примененные правки: {json.dumps(active_edits, ensure_ascii=False)}
3. Стилевой профиль проекта: {json.dumps(style_info, ensure_ascii=False)}
{look_context}
{beat_context}
4. Отчет темпа речи (Pacing): {json.dumps(pacing_report, ensure_ascii=False)}
5. Визуальный контекст (VLM): "{visual_context}"
6. Характеристики видео: {width}x{height} (формат: {aspect_ratio})
{hook_context}
{topic_context}
{user_broll_context}
7. Полный транскрипт с таймкодами:
========================
{transcript_text}
========================

ДОСТУПНЫЕ ИНСТРУМЕНТЫ (Tools Registry):
{tools_desc}

Проанализируй запрос, определи нужные таймкоды из транскрипта/pacing, составь список вызовов инструментов и верни ответ СТРОГО в формате JSON с ключами 'reply', 'visual_reasoning' и 'tool_calls'.
"""
        messages = [
            SystemMessage(content=dynamic_system_instructions),
            HumanMessage(content=user_prompt)
        ]
        from app.workflows.reasoning_manager import ReasoningManager
        ReasoningManager.start_planning("Разработка сценарного плана и подбор монтажных шаблонов...")
    else:
        # Overwrite the first message with the latest dynamic system instructions containing fresh parameters
        if messages and isinstance(messages[0], SystemMessage):
            messages[0] = SystemMessage(content=dynamic_system_instructions)
        from app.workflows.reasoning_manager import ReasoningManager
        ReasoningManager.start_planning("Оценка внесенных изменений и планирование финального шага...")

    # Invoke LLM
    from app.agents.base_agent import llm
    response = await llm.ainvoke(messages)
    messages.append(response)

    # ── Parse LLM Plan and Complete PLANNING Stage ──
    plan = ["Тримминг и вырезание пауз", "Оптимизация визуального удержания"]
    content = response.content if hasattr(response, 'content') else str(response)
    try:
        from app.workflows.json_sanitizer import parse_json_blocks_from_text, safe_json_loads
        content_clean = content.strip()
        if "```json" in content_clean:
            content_clean = content_clean.split("```json")[1].split("```")[0].strip()
        elif "```" in content_clean:
            content_clean = content_clean.split("```")[1].split("```")[0].strip()
            
        parsed_blocks = parse_json_blocks_from_text(content)
        parsed = parsed_blocks[0] if parsed_blocks else safe_json_loads(content_clean)
        
        if "plan" in parsed and isinstance(parsed["plan"], list) and parsed["plan"]:
            plan = [str(x) for x in parsed["plan"]]

        # Stream visual_reasoning early (planning stage) so the user sees intent
        vr = parsed.get("visual_reasoning") if isinstance(parsed, dict) else None
        if vr and isinstance(vr, dict):
            bits = [f"{k}: {v}" for k, v in vr.items() if v not in (None, "")]
            if bits:
                from app.workflows import event_bus
                event_bus.emit("reasoning_update", {
                    "step": "REASONING: Зрительный анализ перед графикой",
                    "status": "running",
                    "agent": "Cinematic Brain",
                    "details": "Планирую графику:\n" + "\n".join(f"• {b}" for b in bits),
                    "progress": 0.48,
                })
    except Exception:
        pass
        
    ReasoningManager.complete_planning(plan)

    return {
        "messages": [response], # LangGraph operator.add will append this response to state
        "production_session": memory.export_session_state()
    }


def format_timeline_snapshot(edits: List[Dict[str, Any]], duration: float) -> str:
    """Generates a clean, readable text snapshot of the timeline for the LLM."""
    visual_slots = []
    zooms = []
    transitions = []
    bgm = None
    
    for e in edits:
        action = e.get("action")
        start = e.get("start", 0.0)
        end = e.get("end", duration)
        
        if action == "add_broll":
            visual_slots.append(f"  [{start:.1f}s - {end:.1f}s] B-Roll: \"{e.get('query', '')}\"")
        elif action in ("semantic_scene", "canvas_overlay", "scene_override", "hyperframes_html", "add_hyperframes_graphics"):
            visual_slots.append(f"  [{start:.1f}s - {end:.1f}s] Graphics Scene (Template: {e.get('scene_template', 'HTML')})")
        elif action == "camera_zoom":
            zooms.append(f"  [{start:.1f}s - {end:.1f}s] Zoom ({e.get('type', 'zoom_in')})")
        elif action == "add_asset":
            query = e.get("asset_query", "").lower()
            if start == 0.0 and "sfx" not in query and "click" not in query and "whoosh" not in query:
                bgm = f"  Фоновая музыка: \"{e.get('asset_query')}\" (Громкость: {e.get('volume', -22)}dB)"
            else:
                transitions.append(f"  [{start:.1f}s] Звук/Переход: \"{e.get('asset_query')}\"")

    lines = [
        f"⏱️ Общая длительность ролика: {duration:.1f} сек.",
        "\n🎬 ВИЗУАЛЬНЫЙ РЯД (B-roll и Графика):"
    ]
    if visual_slots:
        lines.extend(sorted(visual_slots))
    else:
        lines.append("  (Пусто - показывается только оригинальное видео говорящей головы)")

    lines.append("\n🔍 КИНЕТИЧЕСКИЕ ЗУМЫ (Движения камеры):")
    if zooms:
        lines.extend(sorted(zooms))
    else:
        lines.append("  (Нет зумов)")

    lines.append("\n🎵 САУНДТРЕК И ПЕРЕХОДЫ:")
    if bgm:
        lines.append(bgm)
    else:
        lines.append("  (Фоновая музыка не добавлена)")
    if transitions:
        lines.extend(sorted(transitions))

    # Calculate free zones for visual layers (B-roll / Graphics)
    occupied = []
    for e in edits:
        if e.get("action") in ("add_broll", "semantic_scene", "canvas_overlay", "scene_override", "hyperframes_html", "add_hyperframes_graphics"):
            occupied.append((e.get("start", 0.0), e.get("end", duration)))
            
    # Merge overlapping to find true empty spots
    free_zones = []
    if not occupied:
        free_zones.append((0.0, duration))
    else:
        occupied = sorted(occupied, key=lambda x: x[0])
        # Find gaps
        last_end = 0.0
        for start, end in occupied:
            if start > last_end:
                free_zones.append((last_end, start))
            last_end = max(last_end, end)
        if last_end < duration:
            free_zones.append((last_end, duration))

    lines.append("\n🟢 СВОБОДНЫЕ ЗОНЫ НА ТАЙМЛАЙНЕ (можно ставить B-roll или графику):")
    has_free = False
    for start, end in free_zones:
        dur = end - start
        if dur >= 0.5:
            lines.append(f"  [{start:.1f}s - {end:.1f}s] (Свободно {dur:.1f} сек.)")
            has_free = True
    if not has_free:
        lines.append("  (Таймлайн полностью заполнен визуальными эффектами)")

    return "\n".join(lines)


async def execute_single_tool_node(state: VideoEditingState) -> Dict[str, Any]:
    """LangGraph Node: Executes all tool calls in the queue, then returns state snapshot."""
    logger.info("🎬 execute_single_tool_node started execution...")
    
    messages = state.get("messages", [])
    if not messages:
        return {}
        
    last_message = messages[-1]
    content = last_message.content if hasattr(last_message, "content") else str(last_message)
    
    # Clean code fences
    content_clean = content.strip()
    if "```json" in content_clean:
        content_clean = content_clean.split("```json")[1].split("```")[0].strip()
    elif "```" in content_clean:
        content_clean = content_clean.split("```")[1].split("```")[0].strip()

    tool_calls_queue = []
    parsed = {}
    
    try:
        from app.workflows.json_sanitizer import parse_json_blocks_from_text, safe_json_loads
        parsed_blocks = parse_json_blocks_from_text(content)
        if parsed_blocks:
            parsed = parsed_blocks[0]
            tool_calls_queue = parsed.get("tool_calls", [])
        else:
            parsed = safe_json_loads(content_clean) or {}
            tool_calls_queue = parsed.get("tool_calls", [])
    except Exception as e:
        logger.error(f"❌ Failed to parse tool calls: {e}")
        # Regex fallback
        matches = re.findall(r'"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*({[^}]+})', content_clean)
        for name, args_str in matches:
            try:
                tool_calls_queue.append({"name": name, "arguments": json.loads(args_str)})
            except Exception:
                pass

    active_edits = state.get("active_edits", []) or []
    timeline = TimelineState(active_edits)
    memory = ProductionMemory(state.get("production_session", {}))
    if state.get("topic_boundaries"):
        memory.session["topic_boundaries"] = state.get("topic_boundaries")
    session_state = memory.export_session_state() or {}
    duration = session_state.get("duration", 10.0)

    if not tool_calls_queue:
        return {
            "messages": [HumanMessage(content="⚠️ Ошибка: Инструменты для вызова не найдены.")],
            "active_edits": active_edits
        }

    from app.services.beat_sheet import is_full_montage, sort_tool_calls, snap_tools_to_beats
    full = is_full_montage(state.get("user_message") or "")
    if not full:
        names = [c.get("name") for c in tool_calls_queue]
        full = sum(1 for n in names if n in ("create_scene", "add_broll", "create_zoom", "build_kinetic_typography")) >= 3
    tool_calls_queue = sort_tool_calls(tool_calls_queue)
    tool_calls_queue = snap_tools_to_beats(
        tool_calls_queue,
        memory.get_beat_sheet() if hasattr(memory, "get_beat_sheet") else {},
        full=full,
    )

    # Map technical tool names to clean, high-fidelity Russian descriptions
    FRIENDLY_TOOL_NAMES = {
        "cut_clip": "✂️ Обрезка говорящей головы",
        "add_broll": "📹 Добавление B-Roll",
        "create_scene": "📊 Создание графической сцены",
        "build_kinetic_typography": "🔤 Настройка стиля субтитров",
        "select_bgm": "🎵 Выбор фоновой музыки",
        "design_sound": "🎧 Саунд-дизайн",
        "create_zoom": "🔍 Кинетический зум",
        "apply_color_grade": "🎨 Цветокор",
        "build_transition": "🎬 Добавление перехода",
        "apply_topic_transitions": "🎬 Переходы на смены темы",
        "search_and_add_music": "🎵 Поиск и добавление музыки",
        "search_and_add_sticker": "✨ Добавление стикера",
        "generate_audio": "🔊 AI генерация звука"
    }

    MONTAGE_TOOLS = {
        "cut_clip", "create_zoom", "select_bgm", "create_scene",
        "build_kinetic_typography", "add_broll", "apply_topic_transitions",
        "apply_color_grade", "search_and_add_music", "generate_audio",
        "design_sound",
    }

    from app.workflows.tool_executor import ToolExecutor
    from app.workflows.reasoning_manager import ReasoningManager
    from app.services.topic_transition_service import ensure_transitions_on_splices
    
    executor = ToolExecutor(timeline, memory)
    total_tools = len(tool_calls_queue)
    ReasoningManager.start_execution(total_tools)

    # Surface visual_reasoning in chat before graphics tools run
    visual_reasoning = parsed.get("visual_reasoning") if isinstance(parsed, dict) else None
    if visual_reasoning and isinstance(visual_reasoning, dict):
        vr_lines = []
        label_map = {
            "speaker_position": "Позиция спикера",
            "safe_zone": "Safe-zone",
            "graphic_type": "Тип графики",
            "why": "Почему так",
            "layout": "Композиция",
            "mode": "Режим",
            "concept": "Концепт",
        }
        for key, val in visual_reasoning.items():
            if val is None or val == "":
                continue
            vr_lines.append(f"• {label_map.get(key, key)}: {val}")
        if vr_lines:
            ReasoningManager.emit_activity(
                "REASONING: Зрительный анализ перед графикой",
                "Решаю, какую графику поставить:\n" + "\n".join(vr_lines),
                status="done",
                agent="Cinematic Brain",
                progress=0.58,
            )
    
    tool_results = []
    executed_names = []
    for idx, call in enumerate(tool_calls_queue):
        tool_name = call.get("name")
        args = call.get("arguments", {}) or {}
        executed_names.append(tool_name)
        
        friendly_name = FRIENDLY_TOOL_NAMES.get(tool_name, f"🔧 Вызов {tool_name}")
        if tool_name == "create_scene":
            concept = (args.get("concept_prompt") or "ключевая мысль")[:100]
            layout = args.get("layout") or args.get("mode") or "overlay"
            st = args.get("start_time", "?")
            dur = args.get("duration", "?")
            start_details = (
                f"Генерирую графическую сцену «{concept}»\n"
                f"Тип/layout: {layout} · старт {st}с · длительность {dur}с"
            )
        else:
            # Keep args short in the activity feed
            try:
                args_preview = json.dumps(args, ensure_ascii=False)
                if len(args_preview) > 180:
                    args_preview = args_preview[:180] + "…"
            except Exception:
                args_preview = str(args)[:180]
            start_details = f"Запуск: {args_preview}"

        ReasoningManager.update_execution(friendly_name, idx, total_tools, start_details)
        result_log = await executor.execute_tool(tool_name, args)
        tool_results.append(f"- {friendly_name}: {result_log}")
        ReasoningManager.update_execution(friendly_name, idx, total_tools, f"Готово: {result_log}")

    # Full auto-edit: one sound-design pass at the end (bed + sparse SFX + duck).
    montage_count = len([n for n in executed_names if n in MONTAGE_TOOLS])
    if "design_sound" not in executed_names and montage_count >= 3:
        try:
            ds_log = await executor.execute_tool("design_sound", {})
            tool_results.append(f"- 🎧 Саунд-дизайн: {ds_log}")
            executed_names.append("design_sound")
            logger.info("Auto-invoked design_sound after montage tools")
        except Exception as ds_err:
            logger.warning(f"Auto design_sound failed: {ds_err}")

    # Legacy splice SFX only if sound designer did not run this turn
    topic_boundaries = state.get("topic_boundaries") or []
    ran_cut = any(n in ("cut_clip", "apply_topic_transitions") for n in executed_names)
    ran_montage = any(n in MONTAGE_TOOLS for n in executed_names)
    already_did_topics = "apply_topic_transitions" in executed_names
    already_did_sound = "design_sound" in executed_names

    if (ran_cut or ran_montage) and not already_did_sound:
        try:
            auto_logs = ensure_transitions_on_splices(
                timeline,
                memory,
                topic_boundaries,
                from_cuts=True,
                # If agent already called apply_topic_transitions, still cover cut splices
                from_topics=not already_did_topics,
                min_gap_sec=2.5,
            )
            if auto_logs:
                tool_results.append(
                    f"- 🎬 Авто-переходы на склейках: добавлено {len(auto_logs)} "
                    f"({', '.join(auto_logs)})"
                )
                logger.info(f"Auto-placed {len(auto_logs)} splice transitions")
        except Exception as auto_err:
            logger.warning(f"Auto splice transitions failed: {auto_err}")
        
    summary = "\n".join(tool_results)
    ReasoningManager.complete_execution(
        details=("Кратко что сделал:\n" + summary) if summary else "Все запланированные шаги выполнены."
    )

    final_edits = timeline.get_serialized_edits()
    timeline_snapshot = format_timeline_snapshot(final_edits, duration)
    feedback_content = f"""📋 РЕЗУЛЬТАТ ВЫПОЛНЕНИЯ ИНСТРУМЕНТОВ:
{summary}

📊 ТЕКУЩИЙ СНИМОК ТАЙМЛАЙНА:
{timeline_snapshot}

⏭️ Инструкции по следующим шагам:
- Если это был полный автомонтаж и ещё нет `design_sound` — вызови его один раз (не сыпь `build_transition`).
- Точечно «добавь музыку» — `select_bgm`. Точечный whoosh — `build_transition`.
- Если требуется добавить/скорректировать что-то еще, вызови нужные инструменты.
- Если монтаж полностью завершен и таймлайн выглядит гармонично, верни пустой список инструментов: "tool_calls": []."""
    
    results_message = HumanMessage(content=feedback_content.strip())
    
    return {
        "messages": [results_message],
        "active_edits": final_edits,
        "production_session": memory.export_session_state()
    }


async def retention_critic_node(state: VideoEditingState) -> Dict[str, Any]:
    """LangGraph Node: Performs a visual/narrative quality audit on the final compiled timeline."""
    logger.info("🕵️‍♂️ retention_critic_node started audit...")
    
    active_edits = state.get("active_edits", []) or []
    memory = ProductionMemory(state.get("production_session", {}))
    session_state = memory.export_session_state() or {}
    duration = session_state.get("duration", 10.0)
    
    from app.workflows.reasoning_manager import ReasoningManager
    from app.workflows.retention_critic import RetentionCritic
    
    ReasoningManager.start_finalization("Аудит удержания внимания и ритма монтажа...")
    
    audit_results = RetentionCritic.audit(active_edits, duration, beat_sheet=memory.get_beat_sheet())
    suggested_fixes = RetentionCritic.suggest_fixes(active_edits, duration, beat_sheet=memory.get_beat_sheet())
    
    ReasoningManager.complete_finalization(audit_results["score"], audit_results["issues"], suggested_fixes)
    
    retry_count = state.get("critic_retry_count", 0)
    approved = audit_results["approved"]
    
    feedback_messages = []
    if not approved and retry_count < 3:
        issues_list = "\n".join(audit_results["issues"])
        fixes_list = "\n".join([f"- В зоне {fix.get('start', 0.0):.1f}с - {fix.get('end', 0.0):.1f}с: {fix.get('description', '')} (рекомендуемое действие: {fix.get('action')})" for fix in suggested_fixes])
        
        critique = f"""⚠️ АУДИТ КАЧЕСТВА МОНТАЖА ОТКЛОНЕН (Оценка: {audit_results["score"]}/100, необходимо >= 75)

Найденные проблемы:
{issues_list}

📋 РЕКОМЕНДУЕМЫЕ ИСПРАВЛЕНИЯ:
{fixes_list if suggested_fixes else "- Нет автоматических рекомендаций."}

⏭️ Пожалуйста, скорректируй таймлайн (добавь/удали зумы или B-roll), чтобы исправить эти замечания.
Вызови ОДИН корректирующий инструмент."""
        
        feedback_messages.append(HumanMessage(content=critique.strip()))
    
    return {
        "messages": feedback_messages,
        "critic_feedback": "\n".join(audit_results["issues"]),
        "critic_approved": approved,
        "critic_retry_count": retry_count + 1
    }
