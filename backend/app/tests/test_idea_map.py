from app.services.content_look import default_look
from app.services.idea_map import (
    build_idea_map,
    fallback_html,
    infer_kind,
    parse_idea_map,
    pick_visual,
)
from app.services.beat_sheet import build_beat_sheet, snap_tools_to_beats
from app.workflows.graphics_developer import _pick_scene_kind
from app.workflows.retention_critic import RetentionCritic


def _words(pairs):
    words = []
    t = 0.0
    for text, dur in pairs:
        for w in text.split():
            words.append({"word": w, "start": t, "end": t + dur})
            t += dur
    return {"words": words, "text": " ".join(p[0] for p in pairs)}


def test_infer_steps_and_compare():
    assert infer_kind("сначала трафик потом конверсия") == "steps"
    assert infer_kind("это vs то против старого") == "compare"
    assert infer_kind("упало потому что алгоритм режет досмотр") == "cause"
    assert infer_kind("привет я дома расскажу как есть") is None


def test_nodes_come_from_this_speech_not_generic():
    a = build_idea_map("сначала трафик потом конверсия потом деньги", default_look("signal"))
    b = build_idea_map("сначала прогрев потом оффер потом закрытие", default_look("signal"))
    assert a and b
    assert a["nodes"] != b["nodes"]
    assert "трафик" in " ".join(a["nodes"]).lower()
    assert "оффер" in " ".join(b["nodes"]).lower()
    assert "STEP" not in "".join(a["nodes"]).upper()


def test_engine_picks_visual_from_kind():
    assert pick_visual("steps", ["а", "б", "в"]) == "rail"
    assert pick_visual("path", ["из", "в"]) == "rail"
    assert pick_visual("compare", ["было", "стало"]) == "split"
    assert pick_visual("cause", ["если", "то"]) == "split"
    spec = build_idea_map("сначала трафик потом конверсия потом деньги", default_look("signal"))
    assert spec["visual"] == "rail"
    vs = build_idea_map("старый метод vs новый подход", default_look("signal"))
    assert vs and vs["visual"] == "split"
    cause = build_idea_map("упало потому что алгоритм режет досмотр", default_look("ink"))
    assert cause and cause["visual"] == "split"


def test_parse_map_prompt():
    spec = parse_idea_map("MAP:path | трафик → конверсия", default_look("ink"))
    assert spec["kind"] == "path"
    assert spec["visual"] == "rail"
    assert spec["nodes"] == ["трафик", "конверсия"]
    tagged = parse_idea_map("MAP:compare/split | было → стало", default_look("ink"))
    assert tagged["visual"] == "split"


def test_fallback_draws_speech_nodes_and_look_accent():
    look = default_look("signal")
    spec = {
        "kind": "steps",
        "visual": "rail",
        "nodes": ["трафик", "конверсия"],
        "seed": 3,
        "family": "signal",
    }
    html = fallback_html(spec, 4.0, 3.2, "9:16", look=look)
    assert "idea-rail" in html
    assert "ТРАФИК" in html
    assert "КОНВЕРСИЯ" in html
    assert look["palette"]["accent"] in html
    assert "glass-card" not in html
    assert "map-line" not in html
    assert "back.out" not in html
    assert "#FACC15" not in html
    split = fallback_html(
        {"kind": "compare", "visual": "split", "nodes": ["было", "стало"], "family": "signal"},
        1.0, 3.0, "9:16", look=look,
    )
    assert "idea-split" in split
    assert "VS" in split
    assert 'data-idea-visual="split"' in split
    compact = split.replace(" ", "")
    assert "bottom:8%" in compact
    assert "top:16%" not in compact
    rail = fallback_html(spec, 4.0, 3.2, "9:16", look=look)
    assert 'data-idea-visual="rail"' in rail
    assert "bottom:8%" in rail.replace(" ", "")
    assert "top:16%" not in rail


def test_overlay_stays_out_of_face_zone():
    look = default_look("signal")
    for visual in ("rail", "split", "stack", "thesis"):
        html = fallback_html(
            {"kind": "compare" if visual == "split" else "steps", "visual": visual,
             "nodes": ["трафик", "конверсия"], "family": "signal"},
            1.0, 3.0, "9:16", look=look,
        )
        blob = html.replace(" ", "").lower()
        assert "bottom:8%" in blob
        assert "top:auto!important" in blob or "top:auto" in blob
        assert 'data-idea-visual="' + visual + '"' in html
        assert "max-height:18%" in blob or "max-height:16%" in blob


def test_bare_if_is_not_a_map():
    assert infer_kind("и всё получится если верить себе") is None
    assert build_idea_map("и всё получится если верить себе", default_look("ink")) is None


def test_compare_uses_words_next_to_vs():
    spec = build_idea_map(
        "речь про сути МСП сервер vs говоря научным темпом дальше",
        default_look("signal"),
    )
    assert spec and spec["visual"] == "split"
    assert all(len(n.split()) <= 2 for n in spec["nodes"])
    blob = " ".join(spec["nodes"]).lower()
    assert "сервер" in blob
    assert "говоря" in blob
    assert "сути" not in blob


def test_mechanism_beat_becomes_diagram():
    data = _words([
        ("слушай это меняет всё что ты знал про монтаж речи", 0.4),
        ("проблема в том что люди слишком долго ждут идеальный момент", 0.4),
        ("сначала бери трафик потом считай конверсию и режь паузы", 0.4),
        ("восемьдесят процентов уже теряют зрителя на третьей секунде", 0.35),
        ("поэтому делай хук сейчас и не размазывай мысль", 0.4),
    ])
    sheet = build_beat_sheet(
        data,
        hook="слушай это меняет",
        hook_start=0.0,
        hook_end=2.0,
        look=default_look("ink"),
        duration=22.0,
        topic_boundaries=[
            {"time": 3.6},
            {"time": 7.6},
            {"time": 11.2},
            {"time": 14.0},
        ],
    )
    diagrams = [b for b in sheet["beats"] if b["job"] == "diagram"]
    assert diagrams, sheet["beats"]
    assert any(b["concept"].startswith("MAP:") for b in diagrams)
    assert any("трафик" in (b.get("concept") or "").lower() for b in diagrams)
    assert diagrams[0].get("idea_map", {}).get("nodes")


def test_raw_chat_does_not_force_diagram():
    data = _words([
        ("привет я дома расскажу как есть", 0.4),
        ("просто выключи шум вокруг", 0.4),
        ("и всё получится если верить себе", 0.4),
    ])
    sheet = build_beat_sheet(data, look=default_look("raw"), duration=12.0)
    assert all(b["job"] != "diagram" for b in sheet["beats"])


def test_snap_injects_missing_idea_map():
    sheet = {
        "beats": [
            {"id": 1, "job": "title", "start": 1.8, "end": 4.4, "concept": "СЛУШАЙ ЭТО", "zoom": False},
            {
                "id": 2, "job": "diagram", "start": 8.0, "end": 12.0,
                "concept": "MAP:steps | трафик → конверсия",
                "idea_map": {"kind": "steps", "nodes": ["трафик", "конверсия"], "seed": 1},
                "zoom": False,
            },
        ]
    }
    calls = [
        {"name": "create_scene", "arguments": {"layout": "fullscreen", "start_time": 12, "duration": 8, "concept_prompt": "WRONG"}},
        {"name": "design_sound", "arguments": {}},
    ]
    snapped = snap_tools_to_beats(calls, sheet, full=True)
    maps = [
        c for c in snapped
        if c["name"] == "create_scene" and (c["arguments"].get("scene_template") == "idea_map")
    ]
    assert len(maps) == 1
    assert maps[0]["arguments"]["start_time"] == 8.0
    assert maps[0]["arguments"]["layout"] == "overlay"
    assert maps[0]["arguments"]["concept_prompt"].startswith("MAP:")


def test_pick_scene_kind_map():
    assert _pick_scene_kind("full_broll", "fullscreen", "idea_map", "MAP:path | а → б") == "map"
    assert _pick_scene_kind("overlay", "overlay", "idea_map", "MAP:steps/rail | а → б") == "map"
    assert _pick_scene_kind("full_broll", "fullscreen", "kinetic_title", "ДАННЫЕ РЕШАЮТ") == "title"


def test_critic_flags_empty_diagram_beat():
    sheet = {"beats": [
        {"id": 1, "job": "diagram", "start": 4.0, "end": 8.0, "concept": "MAP:path | а → б"},
        {"id": 2, "job": "face", "start": 8.0, "end": 20.0, "zoom": False, "concept": "X"},
    ]}
    result = RetentionCritic.audit(
        [{"action": "add_asset", "start": 0.0, "asset_query": "lofi", "is_bgm": True}],
        20.0,
        beat_sheet=sheet,
    )
    assert any("diagram" in i for i in result["issues"])
