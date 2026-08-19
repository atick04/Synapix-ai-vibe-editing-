"""
Beat sheet — picture-lock contract for auto-montage.

Speech is split into 3–8 narrative beats. Each beat has exactly one job:
  face | title | overlay | broll
Director tools must fill this grid. Graphics never land on a face beat.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

JOBS = ("face", "title", "overlay", "broll")
ROLES = ("hook", "problem", "mechanism", "proof", "turn", "payoff", "cta")

PICTURE_LOCK_TOOLS = ("cut_clip", "change_format")
CAMERA_TOOLS = ("create_zoom",)
COVERAGE_TOOLS = ("add_broll", "create_scene", "add_motion_preset", "set_video_background")
TYPE_TOOLS = ("build_kinetic_typography",)
GRADE_TOOLS = ("apply_color_grade",)
SOUND_TOOLS = ("design_sound", "select_bgm", "build_transition", "apply_topic_transitions", "search_and_add_music")

_PHASE = {}
for i, names in enumerate(
    (PICTURE_LOCK_TOOLS, CAMERA_TOOLS, COVERAGE_TOOLS, TYPE_TOOLS, GRADE_TOOLS, SOUND_TOOLS)
):
    for n in names:
        _PHASE[n] = i


def is_full_montage(message: str) -> bool:
    msg = (message or "").lower()
    keys = (
        "полный монтаж", "авто-монтаж", "автомонтаж", "смонтируй", "смонтировать",
        "монтируй", "начинай", "поехали", "сделай всё", "сделай все",
        "shorts", "reels", "tiktok", "для соцсетей", "динамичн",
        "кинетические субтитры", "хук-графика",
    )
    return any(k in msg for k in keys)


def _duration_from_transcript(data: Dict[str, Any]) -> float:
    words = data.get("words") or []
    if words:
        return float(words[-1].get("end") or 0.0)
    segs = data.get("segments") or []
    if segs:
        return float(segs[-1].get("end") or 0.0)
    return 0.0


def _split_at_times(chunks: List[Dict[str, Any]], times: Sequence[float]) -> List[Dict[str, Any]]:
    cuts = sorted({round(float(t), 2) for t in times if t and t > 1.2})
    if not cuts:
        return list(chunks)
    out: List[Dict[str, Any]] = []
    for ch in chunks:
        start, end = float(ch["start"]), float(ch["end"])
        text = ch.get("text") or ""
        inner = [t for t in cuts if start + 1.4 < t < end - 1.2]
        points = [start] + inner + [end]
        words = text.split()
        n = max(1, len(words))
        span = max(0.01, end - start)
        for i in range(len(points) - 1):
            a, b = points[i], points[i + 1]
            if b - a < 1.3:
                continue
            i0 = int(((a - start) / span) * n)
            i1 = int(((b - start) / span) * n)
            piece = " ".join(words[i0:max(i0 + 1, i1)]).strip() or text
            out.append({"start": a, "end": b, "text": piece})
    return out or list(chunks)


def _fit_count(chunks: List[Dict[str, Any]], lo: int, hi: int) -> List[Dict[str, Any]]:
    items = [dict(c) for c in chunks if float(c["end"]) - float(c["start"]) >= 0.8]
    if not items:
        return chunks
    while len(items) > hi:
        best_i = 0
        best_d = 1e9
        for i in range(len(items) - 1):
            d = float(items[i + 1]["end"]) - float(items[i]["start"])
            if d < best_d:
                best_d = d
                best_i = i
        a, b = items[best_i], items[best_i + 1]
        items[best_i] = {
            "start": a["start"],
            "end": b["end"],
            "text": f"{a.get('text', '')} {b.get('text', '')}".strip(),
        }
        del items[best_i + 1]
    while len(items) < lo:
        idx = max(range(len(items)), key=lambda i: float(items[i]["end"]) - float(items[i]["start"]))
        ch = items[idx]
        mid = (float(ch["start"]) + float(ch["end"])) / 2.0
        if float(ch["end"]) - float(ch["start"]) < 3.6:
            break
        words = (ch.get("text") or "").split()
        half = max(1, len(words) // 2)
        items[idx:idx + 1] = [
            {"start": ch["start"], "end": mid, "text": " ".join(words[:half])},
            {"start": mid, "end": ch["end"], "text": " ".join(words[half:])},
        ]
    return items


def _roles_for(n: int) -> List[str]:
    if n <= 1:
        return ["hook"]
    if n == 2:
        return ["hook", "payoff"]
    if n == 3:
        return ["hook", "problem", "payoff"]
    if n == 4:
        return ["hook", "problem", "proof", "payoff"]
    if n == 5:
        return ["hook", "problem", "mechanism", "proof", "payoff"]
    if n == 6:
        return ["hook", "problem", "mechanism", "proof", "turn", "payoff"]
    roles = ["hook", "problem", "mechanism", "proof", "turn", "payoff", "cta"]
    while len(roles) < n:
        roles.insert(-2, "mechanism")
    return roles[:n]


def _title_budget(look: Dict[str, Any]) -> int:
    raw = str((look.get("montage") or {}).get("title_count") or "1-2")
    nums = [int(x) for x in re.findall(r"\d+", raw)]
    if not nums:
        return 2
    return max(nums)


def _pick_job(
    role: str,
    text: str,
    look: Dict[str, Any],
    titles_left: int,
    overlays_left: int,
    has_user_broll: bool,
) -> str:
    montage = look.get("montage") or {}
    density = str(montage.get("graphic_density") or "low")
    bias = str(montage.get("broll_bias") or "user_first")
    family = look.get("family") or "ink"
    has_num = bool(re.search(r"\d", text or ""))

    if role == "hook":
        if family == "raw" or density == "minimal":
            return "overlay" if overlays_left else "face"
        return "title" if titles_left else "overlay"

    if role in ("payoff", "cta"):
        if titles_left and density == "medium":
            return "title"
        return "face"

    if role == "proof":
        allow_stock = bias in ("metaphor", "user_then_metaphor")
        allow_user = bias in ("user_first", "user_then_metaphor", "metaphor")
        if has_user_broll and allow_user:
            return "broll"
        if allow_stock and not has_user_broll and bias != "none_unless_user":
            return "broll"
        if has_num and overlays_left:
            return "overlay"
        return "face"

    if role == "mechanism":
        if overlays_left and density != "minimal":
            return "overlay"
        return "face"

    if role == "turn":
        if overlays_left and density == "medium":
            return "overlay"
        return "face"

    return "face"


def _headline(text: str, limit: int = 5) -> str:
    words = [w for w in re.split(r"\s+", (text or "").strip()) if w]
    words = [re.sub(r"[^\w\-]+", "", w, flags=re.U) for w in words]
    words = [w for w in words if w][:limit]
    return " ".join(words).upper() if words else "КЛЮЧ"


def build_beat_sheet(
    transcript_data: Optional[Dict[str, Any]] = None,
    *,
    hook: str = "",
    hook_start: float = 0.0,
    hook_end: float = 0.0,
    look: Optional[Dict[str, Any]] = None,
    topic_boundaries: Optional[Sequence[dict]] = None,
    duration: float = 0.0,
    has_user_broll: bool = False,
) -> Dict[str, Any]:
    from app.services.content_look import default_look
    from app.services.topic_transition_service import _build_chunks

    look = look if look and look.get("family") else default_look()
    data = transcript_data or {}
    duration = float(duration or _duration_from_transcript(data) or 12.0)
    chunks = _build_chunks(data, target_chunk_sec=5.0) if data else []
    if not chunks:
        chunks = [{"start": 0.0, "end": duration, "text": hook or "talking head"}]
    times = [float(b.get("time") or 0) for b in (topic_boundaries or [])]
    chunks = _split_at_times(chunks, times)
    speech_end = max((float(c["end"]) for c in chunks), default=duration)
    duration = max(duration, speech_end)
    lo, hi = (5, 8) if speech_end >= 28 else (3, 6) if speech_end >= 12 else (2, 4)
    chunks = _fit_count(chunks, lo, hi)

    # First overlapping hook window becomes the hook chunk
    if hook_end and chunks:
        best = min(
            range(len(chunks)),
            key=lambda i: abs(((chunks[i]["start"] + chunks[i]["end"]) / 2) - ((hook_start + hook_end) / 2)),
        )
        if best != 0:
            hook_chunk = chunks.pop(best)
            chunks.insert(0, hook_chunk)

    roles = _roles_for(len(chunks))
    title_budget = _title_budget(look)
    overlay_budget = 3 if (look.get("montage") or {}).get("graphic_density") == "medium" else 2
    if (look.get("montage") or {}).get("graphic_density") == "minimal":
        overlay_budget = 1
        title_budget = min(title_budget, 1)

    titles_left = title_budget
    overlays_left = overlay_budget
    beats: List[Dict[str, Any]] = []
    for i, (ch, role) in enumerate(zip(chunks, roles)):
        text = (ch.get("text") or "").strip()
        job = _pick_job(role, text, look, titles_left, overlays_left, has_user_broll)
        if job == "title":
            titles_left = max(0, titles_left - 1)
        elif job == "overlay":
            overlays_left = max(0, overlays_left - 1)
        start = round(float(ch["start"]), 2)
        end = round(float(ch["end"]), 2)
        if end - start > 8.5:
            end = round(start + 8.5, 2)
        zoom = job in ("face", "overlay") and role in ("hook", "problem", "proof", "turn")
        concept = _headline(text)
        if job == "overlay" and re.search(r"\d", text):
            m = re.search(r"(\d[\d\s.,]*%?)", text)
            if m:
                concept = f"{concept} | {m.group(1).replace(' ', '')}"
        beats.append({
            "id": i + 1,
            "role": role,
            "job": job,
            "start": start,
            "end": end,
            "text": text[:180],
            "concept": concept,
            "zoom": zoom,
        })

    # Title not before 1.8s unless the hook really starts there
    for b in beats:
        if b["job"] == "title" and b["start"] < 1.6 and b["role"] == "hook":
            b["start"] = round(max(b["start"], 1.8), 2)
            if b["end"] - b["start"] < 2.0:
                b["end"] = round(b["start"] + 2.4, 2)

    return {
        "duration": round(duration, 2),
        "family": look.get("family"),
        "beats": beats,
    }


def director_beat_contract(sheet: Optional[Dict[str, Any]], *, full: bool = True) -> str:
    beats = (sheet or {}).get("beats") or []
    if not beats:
        return ""
    lines = []
    for b in beats:
        zoom = " +zoom" if b.get("zoom") else ""
        lines.append(
            f"{b['id']}. {b['start']:.1f}–{b['end']:.1f}s  {b['role']}/{b['job']}{zoom}  «{b.get('concept') or ''}»"
        )
    grid = "\n".join(lines)
    if not full:
        return f"""
==== BEAT SHEET (ориентир по таймингу) ====
{grid}
Точечная команда: не заполняй всю сетку. Один инструмент. Таймкоды, если нужны, бери из ближайшего бита.
"""
    return f"""
==== BEAT SHEET (контракт picture lock) ====
{grid}

ПОЛНЫЙ АВТОМОНТАЖ — СТРОГО ТРИ ФАЗЫ В ОДНОМ tool_calls:
1) PICTURE LOCK: `cut_clip` (если просили вырезать паузы) + `create_zoom` ТОЛЬКО на битах с +zoom.
2) COVERAGE: `create_scene` fullscreen ТОЛЬКО job=title; overlay ТОЛЬКО job=overlay; `add_broll` ТОЛЬКО job=broll.
   concept_prompt = concept бита. start_time/end_time = границы бита (title 2–3.5с внутри бита).
3) FINISH: `build_kinetic_typography` (preset из Content Look) → `apply_color_grade` (lut из Look) → `design_sound`.

ЗАПРЕЩЕНО:
- графика или B-roll на job=face;
- два акцента (title/overlay/broll) на одном таймкоде;
- TITLE раньше 1.8с;
- сток на бите без job=broll;
- импровизация «закрыть скуку плашкой» вне сетки.
"""


def sort_tool_calls(calls: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    numbered = list(enumerate(calls or []))
    numbered.sort(key=lambda pair: (_PHASE.get(pair[1].get("name") or "", 9), pair[0]))
    return [c for _, c in numbered]


def _is_title_call(call: Dict[str, Any]) -> bool:
    args = call.get("arguments") or {}
    layout = str(args.get("layout") or args.get("mode") or "")
    tmpl = str(args.get("scene_template") or "")
    return layout in ("fullscreen", "cover", "full", "full_broll") or tmpl == "kinetic_title"


def snap_tools_to_beats(
    calls: Sequence[Dict[str, Any]],
    sheet: Optional[Dict[str, Any]],
    *,
    full: bool = True,
) -> List[Dict[str, Any]]:
    beats = list((sheet or {}).get("beats") or [])
    if not beats:
        return list(calls or [])

    def pool(job: str) -> List[Dict[str, Any]]:
        return [b for b in beats if b.get("job") == job]

    titles = pool("title")
    overlays = pool("overlay")
    brolls = pool("broll")
    zoom_beats = [b for b in beats if b.get("zoom")]
    ti = oi = bi = zi = 0
    out: List[Dict[str, Any]] = []

    for call in calls or []:
        name = call.get("name") or ""
        args = dict(call.get("arguments") or {})
        if name == "create_scene":
            if _is_title_call(call):
                if ti >= len(titles):
                    if full:
                        continue
                else:
                    b = titles[ti]
                    ti += 1
                    args["start_time"] = round(b["start"], 2)
                    args["duration"] = round(min(3.4, max(2.0, b["end"] - b["start"])), 2)
                    args["layout"] = "fullscreen"
                    args["scene_template"] = args.get("scene_template") or "kinetic_title"
                    args["concept_prompt"] = args.get("concept_prompt") or b.get("concept")
            else:
                if oi >= len(overlays):
                    if full:
                        continue
                else:
                    b = overlays[oi]
                    oi += 1
                    args["start_time"] = round(b["start"], 2)
                    args["duration"] = round(min(3.2, max(1.8, b["end"] - b["start"])), 2)
                    args["layout"] = args.get("layout") or "overlay"
                    args["scene_template"] = args.get("scene_template") or "abstract"
                    args["concept_prompt"] = args.get("concept_prompt") or b.get("concept")
            out.append({"name": name, "arguments": args})
        elif name == "add_broll":
            if bi >= len(brolls):
                if full:
                    continue
            else:
                b = brolls[bi]
                bi += 1
                args["start_time"] = round(b["start"], 2)
                args["end_time"] = round(min(b["end"], b["start"] + 3.2), 2)
                args["query"] = args.get("query") or b.get("concept") or "detail"
            out.append({"name": name, "arguments": args})
        elif name == "create_zoom":
            if zi < len(zoom_beats):
                b = zoom_beats[zi]
                zi += 1
                span = min(2.4, max(1.3, b["end"] - b["start"] - 0.2))
                args["start_time"] = round(b["start"] + 0.15, 2)
                args["end_time"] = round(args["start_time"] + span, 2)
            out.append({"name": name, "arguments": args})
        else:
            out.append(call if "arguments" in call else {"name": name, "arguments": args})
    return out


def overlapping_accents(edits: Sequence[Dict[str, Any]]) -> List[Tuple[float, float]]:
    slots = []
    for e in edits:
        action = e.get("action")
        if action == "add_broll" or action in (
            "canvas_overlay", "scene_override", "hyperframes_html", "add_hyperframes_graphics"
        ):
            slots.append((float(e.get("start") or 0), float(e.get("end") or 0), action))
    hits = []
    for i, (s1, e1, a1) in enumerate(slots):
        for s2, e2, a2 in slots[i + 1:]:
            if a1 == a2:
                continue
            lo, hi = max(s1, s2), min(e1, e2)
            if hi - lo >= 0.45:
                hits.append((round(lo, 2), round(hi, 2)))
    return hits
