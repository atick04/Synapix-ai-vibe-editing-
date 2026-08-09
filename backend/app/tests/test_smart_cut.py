import unittest
import sys
import os
import json
import shutil
from fastapi.testclient import TestClient

# Add parent directory to path so app modules are importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.main import app
from app.services.smart_cut_service import suggest_smart_cuts

class TestSmartCut(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)
        self.file_id = "test_smart_cut_123"
        self.uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
        self.transcript_path = os.path.join(self.uploads_dir, f"{self.file_id}_transcript.json")

    def tearDown(self):
        # Cleanup mock transcript file
        if os.path.exists(self.transcript_path):
            os.remove(self.transcript_path)

    def test_smart_cut_logic(self):
        # Construct mock transcript with duplicates, silences, and filler words
        mock_transcript = {
            "words": [
                # Word group 1: Hello
                {"word": "Привет", "start": 0.0, "end": 0.5},
                # Filler word
                {"word": "э-э", "start": 0.6, "end": 1.0},
                # Word group 2: Segment A (attempt 1)
                {"word": "мы", "start": 1.5, "end": 1.8},
                {"word": "сделали", "start": 1.9, "end": 2.2},
                {"word": "это", "start": 2.3, "end": 2.5},
                # Word group 3: Segment B (attempt 2 - duplicate!)
                {"word": "мы", "start": 3.2, "end": 3.5},
                {"word": "сделали", "start": 3.6, "end": 3.9},
                {"word": "это", "start": 4.0, "end": 4.2},
                # Long silence (>1.5s gap between 4.2s and 6.5s)
                {"word": "быстро", "start": 6.5, "end": 7.0}
            ]
        }
        
        cuts = suggest_smart_cuts(mock_transcript)
        
        # We expect:
        # 1. Filler word "э-э" at 0.6-1.0s
        # 2. Silence/pause of 2.3s between 4.2s and 6.5s
        # 3. Duplicate take (first attempt) at 1.5-2.5s
        
        reasons = [c["reason"] for c in cuts]
        self.assertTrue("filler" in reasons)
        self.assertTrue("silence" in reasons)
        self.assertTrue("duplicate" in reasons)
        
        # Verify duplicate take is attempt 1 (around 1.5s)
        dup_cut = next(c for c in cuts if c["reason"] == "duplicate")
        self.assertEqual(dup_cut["start"], 1.5)
        self.assertTrue(dup_cut["end"] >= 2.5)

    def test_noise_and_offscreen_cuts(self):
        mock_transcript = {
            "segments": [
                {"text": "Привет всем.", "start": 0.0, "end": 1.5},
                {"text": "[за кадром] Три", "start": 1.5, "end": 3.0},
                {"text": "Три два один.", "start": 3.0, "end": 5.0}
            ],
            "words": [
                {"word": "Привет", "start": 0.0, "end": 0.5},
                {"word": "всем", "start": 0.6, "end": 1.2},
                {"word": "[шум]", "start": 1.3, "end": 1.4},
                {"word": "Три", "start": 1.6, "end": 2.2},
                {"word": "Три", "start": 3.1, "end": 3.6},
                {"word": "два", "start": 3.7, "end": 4.2},
                {"word": "один", "start": 4.3, "end": 4.8}
            ]
        }
        cuts = suggest_smart_cuts(mock_transcript)
        reasons = [c["reason"] for c in cuts]
        texts = [c["text"] for c in cuts]
        
        # Verify bracketed noise "[шум]" was cut
        self.assertTrue(any("Неречевой шум" in t for t in texts))
        
        # Verify prompter voice word "Три" at 1.6s (within off-screen segment 1.5s-3.0s) was cut
        self.assertTrue(any("Закадровый голос/подсказка" in t for t in texts))

    def test_smart_cut_api(self):
        # 1. API should return 404 if transcript doesn't exist
        response = self.client.post(f"/api/video/video/{self.file_id}/smart_cut")
        self.assertEqual(response.status_code, 404)
        
        # 2. Write mock transcript
        mock_transcript = {
            "words": [
                {"word": "Привет", "start": 0.0, "end": 0.5},
                {"word": "э-э", "start": 0.6, "end": 1.0},
                {"word": "Мир", "start": 1.2, "end": 1.7}
            ]
        }
        os.makedirs(self.uploads_dir, exist_ok=True)
        with open(self.transcript_path, "w", encoding="utf-8") as f:
            json.dump(mock_transcript, f)
            
        # 3. API should now return suggestions
        response = self.client.post(f"/api/video/video/{self.file_id}/smart_cut")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertTrue(len(data["cuts"]) > 0)
        self.assertEqual(data["cuts"][0]["reason"], "filler")

if __name__ == "__main__":
    unittest.main()
