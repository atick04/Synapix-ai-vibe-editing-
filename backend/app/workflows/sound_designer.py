"""
Sound Designer — one-pass orchestrator for Reels bed + sparse SFX.

Does not invent timestamps. Reads the finished timeline (cuts, overlays,
TITLE plates, stock B-roll, topic boundaries) and hangs catalog BGM +
Freesound hits on those events. Density limits live in code, not the prompt.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Sequence

from app.workflows.json_sanitizer import parse_json_blocks_from_text, safe_json_loads
from app.workflows.production_memory import ProductionMemory
from app.workflows.timeline_state import TimelineState
from app.workflows import event_bus

logger = logging.getLogger(__name__)

MIN_SFX_GAP_SEC = 1.2
MAX_SFX_PER_10S = 3
HEAD_MUTE_SEC = 0.4
TAIL_MUTE_SEC = 0.3
SAME_HIT_WINDOW_SEC = 0.15

SFX_PRIORITY = {"impact": 3, "click": 2, "swipe": 2, "whoosh": 1}

SFX_VOLUME_DB = {
    "whoosh": -14.0,
    "click": -18.0,
    "swipe": -16.0,
    "impact": -10.0,
}

SFX_DURATION_SEC = {
    "whoosh": 0.8,
    "click": 0.35,
    "swipe": 0.5,
    "impact": 1.0,
}

SFX_SEARCH_QUERY = {
    "whoosh": "whoosh transition",
    "click": "ui click soft",
    "swipe": "ui swipe whoosh",
    "impact": "cinematic impact hit",
}

GRAPHIC_ACTIONS = {
    "canvas_overlay",
    "scene_override",
    "hyperframes_html",
    "add_hyperframes_graphics",
    "add_motion_graphic",
    "semantic_scene",
}

TITLE_MODES = {"full_broll", "fullscreen", "cover", "full"}

SFX_QUERY_MARKERS = ("sfx", "whoosh", "click", "impact", "swipe", "glitch", "riser")

# Template genre tag → catalog track (exact names used by select_bgm)
GENRE_TRACKS = {
    "reels-energy": "Turn It Up",
    "trap-lite": "Arena",
    "cinematic-pulse": "Bleed",
    "lofi-beat": "Just chill it out",
}

CALM_TRACKS = ["Moonlight", "Silence inside", "relax time", "Just chill it out"]
ENERGY_TRACKS = ["Turn It Up", "Arena", "Bleed", "Jump"]

_SFX_PATH_CACHE: Dict[str, str] = {}

SOUND_LLM_PROMPT = """Ты саунд-дизайнер Instagram Reels. Не выдумывай таймкоды.
Тебе дан готовый список ударов (уже с временем) и каталог треков.
Верни ТОЛЬКО JSON:
{"bgm_query": "<точное имя трека из каталога>", "skip_ids": ["id", ...]}

Правила:
- bgm_query — одно точное имя из списка каталога. Не повторяй треки из used_soundtracks.
- skip_ids — удары, которые лучше пропустить, чтобы микс не был кашей (не больше 30% списка).
- Не пропускай TITLE/impact без причины.
- Зумы уже не входят в список — не предлагай их озвучивать.
"""


def _is_sfx_asset(edit: Dict[str, Any]) -> bool:
    if edit.get("action") != "add_asset":
        return False
    if edit.get("is_bgm"):
        return False
    query = (edit.get("asset_query") or "").lower()
    if any(marker in query for marker in SFX_QUERY_MARKERS):
        return True
    start = float(edit.get("start", 0) or 0)
    end = edit.get("end")
    if end is None:
        return False
    return (float(end) - start) <= 1.6 and start > 0.01


def find_existing_bgm(edits: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    for edit in edits:
        if edit.get("action") != "add_asset":
            continue
        if edit.get("is_bgm"):
            return edit
        query = (edit.get("asset_query") or "").lower()
        if any(marker in query for marker in SFX_QUERY_MARKERS):
            continue
        start = float(edit.get("start", -1) or -1)
        end = edit.get("end")
        if start == 0.0 and (end is None or float(end) > 8.0):
            return edit
    return None


def existing_sfx_times(edits: Sequence[Dict[str, Any]]) -> List[float]:
    times: List[float] = []
    for edit in edits:
        if _is_sfx_asset(edit):
            times.append(float(edit.get("start", 0) or 0))
    return times


def collect_sound_events(
    edits: Sequence[Dict[str, Any]],
    duration: float,
    topic_boundaries: Optional[Sequence[Any]] = None,
) -> List[Dict[str, Any]]:
    """Read timeline hits. Does not invent times."""
    events: List[Dict[str, Any]] = []
    counter = 0

    def _add(time_s: float, sfx: str, kind: str) -> None:
        nonlocal counter
        if time_s < 0 or time_s > duration + 0.05:
            return
        counter += 1
        events.append({
            "id": f"{kind}-{counter}",
            "time": round(float(time_s), 2),
            "sfx": sfx,
            "kind": kind,
        })

    for edit in edits:
        action = edit.get("action")
        start = edit.get("start", edit.get("start_time"))
        if start is None:
            continue
        start = float(start)

        if action == "cut_out":
            _add(start, "whoosh", "cut")
        elif action == "add_broll":
            _add(start, "whoosh", "broll")
        elif action in GRAPHIC_ACTIONS:
            graphic_kind = (edit.get("graphic_kind") or "").lower()
            mode = (edit.get("mode") or edit.get("layout") or "").lower()
            if graphic_kind == "title" or mode in TITLE_MODES:
                _add(start, "impact", "title")
            else:
                _add(start, "click", "overlay")

    for boundary in topic_boundaries or []:
        if isinstance(boundary, dict):
            t = boundary.get("time", boundary.get("start"))
        else:
            t = boundary
        if t is not None:
            _add(float(t), "whoosh", "topic")

    return events


def thin_sfx_events(
    events: Sequence[Dict[str, Any]],
    duration: float,
    skip_ids: Optional[Sequence[str]] = None,
    occupied_times: Optional[Sequence[float]] = None,
) -> List[Dict[str, Any]]:
    """Hard density: min gap, max 3 / 10s, mute head/tail, one hit per timestamp."""
    skip = set(skip_ids or [])
    occupied = [float(t) for t in (occupied_times or [])]

    # Collapse near-duplicate timestamps — keep the higher-priority sfx
    by_slot: Dict[int, Dict[str, Any]] = {}
    for event in events:
        if event.get("id") in skip:
            continue
        slot = int(round(float(event["time"]) / SAME_HIT_WINDOW_SEC))
        prev = by_slot.get(slot)
        if prev is None or SFX_PRIORITY.get(event.get("sfx"), 0) > SFX_PRIORITY.get(prev.get("sfx"), 0):
            by_slot[slot] = event

    candidates = sorted(
        by_slot.values(),
        key=lambda e: (-SFX_PRIORITY.get(e.get("sfx"), 0), float(e["time"])),
    )

    accepted: List[Dict[str, Any]] = []
    tail_limit = max(duration - TAIL_MUTE_SEC, HEAD_MUTE_SEC)

    def _blocked(t: float, placed: Sequence[Dict[str, Any]]) -> bool:
        if any(abs(t - float(p["time"])) < MIN_SFX_GAP_SEC for p in placed):
            return True
        if any(abs(t - ot) < MIN_SFX_GAP_SEC for ot in occupied):
            return True
        window = [p for p in placed if abs(t - float(p["time"])) < 10.0]
        occupied_window = [ot for ot in occupied if abs(t - ot) < 10.0]
        return (len(window) + len(occupied_window)) >= MAX_SFX_PER_10S

    for event in candidates:
        t = float(event["time"])
        if t < HEAD_MUTE_SEC or t > tail_limit:
            continue
        if _blocked(t, accepted):
            continue
        accepted.append(event)

    return sorted(accepted, key=lambda e: float(e["time"]))


def _load_sound_design_config(memory: ProductionMemory) -> Dict[str, Any]:
    from app.services.template_service import get_template, get_default_template_id

    template_id = memory.session.get("template_id") or get_default_template_id()
    tpl = get_template(template_id)
    sound = getattr(tpl, "sound_design", None) if tpl else None
    if sound is None:
        return {
            "genre_tags": ["reels-energy", "lofi-beat"],
            "ducking_volume_db": -14,
            "target_bpm": 118,
        }
    bgm = getattr(sound, "background_music", None)
    return {
        "genre_tags": list(getattr(bgm, "genre_tags", None) or ["reels-energy"]),
        "ducking_volume_db": int(getattr(bgm, "ducking_volume_db", -14) or -14),
        "target_bpm": int(getattr(bgm, "target_bpm", 118) or 118),
    }


def fallback_bgm_query(memory: ProductionMemory, genre_tags: Sequence[str], mood: str = "") -> str:
    used = [s.lower() for s in (memory.session.get("used_soundtracks") or [])]
    mood_l = (mood or "").lower()
    pool: List[str] = []
    if any(k in mood_l for k in ("calm", "forest", "nature", "спокой", "лес", "уют", "lofi")):
        pool.extend(CALM_TRACKS)
    else:
        for tag in genre_tags:
            track = GENRE_TRACKS.get(tag)
            if track:
                pool.append(track)
        pool.extend(ENERGY_TRACKS)
        pool.extend(CALM_TRACKS)

    seen = set()
    ordered: List[str] = []
    for track in pool:
        key = track.lower()
        if key not in seen:
            seen.add(key)
            ordered.append(track)

    for track in ordered:
        if not memory.is_soundtrack_repeated(track) and track.lower() not in used[-2:]:
            return track
    return ordered[0] if ordered else "Just chill it out"


async def _llm_sound_choices(
    events: Sequence[Dict[str, Any]],
    catalog_desc: str,
    used_soundtracks: Sequence[str],
    mood: str,
) -> Dict[str, Any]:
    compact = [
        {"id": e["id"], "time": e["time"], "sfx": e["sfx"], "kind": e["kind"]}
        for e in events
    ]
    user = (
        f"Настроение: {mood or 'reels-energy'}\n"
        f"used_soundtracks: {list(used_soundtracks)}\n"
        f"Каталог:\n{catalog_desc}\n"
        f"Удары: {json.dumps(compact, ensure_ascii=False)}"
    )
    try:
        from app.agents.base_agent import invoke_sound_llm
        response = await invoke_sound_llm(SOUND_LLM_PROMPT, user)
        content = getattr(response, "content", "") or ""
        parsed = parse_json_blocks_from_text(content)
        if isinstance(parsed, list):
            parsed = next((p for p in parsed if isinstance(p, dict)), {})
        if not parsed:
            parsed = safe_json_loads(content)
        if not isinstance(parsed, dict):
            return {}
        skip_ids = parsed.get("skip_ids") or []
        if not isinstance(skip_ids, list):
            skip_ids = []
        max_skip = max(0, int(len(events) * 0.3))
        return {
            "bgm_query": (parsed.get("bgm_query") or "").strip(),
            "skip_ids": [str(x) for x in skip_ids[:max_skip]],
        }
    except Exception as exc:
        logger.warning("Sound designer LLM skipped: %s", exc)
        return {}


def _resolve_sfx_path(sfx_type: str, file_id: str) -> Optional[str]:
    cached = _SFX_PATH_CACHE.get(sfx_type)
    if cached and os.path.exists(cached):
        return cached

    from app.services.stock_provider_service import (
        FALLBACK_SFX_MAP,
        download_stock_asset,
        search_freesound_sfx,
    )
    from app.api.video import add_to_media_library

    query = SFX_SEARCH_QUERY.get(sfx_type, f"{sfx_type} sfx")
    download_url = None
    asset_title = f"{sfx_type} sfx"
    try:
        results = search_freesound_sfx(query)
        if results:
            download_url = results[0].get("url")
            asset_title = results[0].get("title") or asset_title
    except Exception as exc:
        logger.warning("Freesound search failed for %s: %s", sfx_type, exc)

    if not download_url:
        download_url = FALLBACK_SFX_MAP.get(sfx_type) or FALLBACK_SFX_MAP.get("whoosh")

    asset_id = f"sfx_design_{sfx_type}_{int(time.time())}"
    local_path = download_stock_asset(asset_id, download_url) if download_url else None
    if not local_path:
        from app.services.asset_manager import resolve_asset_query
        resolved = resolve_asset_query(query)
        local_path = resolved["rel_path"] if resolved else None

    if not local_path:
        return None

    local_path = local_path.replace("\\", "/")
    try:
        add_to_media_library(
            file_id=file_id,
            asset_id=asset_id,
            filename=asset_title,
            path=local_path,
            duration=SFX_DURATION_SEC.get(sfx_type, 0.8),
        )
    except Exception:
        pass

    _SFX_PATH_CACHE[sfx_type] = local_path
    return local_path


def _place_sfx(timeline: TimelineState, file_id: str, event: Dict[str, Any]) -> bool:
    sfx = event.get("sfx") or "whoosh"
    start = float(event["time"])
    duration = SFX_DURATION_SEC.get(sfx, 0.8)
    duration = max(0.3, min(duration, 1.2))
    volume = SFX_VOLUME_DB.get(sfx, -14.0)
    path = _resolve_sfx_path(sfx, file_id)
    if not path:
        logger.warning("No SFX file for %s at %.2fs", sfx, start)
        return False

    edit = timeline.add_asset(
        start=start,
        end=start + duration,
        asset_query=f"{sfx} sfx",
        volume=volume,
        is_bgm=False,
    )
    edit["resolved_path"] = path
    edit["asset_type"] = "audio"
    edit["sfx_kind"] = event.get("kind")
    return True


def _stamp_bgm_duck(timeline: TimelineState, duck_db: float) -> None:
    bgm = find_existing_bgm(timeline.edits)
    if not bgm:
        return
    bgm["is_bgm"] = True
    bgm["duck_db"] = float(duck_db)
    vol = float(bgm.get("volume", -22) or -22)
    bgm["volume"] = max(-24.0, min(-20.0, vol))


async def run_sound_design(
    timeline: TimelineState,
    memory: ProductionMemory,
    args: Optional[Dict[str, Any]] = None,
) -> str:
    args = args or {}
    file_id = memory.session.get("project_id")
    if not file_id:
        return "Ошибка: Не найден ID проекта во временной памяти сессии"

    duration = float(memory.session.get("duration", 10.0) or 10.0)
    cfg = _load_sound_design_config(memory)
    duck_db = float(args.get("duck_db") or cfg["ducking_volume_db"] or -14)
    skip_bgm = bool(args.get("skip_bgm"))
    mood = (args.get("mood") or memory.session.get("visual_context") or "")[:240]

    topic_boundaries = memory.session.get("topic_boundaries") or []
    if not topic_boundaries:
        transcript_path = os.path.join("uploads", f"{file_id}_transcript.json")
        if os.path.exists(transcript_path):
            try:
                with open(transcript_path, "r", encoding="utf-8") as f:
                    transcript_data = json.load(f)
                from app.services.topic_transition_service import detect_topic_boundaries
                topic_boundaries = detect_topic_boundaries(transcript_data, min_gap_sec=5.0)
            except Exception as exc:
                logger.warning("Topic boundaries for sound design skipped: %s", exc)
    events = collect_sound_events(timeline.edits, duration, topic_boundaries)

    catalog_desc = (
        "Turn It Up, Arena, Bleed, Jump, METAMORPHOSIS, Just chill it out, "
        "Moonlight, Silence inside, relax time, Fall season"
    )
    llm_choice: Dict[str, Any] = {}
    if events or not find_existing_bgm(timeline.edits):
        llm_choice = await _llm_sound_choices(
            events,
            catalog_desc,
            memory.session.get("used_soundtracks") or [],
            mood,
        )

    skip_ids = llm_choice.get("skip_ids") or []
    placed_events = thin_sfx_events(
        events,
        duration,
        skip_ids=skip_ids,
        occupied_times=existing_sfx_times(timeline.edits),
    )

    bgm_msg = "кровать уже на таймлайне"
    if not skip_bgm and not find_existing_bgm(timeline.edits):
        from app.workflows.tool_registry import select_bgm

        query = (llm_choice.get("bgm_query") or "").strip()
        if not query or memory.is_soundtrack_repeated(query):
            query = fallback_bgm_query(memory, cfg["genre_tags"], mood)
        bgm_msg = select_bgm(timeline, memory, {"asset_query": query, "volume": -22})

    _stamp_bgm_duck(timeline, duck_db)

    placed = 0
    for event in placed_events:
        if _place_sfx(timeline, file_id, event):
            placed += 1

    summary = (
        f"Саунд-дизайн: {bgm_msg}; SFX {placed} ударов "
        f"(из {len(events)} событий, duck {duck_db:.0f} dB)"
    )
    event_bus.emit("tool_completed", {"tool": "design_sound", "message": summary})
    logger.info(summary)
    return summary
