import json

from app.api import video as video_api


def test_list_and_resolve_user_broll(tmp_path, monkeypatch):
    monkeypatch.setattr(video_api, "UPLOAD_DIR", str(tmp_path))
    lib = [
        {"id": "main", "filename": "Original", "path": "uploads/main.mp4", "duration": 10},
        {
            "id": "additional_aaa",
            "filename": "street.mp4",
            "path": str(tmp_path / "street.mp4").replace("\\", "/"),
            "duration": 5,
            "kind": "user_broll",
            "media_type": "video",
            "source": "user",
        },
        {
            "id": "additional_bbb",
            "filename": "cafe.jpg",
            "path": "uploads/cafe.jpg",
            "duration": 3,
            "kind": "user_broll",
            "media_type": "image",
            "source": "user",
        },
        {"id": "stock_sticker_1", "filename": "fire.gif", "path": "uploads/fire.gif", "kind": "library"},
        {"id": "stock_music_1", "filename": "lofi", "path": "uploads/lofi.mp3"},
    ]
    (tmp_path / "proj_media_library.json").write_text(json.dumps(lib), encoding="utf-8")

    clips = video_api.list_user_broll("proj")
    assert {c["id"] for c in clips} == {"additional_aaa", "additional_bbb"}
    cafe = next(c for c in clips if c["id"] == "additional_bbb")
    assert cafe["path"] == "uploads/cafe.jpg"

    by_id = video_api.resolve_user_broll("proj", asset_id="additional_bbb")
    assert by_id["id"] == "additional_bbb"
    assert by_id["media_type"] == "image"

    by_name = video_api.resolve_user_broll("proj", query="street")
    assert by_name["id"] == "additional_aaa"

    unused = video_api.resolve_user_broll("proj", used_paths=["uploads/street.mp4"])
    assert unused["id"] == "additional_bbb"


def test_public_upload_path_normalizes_windows():
    assert video_api._public_upload_path(r"C:\data\uploads\clip.mp4") == "uploads/clip.mp4"
    assert video_api._normalize_library_path("C:/Users/me/backend/uploads/a.jpg") == "uploads/a.jpg"
