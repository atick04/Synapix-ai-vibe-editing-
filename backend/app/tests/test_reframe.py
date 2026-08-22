from app.services.reframe import cover_crop, display_size, needs_vertical_reframe


def test_landscape_needs_reframe():
    assert needs_vertical_reframe(1920, 1080)
    assert not needs_vertical_reframe(1080, 1920)
    assert not needs_vertical_reframe(1920, 1080, rotation=90)


def test_iphone_rotation_swaps_axes():
    assert display_size(1920, 1080, 90) == (1080, 1920)


def test_center_cover_crop_16x9():
    box = cover_crop(1920, 1080, focus_x=0.5, focus_y=0.45)
    assert abs(box["w"] / box["h"] - 9 / 16) < 0.01
    assert box["h"] == 1080
    assert abs(box["x"] - (1920 - box["w"]) * 0.5) < 1


def test_contain_layout_flag():
    from app.services.reframe import layout_from_edits
    lay = layout_from_edits([{"action": "change_format", "fit": "contain", "scale": 1, "focus_x": 0.5, "focus_y": 0.5}])
    assert lay["fit"] == "contain"
    assert lay["scale"] == 1.0


def test_pan_left_uses_origin():
    left = cover_crop(1920, 1080, focus_x=0.0)
    right = cover_crop(1920, 1080, focus_x=1.0)
    assert left["x"] == 0
    assert right["x"] > left["x"]
    assert abs((right["x"] + right["w"]) - 1920) < 1
