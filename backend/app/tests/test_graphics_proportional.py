"""Smoke tests for proportional plate sizing helpers."""
from app.workflows.graphics_developer import (
    _rewrite_viewport_units,
    _proportional_tokens_css,
    clean_html_fragment,
)


def test_rewrite_vw_vh_to_container_units():
    out = _rewrite_viewport_units("font-size: 4vw; height: 10vh; size: 5vmin;")
    assert "4cqw" in out
    assert "10cqh" in out
    assert "5cqw" in out
    assert "vw" not in out.lower().replace("cqw", "")


def test_proportional_tokens_landscape_overlay():
    css = _proportional_tokens_css("16:9", mode="overlay")
    assert "--plate-max-w: 38%" in css
    assert "container-type: size" in css


def test_proportional_tokens_vertical_overlay():
    css = _proportional_tokens_css("9:16", mode="overlay")
    assert "--plate-max-w: 90%" in css
    assert "--plate-max-h: 38%" in css


def test_proportional_tokens_never_clip_plates():
    css = _proportional_tokens_css("9:16", mode="overlay")
    assert "overflow: visible !important" in css
    assert "max-height: none !important" in css
    assert "overflow-wrap: normal" in css


def test_pick_scene_kind_odysser_mix():
    from app.workflows.graphics_developer import _pick_scene_kind

    assert _pick_scene_kind("overlay", "overlay", "", "ПОДКЛЮЧИ СЕРВЕР | готово") == "abstract"
    assert _pick_scene_kind("overlay", "overlay", "abstract", "что угодно | 12") == "abstract"
    assert _pick_scene_kind("overlay", "overlay", "", "ОШИБКА | 80%") == "plate"
    assert _pick_scene_kind("full_broll", "fullscreen", "", "ДАННЫЕ РЕШАЮТ ВСЁ") == "title"
    assert _pick_scene_kind("full_broll", "fullscreen", "idea_map", "MAP:path | а → б") == "map"


def test_abstract_accent_has_layers_not_plate():
    from app.workflows.graphics_developer import _abstract_accent_fallback

    html = _abstract_accent_fallback("ПОДКЛЮЧИ СЕРВЕР | Готово", 0, 3, "9:16")
    assert "glass-card" not in html
    assert "abs-copy" in html
    assert "abs-stroke" in html or "abs-orb" in html
    assert "headline" in html


def test_clean_overlay_fallback_does_not_clip():
    from app.workflows.graphics_developer import _clean_overlay_fallback

    html = _clean_overlay_fallback("ПОДКЛЮЧИ СЕРВЕР | Готово", 0, 3, "9:16")
    assert "overflow:hidden" not in html.replace(" ", "")
    assert "overflow:visible" in html.replace(" ", "")
    assert "overflow-wrap:normal" in html.replace(" ", "")
    assert "plate-content" in html
