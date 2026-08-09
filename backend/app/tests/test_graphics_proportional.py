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


def test_clean_html_injects_caps():
    html = clean_html_fragment(
        '<div class="clip"><div class="glass-card" style="width:80%">x</div></div>',
        0,
        3,
        mode="overlay",
        aspect_ratio="16:9",
    )
    assert "data-synapix-proportional" in html
    assert "--plate-max-w: 38%" in html
