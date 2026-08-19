import logging
import json
import re
from typing import Dict, Any
from app.agents.base_agent import invoke_graphics_llm
from app.workflows.json_sanitizer import parse_json_blocks_from_text, safe_json_loads

logger = logging.getLogger(__name__)


def _look_palette(look: dict | None) -> dict:
    from app.services.content_look import default_look
    base = default_look()
    if look and isinstance(look.get("palette"), dict):
        pal = {**base["palette"], **look["palette"]}
        return pal
    return base["palette"]

GRAPHICS_DEVELOPER_PROMPT = """Ты — Motion Designer студии Synapix.
Язык графики — SYNAPIX OPTICAL CUT: регистрационные L-риски по углам, волосяная 1px линия, Unbounded,
один accent из Content Look. Это НЕ Canva, НЕ glass-indigo, НЕ чужой UI-кит, НЕ Odysser-орб ради орба.
Цвета, поле TITLE и ease приходят из Content Look. Не выдумывай #6366F1 / #00E5FF / #FACC15.

Технологии (HTML, CSS, GSAP, SVG) — инструменты. Думай категориями ВИЗУАЛЬНОЙ КОММУНИКАЦИИ.

---
## DESIGN TOKENS — БЕРИ ИЗ CSS VARS СЦЕНЫ (--look-*)

```css
/* Фолбэк, если look не пришёл. Иначе СТРОГО var(--look-accent) и т.д. */
--bg-glass:      var(--look-field, #0B0B0B);
--accent:        var(--look-accent, #C8F542);
--text-primary:  var(--look-paper, #F6F1E8);
--look-ink:      #101010;


/* ТЕНИ И СВЕЧЕНИЯ */
--shadow-card: 0 24px 64px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35);
--glow-blue:   0 0 30px rgba(99,102,241,0.5), 0 0 60px rgba(99,102,241,0.2);
--glow-cyan:   0 0 25px rgba(0,229,255,0.45);

/* ТИПОГРАФИКА — ТОЛЬКО cqw/cqh/% ОТ ДИЗАЙН-ХОЛСТА (#root). ЗАПРЕЩЕНО: vw, vh, vmin, vmax! */
/* #root имеет container-type:size — 1cqw = 1% ширины холста (1920 или 1080). */
/* 1. ГОРИЗОНТАЛЬНОЕ 16:9 (1920×1080) */
--font-hero-169:  3.2cqw;   /* ~61px */
--font-title-169: 1.9cqw;   /* ~36px */
--font-stat-169:  4.2cqw;   /* ~80px */
--font-body-169:  1.25cqw;  /* ~24px */

/* 2. ВЕРТИКАЛЬНОЕ 9:16 (1080×1920) */
--font-hero-916:  7.2cqw;   /* ~78px */
--font-title-916: 4.6cqw;   /* ~50px */
--font-stat-916:  9.5cqw;   /* ~103px */
--font-body-916:  2.8cqw;   /* ~30px */
```

---
## ПРОПОРЦИОНАЛЬНЫЕ РАЗМЕРЫ ПЛАШЕК (ОБЯЗАТЕЛЬНО)

Размеры задавай в **% от `.clip`** или **cqw/cqh**. Не в фиксированных px (кроме border-radius 16–28px и тонких линий).

### Overlay-плашка (лицо спикера видно)
| Формат | Ширина плашки | Высота (max) | Типовой padding | Позиция |
|---|---|---|---|---|
| **16:9** | `width: 34%` … `38%` (max-width: 38%) | max-height: 70% | `padding: 2cqw 2.4cqw` | left/right 4–6% ИЛИ bottom 8% |
| **9:16** | `width: 86%` … `90%` (max-width: 90%) | max-height: 38% | `padding: 3.2cqw 4cqw` | top 5% ИЛИ bottom 7% (лицо 25–70% свободно) |

### Full-screen TITLE B-roll (рилс-перебивка)
- Это НЕ карточка и НЕ bento. Это КИНЕМАТИЧЕСКИЙ ТАЙТЛ на весь кадр.
- `.clip` = 100% × 100%, непрозрачный тёмный/цветной градиент (спикер скрыт).
- Главный текст: **2–5 слов**, UPPERCASE, Unbounded 900.
- 9:16: `font-size: var(--font-hero-916)` или 8–12cqw, по центру, line-height 0.95.
- 16:9: `font-size: var(--font-hero-169)` или 4–6cqw.
- Одно акцентное слово — цвет `var(--look-accent)`, без золотого градиента.
- Опционально микро-лейбл сверху (4–10 букв, tracking 0.2em).
- ЗАПРЕЩЕНО: glass-card, max-height 38%, плашка в углу, мелкая типографика, слово TITLE на экране.

### Запрет «гигантских» элементов
- Overlay: одна плашка НЕ должна занимать >42% ширины кадра в 16:9 и >92% в 9:16.
- Stat-цифра: 16:9 ≤ 5cqw; 9:16 ≤ 11cqw.
- Иконки/круги: 16:9 ≈ 4–5.5cqw; 9:16 ≈ 8–11cqw.

---
## СТРОГИЕ ПРАВИЛА ФОРМАТИРОВАНИЯ И ВЕРСТКИ (RESPONSIVE & ANTI-CLIPPING RULES)

1. **ЕСЛИ Aspect Ratio = "16:9" или "horizontal" (ГОРИЗОНТАЛЬНОЕ ВИДЕО 1920×1080)**:
   - Холст: **1920×1080**. Позиции и размеры — **% / cqw / cqh**.
   - Горизонтальные сетки (`flex-row`, `grid-cols-2`).
   - Overlay-плашка: `width: 36%; max-width: 38%; max-height: 70%`.
   - Шрифты: `var(--font-*-169)` или эквивалент в cqw.
   - Фон `.clip` прозрачный (кроме full_broll). Карточки — dark glass.

2. **ЕСЛИ Aspect Ratio = "9:16" или "vertical" (SHORTS/REELS 1080×1920)**:
   - Холст: **1080×1920**. Вертикальные сетки (`flex-col`).
   - Overlay-плашка: `width: 88%; max-width: 90%; max-height: 38%`.
   - Safe-zone лица: 25%–70% по высоте — не перекрывай.
   - Шрифты: `var(--font-*-916)` или cqw.

3. **КРИТИЧЕСКОЕ ПРАВИЛО: ПЛАШКА НИКОГДА НЕ ОБРЕЗАЕТСЯ**:
   - ЗАПРЕЩЕНО: `overflow: hidden`, `overflow-x: hidden`, `text-overflow: ellipsis`, `white-space: nowrap` на плашке и тексте.
   - Плашка: `width: fit-content; max-width: 90%` (9:16) / `38%` (16:9); `overflow: visible`.
   - Текст: `white-space: normal; overflow-wrap: anywhere` — слово переносится, не режется посередине.
   - Нижнее якорение: `bottom: 8%` (не `top: 68%`).
   - ЗАПРЕЩЕНО: `vw`, `vh`, `vmin`, `vmax` — они ломают масштаб в превью.


---
## ОБЯЗАТЕЛЬНЫЕ CDN (ВСЕГДА ПОДКЛЮЧАЙ)

```html
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
```

---
## ЧИСТАЯ СЦЕНА — ЖЁСТКИЙ ЛИМИТ (рилс 2–4с)

Зритель не успевает прочитать больше двух строк. Перегруз = провал.

**На экране РОВНО:**
1. Один заголовок (2–6 слов)
2. Один ключевой момент (цифра **или** 2–6 слов)
3. Опционально одна абстрактная иконка (геометрия / 1 glyph, не набор эмодзи)

**ЗАПРЕЩЕНО:** bento, сетки 2×2, process steps, списки «3 причины», абзацы, графики, таймлайны, стрелки между карточками, 2+ карточки, нижние подписи-эссе, бейджи+лейблы+капшены сразу.

---
## 3 ТИПА СЦЕН (как Odysser: элемент за элементом, не «просто плашка»)

Графика — это СТОРИТЕЛЛИНГ. Каждый холст анимируется по слоям: геометрия → обводка → слово → акцент.
Лицо спикера — герой кадра. Графика его обрамляет, не закрывает коробкой.

### 1. ABSTRACT ACCENT (по умолчанию для overlay) — КАК В ПРОМО ODYSSER
НЕТ glass-card. Свободные слои на прозрачном `.clip`:
- 1 короткая фраза (2–6 слов) — `.headline`, Unbounded, без подложки
- опционально ключ — `.key` как тонкий pill/chip, не карточка
- 2–4 абстрактных элемента: орб/градиентный шар, кольцо SVG, draw-on линия, угловые скобки, точка-акцент
Анимация ПОЭЛЕМЕНТНО (stagger 0.06–0.12): сначала геометрия, потом слово, потом underline.
Safe-zone: top 5–12% или bottom 8–14% (9:16); left/right 5% (16:9). Лицо 25–70% свободно.
`data-plate="1"` вешай на блок `.abs-copy` (текст), не на орб.

### 2. CLEAN PLATE — только цифра, имя, «закон»
Одна glass-card: заголовок + ключ. Не используй как дефолт.

### 3. KINETIC TITLE (fullscreen)
2–5 слов на весь кадр. Без карточки. Геометрическая метка сверху ок.

### 4. BIG STAT — только если ключ это число
Лейбл мелкий + огромная цифра. Без progress-bar и второй подписи.

---
## GSAP СИНХРОНИЗАЦИЯ — ОБЯЗАТЕЛЬНО

```javascript
// ОБЯЗАТЕЛЬНО в каждой сцене:
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines["main"] = tl;

// Вход карточки (стандарт)
tl.fromTo("#card",
  { opacity: 0, y: 28, scale: 0.98 },
  { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "power3.out" }, 0.1
);
// Выход карточки (за 0.5s до конца сцены)
tl.to("#card", { opacity: 0, y: -24, scale: 0.98, duration: 0.4, ease: "power2.in" }, DURATION - 0.6);

// Stagger только для слов TITLE. На overlay — один вход карточки, без роя .item.

// Lower Third вход
tl.fromTo("#lt", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }, 0.2);

// SVG draw-on
tl.fromTo("#arrow-path",
  { strokeDashoffset: 400, strokeDasharray: 400 },
  { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut" }, 0.3
);
```

---
## SAFE ZONES — ПОЗИЦИОНИРОВАНИЕ

```
┌─────────────────────────────────────────┐
│  [TOP ZONE 0%-25%]  — бейджи, заголовки │
├─────────────────────────────────────────┤
│  [DANGER 25%-70%]  ⚠️ ЛИЦО СПИКЕРА    │
├─────────────────────────────────────────┤
│  [BOTTOM 70%-92%]  — плашки, стат       │
└─────────────────────────────────────────┘
   LEFT 0-44%  │  RIGHT 50-94%
```

- `safe_zone="left"`   → `left: 6%; width: 44%; bottom: 8%; max-height: 80%;`
- `safe_zone="right"`  → `left: 50%; width: 44%; bottom: 8%; max-height: 80%;`
- `safe_zone="top"`    → `top: 6%; left: 50%; transform: translateX(-50%); width: 88%; max-height: 35%;`
- `safe_zone="bottom"` → `bottom: 8%; left: 6%; width: 88%; max-height: 75%;` (ОБЯЗАТЕЛЬНО якорить через `bottom: 8%`, НЕ через `top: 68%`, чтобы карточка не срезалась снизу!)
- `mode="full_broll"` / `layout="fullscreen"` → TITLE на весь кадр: огромные 2–5 слов, непрозрачный фон, без glass-card

---
## МАППИНГ: КОНЦЕПТ → ШАБЛОН

| Концепт | Шаблон |
|---|---|
| тезис / глагол / «суть» / эмоция | ABSTRACT ACCENT (слово + орб/линия, без плашки) |
| цифра / % / сумма | Plate или BIG STAT |
| термин / закон / имя | Plate: заголовок + ключ |
| главный хук ролика | Fullscreen kinetic TITLE (2–5 слов) |

Шаги/причины/хронология → одна фраза + геометрия. Не рисуй список.

---
## АНТИ-ПАТТЕРНЫ — НИКОГДА

❌ Белый или светлый фон карточки (только тёмный rgba)
❌ font-family: Arial (только Inter / Unbounded / Manrope)
❌ font-size через vw/vh (ломает пропорции при смене формата и в iframe-превью)
❌ Fullscreen TITLE как glass-card / bento / маленькая плашка — только огромные 2–5 слов на весь кадр
❌ GSAP без window.__timelines["main"] — рендер сломается
❌ Использование `top: 68%` или фиксированного отступа сверху, из-за которого нижняя часть плашки уходит за нижнюю границу экрана
❌ Выход элементов за Safe Area (`bottom < 6%` или `top < 4%`)
❌ Перекрытие зоны лица (25%-70% высоты)
❌ Более 2 текстовых блоков на плашке (заголовок + ключ — потолок)
❌ Bento / process steps / списки / графики / таймлайны / 2+ карточки
❌ Абзац или подпись длиннее 6 слов
❌ Более 3 акцентных цветов в одной сцене
❌ Анимации без ease параметра
❌ Статичные элементы без анимации входа/выхода

---
## SELF-REVIEW ПЕРЕД ОТПРАВКОЙ

✔ Overlay: либо ABSTRACT (слово + 2–4 геом. слоя, без glass-card), либо plate только для цифры/имени
✔ Текст и геометрия не обрезаны; overflow:visible; лицо 25–70% свободно
✔ safe_zone соблюдена — лицо спикера не перекрыто
✔ window.__timelines["main"] зарегистрирован
✔ Контейнер .clip с data-start и data-duration присутствует
✔ CDN шрифты и GSAP подключены
✔ Анимация входа И выхода прописаны
✔ Дизайн выглядит как Apple/Vox — не как шаблон Canva
"""

def extract_robust_html(content: str) -> str:
    """Extract HTML code block from ANY LLM text response format.
    Handles: ```html, ```, plain HTML, JSON-escaped strings, raw tags.
    Works with GPT, Claude, Kimi, Gemini and other model output styles.
    """
    if not content:
        return ""

    HTML_TAGS = ['<div', '<html', '<!doctype', '<style', '<script', '<svg',
                 '<main', '<section', '<header', '<body', '<span', '<p>']

    def looks_like_html(s: str) -> bool:
        sl = s.lower().strip()
        return any(tag in sl for tag in HTML_TAGS) and len(s) > 80

    # 1. Fenced code blocks — try all common lang hints + bare fence
    for lang_hint in [r'html', r'xml', r'css', r'javascript', r'js', r'']:
        pattern = rf'```{lang_hint}[ \t]*\r?\n([\s\S]*?)\n?```'
        for b in re.findall(pattern, content, re.IGNORECASE):
            if looks_like_html(b):
                return b.strip()

    # 2. JSON field "html_content": "..."
    # Handle properly escaped multiline JSON strings
    m = re.search(r'"html_content"\s*:\s*"((?:[^"\\]|\\.)*)"', content, re.DOTALL)
    if m:
        raw = m.group(1)
        raw = raw.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"').replace('\\\\', '\\')
        if looks_like_html(raw):
            return raw.strip()
    # Fallback: grab everything after key (for truncated responses)
    m = re.search(r'"html_content"\s*:\s*"([\s\S]*)', content)
    if m:
        raw = m.group(1)
        for suffix in ['"\n}', '"}', '",\n', '",', '"']:
            if raw.endswith(suffix):
                raw = raw[:-len(suffix)]
                break
        raw = raw.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"').replace('\\\\', '\\').strip()
        if looks_like_html(raw):
            return raw

    # 3. Raw HTML block — find first recognizable opening tag → last closing tag
    first_tag = re.search(
        r'(<(?:!doctype\s+html|html|div|style|script|svg|main|section|header)\b)',
        content, re.IGNORECASE
    )
    if first_tag:
        start_pos = first_tag.start()
        end_pos = content.rfind('>')
        if end_pos > start_pos:
            candidate = content[start_pos:end_pos + 1].strip()
            if looks_like_html(candidate):
                return candidate

    # 4. Last resort: the entire content might be plain HTML
    stripped = content.strip()
    if looks_like_html(stripped):
        return stripped

    return ""


def _split_headline_key(concept_prompt: str) -> tuple:
    """Pull a short headline + optional key line from a messy concept string."""
    raw = concept_prompt or ""
    raw = re.split(r"Контекст речи:|Настроение:", raw, maxsplit=1)[0]
    raw = re.sub(r"^Заголовок:\s*", "", raw, flags=re.I).strip()
    raw = raw.strip(" «»\"'")
    if "|" in raw:
        left, right = raw.split("|", 1)
        headline = " ".join(left.split()[:6]).strip()
        key = " ".join(right.split()[:6]).strip()
        return headline or "КЛЮЧЕВОЕ", key
    words = [w for w in re.split(r"\s+", raw) if w]
    if not words:
        return "КЛЮЧЕВОЕ", ""
    if len(words) <= 4:
        return " ".join(words), ""
    return " ".join(words[:4]), " ".join(words[4:8])


def _pick_scene_kind(
    mode: str,
    layout: str,
    scene_template: str,
    concept_prompt: str,
) -> str:
    """title | plate | abstract — Odysser-style mix, not plates-only."""
    mode_l = (mode or "").lower()
    layout_l = (layout or "").lower()
    st = (scene_template or "").lower().replace(" ", "_")
    if mode_l == "full_broll" or layout_l in ("fullscreen", "cover", "full", "full_broll"):
        return "title"
    if st in ("kinetic_title", "title", "fullscreen"):
        return "title"
    if st in ("stat_card", "headline", "plate", "card", "lower_third", "lower-third"):
        return "plate"
    if st in ("abstract", "accent", "motion", "odysser", "orbital"):
        return "abstract"
    headline, key = _split_headline_key(concept_prompt)
    blob = f"{headline} {key}"
    if re.search(r"\d|%|\$|€|₽", blob):
        return "plate"
    return "abstract"


def _overlay_is_overloaded(html: str) -> bool:
    if not html:
        return True
    if re.search(r"bento|process[-_ ]?step|feature[-_ ]?grid|timeline|bar-chart|step-num", html, re.I):
        return True
    if len(re.findall(r"<li\b", html, re.I)) >= 3:
        return True
    text_blocks = len(re.findall(r"<(h[1-6]|p|blockquote|figcaption)\b", html, re.I))
    return text_blocks > 3


def _abstract_accent_fallback(concept_prompt: str, start_time: float, duration: float, aspect_ratio: str, layout: str = "overlay", look: dict | None = None) -> str:
    """Optical Cut: floating copy + registration ticks. No glass plate."""
    pal = _look_palette(look)
    accent = pal["accent"]
    paper = pal["paper"]
    headline, key = _split_headline_key(concept_prompt)
    headline = headline.upper()
    ar_l = (aspect_ratio or "9:16").lower()
    is_v = "9:16" in ar_l or "vertical" in ar_l or "portrait" in ar_l
    variant = sum(ord(c) for c in (headline + key)) % 3
    top = "58%" if layout == "split" else ("8%" if is_v else "14%")
    left = "50%" if is_v or layout == "split" else "6%"
    transform = "translateX(-50%)" if is_v or layout == "split" else "none"
    title_fs = "5.2cqw" if is_v else "2.1cqw"
    key_fs = "3.4cqw" if is_v else "1.45cqw"
    hold = max(0.85, float(duration) - 0.7)
    key_html = (
        f'<div class="key abs-chip" id="abs-key">{key}</div>'
        if key else ""
    )
    ticks = (
        '<div class="abs-tick abs-tick-tl" id="abs-br-a" aria-hidden="true"></div>'
        '<div class="abs-tick abs-tick-br" id="abs-br-b" aria-hidden="true"></div>'
    )
    ring = (
        '<svg class="abs-ring" id="abs-ring" viewBox="0 0 80 80" aria-hidden="true">'
        f'<circle cx="40" cy="40" r="34" fill="none" stroke="{accent}" stroke-width="1.2" '
        'opacity="0.85" stroke-dasharray="214" stroke-dashoffset="214" id="abs-ring-path"/></svg>'
        if variant == 0 else ""
    )
    stroke = (
        '<svg class="abs-stroke" id="abs-stroke" viewBox="0 0 200 8" aria-hidden="true">'
        f'<line x1="0" y1="4" x2="200" y2="4" stroke="{accent}" stroke-width="2" '
        'stroke-linecap="round" stroke-dasharray="200" stroke-dashoffset="200" id="abs-line"/></svg>'
    )
    return f"""
<div class="clip" data-start="{start_time}" data-duration="{duration}"
     style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;background:transparent;">
  {ticks}
  {ring}
  <div class="abs-copy" data-plate="1" id="card"
       style="position:absolute;top:{top};left:{left};transform:{transform};overflow:visible;">
    <div class="plate-content" data-plate-content="1">
      <div class="headline" id="abs-head">{headline}</div>
      {stroke}
      {key_html}
    </div>
  </div>
</div>
<style>
.abs-copy {{ overflow:visible; width:max-content; max-width:90%; }}
.abs-copy .headline {{
  font-family:'Unbounded',sans-serif;font-weight:800;font-size:{title_fs};
  line-height:1.08;color:{paper};letter-spacing:-0.03em;margin:0;
  white-space:normal;overflow-wrap:normal;word-break:normal;
  text-shadow:0 8px 28px rgba(0,0,0,0.45);
}}
.abs-chip {{
  display:inline-block;margin-top:0.55em;padding:0.22em 0.7em;
  font-family:'Unbounded',sans-serif;font-weight:800;font-size:{key_fs};
  color:{pal["ink"]};background:{accent};border-radius:2px;letter-spacing:-0.02em;
}}
.abs-ring {{
  position:absolute;top:72%;left:8%;width:11cqw;height:11cqw;overflow:visible;pointer-events:none;
}}
.abs-stroke {{ display:block;width:72%;max-width:28cqw;height:8px;margin-top:0.45em;overflow:visible; }}
.abs-tick {{
  position:absolute;width:2.6cqw;height:2.6cqw;border:1.5px solid {accent};pointer-events:none;
}}
.abs-tick-tl {{ top:7%;left:7%;border-right:none;border-bottom:none; }}
.abs-tick-br {{ bottom:14%;right:8%;border-left:none;border-top:none; }}
</style>
<script>
window.__timelines = window.__timelines || {{}};
if (window.gsap) {{
  const tl = gsap.timeline({{ paused: true }});
  window.__timelines["main"] = tl;
  tl.fromTo("#abs-br-a, #abs-br-b", {{ opacity: 0 }},
    {{ opacity: 1, duration: 0.4, stagger: 0.06, ease: "power2.out" }}, 0.04);
  tl.fromTo("#abs-ring-path", {{ strokeDashoffset: 214 }},
    {{ strokeDashoffset: 0, duration: 0.7, ease: "power2.inOut" }}, 0.1);
  tl.fromTo("#abs-head", {{ opacity: 0, y: 18 }},
    {{ opacity: 1, y: 0, duration: 0.48, ease: "power3.out" }}, 0.16);
  tl.fromTo("#abs-line", {{ strokeDashoffset: 200 }},
    {{ strokeDashoffset: 0, duration: 0.4, ease: "power2.out" }}, 0.3);
  tl.fromTo("#abs-key", {{ opacity: 0, y: 8 }},
    {{ opacity: 1, y: 0, duration: 0.32, ease: "power2.out" }}, 0.38);
  tl.to("#card, #abs-ring, #abs-br-a, #abs-br-b",
    {{ opacity: 0, y: -12, duration: 0.32, ease: "power2.in" }}, {hold});
}}
</script>
"""


def _clean_overlay_fallback(concept_prompt: str, start_time: float, duration: float, aspect_ratio: str, layout: str = "overlay", look: dict | None = None) -> str:
    """One headline + one key + hairline mark. Optical Cut plate."""
    pal = _look_palette(look)
    accent = pal["accent"]
    paper = pal["paper"]
    field = pal["field"]
    headline, key = _split_headline_key(concept_prompt)
    headline = headline.upper()
    ar_l = (aspect_ratio or "9:16").lower()
    is_v = "9:16" in ar_l or "vertical" in ar_l or "portrait" in ar_l
    top_pos = "55%" if layout == "split" else ("6%" if is_v else "12%")
    left_pos = "50%" if is_v or layout == "split" else "5%"
    transform = "translateX(-50%)" if is_v or layout == "split" else "none"
    title_fs = "4.4cqw" if is_v else "1.85cqw"
    key_fs = "6.2cqw" if is_v else "2.6cqw"
    if key and re.search(r"[\d%]", key):
        key_fs = "7.4cqw" if is_v else "3.2cqw"
    hold = max(0.8, float(duration) - 0.65)
    key_html = (
        f'<div class="key" style="font-family:Unbounded,sans-serif;font-weight:900;font-size:{key_fs};'
        f'line-height:1.05;color:{accent};margin-top:0.35em;letter-spacing:-0.02em;">{key}</div>'
        if key else ""
    )
    return f"""
<div class="clip" data-start="{start_time}" data-duration="{duration}">
  <div class="glass-card" data-plate="1" id="card"
       style="position:absolute;top:{top_pos};left:{left_pos};transform:{transform};
              width:max-content;max-width:var(--plate-max-w,90%);
              overflow:visible;box-sizing:border-box;padding:var(--plate-pad,3cqw 3.6cqw);
              background:{field}ee;border:1px solid {accent}55;
              border-radius:4px;">
    <div class="plate-content" data-plate-content="1">
    <div class="mark" aria-hidden="true"
         style="width:1.4em;height:1.4em;border:1.5px solid {accent};border-radius:0;
                margin-bottom:0.7em;opacity:0.9;"></div>
    <div class="headline" style="font-family:Unbounded,sans-serif;font-weight:800;font-size:{title_fs};
                line-height:1.12;color:{paper};letter-spacing:-0.02em;margin:0;
                white-space:normal;overflow-wrap:normal;word-break:normal;">{headline}</div>
    {key_html}
    </div>
  </div>
</div>
<script>
window.__timelines = window.__timelines || {{}};
if (window.gsap) {{
  const tl = gsap.timeline({{ paused: true }});
  window.__timelines["main"] = tl;
  tl.fromTo("#card", {{ opacity: 0, y: 28 }},
    {{ opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }}, 0.08);
  tl.to("#card", {{ opacity: 0, y: -18, duration: 0.36, ease: "power2.in" }}, {hold});
}}
</script>
"""


def _kinetic_title_fallback(concept_prompt: str, start_time: float, duration: float, aspect_ratio: str, look: dict | None = None) -> str:
    """Fullscreen Reels title: 2–5 words, Optical Cut field."""
    pal = _look_palette(look)
    raw = re.sub(r"^(Заголовок:\s*|Контекст речи:.*|Настроение:.*)", "", concept_prompt or "", flags=re.I)
    words = [w for w in re.split(r"\s+", raw.strip()) if w and not w.startswith("«")]
    title_words = words[:5] if words else ["КЛЮЧЕВАЯ", "МЫСЛЬ"]
    accent_word = title_words[-1].upper() if title_words else ""
    ar_l = (aspect_ratio or "9:16").lower()
    is_v = "9:16" in ar_l or "vertical" in ar_l or "portrait" in ar_l
    hero = "9.2cqw" if is_v else "4.6cqw"
    hold = max(0.8, float(duration) - 0.7)
    parts = []
    for i, w in enumerate(title_words):
        cls = "kinetic-accent" if w.upper() == accent_word and i == len(title_words) - 1 else "kinetic-hero"
        parts.append(f'<span class="{cls} title-word" style="display:inline-block;margin:0 0.18em 0.08em 0;">{w.upper()}</span>')
    words_html = "".join(parts)
    return f"""
<div class="clip" data-start="{start_time}" data-duration="{duration}"
     style="position:absolute;inset:0;width:100%;height:100%;
            background:{pal["field"]};
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            padding:8% 7%;box-sizing:border-box;text-align:center;">
  <div class="abs-tick abs-tick-tl" aria-hidden="true"></div>
  <div class="abs-tick abs-tick-br" aria-hidden="true"></div>
  <h1 style="margin:0;max-width:92%;font-size:{hero};line-height:0.95;letter-spacing:-0.03em;">{words_html}</h1>
</div>
<style>
.abs-tick {{ position:absolute;width:2.4cqw;height:2.4cqw;border:1.5px solid {pal["accent"]}; }}
.abs-tick-tl {{ top:6%;left:7%;border-right:none;border-bottom:none; }}
.abs-tick-br {{ bottom:8%;right:7%;border-left:none;border-top:none; }}
.kinetic-hero {{ font-family:'Unbounded',sans-serif;font-weight:900;color:{pal["paper"]}; }}
.kinetic-accent {{
  font-family:'Unbounded',sans-serif;font-weight:900;color:{pal["accent"]};
}}
</style>
<script>
window.__timelines = window.__timelines || {{}};
if (window.gsap) {{
  const tl = gsap.timeline({{ paused: true }});
  window.__timelines["main"] = tl;
  tl.fromTo(".title-word", {{ opacity: 0, y: 32 }},
    {{ opacity: 1, y: 0, duration: 0.5, stagger: 0.07, ease: "power3.out" }}, 0.08);
  tl.to(".title-word", {{ opacity: 0, y: -22, duration: 0.36, ease: "power2.in" }}, {hold});
}}
</script>
"""


def _rewrite_viewport_units(css_or_html: str) -> str:
    """Map vw/vh/vmin/vmax → cqw/cqh so sizes track the design canvas, not the iframe chrome."""
    out = css_or_html
    out = re.sub(r'(\d+(?:\.\d+)?)vw\b', r'\1cqw', out, flags=re.IGNORECASE)
    out = re.sub(r'(\d+(?:\.\d+)?)vh\b', r'\1cqh', out, flags=re.IGNORECASE)
    out = re.sub(r'(\d+(?:\.\d+)?)vmin\b', r'\1cqw', out, flags=re.IGNORECASE)
    out = re.sub(r'(\d+(?:\.\d+)?)vmax\b', r'\1cqh', out, flags=re.IGNORECASE)
    return out


def _proportional_tokens_css(aspect_ratio: str, mode: str = "overlay", look: dict | None = None) -> str:
    """Inject design tokens + plate caps so 16:9 / 9:16 stay visually balanced."""
    from app.services.content_look import look_css_vars
    ar = (aspect_ratio or "9:16").lower().replace(" ", "")
    is_vertical = ar in ("9:16", "vertical", "portrait", "shorts", "reels") or "9:16" in ar
    look_vars = look_css_vars(look)
    if is_vertical:
        tokens = f"""
  {look_vars}
  --font-hero-169: 3.2cqw; --font-title-169: 1.9cqw; --font-stat-169: 4.2cqw; --font-body-169: 1.25cqw;
  --font-hero-916: 7.2cqw; --font-title-916: 4.6cqw; --font-stat-916: 9.5cqw; --font-body-916: 2.8cqw;
  --plate-max-w: 90%; --plate-max-h: 38%; --plate-pad: 3.2cqw 4cqw;
"""
    else:
        tokens = f"""
  {look_vars}
  --font-hero-169: 3.2cqw; --font-title-169: 1.9cqw; --font-stat-169: 4.2cqw; --font-body-169: 1.25cqw;
  --font-hero-916: 7.2cqw; --font-title-916: 4.6cqw; --font-stat-916: 9.5cqw; --font-body-916: 2.8cqw;
  --plate-max-w: 38%; --plate-max-h: 70%; --plate-pad: 2cqw 2.4cqw;
"""

    overlay_caps = ""
    if mode != "full_broll":
        # Cap card-like nodes only — do not force width on every .clip child (breaks compositions)
        overlay_caps = f"""
  .clip .glass-card, .clip .card, .clip .plate, .clip .lower-third,
  .clip [class*="glass"], .clip [class*="bento"], .clip [class*="Card"],
  .clip [data-plate], .clip [data-synapix-plate] {{
    max-width: none !important;
    max-height: none !important;
    overflow: visible !important;
    box-sizing: border-box !important;
    white-space: normal !important;
    text-overflow: unset !important;
  }}
  .clip .glass-card *, .clip .card *, .clip .plate *,
  .clip [data-plate] *, .clip [data-synapix-plate] * {{
    overflow: visible !important;
    white-space: normal !important;
    text-overflow: unset !important;
    overflow-wrap: normal !important;
    word-break: normal !important;
  }}
  /* Soft default for a single absolute card without plate class */
  .clip > div[style*="position"][style*="absolute"] {{
    overflow: visible;
    box-sizing: border-box;
  }}
"""

    return f"""<style data-synapix-proportional="1">
.clip, #root {{ container-type: size; }}
.clip {{
  position: absolute; inset: 0; width: 100%; height: 100%;
  {tokens}
}}
{overlay_caps}
</style>
"""


def validate_and_fix_html(html: str, start_time: float, duration: float) -> str:
    """Validates generated HTML code and injects essential GSAP/clip boilerplate if missing."""
    if not html:
        return html

    fixed = _rewrite_viewport_units(html)

    # 1. Check if window.__timelines["main"] registration exists
    if "__timelines" not in fixed or '["main"]' not in fixed:
        logger.info("⚠️ GSAP window.__timelines['main'] registration missing. Injecting fallback timeline setup.")
        timeline_inject = """
<script>
  window.__timelines = window.__timelines || {};
  if (!window.__timelines["main"] && window.gsap) {
    const tl = gsap.timeline({ paused: true });
    window.__timelines["main"] = tl;
    // Auto-animate direct children of .clip if timeline is empty
    const clipEl = document.querySelector('.clip');
    if (clipEl && clipEl.children.length > 0) {
      tl.fromTo(clipEl.children, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out" }, 0.1);
      tl.to(clipEl.children, { opacity: 0, y: -20, duration: 0.4, ease: "power2.in" }, Math.max(0.5, """ + str(duration - 0.5) + """));
    }
  }
</script>
"""
        fixed += "\n" + timeline_inject.strip()

    return fixed


def clean_html_fragment(
    raw_html: str,
    start_time: float,
    duration: float,
    mode: str = "overlay",
    aspect_ratio: str = "9:16",
    look: dict | None = None,
) -> str:
    """Cleans HTML fragment to be embedded inside Remotion/Hyperframes root container cleanly without losing CDN scripts or styles."""
    html = raw_html.strip()
    if not html:
        return ""

    html = _rewrite_viewport_units(html)
    if mode != "full_broll":
        html = re.sub(r'overflow(?:-x|-y)?\s*:\s*hidden', 'overflow: visible', html, flags=re.I)
        html = re.sub(r'\boverflow-hidden\b', '', html)
        html = re.sub(r'\btruncate\b', '', html)

    # 1. Extract all external script tags (e.g. GSAP, Three.js, Tailwind, Lottie, Google Fonts)
    scripts = re.findall(r'<script[^>]*src=[\'"][^\'"]+[\'"][^>]*>\s*</script>', html, re.DOTALL | re.IGNORECASE)

    # 2. Extract inline styles
    styles = re.findall(r'<style.*?>.*?</style>', html, re.DOTALL | re.IGNORECASE)

    # 3. Extract body content or strip outer document tags
    body_match = re.search(r'<body.*?>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    if body_match:
        body_content = body_match.group(1).strip()
    else:
        body_content = re.sub(r'<!doctype.*?>|<html.*?>|</html>|<head.*?>.*?</head>|<body.*?>|</body>', '', html, flags=re.DOTALL | re.IGNORECASE).strip()

    # Combine scripts, styles and body content
    script_str = "\n".join(scripts)
    style_str = "\n".join(styles)
    
    # If mode is overlay, inject transparent background override so giant solid dark boxes never obscure the video!
    transparency_override = ""
    if mode != "full_broll":
        transparency_override = "<style>\n  html, body, .clip, #root { background: transparent !important; background-color: transparent !important; }\n</style>\n"

    proportional = _proportional_tokens_css(aspect_ratio, mode=mode, look=look)

    fragment = f"{script_str}\n{style_str}\n{proportional}\n{transparency_override}{body_content}".strip()

    # Wrap in .clip if .clip is missing, or inject data-start/data-duration attributes
    if 'class="clip"' not in fragment and "class='clip'" not in fragment:
        fragment = f'<div class="clip" data-start="{start_time}" data-duration="{duration}">\n{fragment}\n</div>'
    elif 'data-start=' not in fragment:
        fragment = re.sub(
            r'<div([^>]*class=[\"\'][^\"\']*clip[^\"\']*[\"\'])',
            f'<div\\1 data-start="{start_time}" data-duration="{duration}"',
            fragment,
            flags=re.IGNORECASE
        )

    # Apply validation fixes for GSAP registration and basic animation safety
    fragment = validate_and_fix_html(fragment, start_time, duration)

    return fragment


async def generate_custom_graphics_code(
    concept_prompt: str,
    layout: str,
    aspect_ratio: str,
    start_time: float,
    duration: float,
    visual_frame_context: str = None,
    mode: str = "overlay",
    activity_step: str = None,
    scene_template: str = None,
    look: dict | None = None,
) -> Dict[str, Any]:
    """Generates custom animated HTML code based on narrative requirements, graphics mode, and layout directives."""
    logger.info(f"🎨 Graphics Developer Agent initiated for concept: '{concept_prompt}' (Mode: {mode}, Layout: {layout})")

    def _emit_progress(details: str, status: str = "running", progress: float = 0.76):
        try:
            from app.workflows import event_bus
            step = activity_step or f"GRAPHICS: {(concept_prompt or 'сцена')[:70]}"
            event_bus.emit("graphics_progress", {
                "step": step,
                "status": status,
                "details": details,
                "message": details,
                "agent": "Graphics Developer",
                "progress": progress,
            })
            event_bus.emit("log", {"message": f"🎨 {details}"})
        except Exception:
            pass

    kind = _pick_scene_kind(mode, layout, scene_template or "", concept_prompt)
    mode_ru = {
        "title": "кинетический TITLE",
        "plate": "стеклянная плашка",
        "abstract": "абстрактный акцент (Odysser)",
    }.get(kind, mode)
    _emit_progress(
        f"Пишу HTML/GSAP для «{(concept_prompt or '')[:70]}» — тип: {mode_ru}, {aspect_ratio}…",
        progress=0.74,
    )
    
    style_hint = ""
    if kind == "abstract":
        style_hint = " Optical Cut: слово + L-риски / линия, БЕЗ glass-card."
    elif kind == "plate":
        style_hint = " Компактная плашка под look, Unbounded на акценте, лицо спикера видно."

    mode_instruction = ""
    if kind == "title" or mode == "full_broll":
        is_v = "9:16" in (aspect_ratio or "").lower() or "vertical" in (aspect_ratio or "").lower() or "portrait" in (aspect_ratio or "").lower()
        hero = "var(--font-hero-916, 9cqw)" if is_v else "var(--font-hero-169, 4.4cqw)"
        mode_instruction = f"""
        - ТИП СЦЕНЫ: TITLE B-ROLL (рилс-перебивка), НЕ карточка.
        - Полностью закрой спикера: непрозрачный фон `.clip` = var(--look-field).
        - ЗАПРЕЩЕНО: glass-card, bento, lower-third, max-height 38%, плашка в углу, слово TITLE на экране.
        - Главный текст: 2–5 слов из концепта, UPPERCASE, Unbounded 900, по центру.
        - font-size: {hero}; line-height: 0.95; letter-spacing: -0.03em.
        - Одно ключевое слово — class="kinetic-accent" цвет var(--look-accent), без gold-градиента.
        - Опционально микро-лейбл сверху (tracking 0.25em, opacity 0.5).
        - GSAP: слова влетают stagger 0.08, hold, вылет за 0.45s до конца. ease power3.out / power2.in.
        """
    else:
        ar_l = (aspect_ratio or "16:9").lower()
        is_v = "9:16" in ar_l or "vertical" in ar_l or "portrait" in ar_l
        if is_v:
            size_rule = "width: 88%; max-width: 90%; max-height: 38%; padding: 3.2cqw 4cqw; font-size заголовка ~4.6cqw"
            place_rule = "сверху (top: 5%) или снизу (bottom: 7%), лицо 25–70% свободно"
        else:
            size_rule = "width: 36%; max-width: 38%; max-height: 70%; padding: 2cqw 2.4cqw; font-size заголовка ~1.9cqw"
            place_rule = "слева/справа (left/right: 5%) или снизу (bottom: 8%), центр с лицом открыт"
        if kind == "abstract":
            mode_instruction = f"""
        - ТИП СЦЕНЫ: ABSTRACT ACCENT (Optical Cut). НЕ плашка.
        - Фон `.clip` = transparent. Лицо спикера видно.
        - ЗАПРЕЩЕНО: glass-card, сплошная тёмная подложка под весь текст, bento, списки, indigo-орбы.
        - Слои отдельно: (1) L-риски по углам (2) заголовок 2–6 слов без фона (3) draw-on линия var(--look-accent) (4) опционально chip-ключ.
        - data-plate="1" на `.abs-copy` (текстовый кластер), не на орб.
        - ПОЗИЦИЯ: {place_rule}. Лицо 25–70% свободно.
        - GSAP поэлементно: геометрия → слово → underline → chip. Stagger 0.06–0.12.
        - overflow:visible. Единицы: % / cqw / cqh.
        """
        else:
            mode_instruction = f"""
        - ТИП СЦЕНЫ: ЧИСТАЯ ПЛАШКА (только цифра / имя / закон).
        - Фон `.clip` = transparent. Не закрывай весь кадр.
        - Добавь class="glass-card" или data-plate="1" на корневую плашку.
        - РАЗМЕР (строго): {size_rule}.
        - ПОЗИЦИЯ: {place_rule}.
        - СОДЕРЖИМОЕ: 1 заголовок + 1 ключ + опционально 1 геометрическая метка.
        - ЗАПРЕЩЕНО: списки, bento, шаги, абзацы, графики, 2+ карточки.
        - Единицы: только % / cqw / cqh.
        """


    user_input = f"""
    РАЗРАБОТАЙ КОД ДЛЯ ВИЗУАЛЬНОЙ СЦЕНЫ:
    - Концепт/Описание: "{concept_prompt}"{style_hint}
    - Режим графики (Mode): "{mode}"
    {mode_instruction}
    - Разметка экрана (Layout): "{layout}" (если 'split', сдвинь все в нижнюю половину экрана)
    - Формат кадра (Aspect Ratio): "{aspect_ratio}"
    - Время начала (Start Time): {start_time}s
    - Длительность (Duration): {duration}s
    - КРИТИЧНО: размеры пропорциональны формату (%/cqw). Одна и та же плашка должна выглядеть сбалансированно и в 16:9, и в 9:16.
    """
    
    if visual_frame_context:
        user_input += f"\n    - Визуальный контекст кадра (VLM / Говорящая голова): \"{visual_frame_context}\"\n"
        
    user_input += "\nСобери сцену поэлементно (геометрия, слово, акцент). GSAP вход/выход. Без Tailwind-простыни."
    from app.services.content_look import graphics_look_brief
    look_brief = graphics_look_brief(look)
    system_prompt = GRAPHICS_DEVELOPER_PROMPT + "\n" + look_brief
    
    try:
        _emit_progress("Жду ответ Graphics LLM (вёрстка + анимация)…", progress=0.78)
        response = await invoke_graphics_llm(system_prompt, user_input)
        content = response.content if hasattr(response, 'content') else str(response)
        _emit_progress("Разбираю HTML/GSAP и нормализую размеры под формат…", progress=0.82)
        
        # 1. Try standard JSON parsing first
        parsed_obj = None
        try:
            parsed = parse_json_blocks_from_text(content)
            if parsed and isinstance(parsed[0], dict) and "html_content" in parsed[0]:
                parsed_obj = parsed[0]
        except Exception:
            pass

        # 2. If standard JSON failed, use robust extraction
        html_code = ""
        explanation = "Анимационная сцена сгенерирована ИИ."
        if parsed_obj:
            html_code = parsed_obj.get("html_content", "")
            explanation = parsed_obj.get("explanation", explanation)
        else:
            html_code = extract_robust_html(content)
            exp_m = re.search(r'"explanation"\s*:\s*"(.*?)"', content, re.DOTALL)
            if exp_m:
                explanation = exp_m.group(1).replace('\\"', '"')

        if not html_code:
            raise ValueError("Could not extract any valid HTML code block from LLM output")

        # Fullscreen must be a title plate, not a leftover glass card
        if kind == "title" and re.search(r"glass-card", html_code, re.I):
            if not re.search(r"kinetic-hero|kinetic-accent|font-hero", html_code, re.I):
                logger.info("Fullscreen HTML looked like an overlay card — using kinetic title fallback")
                html_code = _kinetic_title_fallback(concept_prompt, start_time, duration, aspect_ratio, look=look)
        elif kind == "abstract" and (
            _overlay_is_overloaded(html_code) or re.search(r"glass-card", html_code, re.I)
        ):
            logger.info("Abstract scene fell back to Optical Cut accent (busy or plate-like HTML)")
            html_code = _abstract_accent_fallback(concept_prompt, start_time, duration, aspect_ratio, layout, look=look)
        elif kind == "plate" and _overlay_is_overloaded(html_code):
            logger.info("Overlay HTML too busy — using clean headline+key fallback")
            html_code = _clean_overlay_fallback(concept_prompt, start_time, duration, aspect_ratio, layout, look=look)

        # 3. Clean and normalize HTML fragment for hyperframes engine
        cleaned_html = clean_html_fragment(
            html_code, start_time, duration, mode=mode, aspect_ratio=aspect_ratio, look=look
        )
        
        logger.info(f"⚡ Graphics Developer: Successfully extracted and cleaned HTML scene ({len(cleaned_html)} chars)")
        _emit_progress(f"Код сцены собран ({len(cleaned_html)} символов): {explanation}", progress=0.85)
        return {
            "html_content": cleaned_html,
            "explanation": explanation,
            "design_aspect": aspect_ratio,
        }
    except Exception as e:
        logger.error(f"⚠️ Graphics Developer code generation failed: {e}")
        _emit_progress(f"LLM не ответил корректно — ставлю fallback. ({e})", status="running", progress=0.83)
        if kind == "title" or mode == "full_broll":
            fallback_html = _kinetic_title_fallback(concept_prompt, start_time, duration, aspect_ratio, look=look)
            explanation = "Кинетический TITLE на весь кадр (fallback)"
        elif kind == "abstract":
            fallback_html = _abstract_accent_fallback(concept_prompt, start_time, duration, aspect_ratio, layout, look=look)
            explanation = "Optical Cut: слово + риски"
        else:
            fallback_html = _clean_overlay_fallback(concept_prompt, start_time, duration, aspect_ratio, layout, look=look)
            explanation = "Чистая плашка: заголовок + ключ"
        return {
            "html_content": clean_html_fragment(
                fallback_html, start_time, duration, mode=mode, aspect_ratio=aspect_ratio, look=look
            ),
            "explanation": explanation,
            "design_aspect": aspect_ratio,
        }

