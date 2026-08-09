import unittest
import sys
import os
import shutil
from fastapi.testclient import TestClient

# Add parent directory to path so app modules are importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.main import app
from app.services.design_skill import DesignSkill
from app.services.video_service import resolve_lut_path

class TestBrandIntegration(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)
        self.brand_id = "test_brand_testing_123"
        # Base uploads dir
        self.uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
        self.brand_dir = os.path.join(self.uploads_dir, "brands", self.brand_id)

    def tearDown(self):
        # Cleanup uploaded test brand assets
        if os.path.exists(self.brand_dir):
            shutil.rmtree(self.brand_dir)

    def test_brand_assets_upload_flow(self):
        # 1. Test uploading a font
        font_data = b"dummy ttf font content"
        response = self.client.post(
            f"/api/video/brand/{self.brand_id}/upload_font",
            files={"file": ("BrandFont.ttf", font_data, "font/ttf")}
        )
        self.assertEqual(response.status_code, 200)
        json_data = response.json()
        self.assertEqual(json_data["name"], "BrandFont")
        self.assertEqual(json_data["filename"], "BrandFont.ttf")
        self.assertTrue("BrandFont.ttf" in json_data["path"])

        # 2. Test uploading a LUT
        lut_data = b"dummy cube lut content"
        response = self.client.post(
            f"/api/video/brand/{self.brand_id}/upload_lut",
            files={"file": ("BrandLut.cube", lut_data, "application/octet-stream")}
        )
        self.assertEqual(response.status_code, 200)
        json_data = response.json()
        self.assertEqual(json_data["name"], "BrandLut")
        self.assertEqual(json_data["filename"], "BrandLut.cube")

        # 3. Test uploading a music track
        music_data = b"dummy mp3 content"
        response = self.client.post(
            f"/api/video/brand/{self.brand_id}/upload_music",
            files={"file": ("BrandSong.mp3", music_data, "audio/mpeg")}
        )
        self.assertEqual(response.status_code, 200)
        json_data = response.json()
        self.assertEqual(json_data["name"], "BrandSong")
        self.assertEqual(json_data["filename"], "BrandSong.mp3")

        # 4. Test uploading invalid extensions
        response = self.client.post(
            f"/api/video/brand/{self.brand_id}/upload_font",
            files={"file": ("hacker.exe", b"malware", "application/octet-stream")}
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            f"/api/video/brand/{self.brand_id}/upload_lut",
            files={"file": ("hacker.png", b"image", "image/png")}
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            f"/api/video/brand/{self.brand_id}/upload_music",
            files={"file": ("hacker.wav", b"audio", "audio/wav")}
        )
        self.assertEqual(response.status_code, 400)

        # 5. Fetch all assets and verify lists
        response = self.client.get(f"/api/video/brand/{self.brand_id}/assets")
        self.assertEqual(response.status_code, 200)
        assets = response.json()
        
        self.assertEqual(len(assets["fonts"]), 1)
        self.assertEqual(assets["fonts"][0]["name"], "BrandFont")
        self.assertEqual(assets["fonts"][0]["filename"], "BrandFont.ttf")

        self.assertEqual(len(assets["luts"]), 1)
        self.assertEqual(assets["luts"][0]["name"], "BrandLut")
        self.assertEqual(assets["luts"][0]["filename"], "BrandLut.cube")

        self.assertEqual(len(assets["music"]), 1)
        self.assertEqual(assets["music"][0]["name"], "BrandSong")
        self.assertEqual(assets["music"][0]["filename"], "BrandSong.mp3")

    def test_design_skill_resolves_brand_fonts(self):
        # By default, a non-standard font falls back to Inter
        font = DesignSkill.validate_font("MockBrandFont", brand_id=self.brand_id)
        self.assertNotEqual(font, "MockBrandFont")
        
        # Now let's create the font file under the brand folder
        fonts_dir = os.path.join(self.brand_dir, "fonts")
        os.makedirs(fonts_dir, exist_ok=True)
        with open(os.path.join(fonts_dir, "MockBrandFont.ttf"), "w") as f:
            f.write("font data")
            
        # The font should now resolve correctly since it exists in the brand fonts directory!
        resolved_font = DesignSkill.validate_font("MockBrandFont", brand_id=self.brand_id)
        self.assertEqual(resolved_font, "MockBrandFont")

    def test_lut_path_resolver(self):
        # Resolve path for non-existent brand LUT should fail or fallback
        p = resolve_lut_path("NonExistent", brand_id=self.brand_id)
        self.assertIsNone(p)

        # Let's create a LUT file for the brand
        luts_dir = os.path.join(self.brand_dir, "luts")
        os.makedirs(luts_dir, exist_ok=True)
        lut_filepath = os.path.join(luts_dir, "MoodyTeal.cube")
        with open(lut_filepath, "w") as f:
            f.write("lut data")

        # Now it should resolve correctly
        resolved_p = resolve_lut_path("MoodyTeal", brand_id=self.brand_id)
        self.assertIsNotNone(resolved_p)
        self.assertTrue("MoodyTeal.cube" in resolved_p)

if __name__ == "__main__":
    unittest.main()
