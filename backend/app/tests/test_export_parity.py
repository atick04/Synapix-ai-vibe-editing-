from app.services.video_service import (
    graphic_overlay_frame_count,
    is_idea_map_html,
    wrap_graphic_html_for_export,
)


def test_overlay_frames_match_preview_fps():
    assert graphic_overlay_frame_count(0, 3.2) == 96
    assert graphic_overlay_frame_count(1, 4) == 90
    assert graphic_overlay_frame_count(0, 0.05) >= 30


def test_export_wrap_keeps_preview_offsets():
    html = wrap_graphic_html_for_export(
        {"offset_x": 4.5, "offset_y": -2, "scale_x": 1.2, "scale_y": 1},
        '<div data-plate="1">HELLO</div>',
    )
    compact = html.replace(" ", "")
    assert "translate(4.5%" in compact
    assert "-2" in compact
    assert 'data-plate-sx="1.2"' in html
    assert 'data-idea="0"' in html


def test_idea_map_not_scaled_as_glass_plate():
    raw = '<div class="idea-split" data-idea-visual="split" data-plate="1">VS</div>'
    assert is_idea_map_html(raw)
    html = wrap_graphic_html_for_export({"scale_x": 2, "offset_x": 0, "offset_y": 0}, raw)
    assert 'data-idea="1"' in html
    assert "idea-split" in html
