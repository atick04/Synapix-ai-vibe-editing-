"""
Detect topic-change moments in talking-head transcripts and suggest
where visual/SFX transitions should be placed.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

TOPIC_MARKERS = {
    "итак", "теперь", "дальше", "далее", "во-первых", "во-вторых", "в-третьих",
    "кстати", "а ещё", "а еще", "перейдём", "перейдем", "переходим",
    "с другой стороны", "кроме того", "наконец", "в итоге", "короче говоря",
    "важно", "смотри", "второе", "третье", "следующий", "следующее",
    "поехали", "итак дальше", "ну и", "а теперь",
    "so", "now", "next", "first", "second", "third", "also", "anyway",
    "moving on", "on the other hand", "finally", "another thing",
    "the next", "let's talk", "lets talk",
}

STOPWORDS = {
    "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а", "то",
    "все", "она", "так", "его", "но", "да", "ты", "к", "у", "же", "вы", "за",
    "бы", "по", "ее", "мне", "есть", "это", "эта", "этот", "для", "мы", "из",
    "the", "a", "an", "and", "or", "to", "of", "in", "is", "it", "that", "this",
    "we", "you", "i", "my", "our", "be", "was", "are", "with", "for", "on",
}


def _clean_token(word: str) -> str:
    word = re.sub(r"\[[^\]]+\]|\([^\)]+\)", "", word or "")
    return re.sub(r"[^\w\s-]", "", word).strip().lower()


def _content_tokens(text: str) -> Set[str]:
    tokens = {_clean_token(t) for t in text.split()}
    return {t for t in tokens if t and t not in STOPWORDS and len(t) > 2}


def _jaccard(a: Set[str], b: Set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _starts_with_marker(text: str) -> Optional[str]:
    normalized = _clean_token(text)
    # Prefer longer markers first
    for marker in sorted(TOPIC_MARKERS, key=len, reverse=True):
        if normalized.startswith(marker) or f" {marker} " in f" {normalized} ":
            # Marker must appear near the start of the chunk
            if normalized.startswith(marker) or normalized.find(marker) <= 18:
                return marker
    return None


def _build_chunks(transcript_data: Dict[str, Any], target_chunk_sec: float = 12.0) -> List[Dict[str, Any]]:
    """Build timed text chunks from Whisper segments or word windows."""
    segments = transcript_data.get("segments") or []
    words = transcript_data.get("words") or []

    chunks: List[Dict[str, Any]] = []

    if segments:
        for seg in segments:
            text = (seg.get("text") or "").strip()
            if not text:
                continue
            start = float(seg.get("start", 0.0))
            end = float(seg.get("end", start))
            if end - start < 0.4:
                continue
            chunks.append({"start": start, "end": end, "text": text})
    elif words:
        buf: List[Dict[str, Any]] = []
        chunk_start = None
        for w in words:
            w_start = float(w.get("start", 0.0))
            w_end = float(w.get("end", w_start))
            token = (w.get("word") or "").strip()
            if not token:
                continue
            if chunk_start is None:
                chunk_start = w_start
            buf.append(w)
            if w_end - chunk_start >= target_chunk_sec:
                text = " ".join((x.get("word") or "").strip() for x in buf)
                chunks.append({
                    "start": float(chunk_start),
                    "end": w_end,
                    "text": text,
                })
                buf = []
                chunk_start = None
        if buf and chunk_start is not None:
            text = " ".join((x.get("word") or "").strip() for x in buf)
            chunks.append({
                "start": float(chunk_start),
                "end": float(buf[-1].get("end", chunk_start)),
                "text": text,
            })

    # Merge very short consecutive chunks
    merged: List[Dict[str, Any]] = []
    for ch in chunks:
        if merged and (ch["end"] - merged[-1]["start"] < 6.0) and (ch["start"] - merged[-1]["end"] < 0.35):
            merged[-1]["end"] = ch["end"]
            merged[-1]["text"] = f"{merged[-1]['text']} {ch['text']}".strip()
        else:
            merged.append(dict(ch))
    return merged


def detect_topic_boundaries(
    transcript_data: Dict[str, Any],
    *,
    min_gap_sec: float = 5.0,
    max_transitions: int = 14,
    pause_threshold: float = 0.7,
) -> List[Dict[str, Any]]:
    """
    Heuristic topic-boundary detection.

    Returns list of:
      {
        "time": float,
        "score": float,          # 0..1
        "reason": str,
        "from_topic": str,
        "to_topic": str,
        "suggested_type": str,   # whoosh | glitch | film
      }
    """
    if not transcript_data:
        return []

    chunks = _build_chunks(transcript_data)
    if len(chunks) < 2:
        return []

    candidates: List[Dict[str, Any]] = []

    for i in range(len(chunks) - 1):
        prev_c = chunks[i]
        next_c = chunks[i + 1]
        boundary_time = round(float(next_c["start"]), 2)
        if boundary_time < 3.0:
            continue

        gap = max(0.0, float(next_c["start"]) - float(prev_c["end"]))
        prev_tokens = _content_tokens(prev_c["text"])
        next_tokens = _content_tokens(next_c["text"])
        overlap = _jaccard(prev_tokens, next_tokens)
        marker = _starts_with_marker(next_c["text"])

        score = 0.0
        reasons: List[str] = []

        if marker:
            score += 0.55
            reasons.append(f"marker:{marker}")
        if gap >= pause_threshold:
            # Longer pause = stronger topic break signal
            score += min(0.35, 0.15 + gap * 0.08)
            reasons.append(f"pause:{gap:.2f}s")
        if overlap <= 0.18:
            score += 0.35
            reasons.append(f"topic_shift:{overlap:.2f}")
        elif overlap <= 0.30:
            score += 0.18
            reasons.append(f"soft_shift:{overlap:.2f}")

        # Require at least one strong signal
        if score < 0.45:
            continue

        # Prefer whoosh for sharp topic jumps, film for softer ones
        if score >= 0.75 or gap >= 1.2:
            suggested = "whoosh"
        elif marker:
            suggested = "glitch"
        else:
            suggested = "film"

        from_topic = prev_c["text"].strip()
        to_topic = next_c["text"].strip()
        if len(from_topic) > 90:
            from_topic = from_topic[:87] + "..."
        if len(to_topic) > 90:
            to_topic = to_topic[:87] + "..."

        candidates.append({
            "time": boundary_time,
            "score": round(min(score, 1.0), 3),
            "reason": ", ".join(reasons),
            "from_topic": from_topic,
            "to_topic": to_topic,
            "suggested_type": suggested,
        })

    # Sort by score, then enforce minimum spacing
    candidates.sort(key=lambda c: (-c["score"], c["time"]))
    selected: List[Dict[str, Any]] = []
    for cand in candidates:
        if any(abs(cand["time"] - s["time"]) < min_gap_sec for s in selected):
            continue
        selected.append(cand)
        if len(selected) >= max_transitions:
            break

    selected.sort(key=lambda c: c["time"])
    return selected


async def detect_topic_boundaries_llm(
    transcript_data: Dict[str, Any],
    *,
    min_gap_sec: float = 5.0,
    max_transitions: int = 12,
) -> List[Dict[str, Any]]:
    """
    Optional LLM refinement on top of heuristic chunking.
    Falls back to heuristic on any failure.
    """
    heuristic = detect_topic_boundaries(
        transcript_data,
        min_gap_sec=min_gap_sec,
        max_transitions=max_transitions,
    )
    chunks = _build_chunks(transcript_data)
    if len(chunks) < 3:
        return heuristic

    try:
        from app.agents.base_agent import llm
        from langchain_core.messages import SystemMessage, HumanMessage
        from app.workflows.json_sanitizer import parse_json_blocks_from_text

        chunk_lines = []
        for idx, ch in enumerate(chunks[:40]):
            chunk_lines.append(
                f"{idx}: [{ch['start']:.1f}-{ch['end']:.1f}] {ch['text'][:160]}"
            )
        context = "\n".join(chunk_lines)

        system_prompt = (
            "Ты режиссёр монтажа talking-head видео.\n"
            "Найди моменты СМЕНЫ ТЕМЫ в речи спикера — места, где зритель "
            "должен увидеть монтажный переход (whoosh/glitch/film).\n"
            "Не отмечай обычные паузы внутри одной мысли.\n"
            "Ответ строго JSON:\n"
            "{\n"
            '  \"boundaries\": [\n'
            '    {\"chunk_index\": 3, \"transition_type\": \"whoosh\", \"label\": \"кратко о новой теме\"}\n'
            "  ]\n"
            "}\n"
            f"Максимум {max_transitions} границ. chunk_index — индекс НАЧАЛА новой темы."
        )

        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Сегменты речи:\n{context}"),
        ])
        content = response.content if hasattr(response, "content") else str(response)
        blocks = parse_json_blocks_from_text(content)
        if not blocks:
            return heuristic

        raw = blocks[0].get("boundaries") or []
        refined: List[Dict[str, Any]] = []
        for item in raw:
            try:
                idx = int(item.get("chunk_index", -1))
            except (TypeError, ValueError):
                continue
            if idx <= 0 or idx >= len(chunks):
                continue
            t_type = (item.get("transition_type") or "whoosh").lower()
            if t_type not in {"whoosh", "glitch", "film", "dissolve"}:
                t_type = "whoosh"
            ch = chunks[idx]
            prev = chunks[idx - 1]
            label = (item.get("label") or ch["text"]).strip()
            refined.append({
                "time": round(float(ch["start"]), 2),
                "score": 0.9,
                "reason": f"llm:{label[:80]}",
                "from_topic": prev["text"][:90],
                "to_topic": ch["text"][:90],
                "suggested_type": t_type,
            })

        if not refined:
            return heuristic

        refined.sort(key=lambda c: c["time"])
        spaced: List[Dict[str, Any]] = []
        for cand in refined:
            if any(abs(cand["time"] - s["time"]) < min_gap_sec for s in spaced):
                continue
            spaced.append(cand)
            if len(spaced) >= max_transitions:
                break
        return spaced
    except Exception as e:
        logger.warning(f"LLM topic detection failed, using heuristic: {e}")
        return heuristic


def boundaries_to_transition_edits(
    boundaries: List[Dict[str, Any]],
    *,
    default_type: str = "whoosh",
) -> List[Dict[str, Any]]:
    """Convert detected boundaries into timeline build_transition edits."""
    edits = []
    for b in boundaries:
        t_type = b.get("suggested_type") or default_type
        start = float(b["time"])
        edits.append({
            "action": "build_transition",
            "start": round(start, 2),
            "end": round(start + 0.8, 2),
            "transition_type": t_type,
            "reason": b.get("reason", "topic_change"),
            "from_topic": b.get("from_topic"),
            "to_topic": b.get("to_topic"),
        })
    return edits


def collect_splice_points(
    edits: List[Dict[str, Any]],
    topic_boundaries: Optional[List[Dict[str, Any]]] = None,
    *,
    from_cuts: bool = True,
    from_topics: bool = True,
    min_gap_sec: float = 2.5,
    skip_before_sec: float = 3.0,
) -> List[Dict[str, Any]]:
    """
    Collect montage splice times where a transition should play:
    - after each cut_out (jump-cut join at cut.end)
    - at detected topic-change boundaries
    """
    points: List[Dict[str, Any]] = []

    if from_cuts:
        for e in edits or []:
            if e.get("action") != "cut_out":
                continue
            # Jump-cut splice: next keep segment starts at cut.end
            t = e.get("end", e.get("start"))
            if t is None:
                continue
            points.append({
                "time": round(float(t), 2),
                "suggested_type": "whoosh",
                "reason": f"splice:{e.get('reason', 'cut_out')}",
                "score": 0.85,
            })

    if from_topics:
        for b in topic_boundaries or []:
            if b.get("time") is None:
                continue
            points.append({
                "time": round(float(b["time"]), 2),
                "suggested_type": b.get("suggested_type") or "whoosh",
                "reason": b.get("reason", "topic_change"),
                "score": float(b.get("score", 0.8)),
                "from_topic": b.get("from_topic"),
                "to_topic": b.get("to_topic"),
            })

    # Prefer higher score, enforce spacing
    points.sort(key=lambda p: (-p.get("score", 0), p["time"]))
    selected: List[Dict[str, Any]] = []
    for p in points:
        if p["time"] < skip_before_sec:
            continue
        if any(abs(p["time"] - s["time"]) < min_gap_sec for s in selected):
            continue
        selected.append(p)
    selected.sort(key=lambda p: p["time"])
    return selected


def ensure_transitions_on_splices(
    timeline: Any,
    memory: Any,
    topic_boundaries: Optional[List[Dict[str, Any]]] = None,
    *,
    from_cuts: bool = True,
    from_topics: bool = True,
    min_gap_sec: float = 2.5,
) -> List[str]:
    """
    Director auto-pass: place build_transition on cut splices + topic changes.
    Returns human-readable log lines for the agent feedback loop.
    """
    from app.workflows.tool_registry import build_transition

    edits = timeline.get_serialized_edits() if hasattr(timeline, "get_serialized_edits") else list(timeline.edits)
    points = collect_splice_points(
        edits,
        topic_boundaries,
        from_cuts=from_cuts,
        from_topics=from_topics,
        min_gap_sec=min_gap_sec,
    )
    if not points:
        return []

    existing = []
    for e in edits:
        if e.get("action") == "build_transition":
            t = e.get("start", e.get("start_time"))
            if t is not None:
                existing.append(float(t))

    logs: List[str] = []
    for p in points:
        t = float(p["time"])
        if any(abs(t - et) < 0.5 for et in existing):
            continue
        t_type = p.get("suggested_type") or "whoosh"
        msg = build_transition(timeline, memory, {
            "start_time": t,
            "transition_type": t_type,
        })
        if isinstance(msg, str) and msg.startswith("Успешно"):
            existing.append(t)
            logs.append(f"{t}s/{t_type}")
    return logs
