"""DaVinci Resolve–inspired subtitle looks (Text+, boxed, glow, karaoke, lower-third).

Fusion .setting / DRFX cannot be imported. These presets recreate the pack
language for add_subtitles + ASS export.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

RESOLVE_SUBTITLE_PACK: Dict[str, Dict[str, Any]] = {
    "resolve_stacked": {
        "look": "stacked",
        "font": "Montserrat-ExtraBold",
        "font_pairing": "Lobster",
        "font_size": 72,
        "font_color": "#FFFFFF",
        "accent_color": "#FFD000",
        "text_case": "Sentence_Case",
        "use_outline": False,
        "use_shadow": False,
        "shadow_blur": 0,
        "animation_style": "weave",
        "outline_width": 0,
        "max_words": 5,
        "border_style": 1,
        "outline_px": 4,
    },
    "resolve_dropcap": {
        "look": "dropcap",
        "font": "Montserrat-ExtraBold",
        "font_pairing": "Marck Script",
        "font_size": 68,
        "font_color": "#FFFFFF",
        "accent_color": "#FF2D95",
        "text_case": "UPPER",
        "use_outline": True,
        "use_shadow": True,
        "shadow_blur": 18,
        "animation_style": "pop",
        "outline_width": 0.06,
        "max_words": 6,
        "border_style": 1,
        "outline_px": 4,
    },
    "resolve_classic": {
        "look": "outline",
        "font": "Montserrat-ExtraBold",
        "font_size": 72,
        "font_color": "#FFFFFF",
        "accent_color": "#FACC15",
        "text_case": "UPPER",
        "use_outline": True,
        "use_shadow": False,
        "shadow_blur": 0,
        "animation_style": "pop",
        "outline_width": 0.1,
        "border_style": 1,
        "outline_px": 5,
    },
    "resolve_boxed": {
        "look": "boxed",
        "font": "Montserrat-ExtraBold",
        "font_size": 64,
        "font_color": "#FFFFFF",
        "accent_color": "#FACC15",
        "text_case": "UPPER",
        "use_outline": False,
        "use_shadow": False,
        "shadow_blur": 0,
        "animation_style": "slide_up",
        "box_color": "rgba(0,0,0,0.78)",
        "border_style": 3,
        "outline_px": 12,
    },
    "resolve_cinema": {
        "look": "cinema",
        "font": "Inter",
        "font_size": 58,
        "font_color": "#F5F5F7",
        "accent_color": "#F2E16A",
        "text_case": "Sentence_Case",
        "use_outline": False,
        "use_shadow": True,
        "shadow_blur": 22,
        "animation_style": "fade",
        "border_style": 1,
        "outline_px": 0,
    },
    "resolve_neon": {
        "look": "neon",
        "font": "Montserrat-ExtraBold",
        "font_size": 68,
        "font_color": "#FFFFFF",
        "accent_color": "#00E5FF",
        "text_case": "UPPER",
        "use_outline": False,
        "use_shadow": True,
        "shadow_blur": 28,
        "animation_style": "glow",
        "border_style": 1,
        "outline_px": 2,
        "outline_color": "#00E5FF",
    },
    "resolve_karaoke": {
        "look": "karaoke",
        "font": "Montserrat-ExtraBold",
        "font_size": 70,
        "font_color": "#FFFFFF",
        "accent_color": "#FACC15",
        "text_case": "UPPER",
        "use_outline": True,
        "use_shadow": False,
        "shadow_blur": 0,
        "animation_style": "karaoke",
        "inactive_opacity": 0.4,
        "active_scale": 1.18,
        "outline_width": 0.07,
        "border_style": 1,
        "outline_px": 4,
    },
    "resolve_bar": {
        "look": "bar",
        "font": "Manrope",
        "font_size": 56,
        "font_color": "#F5F7FA",
        "accent_color": "#FACC15",
        "text_case": "Sentence_Case",
        "use_outline": False,
        "use_shadow": True,
        "shadow_blur": 14,
        "animation_style": "slide_up",
        "underline": True,
        "border_style": 1,
        "outline_px": 0,
    },
    "resolve_pill": {
        "look": "pill",
        "font": "Montserrat-ExtraBold",
        "font_size": 54,
        "font_color": "#FFFFFF",
        "accent_color": "#6366F1",
        "text_case": "UPPER",
        "use_outline": False,
        "use_shadow": False,
        "shadow_blur": 0,
        "animation_style": "pop",
        "box_color": "rgba(12,12,20,0.82)",
        "border_style": 3,
        "outline_px": 10,
    },
    "resolve_minimal": {
        "look": "minimal",
        "font": "Inter",
        "font_size": 48,
        "font_color": "#FFFFFF",
        "accent_color": "#A1A1AA",
        "text_case": "Sentence_Case",
        "use_outline": False,
        "use_shadow": True,
        "shadow_blur": 10,
        "animation_style": "fade",
        "border_style": 1,
        "outline_px": 0,
    },
}


def get_resolve_subtitle_preset(preset_id: Optional[str]) -> Dict[str, Any]:
    if preset_id and preset_id in RESOLVE_SUBTITLE_PACK:
        return dict(RESOLVE_SUBTITLE_PACK[preset_id])
    return dict(RESOLVE_SUBTITLE_PACK["resolve_classic"])


def preset_to_subtitle_fields(preset_id: Optional[str]) -> Dict[str, Any]:
    p = get_resolve_subtitle_preset(preset_id)
    fields = {
        "subtitle_preset": preset_id or "resolve_classic",
        "caption_look": p["look"],
        "font": p["font"],
        "font_size": p["font_size"],
        "font_color": p["font_color"],
        "accent_color": p["accent_color"],
        "text_case": p["text_case"],
        "use_outline": p["use_outline"],
        "use_shadow": p["use_shadow"],
        "shadow_blur": p["shadow_blur"],
        "animation_style": p["animation_style"],
        "inactive_opacity": p.get("inactive_opacity"),
        "active_scale": p.get("active_scale"),
        "box_color": p.get("box_color"),
        "outline_width": p.get("outline_width"),
        "font_pairing": p.get("font_pairing"),
        "max_words": p.get("max_words"),
    }
    return {k: v for k, v in fields.items() if v is not None}


def split_dropcap_layout(words: list[str]) -> Dict[str, Any]:
    """Giant script initial + uppercase body lines + optional pink flourish on the last word."""
    cleaned = [str(w).strip() for w in words if str(w).strip()]
    if not cleaned:
        return {"drop": "", "lines": [], "flourish": ""}

    first = cleaned[0]
    drop = first[0]
    body: list[str] = []
    rest_first = first[1:]
    if rest_first:
        body.append(rest_first.upper())
    body.extend(w.upper() for w in cleaned[1:])

    flourish = ""
    if len(cleaned) >= 3 and body:
        flourish = body.pop().lower()

    lines: list[list[str]] = []
    if not body:
        return {"drop": drop, "lines": lines, "flourish": flourish}
    if len(body) <= 2:
        lines.append(body)
    elif len(body) <= 4:
        lines.append(body[:2])
        lines.append(body[2:])
    else:
        lines.append(body[:2])
        lines.append(body[2:4])
        lines.append(body[4:])
    return {"drop": drop, "lines": lines, "flourish": flourish}
