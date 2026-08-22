from app.services.ai_service import merge_chunk_transcripts


def test_merge_keeps_speech_after_30s():
    chunk0 = {
        "language": "Russian",
        "words": [
            {"word": "привет", "start": 0.0, "end": 0.4},
            {"word": "графиков", "start": 23.5, "end": 24.0},
        ],
    }
    chunk1 = {
        "language": "Russian",
        "words": [
            {"word": "графиков", "start": 0.4, "end": 0.9},  # overlap with chunk0 at 24+
            {"word": "зумов", "start": 4.0, "end": 4.5},
            {"word": "готово", "start": 20.0, "end": 20.6},
        ],
    }
    merged = merge_chunk_transcripts(
        [(0.0, 24.0, chunk0), (21.0, 45.0, chunk1)],
        duration=45.0,
    )
    tokens = [w["word"] for w in merged["words"]]
    assert "привет" in tokens
    assert "зумов" in tokens
    assert "готово" in tokens
    assert tokens.count("графиков") == 1
    assert merged["words"][-1]["end"] >= 40.0
