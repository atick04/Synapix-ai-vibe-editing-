"""Unit tests for topic-change transition detection."""

from app.services.topic_transition_service import (
    collect_splice_points,
    detect_topic_boundaries,
    boundaries_to_transition_edits,
    is_breath_cut,
)


def test_detects_marker_and_pause_topic_shift():
    transcript = {
        "duration": 40.0,
        "segments": [
            {"start": 0.0, "end": 8.0, "text": "Сегодня расскажу про монтаж видео для соцсетей"},
            {"start": 8.2, "end": 15.0, "text": "Важно снимать с хорошим звуком и светом"},
            {"start": 16.5, "end": 24.0, "text": "А теперь перейдём к цветокоррекции и LUT"},
            {"start": 24.1, "end": 32.0, "text": "Во-вторых про музыку и звуковые эффекты"},
        ],
        "words": [],
    }

    boundaries = detect_topic_boundaries(transcript, min_gap_sec=4.0)
    assert len(boundaries) >= 1
    times = [b["time"] for b in boundaries]
    assert any(t >= 16.0 for t in times)

    edits = boundaries_to_transition_edits(boundaries)
    assert all(e["action"] == "build_transition" for e in edits)
    assert all("start" in e and "transition_type" in e for e in edits)


def test_ignores_same_topic_without_signals():
    transcript = {
        "duration": 20.0,
        "segments": [
            {"start": 0.0, "end": 5.0, "text": "Мы говорим про свет в кадре"},
            {"start": 5.1, "end": 10.0, "text": "Свет в кадре должен быть мягким"},
            {"start": 10.1, "end": 15.0, "text": "Мягкий свет лучше для лица"},
        ],
        "words": [],
    }
    boundaries = detect_topic_boundaries(transcript, min_gap_sec=4.0)
    assert len(boundaries) <= 1


def test_breath_cuts_do_not_get_whoosh():
    edits = [
        {"action": "cut_out", "start": 2.0, "end": 2.8, "reason": "silence", "text": "Затянутая пауза"},
        {"action": "cut_out", "start": 6.0, "end": 6.4, "reason": "filler", "text": "Слово-паразит"},
        {"action": "cut_out", "start": 12.0, "end": 13.5, "reason": "duplicate", "text": "Повтор"},
    ]
    assert is_breath_cut(edits[0])
    assert is_breath_cut(edits[1])
    assert not is_breath_cut(edits[2])
    points = collect_splice_points(edits, from_topics=False, min_gap_sec=2.0, skip_before_sec=1.0)
    times = [p["time"] for p in points]
    assert 13.5 in times
    assert 2.8 not in times
    assert 6.4 not in times
