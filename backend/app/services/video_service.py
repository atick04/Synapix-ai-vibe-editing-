import ffmpeg
import os
import json
import subprocess
import argparse
import time
from typing import Optional, List, Dict, Any
from app.services.pexels_service import download_broll


def safe_replace(src: str, dst: str, retries: int = 10, delay: float = 0.4) -> None:
    """Replace dst with src, retrying on Windows lock errors (WinError 5 / 32).

    Browser/video players often keep ``*_rendered.mp4`` open, so a direct
    overwrite fails. Renaming the locked file aside usually works; then we
    move the new file into place.
    """
    last_err: Optional[BaseException] = None
    for attempt in range(retries):
        try:
            if os.path.exists(dst):
                aside = f"{dst}.prev.{os.getpid()}.{attempt}"
                try:
                    os.replace(dst, aside)
                except OSError:
                    # Locked for rename too — wait and retry full replace
                    aside = None
                else:
                    try:
                        os.replace(src, dst)
                        try:
                            os.remove(aside)
                        except OSError:
                            pass
                        return
                    except OSError as e:
                        last_err = e
                        # Roll rename back if we moved dst aside but failed to place src
                        try:
                            if aside and os.path.exists(aside) and not os.path.exists(dst):
                                os.replace(aside, dst)
                        except OSError:
                            pass
                        time.sleep(delay * (attempt + 1))
                        continue
            os.replace(src, dst)
            return
        except OSError as e:
            last_err = e
            winerr = getattr(e, "winerror", None)
            if winerr not in (5, 32) and not isinstance(e, PermissionError):
                # Non-lock errors: still retry a couple times on Windows sharing
                if attempt >= 2:
                    raise
            time.sleep(delay * (attempt + 1))
    raise PermissionError(
        f"Access denied replacing locked file '{dst}' (close the video preview and retry). "
        f"Last error: {last_err}"
    ) from last_err


# ASS Fontname must match the TTF *family* name (libass), not the filename.
_ASS_FONT_ALIASES = {
    "montserrat-extrabold": "Montserrat",
    "montserrat-bold": "Montserrat",
    "montserrat-semibold": "Montserrat",
    "montserrat-medium": "Montserrat",
    "montserrat": "Montserrat",
    "inter_24pt-bold": "Inter",
    "inter-bold": "Inter",
    "inter": "Inter",
    "unbounded-bold": "Unbounded",
    "unbounded": "Unbounded",
    "rubik-bold": "Rubik",
    "rubik": "Rubik",
    "manrope-bold": "Manrope",
    "manrope": "Manrope",
    "oswald-bold": "Oswald",
    "oswald": "Oswald",
    "comfortaa-bold": "Comfortaa",
    "comfortaa": "Comfortaa",
    "bebasneue-regular": "Bebas Neue",
    "bebasneue": "Bebas Neue",
    "bebas-neue": "Bebas Neue",
    "impact": "Impact",
    "arial": "Arial",
    "marckscript": "Marck Script",
    "marckscript-regular": "Marck Script",
    "marck-script": "Marck Script",
    "lobster": "Lobster",
    "lobster-regular": "Lobster",
}


def resolve_ass_font_name(font: Optional[str]) -> str:
    """Map UI/template font ids (often filenames) to ASS Fontname / family."""
    if not font:
        return "Montserrat"
    name = str(font).strip()
    if "," in name:
        name = name.split(",")[0].strip()
    name = name.replace(".ttf", "").replace(".otf", "").strip()
    key = name.lower().replace(" ", "").replace("_", "-")
    # also try with hyphen preserved from original
    key2 = name.lower().replace(" ", "-")
    return _ASS_FONT_ALIASES.get(key) or _ASS_FONT_ALIASES.get(key2) or name.replace("-", " ")


def _normalize_overlay_text(s: str) -> str:
    import re
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = re.sub(r"[^\wа-яА-ЯёЁ]+", " ", s, flags=re.UNICODE)
    return " ".join(s.lower().split())


def _ass_escape(text: str) -> str:
    return (text or "").replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}")


def _write_dropcap_ass_events(
    f,
    words: list,
    start: float,
    end: float,
    *,
    script_font: str,
    body_font: str,
    font_size_val: int,
    accent_col_ass: str,
    main_col_ass: str,
    custom_x,
    custom_y,
    anim: str,
):
    from app.services.resolve_subtitle_pack import split_dropcap_layout

    layout = split_dropcap_layout(words)
    if not layout.get("drop") and not layout.get("lines"):
        return []

    body_fs = max(42, int(font_size_val * 0.88))
    drop_fs = int(body_fs * 3.05)
    flourish_fs = int(body_fs * 1.35)
    line_h = int(body_fs * 1.08)
    drop_w = int(drop_fs * 0.58)
    extra_lines = max(0, len(layout.get("lines") or []) - 2)
    block_h = int(drop_fs * 0.9 + extra_lines * line_h + (flourish_fs * 0.25 if layout.get("flourish") else 0))
    block_w = drop_w + int(body_fs * 7.2)

    if custom_x is not None:
        cx = int((float(custom_x) / 100.0) * 1080)
        cy = int(((float(custom_y) if custom_y is not None else 78.0) / 100.0) * 1920)
        origin_x = max(40, cx - block_w // 2)
        origin_y = max(80, cy - block_h // 2)
    else:
        origin_x = 90
        origin_y = max(80, 1920 - 220 - block_h)

    start_str = format_ass_time(start)
    end_str = format_ass_time(end)
    body_x = origin_x + int(drop_fs * 0.48)
    glow = "\\blur5\\bord0\\shad0"

    drop = _ass_escape(layout.get("drop") or "")
    accent_events: list[str] = []
    if drop:
        accent_events.append(
            f"Dialogue: 2,{start_str},{end_str},Premium,,0,0,0,,"
            f"{{\\an7\\pos({origin_x},{origin_y})\\fn{script_font}\\fs{drop_fs}\\c{accent_col_ass}{glow}}}{anim}{drop}\n"
        )

    for i, line in enumerate(layout.get("lines") or []):
        text = _ass_escape(" ".join(line))
        if not text:
            continue
        is_under = i >= 2
        lx = origin_x if is_under else body_x
        ly = origin_y + int(drop_fs * 0.78) if is_under else origin_y + int(drop_fs * 0.16) + i * line_h
        f.write(
            f"Dialogue: 0,{start_str},{end_str},Premium,,0,0,0,,"
            f"{{\\an7\\pos({lx},{ly})\\fn{body_font}\\fs{body_fs}\\b1\\c&H00FFFFFF&\\bord0\\shad0}}{anim}{text}\n"
        )

    flourish = _ass_escape(layout.get("flourish") or "")
    if flourish:
        fx = origin_x + int(drop_fs * 0.55)
        fy = origin_y + int(drop_fs * 0.62)
        accent_events.append(
            f"Dialogue: 1,{start_str},{end_str},Premium,,0,0,0,,"
            f"{{\\an7\\pos({fx},{fy})\\fn{script_font}\\fs{flourish_fs}\\c{accent_col_ass}\\frz8{glow}}}{anim}{flourish}\n"
        )
    return accent_events


def _flush_dropcap_accent_ass(body_path: str, header: str, events: list) -> None:
    if not events:
        return
    accent_path = (
        body_path[:-4] + "_accent.ass"
        if body_path.lower().endswith(".ass")
        else body_path + "_accent.ass"
    )
    with open(accent_path, "w", encoding="utf-8") as af:
        af.write(header)
        af.writelines(events)


def graphic_ass_mute_windows(edits: Optional[List[Dict[str, Any]]] = None) -> List[tuple]:
    """Time windows where Remotion/HTML kinetic text should suppress ASS karaoke.

    Prevents double-drawing the same phrase (gold HTML card + white ASS outline).
    """
    GRAPHIC_ACTIONS = (
        "hyperframes_html",
        "canvas_overlay",
        "add_hyperframes_graphics",
        "add_motion_graphic",
        "add_dynamic_graphic",
    )
    windows: List[tuple] = []
    for e in edits or []:
        if e.get("action") not in GRAPHIC_ACTIONS:
            continue
        start = float(e.get("start", 0) or 0)
        end = float(e.get("end", start + 3) or (start + 3))
        if end <= start:
            continue
        html = e.get("html_content") or e.get("html") or ""
        text = e.get("text") or e.get("title") or e.get("subtext") or ""
        blob = _normalize_overlay_text(f"{text} {html}")
        # Only mute when the graphic actually carries readable copy
        if len(blob) < 4:
            continue
        windows.append((start, end, blob))
    return windows


def resolve_fonts_dir() -> Optional[str]:
    """Locate backend/fonts regardless of process cwd."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.abspath("fonts"),
        os.path.abspath(os.path.join(here, "..", "..", "fonts")),
        os.path.abspath(os.path.join(here, "..", "..", "..", "fonts")),
    ]
    for c in candidates:
        if os.path.isdir(c) and any(
            f.lower().endswith((".ttf", ".otf")) for f in os.listdir(c)
        ):
            return c
    return None


def format_ass_time(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    cents = int((seconds - int(seconds)) * 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{cents:02d}"


def remap_source_to_project(t: float, cuts: Optional[List[Dict[str, Any]]] = None) -> float:
    """Map a source-timeline timestamp onto the post-cut (project) timeline."""
    if not cuts:
        return max(0.0, float(t))
    cuts_sorted = sorted(cuts, key=lambda c: float(c.get("start", 0)))
    shift = 0.0
    t = float(t)
    for cut in cuts_sorted:
        cs = float(cut.get("start", 0))
        ce = float(cut.get("end", 0))
        if cs >= t:
            break
        shift += max(0.0, min(ce, t) - cs)
    return max(0.0, t - shift)


def segment_survives_cuts(start: float, end: float, cuts: Optional[List[Dict[str, Any]]] = None) -> bool:
    """True if any part of [start, end] remains after applying cut_out regions."""
    ps = remap_source_to_project(start, cuts)
    pe = remap_source_to_project(end, cuts)
    return pe > ps + 0.02


def projectize_edit_times(edit: Dict[str, Any], cuts: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Return a shallow copy of edit with start/end remapped to project time."""
    out = dict(edit)
    if "start" in out and out["start"] is not None:
        out["start"] = remap_source_to_project(float(out["start"]), cuts)
    if "end" in out and out["end"] is not None:
        out["end"] = remap_source_to_project(float(out["end"]), cuts)
    return out


def _looks_like_bgm_edit(ae: Dict[str, Any]) -> bool:
    if ae.get("is_bgm"):
        return True
    query = (ae.get("asset_query") or "").lower()
    if any(k in query for k in ("sfx", "whoosh", "click", "impact", "swipe", "glitch", "riser")):
        return False
    start = float(ae.get("start", -1) or -1)
    end = ae.get("end")
    return start == 0.0 and (end is None or float(end) > 8.0)


def _speech_duck_enable(
    transcript_data: Optional[dict],
    cuts: Optional[List[Dict[str, Any]]] = None,
    max_len: int = 7000,
) -> Optional[str]:
    """FFmpeg volume enable= expr covering speech windows in project time."""
    if not transcript_data:
        return None
    raw = []
    for w in (transcript_data.get("words") or []):
        s, e = w.get("start"), w.get("end")
        if s is None or e is None:
            continue
        raw.append((float(s), float(e)))
    if not raw:
        for seg in (transcript_data.get("segments") or []):
            s, e = seg.get("start"), seg.get("end")
            if s is None or e is None:
                continue
            raw.append((float(s), float(e)))
    windows = []
    for s, e in raw:
        if e <= s:
            continue
        if not segment_survives_cuts(s, e, cuts):
            continue
        ps = remap_source_to_project(s, cuts)
        pe = remap_source_to_project(e, cuts)
        if pe - ps >= 0.08:
            windows.append((ps, pe))
    if not windows:
        return None
    windows.sort()
    merged = [windows[0]]
    for s, e in windows[1:]:
        if s - merged[-1][1] <= 0.35:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    parts = [f"between(t,{s:.3f},{e:.3f})" for s, e in merged]
    expr = "+".join(parts)
    if len(expr) > max_len:
        # Keep the longest windows so the enable string stays valid
        merged.sort(key=lambda w: w[1] - w[0], reverse=True)
        parts = []
        expr = ""
        for s, e in merged:
            piece = f"between(t,{s:.3f},{e:.3f})"
            nxt = piece if not parts else expr + "+" + piece
            if len(nxt) > max_len:
                break
            parts.append(piece)
            expr = nxt
    return expr or None


def get_animation_tag(style: str) -> str:
    """Return ASS override tags for the given animation preset."""
    # All positions are in PlayRes space: 1080x1920
    styles = {
        # Simple fade in/out — universally safe
        "fade":       r"{\fad(250,200)}",
        # TikTok pop — scale from 130% + alpha, snap to normal
        "pop":        r"{\fscx130\fscy130\alpha&HFF&\t(0,300,\fscx100\fscy100\alpha&H00&)}",
        # Slide from below — works for bottom alignment (alignment=2, marginV~250)
        "slide_up":   r"{\move(540,1820,540,1670,0,400)\fad(300,80)}",
        # Bounce — overshoot scale spring
        "bounce":     r"{\fscx140\fscy140\fad(100,0)\t(0,180,\fscx90\fscy90)\t(180,320,\fscx108\fscy108)\t(320,430,\fscx98\fscy98)\t(430,520,\fscx100\fscy100)}",
        # Glow burst — blur dissolves in
        "glow":       r"{\blur30\alpha&H88&\t(0,400,\blur0\alpha&H00&)}",
        # Slide from left
        "slide_left":  r"{\move(400,1670,540,1670,0,350)\fad(250,50)}",
        # Slide from right
        "slide_right": r"{\move(680,1670,540,1670,0,350)\fad(250,50)}",
        # No animation (still karaoke word-highlight via \k tags)
        "karaoke":    "",
        "weave":      r"{\fscx125\fscy125\alpha&HFF&\t(0,280,\fscx100\fscy100\alpha&H00&)}",
    }
    return styles.get(style, styles["fade"])

def hex_to_ass_color(hex_str: str) -> str:
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 6:
        r, g, b = hex_str[0:2], hex_str[2:4], hex_str[4:6]
        return f"&H00{b}{g}{r}"
    return "&H00FFFFFF"

def color_to_ass(c: str) -> str:
    if not c:
        return "&H00FFFFFF"
    c_lower = c.lower().strip()
    color_map = {
        "white": "&H00FFFFFF",
        "yellow": "&H0000D7FF", # Gold-yellow
        "green": "&H0055FF55",
        "red": "&H005555FF",
        "cyan": "&H00FFFF00",
        "black": "&H00000000",
        "blue": "&H00FF5555"
    }
    if c_lower in color_map:
        return color_map[c_lower]
    if c.startswith("#"):
        hex_str = c.lstrip('#')
        if len(hex_str) == 6:
            r, g, b = hex_str[0:2], hex_str[2:4], hex_str[4:6]
            return f"&H00{b}{g}{r}"
        if len(hex_str) == 8:
            aa, r, g, b = hex_str[0:2], hex_str[2:4], hex_str[4:6], hex_str[6:8]
            return f"&H{aa}{b}{g}{r}"
    import re
    rgba = re.match(
        r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)",
        c_lower,
    )
    if rgba:
        r, g, b = int(rgba.group(1)), int(rgba.group(2)), int(rgba.group(3))
        a = float(rgba.group(4)) if rgba.group(4) is not None else 1.0
        aa = int((1.0 - max(0.0, min(1.0, a))) * 255)
        return f"&H{aa:02X}{b:02X}{g:02X}{r:02X}"
    return "&H00FFFFFF"

def opacity_to_ass_alpha(opacity: float) -> str:
    alpha = int((1.0 - opacity) * 255)
    alpha = min(255, max(0, alpha))
    return f"{alpha:02X}"

def generate_ass(transcript, filepath, position="center", font="Impact", font_size=110, use_outline=True, font_color="White", cuts=None, animation_style="fade", template_id=None, subtitle_edit=None, brand_id=None, mute_windows=None):
    """Generate ASS subtitle file, adjusting timing for cut_out edits and injecting animation tags."""
    from app.services.template_service import get_template
    from app.services.design_skill import DesignSkill
    cuts = sorted(cuts or [], key=lambda c: c.get('start', 0))
    mute_windows = mute_windows or []
    
    def remap_time(t):
        """Shift time t by the total duration of all cuts that start before t."""
        shift = 0.0
        for cut in cuts:
            cs, ce = cut.get('start', 0), cut.get('end', 0)
            if cs >= t:
                break
            # How much of this cut region is before t?
            shift += min(ce, t) - cs
        return max(0.0, t - shift)
    
    def in_cut(start, end):
        """Return True if the word/segment overlaps with any cut region."""
        for cut in cuts:
            cs, ce = cut.get('start', 0), cut.get('end', 0)
            if start < ce and end > cs:  # Overlap
                return True
        return False

    def muted_by_graphic(start, end, text=""):
        """Skip ASS when a Remotion/HTML graphic already shows the same words."""
        tnorm = _normalize_overlay_text(text)
        for gs, ge, gblob in mute_windows:
            if start < ge and end > gs:
                if not tnorm or not gblob:
                    return True
                # Fuzzy overlap: shared tokens or substring either way
                if tnorm in gblob or gblob in tnorm:
                    return True
                t_tokens = set(tnorm.split())
                g_tokens = set(gblob.split())
                if t_tokens and len(t_tokens & g_tokens) >= max(1, min(2, len(t_tokens))):
                    return True
        return False

    # Premium Margin and Positioning defaults
    base_font = resolve_ass_font_name(font or "Montserrat")
    try:
        validated = DesignSkill.validate_font(base_font, brand_id)
        base_font = resolve_ass_font_name(validated)
    except Exception:
        pass
    font_pairing = None
    font_size_val = font_size or 72
    text_main_color = "#FFFFFF"
    text_accent_color = "#FACC15" # Default yellow/gold
    text_case = "Sentence_Case"
    max_words = 3
    shadow_val = 3
    outline_val = 0
    border_style = 1
    underline_on = 0
    outline_col_ass = "&H00000000"
    alignment = 2
    margin_v = 180
    margin_l = 80
    margin_r = 80
    custom_x = None
    custom_y = None
    inactive_opacity = 0.45
    active_scale = 1.25
    use_aesthetic_styling = False

    if template_id:
        tpl = get_template(template_id)
        if tpl and tpl.subtitles:
            sub = tpl.subtitles
            if sub.font_management:
                use_aesthetic_styling = True
                base_font = resolve_ass_font_name(sub.font_management.base_sans_font)
                font_pairing = resolve_ass_font_name(sub.font_management.accent_serif_font) if sub.font_management.accent_serif_font else None
                font_size_val = sub.font_management.font_size_px
                
                if sub.color_palette:
                    text_main_color = sub.color_palette.text_main
                    text_accent_color = sub.color_palette.text_accent
                    
                if sub.layout:
                    text_case = sub.layout.text_case
                    max_words = sub.layout.max_words_per_screen
                    shadow_val = int(sub.layout.shadow_blur_px // 2) if sub.layout.shadow_blur_px else 3

    caption_look = None
    if subtitle_edit:
        preset_id = subtitle_edit.get("subtitle_preset")
        caption_look = subtitle_edit.get("caption_look")
        if preset_id or caption_look:
            from app.services.resolve_subtitle_pack import get_resolve_subtitle_preset
            pack = get_resolve_subtitle_preset(preset_id)
            if not caption_look:
                caption_look = pack.get("look")
            if not subtitle_edit.get("font"):
                base_font = resolve_ass_font_name(pack.get("font") or base_font)
            if not subtitle_edit.get("font_size"):
                font_size_val = int(pack.get("font_size") or font_size_val)
            if not subtitle_edit.get("font_color"):
                text_main_color = pack.get("font_color") or text_main_color
            if not subtitle_edit.get("accent_color"):
                text_accent_color = pack.get("accent_color") or text_accent_color
            if not subtitle_edit.get("text_case"):
                text_case = pack.get("text_case") or text_case
            border_style = int(pack.get("border_style") or 1)
            if pack.get("outline_px") is not None:
                outline_val = int(pack["outline_px"])
            if pack.get("underline"):
                underline_on = 1
            if pack.get("box_color"):
                outline_col_ass = color_to_ass(pack["box_color"])
            if pack.get("outline_color"):
                outline_col_ass = color_to_ass(pack["outline_color"])
            if not subtitle_edit.get("font_pairing") and pack.get("font_pairing"):
                font_pairing = resolve_ass_font_name(pack["font_pairing"])
            if not subtitle_edit.get("max_words") and pack.get("max_words"):
                max_words = int(pack["max_words"])
        if subtitle_edit.get("font"):
            base_font = resolve_ass_font_name(subtitle_edit.get("font"))
        if subtitle_edit.get("font_size"):
            font_size_val = int(subtitle_edit.get("font_size"))
        if subtitle_edit.get("font_color"):
            color_name_map = {
                "White": "#FFFFFF",
                "Yellow": "#FACC15",
                "Green": "#55FF55",
                "Red": "#FF5555",
                "Cyan": "#FFFF00"
            }
            text_main_color = color_name_map.get(subtitle_edit.get("font_color"), subtitle_edit.get("font_color"))
        if subtitle_edit.get("accent_color"):
            text_accent_color = subtitle_edit.get("accent_color")
        if subtitle_edit.get("font_pairing"):
            font_pairing = resolve_ass_font_name(subtitle_edit.get("font_pairing"))
        if subtitle_edit.get("inactive_opacity") is not None:
            inactive_opacity = float(subtitle_edit.get("inactive_opacity"))
        if subtitle_edit.get("active_scale") is not None:
            active_scale = float(subtitle_edit.get("active_scale"))
        if subtitle_edit.get("text_case"):
            text_case = subtitle_edit.get("text_case")
        if subtitle_edit.get("max_words"):
            max_words = int(subtitle_edit.get("max_words"))
            
        pos_preset = subtitle_edit.get("position") or position or "bottom"
        wants_behind = bool(
            subtitle_edit.get("behind_speaker")
            or pos_preset in ("behind_speaker", "behind")
        )
        if wants_behind or pos_preset == "center":
            # Behind-speaker / center kinetic titles sit mid-frame like preview
            alignment = 5
            margin_v = 0
        elif pos_preset == "top":
            alignment = 8
            margin_v = 200
        elif pos_preset == "bottom":
            alignment = 2
            margin_v = 180
            
        if subtitle_edit.get("x") is not None:
            custom_x = float(subtitle_edit.get("x"))
        if subtitle_edit.get("y") is not None:
            custom_y = float(subtitle_edit.get("y"))
            
        use_outline = subtitle_edit.get("use_outline", use_outline)
        look = subtitle_edit.get("caption_look") or caption_look
        if look in ("boxed", "pill"):
            border_style = 3
            outline_val = max(outline_val, 10)
            box_col = subtitle_edit.get("box_color")
            if box_col:
                outline_col_ass = color_to_ass(box_col)
        elif look == "neon":
            border_style = 1
            outline_val = max(outline_val, 2)
            outline_col_ass = color_to_ass(subtitle_edit.get("accent_color") or text_accent_color)
        elif look == "bar":
            underline_on = 1
            outline_val = 0 if not use_outline else outline_val
        elif look in ("cinema", "minimal"):
            outline_val = 0
        elif look == "dropcap":
            outline_val = 0
            shadow_val = 0
        elif look in ("outline", "karaoke", "stacked") or (look is None and use_outline):
            if look in ("outline", "karaoke", "stacked"):
                outline_val = max(outline_val, 4)
            else:
                outline_val = 3 if use_outline else outline_val
        else:
            outline_val = 3 if use_outline else outline_val
        shadow_val = 3 if subtitle_edit.get("use_shadow", True) else 0
        if subtitle_edit.get("shadow_blur") is not None:
            shadow_val = int(float(subtitle_edit.get("shadow_blur")) / 4.0)
            shadow_val = min(10, max(0, shadow_val))

    print(f"[ASS] Fontname={base_font}, size={font_size_val}, mute_windows={len(mute_windows)}")
    main_col_ass = color_to_ass(text_main_color)
    accent_col_ass = color_to_ass(text_accent_color)
    shadow_col_ass = "&H99000000"
    ass_look = caption_look
    if subtitle_edit:
        ass_look = subtitle_edit.get("caption_look") or caption_look
    if ass_look == "dropcap":
        outline_val = 0
        shadow_val = 0
        main_col_ass = "&H00FFFFFF"

    ass_header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Premium,{base_font},{font_size_val},{main_col_ass},{main_col_ass},{outline_col_ass},{shadow_col_ass},1,0,{underline_on},0,100,100,0,0,{border_style},{outline_val},{shadow_val},{alignment},{margin_l},{margin_r},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(ass_header)
        
        anim = get_animation_tag(animation_style)
        dropcap_accent_events: list[str] = []
        
        words = transcript.get("words", [])
        script_font = font_pairing or "Marck Script"

        if not words:
            segments = transcript.get("segments", [])
            for seg in segments:
                s, e = seg.get("start", 0.0), seg.get("end", 0.0)
                if in_cut(s, e):
                    continue
                text = seg.get('text', '').strip()
                if muted_by_graphic(s, e, text):
                    continue
                if ass_look == "dropcap":
                    dropcap_accent_events.extend(
                        _write_dropcap_ass_events(
                        f,
                        text.split(),
                        remap_time(s),
                        remap_time(e),
                        script_font=script_font,
                        body_font=base_font,
                        font_size_val=font_size_val,
                        accent_col_ass=accent_col_ass,
                        main_col_ass=main_col_ass,
                        custom_x=custom_x,
                        custom_y=custom_y,
                        anim=anim,
                        )
                    )
                    continue
                start = format_ass_time(remap_time(s))
                end = format_ass_time(remap_time(e))
                if text_case == "UPPER":
                    text = text.upper()
                elif text_case == "lower":
                    text = text.lower()
                elif text_case == "Sentence_Case":
                    text = text.capitalize()
                f.write(f"Dialogue: 0,{start},{end},Premium,,0,0,0,,{anim}{text}\n")
            _flush_dropcap_accent_ass(filepath, ass_header, dropcap_accent_events)
            return

        # Group words into chunks of max_words, skip cut regions
        chunks, cur_chunk = [], []
        for w in words:
            ws, we = w.get('start', 0.0), w.get('end', 0.0)
            if in_cut(ws, we):
                if cur_chunk:
                    chunks.append(cur_chunk)
                    cur_chunk = []
                continue
            cur_chunk.append(w)
            if len(cur_chunk) == max_words:
                chunks.append(cur_chunk)
                cur_chunk = []
        if cur_chunk:
            chunks.append(cur_chunk)
            
        for chunk in chunks:
            chunk_text = " ".join(w.get("word", "") for w in chunk)
            chunk_start = chunk[0].get("start", 0.0)
            chunk_end = chunk[-1].get("end", 0.0)
            if muted_by_graphic(chunk_start, chunk_end, chunk_text):
                continue
            if ass_look == "dropcap":
                dropcap_accent_events.extend(
                    _write_dropcap_ass_events(
                    f,
                    [w.get("word", "") for w in chunk],
                    remap_time(chunk_start),
                    remap_time(chunk_end),
                    script_font=script_font,
                    body_font=base_font,
                    font_size_val=font_size_val,
                    accent_col_ass=accent_col_ass,
                    main_col_ass=main_col_ass,
                    custom_x=custom_x,
                    custom_y=custom_y,
                    anim=anim,
                    )
                )
                continue
            # Build Dialogue line for each word being active in the chunk
            for active_i, active_w in enumerate(chunk):
                w_start = remap_time(active_w.get('start', 0.0))
                # Active word highlighting displays until the next word starts
                if active_i == len(chunk) - 1:
                    w_end = remap_time(chunk[-1].get('end', 0.0))
                else:
                    w_end = remap_time(chunk[active_i + 1].get('start', 0.0))
                
                if w_start >= w_end:
                    w_end = w_start + 0.1
                
                # Build styled text line for this state
                text_line = ""
                for i, w in enumerate(chunk):
                    word_str = w.get('word', '').strip()
                    
                    if text_case == "Sentence_Case":
                        if i == 0:
                            word_str = word_str.capitalize()
                        else:
                            word_str = word_str.lower()
                    elif text_case == "UPPER":
                        word_str = word_str.upper()
                    elif text_case == "lower":
                        word_str = word_str.lower()
                    
                    is_active = (i == active_i)
                    
                    w_font_size = font_size_val
                    if is_active:
                        w_font_size = int(font_size_val * active_scale)
                    
                    w_color = accent_col_ass if is_active else main_col_ass
                    w_alpha_tag = ""
                    if not is_active and inactive_opacity < 1.0:
                        w_alpha_tag = f"\\1a{opacity_to_ass_alpha(inactive_opacity)}&"
                    
                    # Font pairing
                    w_font = base_font
                    is_accent_word = False
                    if len(chunk) == 3:
                        is_accent_word = (i == 1)
                    elif len(chunk) == 2:
                        is_accent_word = (i == 1)
                    elif len(chunk) == 4:
                        is_accent_word = (i == 1 or i == 2)
                    elif len(chunk) > 4:
                        is_accent_word = (i == 1 or i == 3)
                        
                    if is_accent_word and font_pairing:
                        w_font = font_pairing
                    
                    tags = f"\\fn{w_font}\\fs{w_font_size}\\c{w_color}{w_alpha_tag}"
                    text_line += f"{{{tags}}}{word_str} "
                
                start_str = format_ass_time(w_start)
                end_str = format_ass_time(w_end)
                
                pos_tag = ""
                if custom_x is not None and custom_y is not None:
                    posX = int((custom_x / 100.0) * 1080)
                    posY = int((custom_y / 100.0) * 1920)
                    pos_tag = f"\\pos({posX},{posY})"
                
                f.write(f"Dialogue: 0,{start_str},{end_str},Premium,,0,0,0,,{{{pos_tag}}}{anim}{text_line.strip()}\n")
        _flush_dropcap_accent_ass(filepath, ass_header, dropcap_accent_events)

def extract_audio(video_path: str, output_audio_path: str) -> str:
    try:
        stream = ffmpeg.input(video_path)
        stream = ffmpeg.output(stream, output_audio_path, acodec='libmp3lame', q=4)
        ffmpeg.run(stream, overwrite_output=True, quiet=True)
        return output_audio_path
    except ffmpeg.Error as e:
        print(f"FFmpeg audio extraction error: {e.stderr.decode('utf8') if e.stderr else str(e)}")
        return ""


def apply_zoom(input_path: str, output_path: str, zoom_type: str,
               start: float, end: float, original_duration: float,
               intensity: float = 1.14) -> bool:
    """
    Smooth zoom via FFmpeg zoompan (ease in → settle), avoiding hard cut at segment end.
    zoom_in / punch: scale rises then returns to 1.0 before the edit ends.
    zoom_hold: soft ramp in, hold peak, soft ramp out.
    zoom_out: ease from peak back to 1.0.
    """
    try:
        before_out = output_path.replace('.mp4', '_z_before.mp4')
        seg_out = output_path.replace('.mp4', '_z_seg.mp4')
        after_out = output_path.replace('.mp4', '_z_after.mp4')
        list_file = output_path.replace('.mp4', '_z_list.txt')

        peak = max(1.05, min(1.35, float(intensity or 1.14)))
        dur = max(0.2, float(end) - float(start))
        # Probe fps for zoompan d=frames
        fps = 30.0
        try:
            pr = subprocess.run(
                ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                 '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', input_path],
                capture_output=True, text=True, timeout=15,
            )
            if pr.returncode == 0 and pr.stdout.strip():
                a, b = pr.stdout.strip().split('/')
                fps = float(a) / float(b or 1)
        except Exception:
            pass
        frames = max(2, int(round(dur * fps)))

        # Expression: normalized progress p = on/(n-1); punch envelope then scale
        # z = 1 + (peak-1)*env ; env rises 0..0.55 then falls
        peak_s = f"{peak:.4f}"
        if zoom_type in ("zoom_hold", "hold"):
            # Soft edges 18% each side
            z_expr = (
                f"if(lt(on/{frames},0.18),"
                f"1+({peak_s}-1)*(on/{frames})/0.18,"
                f"if(gt(on/{frames},0.82),"
                f"1+({peak_s}-1)*(1-(on/{frames}-0.82)/0.18),"
                f"{peak_s}))"
            )
        elif zoom_type == "zoom_out":
            z_expr = f"{peak_s}-({peak_s}-1)*on/{max(frames - 1, 1)}"
        else:
            # zoom_in punch: ease-ish triangle via piecewise linear (ffmpeg expr has no cubic)
            z_expr = (
                f"if(lt(on/{frames},0.55),"
                f"1+({peak_s}-1)*(on/{frames})/0.55,"
                f"1+({peak_s}-1)*(1-(on/{frames}-0.55)/0.45))"
            )

        # zoompan s= must be WxH with an 'x' — colons are option separators
        # (s=iw:ih breaks parsing: "No option name near 'ih:fps=...'").
        vf = (
            f"zoompan=z='{z_expr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d=1:s=iwxih:fps={fps:.3f},scale=trunc(iw/2)*2:trunc(ih/2)*2"
        )

        segments = []

        if start > 0.1:
            subprocess.run([
                'ffmpeg', '-i', input_path, '-ss', '0', '-to', str(start),
                '-c', 'copy', before_out, '-y', '-loglevel', 'quiet'
            ], check=True)
            segments.append(before_out)

        subprocess.run([
            'ffmpeg', '-i', input_path,
            '-ss', str(start), '-to', str(end),
            '-vf', vf,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
            '-c:a', 'aac',
            seg_out, '-y', '-loglevel', 'error'
        ], check=True)
        segments.append(seg_out)

        if end < original_duration - 0.1:
            subprocess.run([
                'ffmpeg', '-i', input_path, '-ss', str(end),
                '-c', 'copy', after_out, '-y', '-loglevel', 'quiet'
            ], check=True)
            segments.append(after_out)

        with open(list_file, 'w') as lf:
            for s in segments:
                lf.write(f"file '{os.path.abspath(s)}'\n")

        subprocess.run([
            'ffmpeg', '-f', 'concat', '-safe', '0', '-i', list_file,
            '-c', 'copy', output_path, '-y', '-loglevel', 'quiet'
        ], check=True)

        for tmp in [before_out, seg_out, after_out, list_file]:
            if os.path.exists(tmp):
                os.remove(tmp)

        print(f"[Zoom] ✅ smooth {zoom_type} applied from {start}s to {end}s (peak={peak})")
        return True
    except Exception as e:
        print(f"[Zoom] Error: {e}")
        return False


def apply_speed_ramp(input_path: str, output_path: str, start: float, end: float,
                     speed: float, original_duration: float) -> bool:
    """
    Speed up or slow down a segment using FFmpeg setpts + atempo.
    speed > 1.0 = faster, speed < 1.0 = slower.
    This approach processes the file in Python subprocess for precision.
    """
    try:
        pts_factor = round(1.0 / speed, 4)
        tempo = round(speed, 4)
        # Clamp atempo to 0.5-2.0 range
        tempo = max(0.5, min(2.0, tempo))

        # We split: before + sped segment + after, then concat
        before_out = output_path.replace('.mp4', '_sr_before.mp4')
        seg_out = output_path.replace('.mp4', '_sr_seg.mp4')
        after_out = output_path.replace('.mp4', '_sr_after.mp4')
        list_file = output_path.replace('.mp4', '_sr_list.txt')

        segments = []
        if start > 0:
            subprocess.run([
                'ffmpeg', '-i', input_path, '-ss', '0', '-to', str(start),
                '-c', 'copy', before_out, '-y', '-loglevel', 'quiet'
            ], check=True)
            segments.append(before_out)

        subprocess.run([
            'ffmpeg', '-i', input_path,
            '-ss', str(start), '-to', str(end),
            '-vf', f'setpts={pts_factor}*PTS',
            '-af', f'atempo={tempo}',
            seg_out, '-y', '-loglevel', 'quiet'
        ], check=True)
        segments.append(seg_out)

        if end < original_duration:
            subprocess.run([
                'ffmpeg', '-i', input_path, '-ss', str(end),
                '-c', 'copy', after_out, '-y', '-loglevel', 'quiet'
            ], check=True)
            segments.append(after_out)

        with open(list_file, 'w') as f:
            for s in segments:
                f.write(f"file '{os.path.abspath(s)}'\n")

        subprocess.run([
            'ffmpeg', '-f', 'concat', '-safe', '0', '-i', list_file,
            '-c', 'copy', output_path, '-y', '-loglevel', 'quiet'
        ], check=True)

        # Cleanup temp files
        for tmp in [before_out, seg_out, after_out, list_file]:
            if os.path.exists(tmp):
                os.remove(tmp)
        return True
    except Exception as e:
        print(f"[SpeedRamp] Error: {e}")
        return False

def build_drawtext_kwargs(text: str, start: float, end: float,
                           x: str = "(w-text_w)/2", y: str = "h*0.15",
                           fontsize: int = 72, color: str = "white") -> dict:
    """Build kwargs for FFmpeg drawtext filter."""
    safe_text = text.replace(":", "\\:")
    return {
        "text": safe_text,
        "fontsize": fontsize,
        "fontcolor": color,
        "x": x,
        "y": y,
        "enable": f"between(t,{start},{end})",
        "borderw": 4,
        "bordercolor": "black@0.8",
        "shadowx": 3,
        "shadowy": 3,
        "shadowcolor": "black@0.5",
        "font": "Arial",
    }

LUT_PRESETS = {
    "cinema": {"brightness": 1.0, "contrast": 1.1, "saturation": 1.1, "hue": 0},
    "vintage": {"brightness": 0.95, "contrast": 0.9, "saturation": 0.8, "hue": 5},
    "cyberpunk": {"brightness": 1.0, "contrast": 1.2, "saturation": 1.4, "hue": -10},
    "monochrome": {"brightness": 1.0, "contrast": 1.2, "saturation": 0.0, "hue": 0},
    "teal_orange": {"brightness": 1.0, "contrast": 1.1, "saturation": 1.2, "hue": 10},
    "vibrant": {"brightness": 1.0, "contrast": 1.1, "saturation": 1.3, "hue": 0},
    "cold": {"brightness": 1.0, "contrast": 1.05, "saturation": 0.9, "hue": -15},
    "warm": {"brightness": 1.05, "contrast": 1.0, "saturation": 1.1, "hue": 15}
}

def resolve_lut_path(lut_name: str, brand_id: Optional[str] = None) -> Optional[str]:
    import os
    if not lut_name:
        return None
    # If absolute or already points to uploads
    if os.path.isabs(lut_name) and os.path.exists(lut_name):
        return lut_name
    if lut_name.startswith("uploads/") and os.path.exists(lut_name):
        return lut_name
    
    names_to_try = [lut_name]
    if not lut_name.endswith(".cube"):
        names_to_try.append(lut_name + ".cube")
        
    # Try brand-specific path
    if brand_id:
        for n in names_to_try:
            brand_path = os.path.join("uploads", "brands", brand_id, "luts", n)
            if os.path.exists(brand_path):
                return brand_path
            
    # Try default brand path as fallback
    for n in names_to_try:
        default_path = os.path.join("uploads", "brands", "default", "luts", n)
        if os.path.exists(default_path):
            return default_path
        
    return None

def apply_color_corrections(stream, edits, brand_id=None):
    cc_edits = [e for e in edits if e.get("action") == "color_correction"]
    for cc in cc_edits:
        cc_start = float(cc.get("start", 0))
        cc_end = float(cc.get("end", 0))
        if cc_start >= cc_end:
            continue
            
        preset_key = cc.get("preset") or cc.get("lut") or "cinema"
        if preset_key.endswith(".cube") or "luts/" in preset_key:
            lut_path = resolve_lut_path(preset_key, brand_id)
            if lut_path:
                safe_path = lut_path.replace("\\", "/").replace(":", "\\:")
                stream = stream.filter('lut3d', file=safe_path, enable=f"between(t,{cc_start},{cc_end})")
            continue
            
        base = LUT_PRESETS.get(preset_key, {"brightness": 1.0, "contrast": 1.0, "saturation": 1.0, "hue": 0})
        
        user_b = cc.get("brightness") if cc.get("brightness") is not None else 100
        user_c = cc.get("contrast") if cc.get("contrast") is not None else 100
        user_s = cc.get("saturation") if cc.get("saturation") is not None else 100
        user_h = cc.get("hue") if cc.get("hue") is not None else 0
        
        final_b = base["brightness"] * (user_b / 100.0)
        final_c = base["contrast"] * (user_c / 100.0)
        final_s = base["saturation"] * (user_s / 100.0)
        final_h = base["hue"] + user_h
        
        ffmpeg_b = final_b - 1.0
        ffmpeg_c = final_c
        ffmpeg_s = final_s
        ffmpeg_h = f"{final_h}*PI/180"
        
        stream = stream.filter('eq', brightness=ffmpeg_b, contrast=ffmpeg_c, saturation=ffmpeg_s, enable=f"between(t,{cc_start},{cc_end})")
        stream = stream.filter('hue', h=ffmpeg_h, enable=f"between(t,{cc_start},{cc_end})")
        
    return stream

def render_video(
    input_path: str,
    output_path: str,
    transcript_data: dict,
    edits: list,
    edl: dict = None,
    font: str = "Arial",
    font_size: int = 100,
    use_outline: bool = True,
    font_color: str = "White",
    template_id: str = None,
    brand_id: str = None,
    export_crf: int = 18,
    export_preset: str = "fast",
    export_audio_bitrate: str = "192k",
    target_width: int = None,
    target_height: int = None,
    export_quality: str = "medium",
    export_profile: dict = None,
    source_file_id: str = None,
):
    """Advanced Rendering Pipeline using FFmpeg Concat, ASS overlays, Zoom, Speed, Text and EDL"""
    # Keep real B-roll / graphics edits as-is. Preview and export must share the same timeline semantics:
    # - Zooms / baked Remotion overlays run on source time BEFORE cuts
    # - Audio / text / B-roll overlays on the concatenated stream use PROJECT time
    edits = [dict(e) for e in (edits or [])]

    profile = dict(export_profile or {})
    remotion_max_frames = int(profile.get("remotion_max_frames", 60))
    remotion_max_graphics = int(profile.get("remotion_max_graphics", 4))
    remotion_timeout = int(profile.get("remotion_timeout", 90))
    enable_masking = bool(profile.get("enable_masking", False))
    do_loudnorm = bool(profile.get("loudnorm", False))
    skip_semantic = bool(profile.get("skip_semantic", True))
    mid_preset = profile.get("mid_preset") or "ultrafast"
    mid_crf = int(profile.get("mid_crf", 28))
    print(
        f"[Render] quality={export_quality} frames≤{remotion_max_frames} "
        f"graphics≤{remotion_max_graphics} masking={enable_masking} loudnorm={do_loudnorm}"
    )

    ass_path = output_path.replace(".mp4", ".ass")

    subtitle_edit = next((e for e in edits if e.get("action") == "add_subtitles"), None)
    has_subtitles = subtitle_edit is not None

    # behind_speaker is preview-first. Export masking is expensive (RVM minutes) —
    # only enable on high quality AND only if a cached project mask already exists.
    if subtitle_edit:
        pos = str(subtitle_edit.get("position") or "")
        wants_behind = bool(
            subtitle_edit.get("behind_speaker")
            or pos in ("behind_speaker", "behind")
        )
        if wants_behind and enable_masking:
            cached_mask = None
            if source_file_id:
                for cand in (
                    os.path.join("uploads", f"{source_file_id}_rvm_mask.mp4"),
                    os.path.join("uploads", f"{source_file_id}_mask.mp4"),
                ):
                    if os.path.exists(cand) and os.path.getsize(cand) > 0:
                        cached_mask = cand
                        break
            if cached_mask:
                mask_edit = next((e for e in edits if e.get("action") == "speaker_masking"), None)
                payload = {
                    "action": "speaker_masking",
                    "enabled": True,
                    "effect_type": "behind_text",
                    "mask_path": cached_mask,
                }
                if mask_edit is None:
                    edits.append(payload)
                else:
                    mask_edit.update(payload)
                print(f"[Rotoscope] behind_speaker → reuse cached mask {cached_mask}")
            else:
                print("[Rotoscope] behind_speaker skipped on export (no cached mask — avoid multi-minute RVM)")
        elif wants_behind:
            print(f"[Rotoscope] behind_speaker preview-only (quality={export_quality})")
    
    if has_subtitles:
        position = subtitle_edit.get("position", "center")
        font = resolve_ass_font_name(subtitle_edit.get("font", font))
        font_size = subtitle_edit.get("font_size", font_size)
        use_outline = subtitle_edit.get("use_outline", use_outline)
        font_color = subtitle_edit.get("font_color", font_color)
        animation_style = subtitle_edit.get("animation_style", "fade")
    else:
        position = "center"
        animation_style = "fade"
        font = resolve_ass_font_name(font)

    cuts = [e for e in edits if e.get("action") == "cut_out"]
    zoom_edits = [e for e in edits if e.get("action") == "camera_zoom"]
    speed_edits = [e for e in edits if e.get("action") == "speed_ramp"]
    # Skip preview-only / transcript-duplicate overlays — ASS owns karaoke captions
    text_overlays = []
    for e in edits:
        if e.get("action") != "add_text_overlay":
            continue
        if e.get("is_subtitle"):
            continue
        text_overlays.append(e)

    mute_windows = graphic_ass_mute_windows(edits)

    # Generate ASS AFTER parsing cuts so timing can be remapped
    print(f"[ASS] animation_style={animation_style}, position={position}, template_id={template_id}, brand_id={brand_id}")
    generate_ass(
        transcript_data, ass_path,
        position=position, font=font, font_size=font_size,
        use_outline=use_outline, font_color=font_color, cuts=cuts,
        animation_style=animation_style, template_id=template_id,
        subtitle_edit=subtitle_edit, brand_id=brand_id,
        mute_windows=mute_windows,
    )
    safe_ass = ass_path.replace("\\", "/")

    print(f"[Render] Step 0: Probing video metadata for {input_path}")
    try:
        # ffmpeg.probe() uses subprocess without timeout - can hang on iPhone HEVC.
        # Use our own timeout-safe probe instead.
        probe_result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', input_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30
        )
        if probe_result.returncode == 0:
            probe_data = json.loads(probe_result.stdout)
            duration = float(probe_data['format']['duration'])
            video_stream = next((s for s in probe_data['streams'] if s.get('codec_type') == 'video'), {})
            width = int(video_stream.get('width', 1080))
            height = int(video_stream.get('height', 1920))
            # iPhone HEVC stores frames in landscape with rotate=90/270 metadata
            # The actual display dimensions after rotation are swapped
            rotation = int(video_stream.get('tags', {}).get('rotate', 0))
            side_data = video_stream.get('side_data_list', [])
            for sd in side_data:
                if sd.get('side_data_type') == 'Display Matrix':
                    rotation = sd.get('rotation', rotation)
            if abs(rotation) in (90, 270):
                width, height = height, width
                print(f"[Render] Detected rotation={rotation}°, display dims swapped to {width}x{height}")
        else:
            raise RuntimeError(probe_result.stderr.decode(errors='replace')[:200])
    except subprocess.TimeoutExpired:
        print(f"[Render] ⏰ ffprobe timed out! Using defaults.")
        duration = 10000.0
        width, height = 1080, 1920
    except Exception as ex:
        print(f"[Render] probe error: {ex}, using defaults")
        duration = 10000.0
        width, height = 1080, 1920
    # Ensure dimensions are even numbers (required by libx264)
    width = width if width % 2 == 0 else width - 1
    height = height if height % 2 == 0 else height - 1
    print(f"[Render] Display dimensions: {width}x{height}, duration={duration:.1f}s")

    # Cap zooms on fast exports — each zoompan re-encodes a segment
    if export_quality == "fast" and len(zoom_edits) > 2:
        print(f"[Zoom] Capping {len(zoom_edits)} → 2 zooms for fast export")
        zoom_edits = zoom_edits[:2]
    elif export_quality == "medium" and len(zoom_edits) > 4:
        print(f"[Zoom] Capping {len(zoom_edits)} → 4 zooms for medium export")
        zoom_edits = zoom_edits[:4]

    print(f"[Render] Step 1: Speed ramp edits={len(speed_edits)}")
    # CRITICAL: never mutate the original upload. Remotion/zoom/color used to
    # os.replace() into working_path — when that was input_path, the source
    # talking-head file was permanently overwritten (black + baked graphics).
    import shutil as _shutil_work
    protected_source = os.path.abspath(input_path)
    working_path = output_path.replace(".mp4", "_worksrc.mp4")
    if os.path.abspath(working_path) == protected_source:
        working_path = output_path.replace(".mp4", "_worksrc_safe.mp4")
    # Fast remux copy when possible (seconds vs multi-second byte copy)
    remux = subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, "-c", "copy", working_path, "-loglevel", "error"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120,
    )
    if remux.returncode != 0 or not os.path.exists(working_path):
        _shutil_work.copy2(input_path, working_path)
    print(f"[Render] Working copy: {working_path} (source protected: {protected_source})")

    def _commit_working(temp_path: str) -> None:
        """Replace working media without ever touching the original upload."""
        if os.path.abspath(working_path) == protected_source:
            raise RuntimeError("Refusing to overwrite protected source video")
        safe_replace(temp_path, working_path)

    if speed_edits:
        speed_tmp = output_path.replace('.mp4', '_speed.mp4')
        for se in speed_edits:
            speed = float(se.get('speed', 1.5))
            ok = apply_speed_ramp(working_path, speed_tmp, se.get('start', 0), se.get('end', duration), speed, duration)
            if ok:
                _commit_working(speed_tmp)
                print(f"[SpeedRamp] Applied {speed}x on [{se.get('start')}-{se.get('end')}]")

    # --- Step 1b: Camera zoom (subprocess-based) ---
    if zoom_edits:
        zoom_tmp = output_path.replace('.mp4', '_zoom.mp4')
        for ze in zoom_edits:
            zoom_type = ze.get('type', 'zoom_in')
            z_start = float(ze.get('start', 0))
            z_end = float(ze.get('end', z_start + 2.0))
            print(f"[Zoom] Applying {zoom_type} from {z_start}s to {z_end}s")
            ok = apply_zoom(
                working_path, zoom_tmp, zoom_type, z_start, z_end, duration,
                intensity=float(ze.get('intensity', 1.14) or 1.14),
            )
            if ok:
                _commit_working(zoom_tmp)

    # --- Step 1a: Rotoscoping / Background Removal (RVM) ---
    roto_edit = next((e for e in edits if e.get("action") == "remove_background"), None)
    if roto_edit:
        print(f"[Rotoscope] 🎭 Applying RVM background removal (bg_color={roto_edit.get('bg_color', 'transparent')})")
        try:
            from app.services.rotoscope_service import remove_background_rvm, composite_on_background
            from app.services.pexels_service import download_broll as dl_broll_roto

            bg_color = roto_edit.get("bg_color", "transparent")
            bg_video_query = roto_edit.get("bg_video_query")
            roto_out_ext = "webm" if bg_color == "transparent" else "mp4"
            roto_out = output_path.replace(".mp4", f"_rvm.{roto_out_ext}")

            roto_result = remove_background_rvm(
                input_video_path=working_path,
                output_path=roto_out,
                bg_color=bg_color,
            )
            if roto_result and os.path.exists(roto_result):
                if bg_video_query:
                    # Composite speaker on background stock video
                    bg_video_path = dl_broll_roto(bg_video_query)
                    if bg_video_path and os.path.exists(bg_video_path):
                        composite_out = output_path.replace(".mp4", "_rvm_composite.mp4")
                        final_composite = composite_on_background(roto_result, bg_video_path, composite_out)
                        if final_composite and os.path.exists(final_composite):
                            import shutil as _roto_shutil
                            _roto_shutil.copy2(final_composite, working_path)
                            print(f"[Rotoscope] ✅ Speaker composited on background video: {bg_video_query}")
                        else:
                            print(f"[Rotoscope] ⚠️ Composite failed, using plain roto output")
                            import shutil as _roto_shutil
                            _roto_shutil.copy2(roto_result, working_path)
                    else:
                        print(f"[Rotoscope] ⚠️ Background video not found for query '{bg_video_query}', using roto output")
                        import shutil as _roto_shutil
                        _roto_shutil.copy2(roto_result, working_path)
                else:
                    # Solid color or transparent — replace working_path
                    import shutil as _roto_shutil
                    _roto_shutil.copy2(roto_result, working_path)
                    print(f"[Rotoscope] ✅ Background removed, output: {roto_result}")
            else:
                print(f"[Rotoscope] RVM returned no output — skipping rotoscoping step")
        except Exception as _roto_ex:
            print(f"[Rotoscope] Rotoscoping failed (non-critical): {_roto_ex}")

    # --- Step 1b: Text Behind Speaker (RVM + Generated Background) ---
    text_bg_edit = next((e for e in edits if e.get("action") == "set_video_background"), None)
    if text_bg_edit:
        _bg_color    = text_bg_edit.get("bg_color", "#0a0a14")
        _text        = text_bg_edit.get("text")
        _text_color  = text_bg_edit.get("text_color", "white")
        _text_opacity= float(text_bg_edit.get("text_opacity", 0.12))
        _font_size   = int(text_bg_edit.get("font_size", 220))
        _grad2       = text_bg_edit.get("gradient_color2")
        print(f"[TextBehind] Applying text-behind-speaker: bg={_bg_color}, text={repr(_text)}")
        try:
            from app.services.rotoscope_service import apply_text_behind_speaker
            _textbg_out = output_path.replace(".mp4", "_textbehind.mp4")
            _result = apply_text_behind_speaker(
                input_video_path=working_path,
                output_path=_textbg_out,
                text=_text,
                bg_color=_bg_color,
                text_color=_text_color,
                text_opacity=_text_opacity,
                font_size=_font_size,
                gradient_color2=_grad2,
            )
            if _result and os.path.exists(_result):
                import shutil as _tbg_shutil
                _tbg_shutil.copy2(_result, working_path)
                print(f"[TextBehind] Done — speaker now has custom background with text behind")
            else:
                print(f"[TextBehind] Failed — keeping original video")
        except Exception as _tbg_ex:
            print(f"[TextBehind] Error (non-critical): {_tbg_ex}")

    # --- Step 1c: Color correction (subprocess-based, before graphic overlays) ---
    cc_edits = [e for e in edits if e.get("action") == "color_correction"]
    if cc_edits:
        print(f"[RenderEngine] Applying {len(cc_edits)} color correction segments to source video...")
        color_tmp = output_path.replace('.mp4', '_color.mp4')
        filters = []
        for cc in cc_edits:
            cc_start = float(cc.get("start", 0))
            cc_end = float(cc.get("end", 0))
            if cc_start >= cc_end:
                continue
                
            preset_key = cc.get("preset") or cc.get("lut") or "cinema"
            if preset_key.endswith(".cube") or "luts/" in preset_key:
                lut_path = resolve_lut_path(preset_key, brand_id)
                if lut_path:
                    safe_path = lut_path.replace("\\", "/").replace(":", "\\:")
                    filters.append(f"lut3d=file='{safe_path}':enable='between(t,{cc_start},{cc_end})'")
                continue

            base = LUT_PRESETS.get(preset_key, {"brightness": 1.0, "contrast": 1.0, "saturation": 1.0, "hue": 0})
            
            user_b = cc.get("brightness") if cc.get("brightness") is not None else 100
            user_c = cc.get("contrast") if cc.get("contrast") is not None else 100
            user_s = cc.get("saturation") if cc.get("saturation") is not None else 100
            user_h = cc.get("hue") if cc.get("hue") is not None else 0
            
            final_b = base["brightness"] * (user_b / 100.0)
            final_c = base["contrast"] * (user_c / 100.0)
            final_s = base["saturation"] * (user_s / 100.0)
            final_h = base["hue"] + user_h
            
            ffmpeg_b = final_b - 1.0
            ffmpeg_c = final_c
            ffmpeg_s = final_s
            ffmpeg_h = f"{final_h}*PI/180"
            
            filters.append(f"eq=brightness={ffmpeg_b}:contrast={ffmpeg_c}:saturation={ffmpeg_s}:enable='between(t,{cc_start},{cc_end})'")
            filters.append(f"hue=h='{ffmpeg_h}':enable='between(t,{cc_start},{cc_end})'")
            
        if filters:
            filter_str = ",".join(filters)
            cmd = [
                "ffmpeg", "-i", working_path,
                "-vf", filter_str,
                "-c:v", "libx264", "-c:a", "copy",
                "-preset", "fast",
                color_tmp, "-y", "-loglevel", "error"
            ]
            try:
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
                if res.returncode == 0 and os.path.exists(color_tmp):
                    _commit_working(color_tmp)
                    print("[RenderEngine] ✅ Color correction subprocess applied successfully.")
                else:
                    print(f"[RenderEngine] Color correction subprocess failed: {res.stderr.decode(errors='replace')}")
            except subprocess.TimeoutExpired:
                print("[RenderEngine] ⏰ Color correction subprocess timed out!")

    # --- Step 2: Extract EDL tracks ---
    v1_keeps = []
    a1_keeps = []

    if edl and "v1" in edl and "a1" in edl:
        # User defined EDL tracks independent
        v_segs = edl.get("v1", [])
        a_segs = edl.get("a1", [])
        for seg in v_segs:
            v1_keeps.append((float(seg["start"]), float(seg["end"])))
        for seg in a_segs:
            a1_keeps.append((float(seg["start"]), float(seg["end"])))
    else:
        # Fallback to shared cut_outs logic
        if not cuts:
            v1_keeps.append((0.0, duration))
            a1_keeps.append((0.0, duration))
        else:
            cuts_sorted = sorted(cuts, key=lambda x: x['start'])
            current_time = 0.0
            for cut in cuts_sorted:
                if cut['start'] > current_time:
                    v1_keeps.append((current_time, cut['start']))
                    a1_keeps.append((current_time, cut['start']))
                current_time = max(current_time, cut['end'])
            if current_time < duration:
                v1_keeps.append((current_time, duration))
                a1_keeps.append((current_time, duration))

    print(f"[Render] Step 2: Building FFmpeg filter graph. v1_keeps={len(v1_keeps)}, a1_keeps={len(a1_keeps)}")
    # We must explicitly handle empty lists (meaning track is entirely muted)
    stream = ffmpeg.input(working_path)
    streams_v, streams_a = [], []

    if not v1_keeps: 
        # Create a dummy blank video if v1 is completely empty
        # A bit complex, but usually V1 is not totally empty
        pass
    else:
        for idx, (start, end) in enumerate(v1_keeps):
            # force consistent display dimensions to avoid concat 'parameters do not match'
            # (iPhone videos have rotation metadata that causes inconsistent segment sizes)
            v = (
                stream.video
                .trim(start=start, end=end)
                .setpts('PTS-STARTPTS')
            )
            # Keep scale consistent with preview — no random punch on odd segments
            v = v.filter('scale', width, height)
                
            v = v.filter('setsar', '1')
            streams_v.append(v)
            
    if not a1_keeps:
        pass
    else:
        for (start, end) in a1_keeps:
            a = stream.audio.filter('atrim', start=start, end=end).filter('asetpts', 'PTS-STARTPTS')
            streams_a.append(a)

    # Composite composite streams
    v_out = None
    a_out = None
    
    if streams_v:
        v_out = ffmpeg.concat(*streams_v, v=1, a=0) if len(streams_v) > 1 else streams_v[0]
    if streams_a:
        if len(streams_a) > 1:
            current_a = streams_a[0]
            for next_a in streams_a[1:]:
                current_a = ffmpeg.filter([current_a, next_a], 'acrossfade', d=0.08, c1='tri', c2='tri')
            a_out = current_a
        else:
            a_out = streams_a[0]

    if not v_out or not a_out:
        print("[RenderEngine] Error: V1 or A1 is completely empty. Not supported in this simplified compositing format currently.")
        return False

    # --- Step 2.5: Mix Audio Assets (select_bgm, SFX, transitions) ---
    # Concat output uses PROJECT time — remap source timestamps from cut_out edits.
    audio_edits = [e for e in edits if e.get("action") == "add_asset" and e.get("resolved_path")]
    if audio_edits and a_out is not None:
        print(f"[RenderEngine] Mixing {len(audio_edits)} audio assets onto A1 (project-time remap)...")
        voice = a_out
        mix_inputs = [voice]
        duck_enable = _speech_duck_enable(transcript_data, cuts)

        for ae in audio_edits:
            src_start = float(ae.get("start", 0.0))
            src_end = float(ae.get("end", src_start + 0.5)) if ae.get("end") is not None else None
            if src_end is not None and not segment_survives_cuts(src_start, src_end, cuts):
                print(f"[RenderEngine] Skipping audio entirely inside cut: {ae.get('asset_query') or ae.get('resolved_path')}")
                continue
            proj_start = remap_source_to_project(src_start, cuts)

            asset_path = ae.get("resolved_path")
            
            # Resolve relative/absolute path safely on Windows
            if not os.path.isabs(asset_path):
                # Search in potential project folders
                for prefix in ("", "backend", "../backend", ".."):
                    p = os.path.join(prefix, asset_path)
                    if os.path.exists(p):
                        asset_path = p
                        break
            
            if not os.path.exists(asset_path):
                print(f"[RenderEngine] Audio asset not found: {ae.get('resolved_path')}")
                continue
                
            db = ae.get("volume", -20.0)
            vol_factor = 10 ** (db / 20.0)
            start_ms = int(proj_start * 1000)
            is_bgm = _looks_like_bgm_edit(ae)
            
            # Load audio stream
            if is_bgm:
                # Loop background music automatically
                a_stream = ffmpeg.input(asset_path, stream_loop=-1).audio
            else:
                a_stream = ffmpeg.input(asset_path).audio
                
            # Apply volume and delay to start at correct PROJECT timestamp
            a_processed = a_stream.filter('volume', vol_factor).filter('adelay', f"{start_ms}|{start_ms}")

            if is_bgm:
                duck_db = ae.get("duck_db")
                if duck_db is None:
                    duck_db = -14.0
                duck_factor = 10 ** (float(duck_db) / 20.0)
                if duck_enable and duck_factor < 0.99:
                    a_processed = a_processed.filter('volume', duck_factor, enable=duck_enable)
                    print(f"[RenderEngine] BGM duck {float(duck_db):.0f} dB under speech")
                elif duck_factor < 0.99:
                    try:
                        a_processed = ffmpeg.filter(
                            [a_processed, voice],
                            'sidechaincompress',
                            threshold=0.08,
                            ratio=8,
                            attack=80,
                            release=350,
                            makeup=1,
                        )
                        print("[RenderEngine] BGM sidechain duck (no transcript windows)")
                    except Exception as duck_err:
                        print(f"[RenderEngine] BGM duck skipped: {duck_err}")

            mix_inputs.append(a_processed)
            print(f"[RenderEngine] Audio '{ae.get('asset_query') or os.path.basename(asset_path)}' source={src_start:.2f}s → project={proj_start:.2f}s")
            
        if len(mix_inputs) > 1:
            # Mix all streams into one without dropping main volume (normalize=0)
            a_out = ffmpeg.filter(mix_inputs, 'amix', inputs=len(mix_inputs), normalize=0)
            print(f"[RenderEngine] ✅ Mixed {len(mix_inputs) - 1} audio tracks successfully.")

    # --- Step 3: Camera zoom — already handled above via subprocess ---

    # --- Step 4: Text overlays (drawtext) — project time after concat ---
    # Never burn drawtext for caption-like overlays when ASS karaoke is active.
    if text_overlays:
        transcript_blob = ""
        if has_subtitles and transcript_data:
            words = transcript_data.get("words") or []
            transcript_blob = _normalize_overlay_text(
                " ".join(w.get("word", "") for w in words)
                or " ".join(s.get("text", "") for s in (transcript_data.get("segments") or []))
            )
        for to in text_overlays:
            raw_text = to.get('text', '')
            if has_subtitles and transcript_blob:
                tnorm = _normalize_overlay_text(raw_text)
                if tnorm and (tnorm in transcript_blob or transcript_blob.find(tnorm) >= 0):
                    # Same spoken line as ASS — skip drawtext duplicate
                    print(f"[RenderEngine] Skipping drawtext duplicate of captions: {raw_text[:40]!r}")
                    continue
            src_start = float(to.get('start', 0))
            src_end = float(to.get('end', 3))
            if not segment_survives_cuts(src_start, src_end, cuts):
                continue
            proj_to = projectize_edit_times(to, cuts)
            x_pct = proj_to.get('x', 50.0)
            y_pct = proj_to.get('y', 78.0)
            w_pct = proj_to.get('width', 82.0)
            raw_text = proj_to.get('text', '')
            
            # Estimate wrapping based on width percentage
            fontsize = int(proj_to.get('fontsize') or proj_to.get('font_size') or 72)
            wrapped_text = raw_text
            if w_pct:
                max_w_px = (w_pct / 100.0) * width
                char_w = fontsize * 0.46
                words = raw_text.split(" ")
                lines = []
                current_line = []
                current_width = 0
                for word in words:
                    word_w = len(word) * char_w
                    if current_width + word_w > max_w_px and current_line:
                        lines.append(" ".join(current_line))
                        current_line = [word]
                        current_width = word_w
                    else:
                        current_line.append(word)
                        current_width += word_w + char_w
                if current_line:
                    lines.append(" ".join(current_line))
                wrapped_text = "\n".join(lines)

            # Map percent coordinates to FFmpeg math expressions
            x_expr = f"(w*{x_pct/100.0})-text_w/2"
            y_expr = f"(h*{y_pct/100.0})-text_h/2"
            
            kwargs = build_drawtext_kwargs(
                text=wrapped_text,
                start=float(proj_to.get('start', 0)),
                end=float(proj_to.get('end', 3)),
                fontsize=fontsize,
                color=proj_to.get('font_color') or proj_to.get('color') or 'white',
                x=x_expr,
                y=y_expr
            )
            v_out = v_out.drawtext(**kwargs)

    # --- Step 4.25: Motion Graphics via Remotion (Premium Quality) ---
    motion_edits = [e for e in edits if e.get("action") == "add_motion_graphic"]
    if len(motion_edits) > remotion_max_graphics:
        print(f"[MotionGraphic] Capping {len(motion_edits)} → {remotion_max_graphics}")
        motion_edits = motion_edits[:remotion_max_graphics]
    if motion_edits:
        for me in motion_edits:
            text = me.get("text", "Info")
            subtext = me.get("subtext", "")
            start = float(me.get("start", 0))
            end = float(me.get("end", start + 3))
            position = me.get("position", "top-right")
            style = me.get("style", "cinematic")  # cinematic | blueprint | liquid
            accent = me.get("accent_color", "#a78bfa")

            # Map position to FFmpeg overlay expression
            pos_map = {
                "top-right":    "W-w-60:60",
                "top-left":     "60:60",
                "bottom-right": "W-w-60:H-h-60",
                "bottom-left":  "60:H-h-60",
                "center":       "(W-w)/2:(H-h)/2",
                "left":         "60:(H-h)/2",
                "right":        "W-w-60:(H-h)/2",
            }
            pos_expr = pos_map.get(position, pos_map["top-right"])
            duration_sec = end - start
            duration_frames = min(89, remotion_max_frames, max(24, int(duration_sec * 24)))

            # Remotion dir
            remotion_dir = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "..", "remotion")
            )
            comp_map = {"cinematic": "CinematicDark", "blueprint": "TechBlueprint", "liquid": "LiquidOrganic"}
            composition = comp_map.get(style, "CinematicDark")

            # Write props JSON (avoids Windows quote-escaping issues)
            props_file = os.path.join(remotion_dir, "props", "_render_props.json")
            os.makedirs(os.path.dirname(props_file), exist_ok=True)
            import json as _json
            
            # Find the active vibe config on the timeline
            vibe_edit = next((e for e in edits if e.get("action") == "set_vibe_config"), None)
            vibe_config = vibe_edit.get("vibe_config") if vibe_edit else None

            with open(props_file, "w", encoding="utf-8") as _f:
                _json.dump({
                    "styleType": style,
                    "text": text.upper(),
                    "subtext": subtext.upper(),
                    "accentColor": accent,
                    "transparent": True,   # Overlay mode: only the card, no background
                    "vibeConfig": vibe_config,
                }, _f, ensure_ascii=False)

            overlay_path = os.path.abspath(working_path.replace(".mp4", f"_remotion_{int(start)}.webm"))
            overlay_output = os.path.abspath(working_path.replace(".mp4", f"_after_mg_{int(start)}.mp4"))

            print(f"[MotionGraphic] Rendering Remotion {composition} at t={start}s")

            # Step A: Render the Remotion template to transparent WebM
            # NOTE: shell=True is required on Windows because npx is a .cmd script
            # NOTE: Paths must be quoted to handle spaces in "montage AI" directory name
            # NOTE: yuva420p requires --image-format png for transparent frames
            # NOTE: --background-color=00000000 tells Remotion to use a transparent background
            render_cmd = (
                f'npx remotion render src/index.tsx {composition}'
                f' "{overlay_path}"'
                f' "--props={props_file}"'
                f' --frames 0-{duration_frames - 1}'
                f' --codec vp8'
                f' --image-format png'
                f' --pixel-format yuva420p'
                f' --background-color 00000000'
                f' --log error'
            )
            try:
                render_result = subprocess.run(
                    render_cmd,
                    cwd=remotion_dir,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    shell=True,
                    timeout=remotion_timeout,
                )
            except subprocess.TimeoutExpired:
                print(f"[MotionGraphic] ⏰ Remotion render timed out, skipping")
                continue
            if render_result.returncode != 0:
                print(f"[MotionGraphic] Remotion failed: {render_result.stderr.decode(errors='replace')[:200]}")
                continue

            if not os.path.exists(overlay_path):
                print(f"[MotionGraphic] No overlay file produced, skipping")
                continue

            # Step B: Composite WebM onto source video with alpha support
            # format=yuva420p keeps the alpha channel through scale,
            # overlay format=auto uses it as transparency mask
            filter_complex = (
                f"[0:v]trim=0:{start},setpts=PTS-STARTPTS[before];"
                f"[0:v]trim={start}:{end},setpts=PTS-STARTPTS,boxblur=15:3,eq=brightness=-0.35:contrast=1.0[during];"
                f"[0:v]trim={end},setpts=PTS-STARTPTS[after];"
                f"[1:v]scale={width}:{height},format=yuva420p[webm];"
                f"[during][webm]overlay=0:0:format=auto[during_out];"
                f"[before][during_out][after]concat=n=3:v=1:a=0[out]"
            )
            overlay_cmd = [
                "ffmpeg",
                "-i", working_path,
                "-i", overlay_path,
                "-filter_complex", filter_complex,
                "-map", "[out]",
                "-map", "0:a",
                "-c:v", "libx264",
                "-c:a", "aac",
                "-preset", "fast",
                overlay_output,
                "-y", "-loglevel", "error",
            ]
            try:
                ov_result = subprocess.run(overlay_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
            except subprocess.TimeoutExpired:
                print(f"[MotionGraphic] ⏰ FFmpeg overlay timed out, skipping")
                continue
            if ov_result.returncode == 0 and os.path.exists(overlay_output):
                _commit_working(overlay_output)
                print(f"[MotionGraphic] ✅ Overlaid {composition} at {start}s")
            else:
                print(f"[MotionGraphic] FFmpeg overlay failed: {ov_result.stderr.decode()}")

            # Cleanup temp WebM
            if os.path.exists(overlay_path):
                os.remove(overlay_path)


    # --- Step 4.3: Dynamic Canvas (AI-assembled primitive scenes) ---
    dynamic_edits = [e for e in edits if e.get("action") == "add_dynamic_graphic"]
    if dynamic_edits:
        for de in dynamic_edits:
            elements = de.get("elements", [])
            start = float(de.get("start", 0))
            end = float(de.get("end", start + 3))
            if not elements:
                continue

            duration_sec = end - start
            duration_frames = min(89, remotion_max_frames, max(24, int(duration_sec * 24)))

            remotion_dir = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "..", "remotion")
            )

            # Write elements JSON for DynamicCanvas
            props_file = os.path.join(remotion_dir, "props", "_dynamic_props.json")
            os.makedirs(os.path.dirname(props_file), exist_ok=True)
            import json as _json
            with open(props_file, "w", encoding="utf-8") as _f:
                _json.dump({"elements": elements}, _f, ensure_ascii=False)

            overlay_path = os.path.abspath(working_path.replace(".mp4", f"_dynamic_{int(start)}.webm"))
            overlay_output = os.path.abspath(working_path.replace(".mp4", f"_after_dyn_{int(start)}.mp4"))

            print(f"[DynamicCanvas] Rendering {len(elements)} elements at t={start}s")
            render_cmd = (
                f'npx remotion render src/index.tsx DynamicCanvas'
                f' "{overlay_path}"'
                f' "--props={props_file}"'
                f' --frames 0-{duration_frames - 1}'
                f' --codec vp8'
                f' --image-format png'
                f' --pixel-format yuva420p'
                f' --background-color 00000000'
                f' --log error'
            )
            try:
                render_result = subprocess.run(
                    render_cmd, cwd=remotion_dir,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    shell=True, timeout=remotion_timeout,
                )
            except subprocess.TimeoutExpired:
                print(f"[DynamicCanvas] ⏰ Remotion render timed out, skipping")
                continue

            if render_result.returncode != 0 or not os.path.exists(overlay_path):
                err = render_result.stderr.decode(errors="replace")[:300]
                print(f"[DynamicCanvas] Render failed: {err}")
                continue

            # FFmpeg overlay at the correct timestamp
            offset = start
            filter_complex = (
                f"[0:v]trim=0:{offset},setpts=PTS-STARTPTS[before];"
                f"[0:v]trim={offset}:{end},setpts=PTS-STARTPTS[during_raw];"
                f"[0:v]trim={end},setpts=PTS-STARTPTS[after];"
                # ↓ format=yuva420p preserves alpha channel through scale
                f"[1:v]scale={width}:{height},format=yuva420p[overlay_sc];"
                f"[during_raw][overlay_sc]overlay=0:0:format=auto[during];"
                f"[before][during][after]concat=n=3:v=1:a=0[out]"
            )
            overlay_cmd = [
                "ffmpeg", "-i", working_path, "-i", overlay_path,
                "-filter_complex", filter_complex,
                "-map", "[out]", "-map", "0:a",
                "-c:v", "libx264", "-c:a", "aac", "-preset", mid_preset, "-crf", str(mid_crf),
                overlay_output, "-y", "-loglevel", "error",
            ]
            try:
                ov_result = subprocess.run(overlay_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
            except subprocess.TimeoutExpired:
                print(f"[DynamicCanvas] ⏰ FFmpeg overlay timed out, skipping")
                continue
            if ov_result.returncode == 0 and os.path.exists(overlay_output):
                _commit_working(overlay_output)
                print(f"[DynamicCanvas] ✅ Overlaid {len(elements)} elements at {start}s")
            else:
                print(f"[DynamicCanvas] FFmpeg failed: {ov_result.stderr.decode()[:200]}")

            if os.path.exists(overlay_path):
                os.remove(overlay_path)


    # --- Step 4.4: Remotion HTML Canvas & Semantic Scenes ---
    GRAPHIC_HTML_ACTIONS = ("hyperframes_html", "canvas_overlay", "add_hyperframes_graphics", "add_motion_graphic", "add_dynamic_graphic")
    hyperframes_edits = [e for e in edits if e.get("action") in GRAPHIC_HTML_ACTIONS and (e.get("html_content") or e.get("html"))]
    if len(hyperframes_edits) > remotion_max_graphics:
        print(f"[Remotion] Capping HTML graphics {len(hyperframes_edits)} → {remotion_max_graphics} for speed")
        hyperframes_edits = hyperframes_edits[:remotion_max_graphics]
    semantic_edits = [e for e in edits if e.get("action") == "semantic_scene" and e.get("scene_data")]
    if skip_semantic and semantic_edits:
        print(f"[Remotion] Skipping {len(semantic_edits)} semantic WebGL scenes (fast/medium export)")
        semantic_edits = []

    if hyperframes_edits or semantic_edits:
        print(f"[Remotion] Found {len(hyperframes_edits)} html injections and {len(semantic_edits)} semantic scenes. Compositing...")
        hyperframes_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'hyperframes_studio'))
        os.makedirs(hyperframes_dir, exist_ok=True)
        
        # Bounding time box calculations
        import re
        min_start = float(duration)
        max_end = 0.0
        
        # Track starts and ends for both types of edits
        for e in hyperframes_edits:
            html = e.get("html_content", "")
            clip_matches = re.findall(r'<div[^>]*class=[\'"][^\'"]*clip[^\'"]*[\'"][^>]*>', html)
            starts = []
            durs = []
            for tag in clip_matches:
                s_m = re.search(r"data-start=['\"]([\d.]+)['\"]", tag)
                d_m = re.search(r"data-duration=['\"]([\d.]+)['\"]", tag)
                if s_m: starts.append(float(s_m.group(1)))
                if d_m: durs.append(float(d_m.group(1)))
                
            if starts:
                s = min(starts)
                if s < min_start: min_start = s
                d = max(durs) if durs else 5.0
                if s + d > max_end: max_end = s + d
                
        for e in semantic_edits:
            s = e.get("start", 0.0)
            e_end = e.get("end", s + 5.0)
            if s < min_start: min_start = s
            if e_end > max_end: max_end = e_end
                
        if max_end <= 0.1:
            max_end = float(duration)
                
        def _wrap_html_transform(edit_item: dict) -> str:
            raw = edit_item.get("html_content") or edit_item.get("html") or ""
            ox = float(edit_item.get("offset_x") or 0.0)
            oy = float(edit_item.get("offset_y") or 0.0)
            sx = float(edit_item.get("scale_x") or 1.0)
            sy = float(edit_item.get("scale_y") or 1.0)
            return (
                f'<div class="clip-transform" data-plate-sx="{sx}" data-plate-sy="{sy}" '
                f'style="position:absolute;inset:0;transform:translate({ox}%,{oy}%);'
                f'pointer-events:none;">{raw}</div>'
            )

        combined_html = "\n".join([_wrap_html_transform(e) for e in hyperframes_edits])
        
        # Construct semantic scene canvas elements and script code
        semantic_canvas_html = ""
        semantic_scripts = ""
        draw_calls = ""
        
        for idx, se in enumerate(semantic_edits):
            scene_data_json = json.dumps(se.get("scene_data"), ensure_ascii=False)
            start = se.get("start", 0.0)
            end = se.get("end", 5.0)
            
            is_split = se.get("layout") == "split" or (se.get("scene_data") and se.get("scene_data", {}).get("layout") == "split")
            canvas_y = 960 if is_split else 0
            canvas_h = 960 if is_split else 1920
            semantic_canvas_html += f'<canvas id="semantic-canvas-{idx}" width="1080" height="{canvas_h}" style="position: absolute; top: {canvas_y}px; left: 0; width: 1080px; height: {canvas_h}px; pointer-events: none;"></canvas>\n'
            
            semantic_scripts += f"""
            const sceneData_{idx} = {scene_data_json};
            const sceneStart_{idx} = {start};
            const sceneEnd_{idx} = {end};
            """
            
            is_split_js = "true" if is_split else "false"
            draw_calls += f"""
            if (t >= sceneStart_{idx} && t < sceneEnd_{idx}) {{
                drawSemanticScene('semantic-canvas-{idx}', sceneData_{idx}, sceneStart_{idx}, sceneEnd_{idx}, t);
                if ({is_split_js}) anySplit = true;
            }} else {{
                const canvas_{idx} = document.getElementById('semantic-canvas-{idx}');
                if (canvas_{idx}) {{
                    const ctx_{idx} = canvas_{idx}.getContext('2d');
                    if (ctx_{idx}) ctx_{idx}.clearRect(0, 0, canvas_{idx}.width, canvas_{idx}.height);
                }}
            }}
            """

        if combined_html:
            combined_html = re.sub(r'data-width=[\'"]\d+[\'"]', f'data-width="{width}"', combined_html)
            combined_html = re.sub(r'data-height=[\'"]\d+[\'"]', f'data-height="{height}"', combined_html)
            
        html_doc = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={width}, height={height}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;700&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&family=Manrope:wght@400;700&family=Montserrat:wght@400;700;800&family=Playfair+Display:ital,wght@0,700;1,400&family=Rubik:wght@400;700&family=Unbounded:wght@700&display=swap" rel="stylesheet" />
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: {width}px; height: {height}px; overflow: hidden; background: transparent !important; }}
      .clip {{ position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; container-type: size; }}
      #root {{
          width: 100% !important;
          height: 100% !important;
          position: absolute; inset: 0;
          overflow: visible !important;
          container-type: size;
      }}
      .clip .glass-card, .clip .card, .clip .plate, .clip [data-plate] {{
          overflow: visible !important;
          max-width: 94% !important;
          max-height: none !important;
          min-width: max-content;
          white-space: normal !important;
      }}
      .plate-bg {{ position:absolute; inset:0; z-index:0; pointer-events:none; border-radius:inherit; }}
      .plate-content {{ position:relative; z-index:1; width:max-content; transform:none !important; overflow:visible !important; }}
      .clip .glass-card *, .clip [data-plate] * {{
          overflow: visible !important;
          white-space: normal !important;
          overflow-wrap: normal !important;
          word-break: normal !important;
      }}
    </style>
    <script>
      tailwind.config = {{
        theme: {{
          extend: {{
            fontFamily: {{
              inter: ['Inter', 'sans-serif'],
              montserrat: ['Montserrat', 'sans-serif'],
              rubik: ['Rubik', 'sans-serif'],
              manrope: ['Manrope', 'sans-serif'],
              unbounded: ['Unbounded', 'sans-serif'],
              comfortaa: ['Comfortaa', 'sans-serif'],
              mono: ['JetBrains Mono', 'monospace'],
              playfair: ['Playfair Display', 'serif']
            }}
          }}
        }}
      }}
    </script>
  </head>
  <body style="background: transparent;">
    <div id="root">
{combined_html}
{semantic_canvas_html}
    </div>
    <script>
      function drawRoundedRect(ctx, x, y, w, h, r) {{
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + w - r, y);
          ctx.arcTo(x + w, y, x + w, y + r, r);
          ctx.lineTo(x + w, y + h - r);
          ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
          ctx.lineTo(x + r, y + h);
          ctx.arcTo(x, y + h, x, y + h - r, r);
          ctx.lineTo(x, y + r);
          ctx.arcTo(x, y, x + r, y, r);
          ctx.closePath();
      }}
      function getEmojiForIcon(id) {{
          const mapping = {{
              'rocket': '🚀', 'fire': '🔥', 'warning': '⚠️', 'check': '✅',
              'star': '⭐', 'lightning': '⚡', 'chart': '📊', 'crm': '💻',
              'sales': '📈', 'money': '💰', 'arrow': '➡️', 'brain': '🧠'
          }};
          return mapping[id] || id;
      }}
      function drawArrowhead(ctx, fromX, fromY, toX, toY, size) {{
          const angle = Math.atan2(toY - fromY, toX - fromX);
          ctx.beginPath();
          ctx.moveTo(toX, toY);
          ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
      }}
      function drawSemanticScene(canvasId, sceneData, start, end, t) {{
          const canvas = document.getElementById(canvasId);
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const W = canvas.width;
          const H = canvas.height;
          ctx.clearRect(0, 0, W, H);
          if (t < start || t >= end) return;
          const styleProfile = sceneData.style_profile || {{}};
          const entities = sceneData.entities || [];
          const relations = sceneData.relations || [];
          const bgColor = styleProfile.bg_color || 'rgba(20, 20, 25, 0.65)';
          const borderColor = styleProfile.border_color || 'rgba(255, 255, 255, 0.15)';
          const glowColor = styleProfile.glow_color || 'rgba(255, 255, 255, 0.04)';
          const baseFontFamily = styleProfile.font_family || 'Inter, sans-serif';
          const elapsed = t - start;
          entities.forEach(entity => {{
              const xPercent = entity.x ?? 50;
              const yPercent = entity.y ?? 50;
              const wPercent = entity.width ?? 28;
              const hPercent = entity.height ?? 12;
              const targetX = (xPercent / 100) * W;
              const targetY = (yPercent / 100) * H;
              const targetW = (wPercent / 100) * W;
              const targetH = (hPercent / 100) * H;
              const anim = entity.animation || {{}};
              const animType = anim.type || 'fade';
              const animDuration = anim.duration || 0.6;
              const animDelay = anim.delay || 0.0;
              const progress = Math.min(1, Math.max(0, (elapsed - animDelay) / animDuration));
              let easeProgress = progress;
              if (anim.easing === 'linear') {{
                  easeProgress = progress;
              }} else if (anim.easing === 'bounce') {{
                  const c4 = (2 * Math.PI) / 3;
                  easeProgress = progress === 0 ? 0 : progress === 1 ? 1 : Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * c4) + 1;
              }} else {{
                  easeProgress = progress * progress * (3 - 2 * progress);
              }}
              let currentX = targetX;
              let currentY = targetY;
              let currentOpacity = 1.0;
              let currentScale = 1.0;
              let currentRotation = 0;
              const startOpacity = anim.opacity_start !== undefined ? anim.opacity_start : (animType === 'fade' || animType === 'pop' || animType === 'slide_in' ? 0.0 : 1.0);
              const endOpacity = anim.opacity_end !== undefined ? anim.opacity_end : 1.0;
              currentOpacity = startOpacity + (endOpacity - startOpacity) * easeProgress;
              const startScale = anim.scale_start !== undefined ? anim.scale_start : (animType === 'pop' ? 0.5 : 1.0);
              const endScale = anim.scale_end !== undefined ? anim.scale_end : 1.0;
              currentScale = startScale + (endScale - startScale) * easeProgress;
              const startRotation = anim.rotation_start !== undefined ? anim.rotation_start : 0;
              const endRotation = anim.rotation_end !== undefined ? anim.rotation_end : 0;
              currentRotation = startRotation + (endRotation - startRotation) * easeProgress;
              const xOffsetPercent = anim.x_offset !== undefined ? anim.x_offset : (animType === 'slide_in' ? -10 : 0);
              const yOffsetPercent = anim.y_offset !== undefined ? anim.y_offset : 0;
              const startX = targetX + (xOffsetPercent / 100) * W;
              const startY = targetY + (yOffsetPercent / 100) * H;
              currentX = startX + (targetX - startX) * easeProgress;
              currentY = startY + (targetY - startY) * easeProgress;
              ctx.save();
              ctx.globalAlpha = currentOpacity;
              if (currentScale !== 1.0) {{
                  ctx.translate(currentX, currentY);
                  ctx.scale(currentScale, currentScale);
                  ctx.translate(-currentX, -currentY);
              }}
              if (currentRotation !== 0) {{
                  ctx.translate(currentX, currentY);
                  ctx.rotate(currentRotation * Math.PI / 180);
                  ctx.translate(-currentX, -currentY);
              }}
              const styles = entity.styles || {{}};
              const itemBg = styles.bg_color || bgColor;
              const itemBorder = styles.border_color || borderColor;
              const itemGlow = styles.glow_color || glowColor;
              const itemFont = styles.font_family || baseFontFamily;
              
              if (entity.type === 'loading_bar' || entity.is_loading_bar) {{
                  // Render Apple-style loading bar
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                  ctx.strokeStyle = itemBorder;
                  ctx.lineWidth = 1.0;
                  drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, targetW, targetH, targetH / 2);
                  ctx.fill();
                  ctx.stroke();
                  
                  ctx.fillStyle = styleProfile.color_accent || '#0A84FF';
                  const activeW = targetW * easeProgress;
                  drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, activeW, targetH, targetH / 2);
                  ctx.fill();
                  
                  const textVal = entity.text || '';
                  if (textVal) {{
                      ctx.fillStyle = '#FFFFFF';
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.font = `bold ${{Math.round(targetH * 0.5)}}px ${{itemFont}}`;
                      ctx.fillText(textVal + ' ' + Math.round(easeProgress * 100) + '%', currentX, currentY);
                  }}
              }} else if (entity.type !== 'headline') {{
                  ctx.shadowColor = itemGlow;
                  ctx.shadowBlur = 28;
                  ctx.shadowOffsetY = 4;
                  ctx.fillStyle = itemBg;
                  ctx.strokeStyle = itemBorder;
                  ctx.lineWidth = 1.5;
                  drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, targetW, targetH, 16);
                  ctx.fill();
                  ctx.shadowColor = 'transparent';
                  ctx.shadowBlur = 0;
                  ctx.stroke();
              }}
              
              if (entity.type !== 'loading_bar' && !entity.is_loading_bar) {{
                  const textVal = entity.text || '';
                  if (textVal) {{
                      const lines = textVal.split('\\n');
                      const textColor = styles.color || '#F5F7FA';
                      const fontSize = styles.font_size || Math.round(H * 0.024);
                      ctx.fillStyle = textColor;
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.font = `${{styles.bold ? 'bold ' : ''}}${{styles.italic ? 'italic ' : ''}}${{fontSize}}px ${{itemFont}}`;
                      const totalTextHeight = lines.length * (fontSize * 1.35);
                      const startY = currentY - (totalTextHeight / 2) + (fontSize / 2);
                      lines.forEach((lineText, lIdx) => {{
                          ctx.fillText(lineText, currentX, startY + lIdx * (fontSize * 1.35));
                      }});
                  }}
                  const iconId = entity.asset_id || entity.icon;
                  if (entity.type === 'icon' && iconId) {{
                      ctx.fillStyle = styles.color || '#3B82F6';
                      ctx.font = `${{Math.round(targetH * 0.5)}}px ${{itemFont}}`;
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillText(getEmojiForIcon(iconId), currentX, currentY);
                  }}
              }}
              ctx.restore();
          }});
          relations.forEach(rel => {{
              const fromEnt = entities.find(e => e.id === rel.from);
              const toEnt = entities.find(e => e.id === rel.to);
              if (!fromEnt || !toEnt) return;
              const fromX = ( (fromEnt.x ?? 50) / 100 ) * W;
              const fromY = ( (fromEnt.y ?? 50) / 100 ) * H;
              const toX = ( (toEnt.x ?? 50) / 100 ) * W;
              const toY = ( (toEnt.y ?? 50) / 100 ) * H;
              ctx.save();
              ctx.strokeStyle = styleProfile.arrow_color || styleProfile.border_color || 'rgba(59, 130, 246, 0.6)';
              ctx.lineWidth = styleProfile.arrow_width || 3.0;
              const anim = styleProfile.relation_animation || {{}};
              const rDelay = anim.delay || 0.4;
              const rDur = anim.duration || 0.8;
              const rProgress = Math.min(1, Math.max(0, (elapsed - rDelay) / rDur));
              const rEase = rProgress * rProgress * (3 - 2 * rProgress);
              if (rProgress > 0) {{
                  const currentEndX = fromX + (toX - fromX) * rEase;
                  const currentEndY = fromY + (toY - fromY) * rEase;
                  ctx.beginPath();
                  ctx.moveTo(fromX, fromY);
                  ctx.lineTo(currentEndX, currentEndY);
                  ctx.stroke();
                  if (rProgress >= 0.95) {{
                      drawArrowhead(ctx, fromX, fromY, toX, toY, 12);
                  }}
              }}
              ctx.restore();
          }});
      }}
      
      {semantic_scripts}
      
      function drawAllScenes(t) {{
          {draw_calls}
      }}

      function scaleRoot(){{
        const r=document.getElementById('root');
        if(!r)return;
        r.style.width='100%';
        r.style.height='100%';
        r.style.left='0';
        r.style.top='0';
        r.style.transform='none';
        r.style.overflow='visible';
        r.style.zoom='';
      }}
      window.addEventListener('resize',scaleRoot);
      scaleRoot();
      (function applyExportPlateBox(){{
        var wrap = document.querySelector('.clip-transform');
        var sx = wrap ? parseFloat(wrap.getAttribute('data-plate-sx') || '1') : 1;
        var sy = wrap ? parseFloat(wrap.getAttribute('data-plate-sy') || '1') : 1;
        var plate = document.querySelector('[data-plate], .glass-card, .plate, .card');
        if (!plate) return;
        if (!plate.querySelector(':scope > .plate-content')) {{
          var content = document.createElement('div');
          content.className = 'plate-content';
          while (plate.firstChild) content.appendChild(plate.firstChild);
          var bg = document.createElement('div');
          bg.className = 'plate-bg';
          var cs = getComputedStyle(plate);
          bg.style.background = cs.background;
          bg.style.borderRadius = cs.borderRadius;
          bg.style.boxShadow = cs.boxShadow;
          plate.style.background = 'transparent';
          plate.style.boxShadow = 'none';
          plate.appendChild(bg);
          plate.appendChild(content);
        }}
        var body = plate.querySelector('.plate-content');
        var cw = body ? body.offsetWidth : plate.offsetWidth;
        var ch = body ? body.offsetHeight : plate.offsetHeight;
        plate.style.setProperty('width', Math.max(cw, cw * sx) + 'px', 'important');
        plate.style.setProperty('height', Math.max(ch, ch * sy) + 'px', 'important');
        plate.style.setProperty('overflow', 'visible', 'important');
      }})();

      let isSynced = false;
      window.addEventListener('message', (event) => {{
          if (event.data && event.data.type === 'sync_time') {{
              isSynced = true;
              const t = event.data.time;
              if (window.__timelines && window.__timelines["main"]) {{
                  window.__timelines["main"].pause();
                  window.__timelines["main"].seek(t);
              }}
              drawAllScenes(t);
          }}
      }});
      
      function tick() {{
          requestAnimationFrame(tick);
      }}
      requestAnimationFrame(tick);
    </script>
  </body>
</html>"""
        
        os.makedirs(hyperframes_dir, exist_ok=True)
        idx_file = os.path.join(hyperframes_dir, "index.html")
        with open(idx_file, "w", encoding="utf-8") as f:
            f.write(html_doc)
        
        base_name, _ = os.path.splitext(working_path)
        # We render semantic scenes using Remotion for dynamic 3D WebGL scenes, 
        # camera animations, and high-fidelity staggered overlays!
        if semantic_edits:
            print("[SemanticRenderer] Activating dynamic Remotion WebGL & HTML scene compilation pipeline...")
            
            # Find the active vibe config on the timeline
            vibe_edit = next((e for e in edits if e.get("action") == "set_vibe_config"), None)
            vibe_config = vibe_edit.get("vibe_config") if vibe_edit else None
            
            # Remotion dir
            remotion_dir = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "..", "remotion")
            )
            
            for idx, se in enumerate(semantic_edits):
                start = float(se.get("start", 0.0))
                end = float(se.get("end", start + 5.0))
                scene_data = se.get("scene_data", {})
                
                duration_sec = end - start
                duration_frames = min(149, remotion_max_frames, max(24, int(duration_sec * 24)))
                
                # Write props JSON (avoids Windows quote-escaping issues)
                props_file = os.path.join(remotion_dir, "props", f"_render_props_semantic_{idx}.json")
                os.makedirs(os.path.dirname(props_file), exist_ok=True)
                import json as _json
                with open(props_file, "w", encoding="utf-8") as _f:
                    _json.dump({
                        "vibeConfig": vibe_config,
                        "sceneData": scene_data,
                        "transparent": True,
                    }, _f, ensure_ascii=False)
                
                overlay_path = os.path.abspath(working_path.replace(".mp4", f"_semantic_{idx}.webm"))
                temp_out = base_name + f"_remotion_blend_{idx}.mp4"
                
                print(f"[SemanticRenderer] Rendering SemanticScene composition at t={start}s ({duration_frames} frames)")
                
                # Render transparent WebM using Remotion CLI
                render_cmd = (
                    f'npx remotion render src/index.tsx SemanticScene'
                    f' "{overlay_path}"'
                    f' "--props={props_file}"'
                    f' --frames 0-{duration_frames - 1}'
                    f' --codec vp8'
                    f' --image-format png'
                    f' --pixel-format yuva420p'
                    f' --background-color 00000000'
                    f' --log error'
                )
                
                try:
                    render_result = subprocess.run(
                        render_cmd,
                        cwd=remotion_dir,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        shell=True,
                        timeout=remotion_timeout,
                    )
                except subprocess.TimeoutExpired:
                    print(f"[SemanticRenderer] ⏰ Remotion render timed out for scene {idx}, skipping")
                    continue
                    
                if render_result.returncode != 0:
                    print(f"[SemanticRenderer] Remotion failed: {render_result.stderr.decode(errors='replace')[:250]}")
                    continue
                    
                if not os.path.exists(overlay_path):
                    print(f"[SemanticRenderer] No overlay file produced, skipping")
                    continue
                
                # Composite WebM onto blurred/dimmed video
                is_split = se.get("layout") == "split" or (se.get("scene_data") and se.get("scene_data", {}).get("layout") == "split")
                filter_during = "null" if is_split else "boxblur=15:3,eq=brightness=-0.35:contrast=1.0"
                blend_cmd = [
                    "ffmpeg", "-i", working_path,
                    "-i", overlay_path,
                    "-filter_complex", (
                        f"[0:v]trim=0:{start},setpts=PTS-STARTPTS[before];"
                        f"[0:v]trim={start}:{end},setpts=PTS-STARTPTS,{filter_during}[during];"
                        f"[0:v]trim={end},setpts=PTS-STARTPTS[after];"
                        f"[during][1:v]overlay=0:0:format=auto[during_out];"
                        f"[before][during_out][after]concat=n=3:v=1:a=0[outv]"
                    ),
                    "-map", "[outv]", "-map", "0:a",
                    "-c:v", "libx264", "-c:a", "copy", "-preset", mid_preset, "-crf", str(mid_crf),
                    temp_out, "-y", "-loglevel", "error"
                ]
                
                blend_res = subprocess.run(blend_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
                if blend_res.returncode == 0 and os.path.exists(temp_out):
                    _commit_working(temp_out)
                    print(f"[SemanticRenderer] ✅ Remotion overlay successfully applied for scene {idx} ({start}s-{end}s)")
                else:
                    print(f"[SemanticRenderer] FFmpeg overlay failed: {blend_res.stderr.decode()}")
                
                # Cleanup temp files
                for fpath in (overlay_path, props_file):
                    try:
                        if os.path.exists(fpath):
                            os.remove(fpath)
                    except:
                        pass

        # Render custom HTML graphics via Remotion's HtmlGraphicsScene
        if hyperframes_edits:
            print(f"[GraphicsRenderer] Activating Remotion HTML Graphics scene compilation pipeline for {len(hyperframes_edits)} edits...")
            remotion_dir = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "..", "remotion")
            )
            base_name, _ = os.path.splitext(working_path)
            
            for idx, he in enumerate(hyperframes_edits):
                start = float(he.get("start", 0.0))
                end = float(he.get("end", start + 5.0))
                html_content = he.get("html_content") or he.get("html", "")
                if not html_content:
                    continue
                
                # Dynamic background transparent cleaning
                def force_python_transparency(html: str) -> str:
                    if not html: return ''
                    cleaned = html
                    for bg in ["bg-white", "bg-slate-50", "bg-neutral-50", "bg-zinc-50", "bg-gray-50"]:
                        cleaned = cleaned.replace(bg, "bg-transparent")
                    import re
                    def repl(m):
                        val = m.group(2).strip().lower().replace('!important', '').strip()
                        is_white_like = val in [
                            'white', '#fff', '#ffffff', '#f8fafc', '#f3f4f6', 
                            '#fafafa', '#f5f5f5', '#f9fafb'
                        ] or '255,255,255' in val or '255, 255, 255' in val or '248,250,252' in val or '243,244,246' in val
                        if is_white_like:
                            return 'background-color: transparent !important'
                        return m.group(0)
                    cleaned = re.sub(
                        r'background(-color)?\s*:\s*([^;\'"]+)',
                        repl,
                        cleaned,
                        flags=re.IGNORECASE
                    )
                    return cleaned
                
                html_content = force_python_transparency(html_content)
                
                duration_sec = end - start
                duration_frames = min(299, remotion_max_frames, max(24, int(duration_sec * 24)))
                
                props_file = os.path.join(remotion_dir, "props", f"_render_props_graphics_{idx}.json")
                os.makedirs(os.path.dirname(props_file), exist_ok=True)
                import json as _json
                with open(props_file, "w", encoding="utf-8") as _f:
                    _json.dump({
                        "htmlContent": html_content,
                        "transparent": True,
                    }, _f, ensure_ascii=False)
                
                overlay_path = os.path.abspath(working_path.replace(".mp4", f"_graphics_{idx}.webm"))
                temp_out = base_name + f"_remotion_graphics_blend_{idx}.mp4"
                
                print(f"[GraphicsRenderer] Rendering HtmlGraphicsScene composition at t={start}s ({duration_frames} frames)")
                
                render_cmd = (
                    f'npx remotion render src/index.tsx HtmlGraphicsScene'
                    f' "{overlay_path}"'
                    f' "--props={props_file}"'
                    f' --frames 0-{duration_frames - 1}'
                    f' --codec vp8'
                    f' --image-format png'
                    f' --pixel-format yuva420p'
                    f' --background-color 00000000'
                    f' --log error'
                )
                
                try:
                    render_result = subprocess.run(
                        render_cmd,
                        cwd=remotion_dir,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        shell=True,
                        timeout=remotion_timeout,
                    )
                except subprocess.TimeoutExpired:
                    print(f"[GraphicsRenderer] ⏰ Remotion render timed out for graphics {idx}, skipping")
                    continue
                    
                if render_result.returncode != 0:
                    print(f"[GraphicsRenderer] Remotion failed: {render_result.stderr.decode(errors='replace')[:250]}")
                    continue
                    
                if not os.path.exists(overlay_path):
                    print(f"[GraphicsRenderer] No overlay file produced, skipping")
                    continue
                
                # Composite WebM onto video using FFmpeg
                blend_cmd = [
                    "ffmpeg", "-i", working_path,
                    "-i", overlay_path,
                    "-filter_complex", (
                        f"[0:v]trim=0:{start},setpts=PTS-STARTPTS[before];"
                        f"[0:v]trim={start}:{end},setpts=PTS-STARTPTS[during];"
                        f"[0:v]trim={end},setpts=PTS-STARTPTS[after];"
                        f"[during][1:v]overlay=0:0:format=auto[during_out];"
                        f"[before][during_out][after]concat=n=3:v=1:a=0[outv]"
                    ),
                    "-map", "[outv]", "-map", "0:a",
                    "-c:v", "libx264", "-c:a", "copy", "-preset", mid_preset, "-crf", str(mid_crf),
                    temp_out, "-y", "-loglevel", "error"
                ]
                
                blend_res = subprocess.run(blend_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
                if blend_res.returncode == 0 and os.path.exists(temp_out):
                    _commit_working(temp_out)
                    print(f"[GraphicsRenderer] ✅ Graphics overlay successfully applied for graphics {idx} ({start}s-{end}s)")
                else:
                    print(f"[GraphicsRenderer] FFmpeg overlay failed: {blend_res.stderr.decode()}")
                    
                # Cleanup temp files
                for fpath in (overlay_path, props_file):
                    try:
                        if os.path.exists(fpath):
                            os.remove(fpath)
                    except:
                        pass


    # --- Step 4.5: B-Roll overlay (project time after concat — must match preview) ---
    broll_edits = [e for e in edits if e.get("action") == "add_broll"]
    if broll_edits:
        for broll in broll_edits:
            src_start = float(broll.get("start", 0))
            src_end = float(broll.get("end", src_start + 3))
            if not segment_survives_cuts(src_start, src_end, cuts):
                print(f"[RenderEngine] Skipping B-roll entirely inside cut [{src_start}-{src_end}]")
                continue
            start = remap_source_to_project(src_start, cuts)
            end = remap_source_to_project(src_end, cuts)
            if end <= start + 0.05:
                continue
            duration = end - start
            print(f"[RenderEngine] B-roll source=[{src_start:.2f}-{src_end:.2f}] → project=[{start:.2f}-{end:.2f}]")
            
            broll_path = broll.get("resolved_path")
            if broll_path:
                if not os.path.isabs(broll_path):
                    for prefix in ("", "backend", "../backend", ".."):
                        p = os.path.join(prefix, broll_path)
                        if os.path.exists(p):
                            broll_path = p
                            break
                if not os.path.exists(broll_path):
                    broll_path = None
                    
            if not broll_path:
                q = broll.get("query", "technology")
                broll_path = download_broll(q, duration)
            if broll_path:
                print(f"[RenderEngine] Overlaying broll {broll_path} at {start}-{end}s")
                is_image = (broll.get("media_type") == "image") or str(broll_path).lower().endswith(
                    (".jpg", ".jpeg", ".png", ".webp", ".gif")
                )
                if is_image:
                    b_in = ffmpeg.input(broll_path, loop=1, framerate=30, t=max(0.2, duration)).video
                else:
                    b_in = ffmpeg.input(broll_path).video
                # Scale and crop to target resolution, adjust PTS to start at exact timestamp
                if broll.get("layout") == "split":
                    b_scaled = b_in.filter('scale', width, int(height/2), force_original_aspect_ratio='increase').filter('crop', width, int(height/2)).filter('setpts', f'PTS-STARTPTS+{start}/TB')
                    b_scaled = apply_color_corrections(b_scaled, edits, brand_id=brand_id)
                    v_out = ffmpeg.overlay(v_out, b_scaled, x=0, y=int(height/2), enable=f"between(t,{start},{end})", eof_action='pass')
                else:
                    b_scaled = b_in.filter('scale', width, height, force_original_aspect_ratio='increase').filter('crop', width, height).filter('setpts', f'PTS-STARTPTS+{start}/TB').filter('fade', type='in', start_time=start, duration=0.25)
                    b_scaled = apply_color_corrections(b_scaled, edits, brand_id=brand_id)
                    v_out = ffmpeg.overlay(v_out, b_scaled, enable=f"between(t,{start},{end})", eof_action='pass')
            else:
                # Local professional fallback: Use the original input video stream, but apply a zoom + cyberpunk color grading!
                print(f"[RenderEngine] No Pexels B-Roll downloaded. Using cinematic fallback grade on input video at {start}-{end}s")
                if broll.get("layout") == "split":
                    b_scaled = (
                        ffmpeg.input(input_path).video
                        .filter('trim', start=src_start, end=src_end)
                        .filter('setpts', 'PTS-STARTPTS')
                        .filter('scale', width, int(height/2), force_original_aspect_ratio='increase')
                        .filter('crop', width, int(height/2))
                        .filter('eq', saturation=1.8, contrast=1.2, brightness=0.05)  # Professional pop color grading
                        .filter('hue', h="120")  # Cyberpunk gold/cyan tint
                        .filter('setpts', f'PTS-STARTPTS+{start}/TB')
                    )
                    b_scaled = apply_color_corrections(b_scaled, edits, brand_id=brand_id)
                    v_out = ffmpeg.overlay(v_out, b_scaled, x=0, y=int(height/2), enable=f"between(t,{start},{end})", eof_action='pass')
                else:
                    b_scaled = (
                        ffmpeg.input(input_path).video
                        .filter('trim', start=src_start, end=src_end)
                        .filter('setpts', 'PTS-STARTPTS')
                        .filter('scale', width, height, force_original_aspect_ratio='increase')
                        .filter('crop', width, height)
                        .filter('eq', saturation=1.8, contrast=1.2, brightness=0.05)  # Professional pop color grading
                        .filter('hue', h="120")  # Cyberpunk gold/cyan tint
                        .filter('setpts', f'PTS-STARTPTS+{start}/TB')
                    )
                    b_scaled = apply_color_corrections(b_scaled, edits, brand_id=brand_id)
                    v_out = ffmpeg.overlay(v_out, b_scaled, enable=f"between(t,{start},{end})", eof_action='pass')

    # --- Step 5: Subtitles via separate subprocess pass (avoids Windows path/space issues) ---
    # We do NOT add the ASS filter to the main graph. Instead we run the main 
    # pipeline first, then apply subtitles in a second ffmpeg subprocess call.
    # This is necessary because ffmpeg's 'ass' filter on Windows fails silently
    # when the path contains spaces (e.g. "montage AI").

    def _run_ffmpeg_with_timeout(stream, timeout_sec=600):
        """Run ffmpeg-python stream with a hard timeout to prevent infinite hangs."""
        proc = stream.run_async(pipe_stdout=True, pipe_stderr=True, overwrite_output=True)
        try:
            _, stderr_bytes = proc.communicate(timeout=timeout_sec)
            if proc.returncode != 0:
                return False, stderr_bytes.decode("utf-8", errors="replace")
            return True, ""
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            return False, f"FFmpeg timed out after {timeout_sec}s"

    try:
        # Optional Instagram Reels target frame (9:16)
        if target_width and target_height:
            tw = int(target_width) if int(target_width) % 2 == 0 else int(target_width) - 1
            th = int(target_height) if int(target_height) % 2 == 0 else int(target_height) - 1
            v_out = (
                v_out
                .filter("scale", tw, th, force_original_aspect_ratio="increase")
                .filter("crop", tw, th)
                .filter("setsar", "1")
            )
            print(f"[RenderEngine] Scaling export to Reels {tw}x{th}")
            width, height = tw, th

        encode_kwargs = dict(
            vcodec="libx264",
            acodec="aac",
            preset=export_preset or "fast",
            crf=int(export_crf) if export_crf is not None else 18,
            audio_bitrate=export_audio_bitrate or "192k",
            pix_fmt="yuv420p",
            movflags="+faststart",
        )

        if has_subtitles and a_out is not None:
            pre_sub_output = output_path.replace('.mp4', '_presub.mp4')
            out = ffmpeg.output(v_out, a_out, pre_sub_output, **encode_kwargs)
            ok, err = _run_ffmpeg_with_timeout(out)
            if not ok:
                print(f"[RenderEngine] Main FFmpeg FAILED: {err[:300]}")
                return False
        else:
            out = ffmpeg.output(v_out, a_out, output_path, **encode_kwargs)
            ok, err = _run_ffmpeg_with_timeout(out)
            if not ok:
                print(f"[RenderEngine] Main FFmpeg FAILED: {err[:300]}")
                return False
                
            mask_edit = next((e for e in edits if e.get("action") == "speaker_masking"), None)
            is_masking_enabled = mask_edit is not None and mask_edit.get("enabled", False)
            if is_masking_enabled:
                unblurred_output = output_path.replace('.mp4', '_unblurred.mp4')
                import shutil
                if os.path.exists(output_path):
                    shutil.copy2(output_path, unblurred_output)
                    effect_type = mask_edit.get("effect_type", "behind_text")
                    if effect_type == "blur_bg":
                        blur_strength = mask_edit.get("blur_strength", 10.0)
                        temp_blur = output_path.replace('.mp4', '_blur_temp.mp4')
                        subprocess.run([
                            'ffmpeg', '-y', '-i', unblurred_output,
                            '-vf', f'boxblur={blur_strength}',
                            '-c:a', 'copy', temp_blur
                        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                        if os.path.exists(temp_blur):
                            safe_replace(temp_blur, output_path)
                    
                    from app.services.masking_service import apply_speaker_masking
                    apply_speaker_masking(unblurred_output, output_path, mask_edit, width, height)
                    
                    if os.path.exists(unblurred_output):
                        try:
                            os.remove(unblurred_output)
                        except OSError:
                            pass
    except Exception as e:
        print(f"[RenderEngine] Main FFmpeg Exception: {e}")
        return False

    # --- Step 6: Apply ASS subtitles via subprocess (Windows-safe) ---
    if has_subtitles and os.path.exists(ass_path) and os.path.exists(pre_sub_output):
        import tempfile, shutil
        
        # Check masking config
        mask_edit = next((e for e in edits if e.get("action") == "speaker_masking"), None)
        is_masking_enabled = mask_edit is not None and mask_edit.get("enabled", False)
        
        pre_sub_unblurred = None
        if is_masking_enabled:
            pre_sub_unblurred = pre_sub_output.replace('.mp4', '_unblurred.mp4')
            shutil.copy2(pre_sub_output, pre_sub_unblurred)
            
            effect_type = mask_edit.get("effect_type", "behind_text")
            if effect_type == "blur_bg":
                blur_strength = mask_edit.get("blur_strength", 10.0)
                temp_blur = pre_sub_output.replace('.mp4', '_blur_temp.mp4')
                subprocess.run([
                    'ffmpeg', '-y', '-i', pre_sub_unblurred,
                    '-vf', f'boxblur={blur_strength}',
                    '-c:a', 'copy', temp_blur
                ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if os.path.exists(temp_blur):
                    safe_replace(temp_blur, pre_sub_output)
        
        temp_dir = tempfile.gettempdir()
        # Use a SIMPLE filename with no colons/spaces/special chars for the filter string
        simple_ass_name = "montage_sub_tmp.ass"
        temp_ass_path = os.path.join(temp_dir, simple_ass_name)
        shutil.copy2(ass_path, temp_ass_path)
        
        # Copy fonts dir to temp (no spaces in path)
        fonts_src = resolve_fonts_dir() or os.path.abspath('fonts')
        temp_fonts = os.path.join(temp_dir, 'montage_fonts')
        if os.path.exists(fonts_src) and not os.path.exists(temp_fonts):
            try:
                shutil.copytree(fonts_src, temp_fonts)
                print(f"[Subtitles] Fonts from {fonts_src} → {temp_fonts}")
            except Exception as e:
                print(f"[Subtitles] Font copy warning: {e}")
        elif not os.path.exists(temp_fonts):
            os.makedirs(temp_fonts, exist_ok=True)
        elif fonts_src and os.path.isdir(fonts_src):
            # Ensure latest TTFs exist even if temp dir was created earlier
            try:
                for f in os.listdir(fonts_src):
                    if not f.lower().endswith((".ttf", ".otf")):
                        continue
                    src_f = os.path.join(fonts_src, f)
                    dst_f = os.path.join(temp_fonts, f)
                    if os.path.isfile(src_f) and not os.path.exists(dst_f):
                        shutil.copy2(src_f, dst_f)
            except Exception as e:
                print(f"[Subtitles] Font sync warning: {e}")
            
        # Copy brand-specific fonts to temp_fonts
        if brand_id:
            brand_fonts_src = os.path.abspath(os.path.join('uploads', 'brands', brand_id, 'fonts'))
            if os.path.exists(brand_fonts_src):
                try:
                    for f in os.listdir(brand_fonts_src):
                        src_f = os.path.join(brand_fonts_src, f)
                        dst_f = os.path.join(temp_fonts, f)
                        if os.path.isfile(src_f):
                            shutil.copy2(src_f, dst_f)
                    print(f"[Subtitles] Copied brand fonts from {brand_fonts_src} to {temp_fonts}")
                except Exception as e:
                    print(f"[Subtitles] Brand font copy warning: {e}")
        
        # KEY FIX: Run FFmpeg from temp_dir using RELATIVE filename in filter string.
        # This avoids ALL Windows path escaping issues (drive letter colons, spaces).
        # -i and output use absolute paths which FFmpeg handles normally.
        if os.path.exists(temp_fonts):
            fonts_arg = ":fontsdir=montage_fonts"
        else:
            fonts_arg = ""

        abs_presub = os.path.abspath(pre_sub_output)
        abs_output = os.path.abspath(output_path)
        accent_ass_src = (
            ass_path[:-4] + "_accent.ass"
            if ass_path.lower().endswith(".ass")
            else ass_path + "_accent.ass"
        )
        use_text_mask = os.path.exists(accent_ass_src) and (
            (subtitle_edit or {}).get("caption_look") == "dropcap"
            or (subtitle_edit or {}).get("subtitle_preset") == "resolve_dropcap"
        )

        try:
            if use_text_mask:
                simple_accent = "montage_sub_accent.ass"
                shutil.copy2(accent_ass_src, os.path.join(temp_dir, simple_accent))
                # White glyphs on black, then difference = inverted video inside letters.
                filter_complex = (
                    "[0:v]split[base][ink];"
                    "[ink]drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill[blk];"
                    f"[blk]ass=filename={simple_ass_name}{fonts_arg}[mask];"
                    "[base][mask]blend=all_mode=difference[inv];"
                    f"[inv]ass=filename={simple_accent}{fonts_arg}[vout]"
                )
                print(f"[Subtitles] cwd={temp_dir}, text-mask difference blend")
                result = subprocess.run(
                    [
                        "ffmpeg", "-i", abs_presub,
                        "-filter_complex", filter_complex,
                        "-map", "[vout]", "-map", "0:a?",
                        "-c:a", "copy", abs_output, "-y", "-loglevel", "warning",
                    ],
                    cwd=temp_dir,
                    stderr=subprocess.PIPE, stdout=subprocess.PIPE,
                    timeout=300,
                )
            else:
                vf_filter = f"ass=filename={simple_ass_name}{fonts_arg}" if fonts_arg else f"ass={simple_ass_name}"
                print(f"[Subtitles] cwd={temp_dir}, filter={vf_filter}")
                result = subprocess.run(
                    ['ffmpeg', '-i', abs_presub, '-vf', vf_filter,
                     '-c:a', 'copy', abs_output, '-y', '-loglevel', 'warning'],
                    cwd=temp_dir,
                    stderr=subprocess.PIPE, stdout=subprocess.PIPE,
                    timeout=300,
                )

            if result.returncode != 0:
                err = result.stderr.decode('utf-8', errors='replace')
                print(f"[Subtitles] FAILED (code {result.returncode}): {err}")
                safe_replace(abs_presub, abs_output)
            else:
                # Apply speaker masking overlay
                if is_masking_enabled and pre_sub_unblurred and os.path.exists(pre_sub_unblurred):
                    from app.services.masking_service import apply_speaker_masking
                    apply_speaker_masking(pre_sub_unblurred, output_path, mask_edit, width, height)
                
                # Cleanup presub files
                if os.path.exists(abs_presub):
                    try:
                        os.remove(abs_presub)
                    except OSError:
                        pass
                if pre_sub_unblurred and os.path.exists(pre_sub_unblurred):
                    try:
                        os.remove(pre_sub_unblurred)
                    except OSError:
                        pass
                print(f"[Subtitles] SUCCESS")
        except Exception as e:
            print(f"[Subtitles] Exception: {e}")
            if os.path.exists(abs_presub):
                try:
                    safe_replace(abs_presub, abs_output)
                except OSError as move_err:
                    print(f"[Subtitles] Fallback move failed: {move_err}")
        
        return True
    
    # --- Step 7: Audio normalization (loudnorm) ---
    # Equalizes volume: makes quiet parts louder, loud parts softer
    if do_loudnorm and os.path.exists(output_path):
        print("[Audio] Applying loudnorm normalization...")
        norm_output = output_path.replace('.mp4', '_norm.mp4')
        try:
            norm_result = subprocess.run(
                ['ffmpeg', '-i', output_path,
                 '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
                 '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                 norm_output, '-y', '-loglevel', 'warning'],
                stderr=subprocess.PIPE, stdout=subprocess.PIPE,
                timeout=300,
            )
            if norm_result.returncode == 0 and os.path.exists(norm_output):
                safe_replace(norm_output, output_path)
                print("[Audio] ✅ Loudnorm normalization applied successfully")
            else:
                err = norm_result.stderr.decode('utf-8', errors='replace')
                print(f"[Audio] Normalization failed (non-critical): {err[:200]}")
                if os.path.exists(norm_output):
                    try:
                        os.remove(norm_output)
                    except OSError:
                        pass
        except Exception as e:
            print(f"[Audio] Normalization exception (non-critical): {e}")
            if os.path.exists(norm_output):
                try:
                    os.remove(norm_output)
                except OSError:
                    pass
    
    return True

