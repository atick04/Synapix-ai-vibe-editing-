import unittest
import sys
import os

# Add parent directory to path so app modules are importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.services.design_skill import DesignSkill, CYRILLIC_FONTS

class TestDesignSkill(unittest.TestCase):

    def test_typography_validation(self):
        # 1. Non-cyrillic font should fall back to Inter
        font = DesignSkill.validate_font("RobotoCondensed-Regular")
        self.assertEqual(font, CYRILLIC_FONTS["Inter"])

        # 2. Cyrillic font should resolve correctly
        font2 = DesignSkill.validate_font("montserrat")
        self.assertEqual(font2, CYRILLIC_FONTS["Montserrat"])
        
        # 3. Comfortaa check
        font3 = DesignSkill.validate_font("Comfortaa-Bold")
        self.assertEqual(font3, CYRILLIC_FONTS["Comfortaa"])

    def test_layout_generation(self):
        # Comparison layout check
        layout = DesignSkill.generate_layout("comparison", 2, "vertical")
        self.assertEqual(len(layout), 2)
        self.assertEqual(layout[0]["x"], 26.0)
        self.assertEqual(layout[1]["x"], 74.0)

        # Vertical stack check
        layout_stack = DesignSkill.generate_layout("vertical_stack", 3, "vertical")
        self.assertEqual(len(layout_stack), 3)
        self.assertTrue(layout_stack[0]["y"] < layout_stack[1]["y"] < layout_stack[2]["y"])

    def test_design_critic_auto_corrections(self):
        scene_data = {
            "scene_template": "comparison",
            "mood": "tech",
            "style_profile": {
                "font_family": "NonCyrillicFontName"  # Should trigger fix
            },
            "entities": [
                {
                    "id": "e1",
                    "type": "stat_card",
                    "text": "Тест 1",
                    "x": 50.0,
                    "y": 50.0,
                    "width": 30.0,
                    "height": 10.0,
                    "styles": {
                        "color": "#111111"  # Dark color on Dark background contrast issue
                    }
                },
                {
                    "id": "e2",
                    "type": "stat_card",
                    "text": "Тест 2",
                    "x": 52.0,  # Overlaps significantly with e1!
                    "y": 50.0,
                    "width": 30.0,
                    "height": 10.0
                },
                {
                    "id": "e3",
                    "type": "stat_card",
                    "text": "Тест 3",
                    "x": 50.0,
                    "y": 95.0,  # Out of Safe Area bounds (bottom limit is 76.0%)
                    "width": 20.0,
                    "height": 8.0
                }
            ],
            "relations": [
                {
                    "from": "e1",
                    "to": "e2",
                    "type": "leads_to"
                }
            ],
            "duration": 6.0
        }

        polished, fixes = DesignSkill.audit_and_correct(scene_data, "vertical")
        
        # We assert that fixes were performed
        self.assertTrue(len(fixes) > 0)
        
        # Assert typography correction
        self.assertEqual(polished["style_profile"]["font_family"], CYRILLIC_FONTS["Inter"])
        
        # Assert safe area coordinates correction for e3
        e3_corrected = next(e for e in polished["entities"] if e["id"] == "e3")
        self.assertTrue(e3_corrected["y"] <= 76.0) # Safe zone limit

        # Assert overlap resolution (e1 and e2 should be pushed apart)
        e1_corrected = next(e for e in polished["entities"] if e["id"] == "e1")
        e2_corrected = next(e for e in polished["entities"] if e["id"] == "e2")
        dx = abs(e2_corrected["x"] - e1_corrected["x"])
        dy = abs(e2_corrected["y"] - e1_corrected["y"])
        margin_x = (e1_corrected["width"] + e2_corrected["width"]) / 2.0
        margin_y = (e1_corrected["height"] + e2_corrected["height"]) / 2.0
        self.assertTrue(dx >= margin_x or dy >= margin_y)
        
        # Assert stagger animation delay calculations
        self.assertTrue(e1_corrected["animation"]["delay"] < e2_corrected["animation"]["delay"])
        
        # Assert relation transition draws after e1 appears
        rel_corrected = polished["relations"][0]
        self.assertTrue(rel_corrected["animation"]["delay"] >= e1_corrected["animation"]["delay"] + 0.3)

    def test_dynamic_font_pairing(self):
        scene_data = {
            "scene_template": "concept_explainer",
            "mood": "tech",  # tech mood maps to header: Unbounded, body: Inter
            "entities": [
                {
                    "id": "e1",
                    "type": "headline",
                    "text": "Технологический заголовок"
                },
                {
                    "id": "e2",
                    "type": "stat_card",
                    "text": "Карточка 1"
                }
            ],
            "duration": 5.0
        }
        polished, fixes = DesignSkill.audit_and_correct(scene_data, "vertical")
        
        # Headline e1 should get Unbounded font (header)
        e1 = next(e for e in polished["entities"] if e["id"] == "e1")
        self.assertEqual(e1["styles"]["font_family"], CYRILLIC_FONTS["Unbounded"])
        
        # Stat card e2 should get Inter font (body)
        e2 = next(e for e in polished["entities"] if e["id"] == "e2")
        self.assertEqual(e2["styles"]["font_family"], CYRILLIC_FONTS["Inter"])
        
        # Cozy mood check
        scene_data_cozy = {
            "scene_template": "comparison",
            "mood": "cozy",  # cozy maps to header: Comfortaa, body: Rubik
            "entities": [
                {
                    "id": "e1",
                    "type": "headline",
                    "text": "Уютный заголовок"
                },
                {
                    "id": "e2",
                    "type": "stat_card",
                    "text": "Карточка 2"
                }
            ],
            "duration": 5.0
        }
        polished_cozy, fixes_cozy = DesignSkill.audit_and_correct(scene_data_cozy, "vertical")
        e1_cozy = next(e for e in polished_cozy["entities"] if e["id"] == "e1")
        e2_cozy = next(e for e in polished_cozy["entities"] if e["id"] == "e2")
        self.assertEqual(e1_cozy["styles"]["font_family"], CYRILLIC_FONTS["Comfortaa"])
        self.assertEqual(e2_cozy["styles"]["font_family"], CYRILLIC_FONTS["Rubik"])

if __name__ == "__main__":
    unittest.main()
