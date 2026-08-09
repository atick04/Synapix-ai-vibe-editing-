import logging
import json
import re
from typing import Dict, Any
from app.agents.base_agent import invoke_graphics_llm
from app.workflows.json_sanitizer import parse_json_blocks_from_text, safe_json_loads

logger = logging.getLogger(__name__)

GRAPHICS_DEVELOPER_PROMPT = """Ты — ведущий Motion Designer, Art Director и UI Designer в студии Synapix AI.
Ты создаёшь КИНЕМАТОГРАФИЧЕСКИЕ ГРАФИЧЕСКИЕ ОВЕРЛЕИ для видеоконтента уровня Apple / Vox / MrBeast.
Технологии (HTML, CSS, GSAP, SVG) — это инструменты реализации твоих дизайнерских решений.
НЕ думай категориями HTML-компонентов. Думай категориями ВИЗУАЛЬНОЙ КОММУНИКАЦИИ.

---
## DESIGN TOKENS — ОБЯЗАТЕЛЬНЫЕ ПЕРЕМЕННЫЕ

```css
/* ЦВЕТА */
--bg-glass:      rgba(12, 12, 20, 0.72);
--bg-glass-2:    rgba(255, 255, 255, 0.04);
--border-glass:  rgba(255, 255, 255, 0.12);
--accent-blue:   #6366F1;   /* основной */
--accent-cyan:   #00E5FF;   /* энергичный */
--accent-gold:   #FACC15;   /* TikTok-выделение */
--accent-purple: #A855F7;   /* премиум */
--accent-green:  #22C55E;   /* успех, рост */
--text-primary:  #F5F7FA;
--text-secondary: rgba(245, 247, 250, 0.55);

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

### Full-screen graphic B-roll
- Контейнер `.clip` = 100% × 100%. Внутренние карточки: 16:9 → до 42% ширины каждая; 9:16 → 88% ширины, стек `flex-col gap: 2.5cqh`.

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

3. **КРИТИЧЕСКОЕ ПРАВИЛО: ЗАПРЕТ ОБРЕЗАНИЯ КАРТОЧЕК СНИЗУ**:
   - Нижнее якорение: `bottom: 8%` (не `top: 68%`).
   - `max-height` по таблице выше; `box-sizing: border-box`.
   - ЗАПРЕЩЕНО: `vw`, `vh`, `vmin`, `vmax` — они ломают масштаб в превью.


---
## ОБЯЗАТЕЛЬНЫЕ CDN (ВСЕГДА ПОДКЛЮЧАЙ)

```html
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
```

---
## 5 ТИПОВ КАРТОЧЕК — ВЫБИРАЙ ПОД КОНЦЕПТ

### 1. GLASSMORPHISM CARD (основная карточка)
```css
.glass-card {
  background: rgba(12, 12, 20, 0.72);
  backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.55);
  overflow: hidden;
}
/* Верхняя светящаяся полоса */
.glass-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #6366F1, #00E5FF, transparent);
}
```

### 2. BIG STAT CALLOUT (большая анимированная цифра)
```html
<div class="stat-value" id="stat-num">0</div>  <!-- GSAP countup -->
<div class="stat-bar"><div class="stat-bar-fill" id="bar"></div></div>
```
```css
.stat-value {
  font-family: 'Unbounded', sans-serif; font-size: var(--font-stat-169, 4.2cqw); font-weight: 900;
  background: linear-gradient(135deg, #FFFFFF 30%, #6366F1 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.stat-bar { height: 6px; background: rgba(255,255,255,0.1); border-radius: 999px; overflow: hidden; }
.stat-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #6366F1, #00E5FF);
  box-shadow: 0 0 12px rgba(0,229,255,0.5); }
```
```javascript
// GSAP countup
gsap.to({ val: 0 }, { val: TARGET_NUM, duration: 1.8, ease: "power2.out", delay: 0.4,
  onUpdate: function() { document.getElementById("stat-num").textContent = Math.round(this.targets()[0].val); } });
gsap.to("#bar", { width: "78%", duration: 1.5, ease: "power2.out", delay: 0.5 });
```

### 3. KINETIC TYPOGRAPHY (кинетический леттеринг)
```css
.kinetic-hero { font-family: 'Unbounded', sans-serif; font-size: var(--font-hero-169, 3.2cqw); font-weight: 900; line-height: 1.05; color: #F5F7FA; }
.kinetic-accent {
  background: linear-gradient(135deg, #FACC15 0%, #F59E0B 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 20px rgba(250,204,21,0.4));
}
```

### 4. LOWER THIRD (плашка-тайтл)
```css
.lower-third {
  position: absolute; bottom: 8%; left: 6%;
  background: rgba(10, 10, 18, 0.85); backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.1); border-left: 4px solid #6366F1;
  border-radius: 0 14px 14px 0; padding: 18px 28px;
}
.lt-name { font-family: 'Inter', sans-serif; font-size: var(--font-title-169, 1.9cqw); font-weight: 700; color: #F5F7FA; }
.lt-role { font-family: 'Inter', sans-serif; font-size: var(--font-body-169, 1.25cqw); color: rgba(245,247,250,0.60); }
```

### 5. PROCESS STEPS (список шагов)
```css
.step-num { font-family: 'Unbounded'; font-size: 2cqw; font-weight: 900; color: #6366F1; min-width: 3cqw; }
.step-text { font-family: 'Inter'; font-size: var(--font-body-169, 1.25cqw); font-weight: 500; color: #F5F7FA; }
.step-divider { height: 1px; background: rgba(255,255,255,0.08); }
```

---
## GSAP СИНХРОНИЗАЦИЯ — ОБЯЗАТЕЛЬНО

```javascript
// ОБЯЗАТЕЛЬНО в каждой сцене:
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines["main"] = tl;

// Вход карточки (стандарт)
tl.fromTo("#card",
  { opacity: 0, y: 60, scale: 0.88, rotateX: 12 },
  { opacity: 1, y: 0, scale: 1, rotateX: 0, duration: 0.75, ease: "back.out(1.4)" }, 0.1
);
// Выход карточки (за 0.5s до конца сцены)
tl.to("#card", { opacity: 0, y: -40, scale: 0.94, duration: 0.45, ease: "power2.in" }, DURATION - 0.6);

// Stagger для нескольких элементов
tl.fromTo(".item",
  { opacity: 0, y: 40 },
  { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "power3.out" }, 0.2
);

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
- `mode="full_broll"`  → весь экран, закрывает видео полностью, тёмный градиентный фон

---
## МАППИНГ: КОНЦЕПТ → ШАБЛОН

| Концепт | Шаблон |
|---|---|
| "рост на X%" / цифра | Stat Callout + progress bar |
| "3 шага / причины" | Process Steps Card |
| "имя / должность" | Lower Third |
| "главная мысль" | Kinetic Typography |
| "сравнение A vs B" | Bento 2 карточки |
| "объяснение концепции" | Full-screen Bento |
| "статистика / данные" | Stat + SVG chart |
| "хронология / шаги" | SVG Timeline |
| "цитата" | Quote Card + accent border |

---
## АНТИ-ПАТТЕРНЫ — НИКОГДА

❌ Белый или светлый фон карточки (только тёмный rgba)
❌ font-family: Arial (только Inter / Unbounded / Manrope)
❌ font-size через vw/vh (ломает пропорции при смене формата и в iframe-превью)
❌ Гигантская overlay-плашка (>42% ширины в 16:9 или >92% в 9:16)
❌ GSAP без window.__timelines["main"] — рендер сломается
❌ Использование `top: 68%` или фиксированного отступа сверху, из-за которого нижняя часть плашки уходит за нижнюю границу экрана
❌ Выход элементов за Safe Area (`bottom < 6%` или `top < 4%`)
❌ Перекрытие зоны лица (25%-70% высоты)
❌ Более 3 акцентных цветов в одной сцене
❌ Анимации без ease параметра
❌ Статичные элементы без анимации входа/выхода

---
## SELF-REVIEW ПЕРЕД ОТПРАВКОЙ

✔ Карточка гарантированно вмещается на 100% по высоте (отступ от нижнего края `bottom: 8%`, ни одна строка текста не обрезана)
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


def _rewrite_viewport_units(css_or_html: str) -> str:
    """Map vw/vh/vmin/vmax → cqw/cqh so sizes track the design canvas, not the iframe chrome."""
    out = css_or_html
    out = re.sub(r'(\d+(?:\.\d+)?)vw\b', r'\1cqw', out, flags=re.IGNORECASE)
    out = re.sub(r'(\d+(?:\.\d+)?)vh\b', r'\1cqh', out, flags=re.IGNORECASE)
    out = re.sub(r'(\d+(?:\.\d+)?)vmin\b', r'\1cqw', out, flags=re.IGNORECASE)
    out = re.sub(r'(\d+(?:\.\d+)?)vmax\b', r'\1cqh', out, flags=re.IGNORECASE)
    return out


def _proportional_tokens_css(aspect_ratio: str, mode: str = "overlay") -> str:
    """Inject design tokens + plate caps so 16:9 / 9:16 stay visually balanced."""
    ar = (aspect_ratio or "16:9").lower().replace(" ", "")
    is_vertical = ar in ("9:16", "vertical", "portrait", "shorts", "reels") or "9:16" in ar
    if is_vertical:
        tokens = """
  --font-hero-169: 3.2cqw; --font-title-169: 1.9cqw; --font-stat-169: 4.2cqw; --font-body-169: 1.25cqw;
  --font-hero-916: 7.2cqw; --font-title-916: 4.6cqw; --font-stat-916: 9.5cqw; --font-body-916: 2.8cqw;
  --plate-max-w: 90%; --plate-max-h: 38%; --plate-pad: 3.2cqw 4cqw;
"""
    else:
        tokens = """
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
    max-width: min(100%, var(--plate-max-w)) !important;
    max-height: min(100%, var(--plate-max-h)) !important;
    box-sizing: border-box !important;
  }}
  /* Soft default for a single absolute card without plate class */
  .clip > div[style*="position"][style*="absolute"] {{
    max-width: min(100%, var(--plate-max-w));
    max-height: min(100%, var(--plate-max-h));
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
    aspect_ratio: str = "16:9",
) -> str:
    """Cleans HTML fragment to be embedded inside Remotion/Hyperframes root container cleanly without losing CDN scripts or styles."""
    html = raw_html.strip()
    if not html:
        return ""

    html = _rewrite_viewport_units(html)

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

    proportional = _proportional_tokens_css(aspect_ratio, mode=mode)

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

    mode_ru = {
        "overlay": "стеклянная плашка",
        "full_broll": "полноэкранный графический B-roll",
        "split": "split-layout",
    }.get(mode, mode)
    _emit_progress(
        f"Пишу HTML/GSAP для «{(concept_prompt or '')[:70]}» — тип: {mode_ru}, {aspect_ratio}…",
        progress=0.74,
    )
    
    style_hint = ""
    try:
        from app.services.clip_service import _init_clip
        model, _ = _init_clip()
        if model:
            style_hint = " ИСПОЛЬЗУЙ РАЗМЫТЫЙ СТЕКЛЯННЫЙ ФОН BENTO, АКЦЕНТНЫЙ ШРИФТ UNBOUNDED И КИНЕТИЧЕСКИЙ ВЫЛЕТ С ЭФФЕКТОМ VOX/APPLE."
    except Exception:
        pass

    mode_instruction = ""
    if mode == "full_broll":
        mode_instruction = """
        - ТИП СЦЕНЫ: ПОЛНОЭКРАННАЯ ГРАФИЧЕСКАЯ ПЕРЕБИВКА (Full-screen Graphic B-roll).
        - ЭТА СЦЕНА ДОЛЖНА ПОЛНОСТЬЮ ЗАКРЫТЬ ВИДЕОПОТОК СПИКЕРА!
        - Внутри контейнера `.clip` обязательно добавь глубокий темный градиентный фон (например, bg-gradient-to-br from-neutral-950 via-slate-900 to-indigo-950), 3D частицы Three.js или перспективную сетку, крупную типографику и Bento-карты.
        - Размеры внутренних карточек: % / cqw. В 16:9 карточка ≤42% ширины; в 9:16 ≤88% ширины.
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
        mode_instruction = f"""
        - ТИП СЦЕНЫ: КОМПАКТНАЯ СТЕКЛЯННАЯ ПЛАШКА (Floating Glass Overlay).
        - Фон `.clip` = transparent. Не закрывай весь кадр тёмным фоном.
        - Добавь class="glass-card" или data-plate="1" на корневую плашку.
        - РАЗМЕР (строго): {size_rule}.
        - ПОЗИЦИЯ: {place_rule}.
        - Единицы: только % / cqw / cqh. Запрещены vw/vh и гигантские px-шрифты (>80px в 16:9).
        - Стекло: rgba(12,12,20,0.8) + backdrop-filter: blur(24px); border-radius: 20–28px.
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
        
    user_input += "\nНапиши кастомную премиальную верстку с анимациями, используя GSAP и Tailwind CSS."
    
    try:
        _emit_progress("Жду ответ Graphics LLM (вёрстка + анимация)…", progress=0.78)
        response = await invoke_graphics_llm(GRAPHICS_DEVELOPER_PROMPT, user_input)
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

        # 3. Clean and normalize HTML fragment for hyperframes engine
        cleaned_html = clean_html_fragment(
            html_code, start_time, duration, mode=mode, aspect_ratio=aspect_ratio
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
        _emit_progress(f"LLM не ответил корректно — ставлю fallback-плашку. ({e})", status="running", progress=0.83)
        ar_l = (aspect_ratio or "16:9").lower()
        is_v = "9:16" in ar_l or "vertical" in ar_l
        top_pos = '55%' if layout == 'split' else ('6%' if is_v else '12%')
        left_pos = '50%' if is_v or layout == 'split' else '5%'
        transform = 'translateX(-50%)' if is_v or layout == 'split' else 'none'
        width = '88%' if is_v else '36%'
        max_h = '38%' if is_v else '70%'
        title_fs = '4.6cqw' if is_v else '1.9cqw'
        fallback_html = f"""
        <div class="clip" data-start="{start_time}" data-duration="{duration}">
            <div class="glass-card" data-plate="1" style="position: absolute; top: {top_pos}; left: {left_pos}; transform: {transform}; background: rgba(15, 15, 30, 0.85); border: 1px solid rgba(255, 255, 255, 0.15); backdrop-filter: blur(20px); padding: var(--plate-pad, 2cqw 2.4cqw); border-radius: 24px; text-align: left; width: {width}; max-width: var(--plate-max-w); max-height: {max_h}; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5); box-sizing: border-box;">
                <h2 style="font-size: {title_fs}; font-weight: 800; color: #ffffff; margin: 0 0 0.6em 0; font-family: 'Unbounded', sans-serif; line-height: 1.15;">{concept_prompt}</h2>
                <div style="width: 12%; height: 4px; background: #FACC15; border-radius: 2px;"></div>
            </div>
        </div>
        """
        return {
            "html_content": clean_html_fragment(
                fallback_html, start_time, duration, mode=mode, aspect_ratio=aspect_ratio
            ),
            "explanation": "Стеклянная карточка-акцент (fallback)",
            "design_aspect": aspect_ratio,
        }

