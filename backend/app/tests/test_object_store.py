from app.services.object_store import enabled, rel_key, should_evict, should_persist


def test_persist_only_media():
    assert should_persist("clip.mp4")
    assert should_persist("brands/u1/fonts/Display.ttf")
    assert not should_persist("id_transcript.json")
    assert not should_persist("id.log")
    assert not should_persist("id_rendered.exporting.abc123.mp4")


def test_enabled_needs_all_env(monkeypatch):
    for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"):
        monkeypatch.setenv(k, "")
    assert enabled() is False
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "id")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("R2_BUCKET_NAME", "synapix-videos")
    assert enabled() is True


def test_rel_key_strips_uploads_prefix():
    assert rel_key("uploads/abc.mp4") == "abc.mp4"
    assert rel_key("uploads/brands/u1/fonts/A.ttf") == "brands/u1/fonts/A.ttf"


def test_evict_defaults_off_in_dev(monkeypatch):
    monkeypatch.delenv("R2_EVICT_LOCAL", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    assert should_evict() is False
    monkeypatch.setenv("R2_EVICT_LOCAL", "1")
    assert should_evict() is True
