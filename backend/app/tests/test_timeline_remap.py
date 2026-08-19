"""Unit tests for source→project timeline remapping after cut_out."""

from app.services.video_service import (
    remap_source_to_project,
    segment_survives_cuts,
    projectize_edit_times,
)


def test_remap_no_cuts():
    assert remap_source_to_project(12.5, None) == 12.5
    assert remap_source_to_project(12.5, []) == 12.5


def test_remap_single_cut_before():
    cuts = [{"start": 5.0, "end": 8.0}]  # remove 3s
    assert remap_source_to_project(4.0, cuts) == 4.0
    assert remap_source_to_project(8.0, cuts) == 5.0
    assert remap_source_to_project(10.0, cuts) == 7.0


def test_remap_inside_cut_clamps_to_cut_start():
    cuts = [{"start": 5.0, "end": 8.0}]
    # Point inside removed region maps to the join point
    assert remap_source_to_project(6.0, cuts) == 5.0


def test_remap_multiple_cuts():
    cuts = [
        {"start": 2.0, "end": 3.0},  # -1s
        {"start": 10.0, "end": 12.0},  # -2s
    ]
    assert abs(remap_source_to_project(15.0, cuts) - 12.0) < 1e-6


def test_segment_survives():
    cuts = [{"start": 5.0, "end": 8.0}]
    assert segment_survives_cuts(1.0, 4.0, cuts) is True
    assert segment_survives_cuts(5.0, 8.0, cuts) is False
    assert segment_survives_cuts(6.0, 10.0, cuts) is True


def test_projectize_edit_times():
    cuts = [{"start": 5.0, "end": 8.0}]
    edit = {"action": "add_broll", "start": 10.0, "end": 12.0, "query": "city"}
    out = projectize_edit_times(edit, cuts)
    assert out["start"] == 7.0
    assert out["end"] == 9.0
    assert out["query"] == "city"
    assert edit["start"] == 10.0  # original untouched
