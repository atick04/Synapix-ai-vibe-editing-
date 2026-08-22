from app.services.beat_sheet import (
    build_beat_sheet,
    director_beat_contract,
    is_full_montage,
    overlapping_accents,
    snap_tools_to_beats,
    sort_tool_calls,
)
from app.services.content_look import default_look
from app.workflows.retention_critic import RetentionCritic


def _words(pairs):
    words = []
    t = 0.0
    for text, dur in pairs:
        for w in text.split():
            words.append({"word": w, "start": t, "end": t + dur})
            t += dur
    return {"words": words, "text": " ".join(p[0] for p in pairs)}


def test_full_montage_detects_auto_edit():
    assert is_full_montage("Сделай авто-монтаж Instagram Reels")
    assert not is_full_montage("добавь музыку lofi")
    assert not is_full_montage("добавь субтитры")
    assert not is_full_montage("добавь кинетические субтитры")
    assert not is_full_montage("субтитры для reels")


def test_subtitle_request_strips_cuts_and_sfx():
    from app.services.beat_sheet import filter_tools_for_intent, targeted_allowlist
    assert targeted_allowlist("Добавь субтитры") == frozenset({"build_kinetic_typography"})
    calls = [
        {"name": "cut_clip", "arguments": {"start_time": 1, "end_time": 2}},
        {"name": "build_kinetic_typography", "arguments": {"subtitle_preset": "resolve_classic"}},
        {"name": "design_sound", "arguments": {}},
        {"name": "build_transition", "arguments": {}},
    ]
    kept = filter_tools_for_intent(calls, "Добавь субтитры")
    assert [c["name"] for c in kept] == ["build_kinetic_typography"]
    injected = filter_tools_for_intent(
        [{"name": "cut_clip", "arguments": {"start_time": 0, "end_time": 1}}],
        "добавь субтитры",
    )
    assert [c["name"] for c in injected] == ["build_kinetic_typography"]
    assert injected[0]["arguments"].get("subtitle_preset") == "resolve_classic"

    from app.services.beat_sheet import planned_calls_for_message
    assert planned_calls_for_message("добавь субтитры")[0]["name"] == "build_kinetic_typography"


def test_direct_subtitles_do_not_cut_or_add_sfx():
    import asyncio
    from app.services.direct_edit import apply_direct_intent

    edits, reply = asyncio.run(apply_direct_intent(
        "pytest-direct-subs",
        "Добавь субтитры",
        [{"action": "change_format", "format": "9:16", "fit": "cover"}],
    ))
    actions = [e.get("action") for e in edits]
    assert "add_subtitles" in actions
    assert "change_format" in actions
    assert "cut_out" not in actions
    assert not any(e.get("action") == "add_asset" for e in edits)
    assert "субтит" in reply.lower()


def test_beat_sheet_hook_is_title_for_ink():
    data = _words([
        ("слушай это меняет всё что ты знал про монтаж речи", 0.45),
        ("проблема в том что люди слишком долго ждут идеальный момент", 0.4),
        ("механизм простой считай цифры и режь паузы сразу", 0.4),
        ("восемьдесят процентов уже теряют зрителя на третьей секунде", 0.4),
        ("поэтому делай хук сейчас и не размазывай мысль", 0.45),
    ])
    sheet = build_beat_sheet(
        data,
        hook="слушай это меняет",
        hook_start=0.0,
        hook_end=2.0,
        look=default_look("ink"),
        duration=18.0,
    )
    beats = sheet["beats"]
    assert 3 <= len(beats) <= 8
    assert beats[0]["role"] == "hook"
    assert beats[0]["job"] in ("title", "overlay")
    jobs = {b["job"] for b in beats}
    assert "face" in jobs
    zooms = [b for b in beats if b.get("zoom")]
    assert len(zooms) <= 2
    assert all(b["job"] == "face" for b in zooms)
    stacked = 0
    prev = ""
    for b in beats:
        if b["job"] in ("overlay", "title", "diagram") and prev in ("overlay", "title", "diagram"):
            stacked += 1
        prev = b["job"]
    assert stacked == 0
    text = director_beat_contract(sheet, full=True)
    assert "PICTURE LOCK" in text
    assert "job=face" in text


def test_raw_look_does_not_open_on_fullscreen_title():
    data = _words([
        ("привет я дома расскажу как есть", 0.4),
        ("просто выключи шум вокруг", 0.4),
        ("и всё получится", 0.4),
    ])
    sheet = build_beat_sheet(data, look=default_look("raw"), duration=12.0)
    assert sheet["beats"][0]["job"] != "title"


def test_sort_picture_lock_before_graphics():
    calls = [
        {"name": "create_scene", "arguments": {}},
        {"name": "cut_clip", "arguments": {}},
        {"name": "design_sound", "arguments": {}},
        {"name": "create_zoom", "arguments": {}},
    ]
    names = [c["name"] for c in sort_tool_calls(calls)]
    assert names == ["cut_clip", "create_zoom", "create_scene", "design_sound"]


def test_snap_maps_title_to_title_beat():
    sheet = {
        "beats": [
            {"id": 1, "job": "title", "start": 1.8, "end": 4.4, "concept": "СЛУШАЙ ЭТО", "zoom": False},
            {"id": 2, "job": "face", "start": 4.4, "end": 9.0, "concept": "ПРОБЛЕМА", "zoom": True},
        ]
    }
    calls = [
        {"name": "create_scene", "arguments": {"layout": "fullscreen", "start_time": 12, "duration": 8, "concept_prompt": "WRONG"}},
        {"name": "create_scene", "arguments": {"layout": "fullscreen", "start_time": 20, "duration": 5}},
    ]
    snapped = snap_tools_to_beats(calls, sheet, full=True)
    assert len(snapped) == 1
    assert snapped[0]["arguments"]["start_time"] == 1.8
    assert snapped[0]["arguments"]["concept_prompt"] == "WRONG"


def test_critic_skips_broll_demand_without_broll_beats():
    edits = [{"action": "add_asset", "start": 0.0, "asset_query": "lofi", "is_bgm": True}]
    sheet = {"beats": [{"id": 1, "job": "face", "start": 0, "end": 30, "zoom": True, "concept": "X"}]}
    result = RetentionCritic.audit(edits, 30.0, beat_sheet=sheet)
    assert not any("B-roll" in i or "стокового" in i for i in result["issues"])


def test_overlapping_accents_detected():
    edits = [
        {"action": "add_broll", "start": 4.0, "end": 7.0},
        {"action": "hyperframes_html", "start": 5.0, "end": 8.0, "mode": "overlay"},
    ]
    hits = overlapping_accents(edits)
    assert hits
    result = RetentionCritic.audit(edits, 20.0, beat_sheet={"beats": []})
    assert any("Two accents" in i for i in result["issues"])
