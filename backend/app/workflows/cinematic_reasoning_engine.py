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
SYSTEM_INSTRUCTIONS_TEMPLATE = """Ты — СИНЕМАТОГРАФИЧЕСКИЙ РАЗУМ (Persistent Cinematic LLM) элитной студии монтажа Synapix AI.
Твоя задача — монтировать видео как первоклассный голливудский и TikTok-режиссер, используя золотые стандарты удержания внимания (Retention) и кинематографичного темпа.

⚡ ХАРАКТЕРИСТИКИ ЭТОГО ПРОЕКТА:
- Разрешение: {width}x{height}
- Соотношение сторон (Aspect Ratio): {aspect_ratio} (СТРОГО учитывай это при расчете размера субтитров!)

⚡ ЗОЛОТЫЕ СТАНДАРТЫ ПРОФЕССИОНАЛЬНОГО МОНТАЖА:
1. ДИНАМИЧНЫЙ ТЕМП И ШАБЛОНЫ УДЕРЖАНИЯ (Pattern Interrupts):
   - Удержание внимания требует визуального изменения каждые 2.5 - 3.5 секунды! Говорящая голова без перебивок усыпляет зрителя.
   - Разделяй таймлайн на отрезки и чередуй: [Speaker Zoom In] → [B-roll] → [Infographics / Graphics Overlay] → [Speaker Zoom Out].
   - Обязательно используй отчет темпа речи (Pacing): на каждом эмоциональном пике (`peaks`) со значением >= 0.6 делай наезд камеры `create_zoom` (zoom_in на 1-2 секунды, затем возвращай zoom_out) для драматического акцента.

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
      - `font_size` — размер шрифта в px. Для 9:16: 75–100px. Для 16:9: 36–55px. Выбирай исходя из формата видео.
      - `font_color` — цвет НЕАКТИВНЫХ слов в hex (например: "#FFFFFF", "#FACC15", "#FF3B30", "#00E5FF")
      - `accent_color` — цвет АКТИВНОГО (произносимого в данный момент) слова — это ключевой элемент karaoke-эффект! "#FACC15" золотой стандарт, "#FF3B30" красный, "#7CFC00" неоновый зеленый
      - `use_outline` — true/false: темная обводка вокруг текста для читаемости
      - `use_shadow` — true/false: мягкая тень вместо жесткой обводки (более премиально)
      - `shadow_blur` — размытие тени в px (10–35, актуально при use_shadow=true)
      - `animation_style` — "pop", "slide_up", "glow", "bounce"
      - `position` — "bottom", "center", "top"
      - `x` — число/процент от 0 до 100 для точного горизонтального позиционирования текста (50 - центр, 10-20 - слева, 80-90 - справа)
      - `y` — число/процент от 0 до 100 для точного вертикального позиционирования текста (50 - центр, 15 - вверху, 80-85 - внизу)
      - `text_case` — "UPPER" (ЗАГЛАВНЫЕ — стандарт Manas/MrBeast/Shorts, максимальный impact!), "Sentence_Case", "lower"
      - `max_words` — количество слов одновременно: 2–3 для shorts, 4–6 для YouTube 16:9
      - `font_pairing` — акцентный шрифт (например: 'Lobster', 'BebasNeue-Regular') для комбинированных стилей
      - `inactive_opacity` — прозрачность неактивных слов во время караоке-анимации (например, 0.45 или 0.7)
      - `active_scale` — размер/зум активного слова в караоке-анимации (например, 1.25)
      - `word_styles` — JSON-строка (список словарей) для точной пословной стилизации. Поддерживает ключи:
        * 'font': переопределить шрифт слова (например, 'Lobster')
        * 'size': коэффициент масштаба слова (например, 1.5 для выделения крупным размером, 0.8 для маленького)
        * 'color': цвет в hex (например, '#00E5FF' для неоново-голубого свечения)
        * 'italic': true/false (курсив)
        * 'bold': true/false (жирность)
        * 'newline': true/false (если true, слово переносится на новую строку)
        * 'x_offset', 'y_offset': сдвиг слова в пикселях (для построения сложной композиции)
        * 'glow': true/false (применить неоновое свечение/тень к этому слову)
    - РЕЦЕПТ СТИЛЯ MANAS С КОМПОЗИЦИЕЙ: font="Montserrat-ExtraBold", font_color="#FFFFFF", accent_color="#00E5FF", font_pairing="Lobster", text_case="UPPER", use_shadow=true, shadow_blur=22, word_styles='[[{{"font": "Lobster", "italic": true, "size": 1.5}}, {{"font": "Montserrat-ExtraBold", "bold": true}}, {{"newline": true, "size": 0.8}}, {{"size": 0.8}}, {{"newline": true}}, {{"font": "Lobster", "color": "#00E5FF", "size": 1.8, "italic": true, "glow": true}}, {{"newline": true, "size": 1.2}}, {{"font": "BebasNeue-Regular", "size": 1.2}}]]'
    - СТРОГО: text_case="UPPER" + accent_color создают вирусный karaoke-эффект как у MrBeast и Manas. Используй это для всех Shorts/TikTok видео по умолчанию!
3. ЗВУКОВОЙ ДИЗАЙН И САУНДТРЕК (Audio Branding):
   - Хороший монтаж — это 50% звука! Тщательно анализируй смысл, обстановку и атмосферу видео (например, по визуальному контексту VLM и транскрипту):
     - Если спикер находится в ЛЕСУ, на ПРИРОДЕ, или видео носит спокойный, расслабляющий, созерцательный характер: СТРОГО подбирай спокойную, инструментальную, вдохновляющую музыку! Используй запросы "Yehezkel Raz - As Long as in the Heart" (невероятное спокойное пианино в лесу), "Moonlight" (нежное спокойное пианино Domitori Taranofu), "Silence inside" (глубокий эмбиент chirrrex) или спокойный лоу-фай "relax time" / "my favorite coffee shop" / "pink wood". Никаких взрывных треков или агрессивного фонка для спокойных видео!
     - Если видео динамичное, про спорт, игры, технологии или бизнес-успех: используй активный трап "Arena" / "Turn It Up" / "Bleed" / "Jump" или трендовый фонк "METAMORPHOSIS".
   - Накладывай фоновую музыку через `select_bgm` с правильным атмосферным запросом в поле `asset_query` и комфортной громкостью (например, -22дБ).
   - Каждая склейка, зум, появление плашки или переход должны сопровождаться аудио-эффектом `build_transition` (`whoosh` для быстрого сдвига, `glitch` для технологичного кадра, `film` для мягкого перехода).

4. ВИЗУАЛЬНЫЕ ПЕРЕБИВКИ (Rich B-Roll & Scenes):
   - Добавляй качественные B-roll через `add_broll` на затянутые фразы спикера. Поисковые запросы Pexels пиши строго на английском языке (например: 'cyberpunk hacker keyboard typing close up', 'relaxing coffee stream warm bokeh').
   - Сложные факты, списки или тезисы превращай в эффектную графику через `generate_vox_graphics` (для детальных инфографик) или `generate_scene_override` (для полноэкранного сплит-экрана).

5. ВЫЯВЛЕНИЕ ИНТЕРЕСНЫХ МОМЕНТОВ И ФОРМАТИРОВАНИЕ (YouTube vs Social Media):
   - Ты обязан выявлять самый вовлекающий, интересный или ключевой фрагмент видео по транскрипту (например, важную мысль, инсайт или эмоциональное высказывание).
   - В приветственном сообщении (`INIT_PLAN`) или первом ответе обязательно предложи пользователю обрезать ролик под этот конкретный отрезок (назови таймкоды начала и конца и процитируй суть) и спроси напрямую: «Вы монтируете это видео для соцсетей (динамичный ролик до 1 минуты) или для YouTube (убрав слова-паразиты и длинные паузы, но сохранив полную версию)?».
   - Если пользователь выбирает «для соцсетей» или «для Shorts/Reels/TikTok», предложи или примени план обрезки видео (с помощью `cut_clip`), чтобы сократить ролик строго до 60 секунд (или меньше), оставив только выделенный интересный отрезок. Если «для YouTube» — сохрани полную версию, аккуратно удалив слова-паразиты и длинные паузы.

{music_catalog_desc}

🔥 КРИТИЧЕСКИЕ ПРАВИЛА ВЫПОЛНЕНИЯ:
1. РАБОТАЙ СТРОГО ЧЕРЕЗ ИНСТРУМЕНТЫ. Тебе запрещено генерировать raw edit logic напрямую. Всегда вызывай соответствующие функции из списка.
2. ВЫПОЛНЯЙ МОНТАЖ СТРОГО ПОСЛЕДОВАТЕЛЬНО И ПО ШАГАМ (Sub-structural Editing):
   - Делай монтаж строго пошагово, реагируя именно на то, что попросил пользователь в текущем сообщении.
   - Если в запросе пользователя содержатся конкретные команды (например, "добавь музыку", "сделай зум", "наложи субтитры"), то выполняй СТРОГО эти команды, используя соответствующие инструменты (`select_bgm`, `create_zoom`, `build_kinetic_typography` и т.д.).
   - Если пользователь не попросил ничего конкретного, а просто прислал приветствие или дал общую команду начать (например, "Привет", "Hi", "делай", "начинай", "поехали" или согласился с планом), то на этом первом шаге подтверди загрузку сырого видео в оригинальном виде в поле `reply` дружелюбным человеческим языком, и мягко предложи пользователю начать работу с базовой обрезки видео (создания чернового монтажа/рафката) или выбрать любое другое действие на его усмотрение.
   - Категорически запрещено вызывать несуществующие инструменты: `match_cut`, `create_match_cut`, `trim_video`, `remove_silence`, `auto_cuts`! Их не существует в реестре!
   - Если тебе требуется вручную вырезать конкретный диапазон видео, используй СТРОГО ЕДИНСТВЕННЫЙ существующий инструмент для нарезки: `cut_clip` с аргументами `start_time` и `end_time`.
3. ОТВЕЧАЙ НА РУССКОМ ЯЗЫКЕ. В поле 'reply' дай дружелюбный, живой, естественный и емкий ответ:
   - ВСЕ СВОИ МЫСЛИ, мета-анализ действий пользователя, классификацию запроса ПИШИ СТРОГО в блоке <think>...</think> в самом начале ответа! В поле 'reply' писать технические рассуждения о пользователе КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО!
   - В поле 'reply' пиши чистый, живой, естественный разговорный текст (как опытный монтажер-напарник, который общается тепло, просто и профессионально). Общайся на современном профессиональном сленге монтажеров (используй такие термины как: B-roll / перебивки, динамичные зумы, саунд-дизайн, темпоритм / pacing, удержание / retention, паттерн-интеррапты, склейки, титры / леттеринг, хук). Пиши мягко и дружелюбно, но СТРОГО БЕЗ ЭМОДЗИ и смайликов!
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать двойные кавычки (") внутри значения строки 'reply'. Вместо этого для названий треков, шрифтов, B-roll и стилей СТРОГО используй одиночные кавычки (') или русские кавычки-елочки « » (или « и »). Это необходимо для предотвращения ошибок синтаксиса JSON! Например: трек «Moonlight» или стиль 'pop'.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выводить пустой шаблонный текст в квадратных скобках (например, [краткое описание темы], [описание настроения] или [название трека]). Ты обязан сразу подставлять реальные аналитические данные на основе предоставленного транскрипта и визуального контекста видео! Если транскрипт отсутствует, пиши реальные выводы из визуального описания (VLM).
   - Тепло поприветствуй пользователя ТОЛЬКО в самом первом сообщении (когда запрос пользователя 'INIT_PLAN'). В последующих ответах СТРОГО ЗАПРЕЩЕНО здороваться! Переходи сразу к делу.
   - Вместо длинных технических обоснований пиши кратко: сначала дай емкий итог сделанных на таймлайне изменений (1-2 лаконичных предложения), а затем проактивное предложение следующего творческого шага (например: "Я порезал лишние паузы, накинул lofi-трек для вайба и выставил динамичные зумы на пиках речи спикера. Что делаем дальше — добавим B-roll, настроим леттеринг субтитров или соберем инфографику?").
   - СТРОГО ЗАПРЕЩЕНО писать приветствия в каждом ответе, лить лишнюю "воду" и писать огромные тексты. Будь умным и лаконичным! СТРОГО БЕЗ СМАЙЛИКОВ И ЭМОДЗИ в тексте!

Для максимальной надежности в ЛЮБЫХ окружениях, верни ответ СТРОГО в формате JSON с ключами:
- "plan": ["пошаговый производственный план монтажа на русском языке (например, ['вырезать паузы', 'сделать приближение на кульминации', 'наложить фоновую музыку'])"]
- "reply": "чистый, живой, мягкий разговорный ответ на русском языке для пользователя на монтажном сленге, без приветствий (кроме INIT_PLAN), СТРОГО БЕЗ ЭМОДЗИ и без двойных кавычек внутри строки (используй кавычки-елочки или одиночные кавычки!)"
- "tool_calls": [
    {{"name": "имя_инструмента", "arguments": {{"аргумент_1": "значение"}}}}
  ]
}}
"""














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

ПРАВИЛО РАЗУМА ДЛЯ ХУКА:
Ты ОБЯЗАН выделить эту фразу в начале видео. Для этого примени инструмент `create_scene` (выбрав в качестве `visual_entity` подходящий вид графики, например `stat_card` или `headline` внутри списка `entities`) на интервале {hook_start} - {hook_end} сек., чтобы акцентировать внимание зрителя с первых секунд!
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
        music_catalog_desc=music_catalog_desc
    )

    # 1. First turn: initialize message history
    if not messages:
        if user_message == "INIT_PLAN":
            user_prompt = f"""
==== ПЕРВЫЙ ЗАПУСК ПРОЕКТА ====
Это первая инициализация проекта. На данном этапе тебе СТРОГО ЗАПРЕЩЕНО вызывать какие-либо инструменты монтажа (поле 'tool_calls' должно быть абсолютно пустым: "tool_calls": []).
Твоя цель сейчас — проанализировать исходные материалы и предложить пользователю несколько вариантов готовых решений (стилевых концепций) в поле 'reply', чтобы он мог выбрать.

Проанализируй исходные материалы:
Стилевой профиль проекта: {json.dumps(style_info, ensure_ascii=False)}
Отчет темпа речи (Pacing): {json.dumps(pacing_report, ensure_ascii=False)}
Визуальный контекст (VLM): "{visual_context}"
Разрешение видео: {width}x{height} (формат: {aspect_ratio})
{hook_context}
Полный транскрипт с таймкодами:
========================
{transcript_text}
========================

Напиши развернутый, теплый, вдохновляющий ответ на русском языке (СТРОГО БЕЗ ЭМОДЗИ!).
1. Тепло поприветствуй пользователя, представься как Синематографический Разум. Подтверди, что исходное сырое видео успешно загружено без изменений. Кратко опиши, о чем видео спикера на основе транскрипта и визуального ряда (например, если он на природе, в лесу или в офисе — обязательно подчеркни эту реальную атмосферу кадра).
2. Предложи 3 уникальные творческие концепции монтажа, разработанные специально под тему, настроение и содержание видео на основе транскрипта и визуального ряда (например, спокойный вайбовый влог, динамичный технообзор, экспертный сторителлинг, атмосферный ролик о природе и т.д.). Ни в коем случае не используй шаблонные стили Vox, Paper или Mograph!
3. Опиши, какие конкретно B-roll категории, подходящие музыкальные треки из нашего каталога (лоу-фай, классическое пианино, активный трап или фонк — строго под атмосферу концепции) и монтажные приемы ты предлагаешь использовать для каждого стиля с учетом формата {aspect_ratio}.
4. В конце спроси, какая концепция ему ближе. Ты ОБЯЗАН предложить пользователю обрезать ролик под самый интересный и вовлекающий отрезок (проанализируй транскрипт, укажи точные таймкоды начала/конца лучшей мысли и процитируй её), а также задать прямой вопрос: «Для какой платформы вы монтируете это видео: для YouTube (чтобы убрать слова-паразиты и паузы, но сохранить полную версию) или для соцсетей / Shorts (чтобы сделать ролик короче 1 минуты, оставив только самый интересный отрезок)?».

            ПОДЧЕРКИВАЕМ: ТЕБЕ СТРОГО ЗАПРЕЩЕНО ВЫЗЫВАТЬ ЛЮБЫЕ ИНСТРУМЕНТЫ (например, create_zoom, build_kinetic_typography, select_bgm и др.) В ЭТОМ ХОДУ. Поле 'tool_calls' должно быть пустым: "tool_calls": [].
            """
        else:
            user_prompt = f"""
==== ИНСТРУКЦИЯ ДЛЯ ВЫПОЛНЕНИЯ ====
Пользователь прислал конкретный запрос на монтаж: "{user_message}"
Ты ДОЛЖЕН сразу же проанализировать этот запрос и вызвать соответствующие инструменты из Tools Registry для его выполнения на основе транскрипта и pacing-отчета!
Не пиши пустой список "tool_calls" и не задавай лишних вопросов, если пользователь дал четкую команду (например: добавить музыку -> вызови `select_bgm`; сделать зум -> вызови `create_zoom` на таймкод из pacing peaks или транскрипта).

==== ТЕКУЩИЙ КОНТЕКСТ ====
1. Запрос пользователя: "{user_message}"
2. Текущие примененные правки: {json.dumps(active_edits, ensure_ascii=False)}
3. Стилевой профиль проекта: {json.dumps(style_info, ensure_ascii=False)}
4. Отчет темпа речи (Pacing): {json.dumps(pacing_report, ensure_ascii=False)}
5. Визуальный контекст (VLM): "{visual_context}"
6. Характеристики видео: {width}x{height} (формат: {aspect_ratio})
{hook_context}
7. Полный транскрипт с таймкодами:
========================
{transcript_text}
========================

ДОСТУПНЫЕ ИНСТРУМЕНТЫ (Tools Registry):
{tools_desc}

Проанализируй запрос, определи нужные таймкоды из транскрипта/pacing, составь список вызовов инструментов и верни ответ СТРОГО в формате JSON с ключами 'reply' и 'tool_calls'.
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
    except Exception:
        pass
        
    ReasoningManager.complete_planning(plan)

    return {
        "messages": [response], # LangGraph operator.add will append this response to state
        "production_session": memory.export_session_state()
    }


async def execute_tools_node(state: VideoEditingState) -> Dict[str, Any]:
    """LangGraph Node: Executes the queue of tool calls sequentially, emitting live updates."""
    logger.info("🔌 Execute Tools Node started execution...")
    
    messages = state.get("messages", [])
    if not messages:
        return {}
        
    last_message = messages[-1]
    content = last_message.content if hasattr(last_message, "content") else str(last_message)
    
    # Clean code fences if present
    content_clean = content.strip()
    if "```json" in content_clean:
        content_clean = content_clean.split("```json")[1].split("```")[0].strip()
    elif "```" in content_clean:
        content_clean = content_clean.split("```")[1].split("```")[0].strip()

    tool_calls_queue = []
    reply_text = "Монтаж..."
    
    try:
        from app.workflows.json_sanitizer import parse_json_blocks_from_text, safe_json_loads
        parsed_blocks = parse_json_blocks_from_text(content)
        if parsed_blocks:
            parsed = parsed_blocks[0]
            reply_text = parsed.get("reply", "Монтаж...")
            tool_calls_queue = parsed.get("tool_calls", [])
        else:
            parsed = safe_json_loads(content_clean)
            reply_text = parsed.get("reply", "Монтаж...")
            tool_calls_queue = parsed.get("tool_calls", [])
    except Exception as e:
        logger.error(f"⚠️ Failed to parse tool calls queue: {e}")
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
    
    # Map technical tool names to clean, high-fidelity Russian descriptions
    FRIENDLY_TOOL_NAMES = {
        "cut_clip": "✂️ Вырезание пауз и лишних фраз",
        "add_broll": "🎬 Наложение стокового видео B-Roll Pexels",
        "generate_scene_override": "🖼 Сборка полноэкранного сплит-экрана",
        "generate_vox_graphics": "📊 Создание анимированной Vox-инфографики",
        "generate_mograph_graphics": "✨ Наложение неонового Mograph оверлея",
        "build_kinetic_typography": "✍️ Настройка кинематических субтитров",
        "select_bgm": "🎵 Наложение саундтрека и фоновой музыки",
        "create_zoom": "🔍 Наезды камеры и расстановка акцентов",
        "build_transition": "💿 Добавление звукового перехода склейки"
    }

    tool_results = []
    from app.workflows.tool_executor import ToolExecutor
    from app.workflows.reasoning_manager import ReasoningManager
    
    executor = ToolExecutor(timeline, memory)
    total_tools = len(tool_calls_queue)
    
    # Start the EXECUTION stage
    ReasoningManager.start_execution(total_tools)

    for idx, call in enumerate(tool_calls_queue):
        tool_name = call.get("name")
        args = call.get("arguments", {}) or {}
        
        friendly_name = FRIENDLY_TOOL_NAMES.get(tool_name, f"🛠 Запуск инструмента {tool_name}")
        
        # 1. Update the execution progress on Reasoning Manager
        ReasoningManager.update_execution(friendly_name, idx, total_tools, f"Вызов с аргументами: {json.dumps(args, ensure_ascii=False)}")
        
        # 2. Run the tool mutation locally on TimelineState
        result_log = await executor.execute_tool(tool_name, args)
        tool_results.append(f"- Инструмент '{tool_name}': {result_log}")
        
        # 3. Update with the completion log
        ReasoningManager.update_execution(friendly_name, idx, total_tools, f"Завершено: {result_log}")

    # Complete the EXECUTION stage
    ReasoningManager.complete_execution()

    # Compile the final modifications list
    final_edits = timeline.get_serialized_edits()
    
    # ─── 4. FINALIZATION: Retention Critic Audit & Suggest Fixes ───
    ReasoningManager.start_finalization("Аудит удержания внимания, темпа и плотности графики...")
    
    from app.workflows.retention_critic import RetentionCritic
    session_state = memory.export_session_state() or {}
    duration = session_state.get("duration", 10.0)
    
    # Audit and suggest fixes
    audit_results = RetentionCritic.audit(final_edits, duration)
    suggested_fixes = RetentionCritic.suggest_fixes(final_edits, duration)
    
    # Complete the FINALIZATION stage
    ReasoningManager.complete_finalization(audit_results["score"], audit_results["issues"], suggested_fixes)
    
    # Store results in message history so LLM gets context in the next turn
    summary = "\n".join(tool_results)
    results_message = HumanMessage(content=f"РЕЗУЛЬТАТЫ ВЫПОЛНЕНИЯ ИНСТРУМЕНТОВ:\n{summary}\nВсе операции успешно зафиксированы на таймлайне.")

    return {
        "messages": [results_message],
        "active_edits": final_edits,
        "production_session": memory.export_session_state(),
        "critic_feedback": "\n".join(audit_results["issues"]),
        "critic_approved": audit_results["approved"],
        "critic_retry_count": state.get("critic_retry_count", 0) + 1
    }
