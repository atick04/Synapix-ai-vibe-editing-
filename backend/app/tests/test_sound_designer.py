"""Unit tests for Sound Designer v1 event collection and density limits."""

from app.workflows.sound_designer import (
    collect_sound_events,
    existing_sfx_times,
    find_existing_bgm,
    thin_sfx_events,
)
from app.workflows.timeline_state import TimelineState
from app.services.video_service import _looks_like_bgm_edit, _speech_duck_enable


def test_collects_cuts_titles_overlays_broll_not_zooms():
    edits = [
        {"action": "cut_out", "start": 5.0, "end": 6.0},
        {"action": "canvas_overlay", "start": 8.0, "end": 11.0, "mode": "overlay", "graphic_kind": "overlay"},
        {"action": "canvas_overlay", "start": 14.0, "end": 17.0, "mode": "full_broll", "graphic_kind": "title"},
        {"action": "add_broll", "start": 20.0, "end": 22.5, "query": "city night"},
        {"action": "camera_zoom", "start": 10.0, "end": 12.0, "type": "zoom_in"},
    ]
    events = collect_sound_events(edits, duration=30.0, topic_boundaries=[{"time": 18.0}])
    kinds = {e["kind"] for e in events}
    sfx = {e["sfx"] for e in events}
    assert "cut" in kinds
    assert "overlay" in kinds
    assert "title" in kinds
    assert "broll" in kinds
    assert "topic" in kinds
    assert "zoom" not in kinds
    assert "impact" in sfx
    assert "click" in sfx
    assert "whoosh" in sfx
    assert all(e["sfx"] != "whoosh" or e["kind"] != "zoom" for e in events)


def test_density_min_gap_and_head_tail_mute():
    events = [
        {"id": "a", "time": 0.2, "sfx": "whoosh", "kind": "cut"},
        {"id": "b", "time": 1.0, "sfx": "click", "kind": "overlay"},
        {"id": "c", "time": 1.5, "sfx": "whoosh", "kind": "cut"},
        {"id": "d", "time": 8.0, "sfx": "impact", "kind": "title"},
        {"id": "e", "time": 29.9, "sfx": "whoosh", "kind": "cut"},
    ]
    placed = thin_sfx_events(events, duration=30.0)
    times = [e["time"] for e in placed]
    assert 0.2 not in times
    assert 29.9 not in times
    for i in range(1, len(times)):
        assert times[i] - times[i - 1] >= 1.2
    # TITLE impact wins over a nearby whoosh
    assert any(e["sfx"] == "impact" for e in placed)


def test_no_double_whoosh_on_same_timecode():
    events = [
        {"id": "cut-1", "time": 6.0, "sfx": "whoosh", "kind": "cut"},
        {"id": "broll-1", "time": 6.05, "sfx": "whoosh", "kind": "broll"},
        {"id": "title-1", "time": 6.08, "sfx": "impact", "kind": "title"},
    ]
    placed = thin_sfx_events(events, duration=20.0)
    assert len(placed) == 1
    assert placed[0]["sfx"] == "impact"


def test_max_three_hits_per_10s():
    events = [
        {"id": f"h-{i}", "time": 2.0 + i * 1.3, "sfx": "click", "kind": "overlay"}
        for i in range(8)
    ]
    placed = thin_sfx_events(events, duration=40.0)
    # First 10s window starting at 2.0 should not exceed 3
    first_window = [e for e in placed if e["time"] < 12.0]
    assert len(first_window) <= 3


def test_existing_bgm_and_sfx_detection():
    timeline = TimelineState()
    bgm = timeline.add_asset(0.0, None, "Turn It Up", volume=-22, is_bgm=True)
    bgm["duck_db"] = -14
    sfx = timeline.add_asset(4.0, 4.8, "whoosh sfx", volume=-14, is_bgm=False)
    assert find_existing_bgm(timeline.edits) is bgm
    assert existing_sfx_times(timeline.edits) == [4.0]
    assert _looks_like_bgm_edit(bgm)
    assert not _looks_like_bgm_edit(sfx)


def test_speech_duck_enable_merges_windows():
    transcript = {
        "words": [
            {"start": 1.0, "end": 1.2, "word": "привет"},
            {"start": 1.3, "end": 1.5, "word": "мир"},
            {"start": 5.0, "end": 5.4, "word": "дальше"},
        ]
    }
    expr = _speech_duck_enable(transcript, cuts=None)
    assert expr
    assert "between(t,1.000," in expr
    assert "between(t,5.000,5.400)" in expr


def test_fallback_bgm_skips_recent_tracks():
    from app.workflows.production_memory import ProductionMemory
    from app.workflows.sound_designer import fallback_bgm_query

    memory = ProductionMemory({"used_soundtracks": ["turn it up", "arena"]})
    query = fallback_bgm_query(memory, ["reels-energy", "trap-lite"], mood="energy")
    assert query.lower() not in {"turn it up", "arena"}


def test_occupied_sfx_blocks_nearby_hits():
    events = [
        {"id": "n1", "time": 5.0, "sfx": "click", "kind": "overlay"},
        {"id": "n2", "time": 12.0, "sfx": "impact", "kind": "title"},
    ]
    placed = thin_sfx_events(events, duration=20.0, occupied_times=[5.1])
    assert all(e["time"] != 5.0 for e in placed)
    assert any(e["sfx"] == "impact" for e in placed)
