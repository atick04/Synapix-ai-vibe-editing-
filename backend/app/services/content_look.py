"""
Synapix Optical Cut — content-aware look DNA.

Not a clone of glassmorphism / indigo-gold Reels kits.
One graphic language (optical registration marks, settle motion, one accent),
five families chosen from the uploaded talking-head: light, color, room, speech.
"""

from __future__ import annotations

import json
import os
import tempfile
from typing import Any, Dict, List, Optional, Sequence, Tuple

LOOK_FAMILIES = ("ember", "frost", "signal", "ink", "raw")

# Unique Synapix accent — not TikTok gold (#FACC15) and not cyan (#00E5FF).
VOLT = "#C8F542"

FAMILIES: Dict[str, Dict[str, Any]] = {
    "ember": {
        "palette": {
            "paper": "#F3E6D4",
            "ink": "#1C120C",
            "accent": "#D0602A",
            "accent_2": "#E8B86A",
            "field": "#120C09",
            "muted": "rgba(243,230,212,0.48)",
        },
        "montage": {
            "pacing": "measured",
            "zoom_intensity": 1.12,
            "zoom_count": "low",
            "graphic_density": "low",
            "broll_bias": "metaphor",
            "subtitle_preset": "resolve_cinema",
            "lut": "warm",
            "music_mood": "warm acoustic",
            "title_count": "1-2",
        },
        "why_ru": "тёплый интерьер — графика как бумага и ржавчина, не неон",
    },
    "frost": {
        "palette": {
            "paper": "#E8EEF3",
            "ink": "#0E141A",
            "accent": "#6A8499",
            "accent_2": "#C5D4DE",
            "field": "#0A1014",
            "muted": "rgba(232,238,243,0.46)",
        },
        "montage": {
            "pacing": "sparse",
            "zoom_intensity": 1.10,
            "zoom_count": "low",
            "graphic_density": "low",
            "broll_bias": "none_unless_user",
            "subtitle_preset": "resolve_classic",
            "lut": "cold",
            "music_mood": "quiet piano",
            "title_count": "1",
        },
        "why_ru": "дневной студийный свет — мало графики, холодный LUT, тонкие линии",
    },
    "signal": {
        "palette": {
            "paper": "#F1F0E8",
            "ink": "#090B08",
            "accent": VOLT,
            "accent_2": "#8FD94A",
            "field": "#070806",
            "muted": "rgba(241,240,232,0.42)",
        },
        "montage": {
            "pacing": "punchy",
            "zoom_intensity": 1.16,
            "zoom_count": "medium",
            "graphic_density": "medium",
            "broll_bias": "user_then_metaphor",
            "subtitle_preset": "resolve_karaoke",
            "lut": "vibrant",
            "music_mood": "dark pulse",
            "title_count": "2-3",
        },
        "why_ru": "тёмный/тех кадр — volt-акцент Synapix, плотнее TITLE, караоке",
    },
    "ink": {
        "palette": {
            "paper": "#F6F1E8",
            "ink": "#101010",
            "accent": "#E8E2D6",
            "accent_2": "#8A8378",
            "field": "#0B0B0B",
            "muted": "rgba(246,241,232,0.40)",
        },
        "montage": {
            "pacing": "editorial",
            "zoom_intensity": 1.14,
            "zoom_count": "low",
            "graphic_density": "low",
            "broll_bias": "none_unless_user",
            "subtitle_preset": "resolve_minimal",
            "lut": "cinema",
            "music_mood": "sparse score",
            "title_count": "1-2",
        },
        "why_ru": "высокий контраст — огромный шрифт, почти без заливки",
    },
    "raw": {
        "palette": {
            "paper": "#F4F2EE",
            "ink": "#161412",
            "accent": "#E7E2D8",
            "accent_2": "#9A9388",
            "field": "#121110",
            "muted": "rgba(244,242,238,0.50)",
        },
        "montage": {
            "pacing": "talk",
            "zoom_intensity": 1.13,
            "zoom_count": "medium",
            "graphic_density": "minimal",
            "broll_bias": "user_first",
            "subtitle_preset": "resolve_classic",
            "lut": "cinema",
            "music_mood": "lofi",
            "title_count": "0-1",
        },
        "why_ru": "бытовая съёмка — лицо и зумы важнее плашек",
    },
}

_WARM = (
    "ламп", "warm", "beige", "sunset", "evening", "кухн", "диван", "bedroom",
    "indoor lamp", "orange light", "янтар", "вечер", "торшер", "деревян",
)
_FROST = (
    "white wall", "studio", "daylight", "office", "окно", "бел", "дневн",
    "bright room", "minimal", "чистая стена", "студи",
)
_SIGNAL = (
    "neon", "rgb", "dark room", "hoodie", "monitor", "led", "ноч", "тёмн",
    "темн", "gaming", "rgb light", "black shirt", "капюшон",
)
_INK = (
    "black and white", "high contrast", "bw ", "чб", "монохром", "editorial",
)
_RAW = (
    "messy", "handheld", "kitchen", "clutter", "bedroom mess", "casual",
    "phone", "selfie", "разброс", "handheld", "домашн",
)


def default_look(family: str = "ink") -> Dict[str, Any]:
    fam = family if family in FAMILIES else "ink"
    spec = FAMILIES[fam]
    return {
        "family": fam,
        "language": "optical_cut",
        "confidence": 0.4,
        "why": spec["why_ru"],
        "palette": dict(spec["palette"]),
        "sampled": {},
        "montage": dict(spec["montage"]),
        "graphics": {
            "marks": "ticks",
            "motion": "settle",
            "no_glass": fam != "ember",
            "glass_only_for_stats": True,
        },
    }


def _hex(rgb: Tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def _rgb_stats(pixels: Sequence[Tuple[int, int, int]]) -> Dict[str, float]:
    if not pixels:
        return {"luma": 0.45, "sat": 0.2, "warm": 0.0, "contrast": 0.2}
    n = len(pixels)
    lumas = []
    sats = []
    warm = 0.0
    for r, g, b in pixels:
        mx, mn = max(r, g, b), min(r, g, b)
        luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
        sat = ((mx - mn) / 255.0) if mx else 0.0
        lumas.append(luma)
        sats.append(sat)
        warm += (r - b) / 255.0
    lumas.sort()
    p20 = lumas[max(0, int(n * 0.2))]
    p80 = lumas[min(n - 1, int(n * 0.8))]
    return {
        "luma": sum(lumas) / n,
        "sat": sum(sats) / n,
        "warm": warm / n,
        "contrast": max(0.0, p80 - p20),
    }


def sample_video_palette(video_path: str, max_frames: int = 6) -> Dict[str, Any]:
    """Cheap FFmpeg + PIL median color. No VLM."""
    if not video_path or not os.path.exists(video_path):
        return {}
    try:
        from PIL import Image
        from app.services.vlm_service import extract_frames
    except Exception:
        return {}

    with tempfile.TemporaryDirectory() as tmp:
        frames = extract_frames(video_path, tmp, fps=0.35)
        if not frames:
            return {}
        step = max(1, len(frames) // max_frames)
        sampled_paths = frames[::step][:max_frames]
        pixels: List[Tuple[int, int, int]] = []
        median_acc = [0, 0, 0]
        used = 0
        for path in sampled_paths:
            try:
                im = Image.open(path).convert("RGB")
                im.thumbnail((96, 96))
                data = list(im.getdata())
                # skip crushed blacks / blown whites
                mid = [p for p in data if 18 < (p[0] + p[1] + p[2]) / 3 < 242]
                take = mid or data
                take = take[:: max(1, len(take) // 80)]
                if not take:
                    continue
                pixels.extend(take[:80])
                r = sum(p[0] for p in take) // len(take)
                g = sum(p[1] for p in take) // len(take)
                b = sum(p[2] for p in take) // len(take)
                median_acc[0] += r
                median_acc[1] += g
                median_acc[2] += b
                used += 1
            except Exception:
                continue
        if not used:
            return {}
        rgb = (median_acc[0] // used, median_acc[1] // used, median_acc[2] // used)
        stats = _rgb_stats(pixels)
        stats["hex"] = _hex(rgb)
        stats["rgb"] = rgb
        return stats


def _blob(scenes: Sequence[dict], transcript: str) -> str:
    bits = [transcript or ""]
    for s in scenes or []:
        bits.append(str(s.get("scene") or ""))
    return " ".join(bits).lower()


def classify_family(
    sampled: Dict[str, Any],
    scenes: Sequence[dict],
    transcript: str,
) -> Tuple[str, float, str]:
    text = _blob(scenes, transcript)
    scores = {k: 0.0 for k in LOOK_FAMILIES}

    def hit(keys: Tuple[str, ...], fam: str, w: float = 1.0) -> None:
        if any(k in text for k in keys):
            scores[fam] += w

    hit(_WARM, "ember", 1.4)
    hit(_FROST, "frost", 1.4)
    hit(_SIGNAL, "signal", 1.6)
    hit(_INK, "ink", 1.8)
    hit(_RAW, "raw", 1.3)

    luma = float(sampled.get("luma") or 0.45)
    sat = float(sampled.get("sat") or 0.2)
    warm = float(sampled.get("warm") or 0.0)
    contrast = float(sampled.get("contrast") or 0.2)

    if warm > 0.08 and luma > 0.28:
        scores["ember"] += 1.5
    if luma > 0.55 and sat < 0.22:
        scores["frost"] += 1.6
    if luma < 0.32 and sat > 0.18:
        scores["signal"] += 1.7
    if contrast > 0.38 and sat < 0.18:
        scores["ink"] += 1.5
    if 0.28 < luma < 0.55 and sat < 0.25 and contrast < 0.32:
        scores["raw"] += 0.9

    topic = text
    if any(w in topic for w in ("спорт", "игр", "код", "ai ", "стартап", "деньги", "хype", "trap")):
        scores["signal"] += 0.6
    if any(w in topic for w in ("истори", "чувств", "мам", "отношен", "душев")):
        scores["ember"] += 0.5
    if any(w in topic for w in ("урок", "обуч", "объясн", "как ")):
        scores["frost"] += 0.4

    family = max(scores, key=scores.get)
    top = scores[family]
    if top < 0.7:
        family = "ink"
        top = 0.7
    total = sum(max(0.0, v) for v in scores.values()) or 1.0
    conf = round(min(0.95, 0.35 + top / (total + 0.8)), 2)
    why = FAMILIES[family]["why_ru"]
    if sampled.get("hex"):
        why = f"{why}; кадр {sampled['hex']}"
    return family, conf, why


def tint_accent(base_hex: str, sampled_hex: str) -> str:
    """Pull family accent 35% toward footage color so it belongs to the clip."""
    def parse(h: str) -> Tuple[int, int, int]:
        h = (h or "#888888").lstrip("#")
        if len(h) < 6:
            return (136, 136, 136)
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

    a = parse(base_hex)
    b = parse(sampled_hex)
    mix = tuple(int(a[i] * 0.65 + b[i] * 0.35) for i in range(3))
    return _hex(mix)


def infer_content_look(
    video_path: str = "",
    scenes: Optional[Sequence[dict]] = None,
    transcript: str = "",
    sampled: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    scenes = list(scenes or [])
    sampled = dict(sampled or {})
    if video_path and not sampled:
        sampled = sample_video_palette(video_path)
    family, conf, why = classify_family(sampled, scenes, transcript or "")
    look = default_look(family)
    look["confidence"] = conf
    look["why"] = why
    look["sampled"] = {
        k: sampled[k]
        for k in ("hex", "luma", "sat", "warm", "contrast")
        if k in sampled
    }
    if sampled.get("hex") and family in ("ember", "frost", "raw"):
        look["palette"]["accent"] = tint_accent(look["palette"]["accent"], sampled["hex"])
    return look


def look_css_vars(look: Optional[Dict[str, Any]]) -> str:
    look = look if look and look.get("palette") else default_look()
    p = look["palette"]
    return (
        f"--look-paper:{p['paper']};--look-ink:{p['ink']};"
        f"--look-accent:{p['accent']};--look-accent-2:{p['accent_2']};"
        f"--look-field:{p['field']};--look-muted:{p['muted']};"
    )


def director_look_contract(look: Optional[Dict[str, Any]]) -> str:
    look = look if look and look.get("family") else default_look()
    m = look.get("montage") or {}
    p = look.get("palette") or {}
    fam = look.get("family", "ink")
    density = m.get("graphic_density", "low")
    titles = m.get("title_count", "1-2")
    return f"""
==== CONTENT LOOK (Optical Cut — контракт, не совет) ====
Семья: `{fam}` ({look.get("why", "")}). Язык графики: optical_cut.
Палитра: paper {p.get("paper")} / ink {p.get("ink")} / accent {p.get("accent")} / field {p.get("field")}.
Монтаж: pacing={m.get("pacing")}, zoom intensity={m.get("zoom_intensity")}, zoom_count={m.get("zoom_count")},
graphics={density}, titles на ролик: {titles}, B-roll: {m.get("broll_bias")},
субтитры `subtitle_preset`={m.get("subtitle_preset")}, цветокор `apply_color_grade` preset=`{m.get("lut")}`,
музыка: {m.get("music_mood")}.

ЖЁСТКО:
- Графика только Optical Cut: угловые регистрационные риски, волосяная линия, Unbounded, ОДИН accent из палитры.
- ЗАПРЕЩЕНО: indigo #6366F1, cyan #00E5FF, TikTok gold #FACC15, радужный glassmorphism, bounce/back.out.
- GSAP ease только power2 / power3 (settle). Не back.out.
- density=minimal/low → максимум 1 TITLE, 1 abstract, 1 idea_map если в речи есть путь/причина/vs.
- density=medium → 2–3 TITLE/abstract + до 2 карт мысли на механизм, всё равно не чаще чем раз в 6–8с.
- Зум только на ударной фразе, не чаще zoom_count. Не наезд каждые 3с.
- job=diagram → overlay `idea_map` (rail/split/stack/thesis по мысли бита). Не TITLE и не Pexels «мозг».
- broll_bias=none_unless_user → сток Pexels не ставь, только свои клипы.
- broll_bias=user_first → сначала asset_id пользователя.
- Цветокор и субтитры бери СТРОГО из этого блока, не из шаблона «cinema+gold».
"""


def graphics_look_brief(look: Optional[Dict[str, Any]]) -> str:
    look = look if look and look.get("palette") else default_look()
    p = look["palette"]
    fam = look.get("family", "ink")
    return f"""
==== SYNAPIX OPTICAL CUT / LOOK `{fam}` ====
Это НЕ Canva, НЕ glass-indigo, НЕ Odysser-орб ради орба.
Язык: регистрационные риски по углам (L-marks), 1px линия под словом, Unbounded 800/900,
accent ТОЛЬКО {p["accent"]} (accent_2 {p["accent_2"]}), текст {p["paper"]}, поле TITLE {p["field"]}.
Motion: gsap power3.out вход, power2.in выход. ЗАПРЕЩЕНО back.out / bounce / elastic.
ЗАПРЕЩЕНО: #6366F1 #00E5FF #FACC15, backdrop-filter glass как дефолт, градиентный indigo TITLE.
TITLE fullscreen: фон {p["field"]}, без слова "TITLE" на экране, без золотого градиента на слове.
IDEA MAP: overlay по мысли бита — rail справа, split (vs/причина), stack или thesis. Не TITLE, не glass-card, не лестница на весь кадр.
Overlay abstract: без glass-card. Plate (цифра) — можно тёмную плашку {p["field"]} + hairline {p["accent"]}.
CSS vars уже будут в сцене: --look-accent и т.д. Используй их.
"""


def save_look(path: str, look: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(look, f, ensure_ascii=False, indent=2)


def load_look(path: str) -> Optional[Dict[str, Any]]:
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and data.get("family") in LOOK_FAMILIES:
            return data
    except Exception:
        return None
    return None


def transcript_blob(transcript: Any) -> str:
    if not transcript:
        return ""
    if isinstance(transcript, str):
        return transcript
    if isinstance(transcript, dict):
        text = str(transcript.get("text") or "")
        if text:
            return text
        words = transcript.get("words") or []
        return " ".join(str(w.get("word") or w.get("text") or "") for w in words)
    return str(transcript)
