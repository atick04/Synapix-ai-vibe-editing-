from app.services.resolve_subtitle_pack import (
    RESOLVE_SUBTITLE_PACK,
    get_resolve_subtitle_preset,
    preset_to_subtitle_fields,
    split_dropcap_layout,
)


def test_pack_has_resolve_looks():
    expected = {
        "resolve_stacked",
        "resolve_dropcap",
        "resolve_classic",
        "resolve_boxed",
        "resolve_cinema",
        "resolve_neon",
        "resolve_karaoke",
        "resolve_bar",
        "resolve_pill",
        "resolve_minimal",
    }
    assert expected <= set(RESOLVE_SUBTITLE_PACK)


def test_unknown_preset_falls_back_to_classic():
    p = get_resolve_subtitle_preset("not-a-real-pack")
    assert p["look"] == "outline"
    assert p["use_outline"] is True


def test_stacked_preset_uses_script_pairing():
    fields = preset_to_subtitle_fields("resolve_stacked")
    assert fields["caption_look"] == "stacked"
    assert fields["font_pairing"] == "Lobster"
    assert fields["animation_style"] == "weave"
    assert fields["max_words"] == 5


def test_dropcap_preset_uses_pink_script():
    fields = preset_to_subtitle_fields("resolve_dropcap")
    assert fields["caption_look"] == "dropcap"
    assert fields["font_pairing"] == "Marck Script"
    assert fields["accent_color"] == "#FF2D95"
    assert fields["text_case"] == "UPPER"
    assert fields["max_words"] == 6


def test_split_dropcap_layout_initial_and_flourish():
    layout = split_dropcap_layout(["Почему", "никто", "не", "говорит"])
    assert layout["drop"] == "П"
    assert layout["flourish"] == "говорит"
    assert layout["lines"][0][0].startswith("ОЧЕМУ")
    joined = " ".join(w for line in layout["lines"] for w in line)
    assert "ГОВОРИТ" not in joined
    assert "НИКТО" in joined


def test_boxed_preset_maps_to_ass_box():
    p = get_resolve_subtitle_preset("resolve_boxed")
    assert p["border_style"] == 3
    assert p["look"] == "boxed"
    fields = preset_to_subtitle_fields("resolve_boxed")
    assert fields["caption_look"] == "boxed"
    assert fields["animation_style"] == "slide_up"
    assert fields["use_outline"] is False
