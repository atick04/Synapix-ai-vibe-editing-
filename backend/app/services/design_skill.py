import math
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ===========================================================================
# 1. TYPOGRAPHY SKILL CONFIGURATION
# ===========================================================================
CYRILLIC_FONTS = {
    "Inter": "Inter, sans-serif",
    "Montserrat": "Montserrat, sans-serif",
    "Rubik": "Rubik, sans-serif",
    "Manrope": "Manrope, sans-serif",
    "Unbounded": "Unbounded, sans-serif",
    "Comfortaa": "Comfortaa, sans-serif",
    "JetBrains Mono": "JetBrains Mono, monospace",
    "Playfair Display": "Playfair Display, serif"
}

FONT_PAIRINGS = {
    "tech": {"header": "Unbounded", "body": "Inter"},
    "analytical": {"header": "JetBrains Mono", "body": "Inter"},
    "cozy": {"header": "Comfortaa", "body": "Rubik"},
    "dramatic": {"header": "Playfair Display", "body": "Manrope"},
    "energetic": {"header": "Montserrat", "body": "Inter"},
    "neutral": {"header": "Inter", "body": "Inter"}
}

# ===========================================================================
# 2. COLOR SKILL CONFIGURATION
# ===========================================================================
PALETTES = {
    "apple-dark": {
        "bg_color": "rgba(20, 20, 25, 0.65)",
        "border_color": "rgba(255, 255, 255, 0.15)",
        "glow_color": "rgba(255, 255, 255, 0.04)",
        "color_text": "#F5F7FA",
        "color_accent": "#0A84FF",  # Apple iOS Blue
        "arrow_color": "rgba(10, 132, 255, 0.65)",
        "arrow_width": 3.0
    },
    "apple-light": {
        "bg_color": "rgba(255, 255, 255, 0.72)",
        "border_color": "rgba(0, 0, 0, 0.08)",
        "glow_color": "rgba(0, 0, 0, 0.02)",
        "color_text": "#1C1C1E",
        "color_accent": "#007AFF",  # Apple macOS Blue
        "arrow_color": "rgba(0, 122, 255, 0.60)",
        "arrow_width": 3.0
    },
    "cyberpunk": {
        "bg_color": "rgba(10, 10, 14, 0.80)",
        "border_color": "rgba(0, 229, 255, 0.35)",  # Neon cyan
        "glow_color": "rgba(0, 229, 255, 0.18)",
        "color_text": "#FFFFFF",
        "color_accent": "#FF007F",  # Neon pink
        "arrow_color": "rgba(0, 229, 255, 0.65)",
        "arrow_width": 3.0
    },
    "cozy-lofi": {
        "bg_color": "rgba(252, 248, 242, 0.88)",
        "border_color": "rgba(140, 98, 57, 0.15)",
        "glow_color": "rgba(140, 98, 57, 0.02)",
        "color_text": "#3E2723",  # Deep brown
        "color_accent": "#D97706",  # Terracotta amber
        "arrow_color": "rgba(217, 119, 6, 0.60)",
        "arrow_width": 3.0
    }
}

class DesignSkill:
    """
    Design Skill Engine — Integrates Typography, Color, Composition, Motion,
    Asset Relationship Skills, and Design Critic to build beautiful, balanced semantic scenes.
    """

    # -----------------------------------------------------------------------
    # 1. TYPOGRAPHY SKILL METHODS
    # -----------------------------------------------------------------------
    @staticmethod
    def get_font_pair(vibe: str) -> Dict[str, str]:
        """Returns header and body font name according to vibe."""
        pair = FONT_PAIRINGS.get(vibe.lower(), FONT_PAIRINGS["neutral"])
        return {
            "header": CYRILLIC_FONTS[pair["header"]],
            "body": CYRILLIC_FONTS[pair["body"]]
        }

    @staticmethod
    def validate_font(font_name: str) -> str:
        """Validates if font is cyrillic, returning it or fallback Inter."""
        for name, css in CYRILLIC_FONTS.items():
            if font_name.lower() in name.lower() or name.lower() in font_name.lower():
                return css
        # Fallback to Inter
        return CYRILLIC_FONTS["Inter"]

    # -----------------------------------------------------------------------
    # 2. COLOR SKILL METHODS
    # -----------------------------------------------------------------------
    @staticmethod
    def get_palette(mood: str) -> Dict[str, Any]:
        """Maps narrative moods to dynamic premium style palettes."""
        mood_lower = mood.lower()
        if mood_lower in ("tech", "analytical", "cyber", "futuristic"):
            return PALETTES["cyberpunk"]
        elif mood_lower in ("cozy", "warm", "lofi", "chill", "soft"):
            return PALETTES["cozy-lofi"]
        elif mood_lower in ("vibrant", "energetic", "fun", "pop"):
            return PALETTES["apple-dark"]  # Accent is vibrant neon blue
        else:
            # Standard premium corporate style
            return PALETTES["apple-dark"]

    @staticmethod
    def check_contrast(bg_rgba: str, text_hex: str) -> float:
        """
        Simple contrast calculator to ensure text readability.
        Returns a mock score, or normalizes colors if background is too light/dark.
        """
        # Apple glassmorphic backgrounds are highly translucent, so text should
        # be dark for light themes and light for dark themes.
        is_dark_bg = "rgba(0, 0, 0" in bg_rgba or "rgba(20, 20" in bg_rgba or "rgba(10, 10" in bg_rgba
        is_light_text = text_hex.upper() in ("#FFFFFF", "#F5F7FA", "#00E5FF", "#FFF")
        
        if is_dark_bg and not is_light_text:
            return 0.1  # Bad contrast (dark on dark)
        if not is_dark_bg and is_light_text:
            return 0.2  # Bad contrast (light on light)
        return 1.0  # Perfect contrast

    # -----------------------------------------------------------------------
    # 3. COMPOSITION SKILL METHODS
    # -----------------------------------------------------------------------
    @staticmethod
    def get_safe_area(aspect_ratio: str) -> Dict[str, Tuple[float, float]]:
        """Returns safe area coordinate boundaries (percentages)."""
        if aspect_ratio == "vertical" or aspect_ratio == "9:16":
            return {
                "x": (5.0, 95.0),
                "y": (15.0, 76.0)  # Avoid overlapping bottom subtitles
            }
        else:
            return {
                "x": (5.0, 95.0),
                "y": (10.0, 90.0)
            }

    @classmethod
    def generate_layout(cls, template: str, entities_count: int, aspect_ratio: str = "vertical") -> List[Dict[str, float]]:
        """Procedurally generates non-overlapping layouts based on templates."""
        coords = []
        safe_area = cls.get_safe_area(aspect_ratio)
        x_min, x_max = safe_area["x"]
        y_min, y_max = safe_area["y"]
        y_center = (y_min + y_max) / 2.0
        
        if template == "comparison" or entities_count == 2:
            # Side-by-side columns
            coords.append({"x": 26.0, "y": y_center, "width": 36.0, "height": 16.0})
            coords.append({"x": 74.0, "y": y_center, "width": 36.0, "height": 16.0})
            
        elif template == "vertical_stack" or template == "list" or template == "cause_effect":
            # Stack elements vertically
            card_h = min(12.0, (y_max - y_min) / (entities_count * 1.5))
            gap = (y_max - y_min - (card_h * entities_count)) / (entities_count + 1)
            for i in range(entities_count):
                coords.append({
                    "x": 50.0,
                    "y": y_min + gap + i * (card_h + gap) + card_h / 2.0,
                    "width": 80.0,
                    "height": card_h
                })
                
        elif template == "concept_explainer" or template == "mindmap":
            # Central parent, rest are children side-by-side or around
            coords.append({"x": 50.0, "y": y_center - 12.0, "width": 45.0, "height": 12.0}) # Center parent
            
            children_count = entities_count - 1
            if children_count > 0:
                span_w = (x_max - x_min)
                step_x = span_w / (children_count + 1)
                child_w = min(28.0, step_x * 0.8)
                for i in range(children_count):
                    coords.append({
                        "x": x_min + step_x * (i + 1),
                        "y": y_center + 14.0,
                        "width": child_w,
                        "height": 12.0
                    })
        else:
            # Default horizontal timeline flow
            span_w = (x_max - x_min)
            step_x = span_w / (entities_count + 1)
            card_w = min(26.0, step_x * 0.8)
            for i in range(entities_count):
                coords.append({
                    "x": x_min + step_x * (i + 1),
                    "y": y_center,
                    "width": card_w,
                    "height": 14.0
                })
                
        return coords

    # -----------------------------------------------------------------------
    # 4. MOTION & 5. RELATIONSHIP SKILLS METHODS
    # -----------------------------------------------------------------------
    @classmethod
    def apply_motion_and_relations(cls, entities: List[Dict[str, Any]], relations: List[Dict[str, Any]], scene_duration: float):
        """Calculates animations, easing, delays, stagger times, and loading bars."""
        # 1. Base staggered animations for entities
        base_delay = 0.2
        stagger = 0.15
        
        for idx, entity in enumerate(entities):
            # Easing and animation profile
            anim = entity.get("animation", {})
            if not isinstance(anim, dict):
                anim = {"type": anim} if isinstance(anim, str) else {}
            if "type" not in anim:
                # Top headline zooms/fades, standard cards slide/pop
                anim["type"] = "fade" if entity.get("type") == "headline" else "pop"
            if "duration" not in anim:
                anim["duration"] = 0.6
            if "delay" not in anim:
                anim["delay"] = round(base_delay + idx * stagger, 2)
            if "easing" not in anim:
                anim["easing"] = "bounce" if entity.get("type") != "headline" else "smooth"
                
            # If entity is a loading_bar, configure its animation params
            if entity.get("type") == "loading_bar":
                entity["is_loading_bar"] = True
                anim["type"] = "fade"
                anim["easing"] = "linear"
                anim["duration"] = round(max(1.0, scene_duration - anim["delay"] - 0.5), 2)
                
            entity["animation"] = anim
            
        # 2. Relation (connecting lines) animation starts AFTER source entity starts fade-in
        for rel in (relations or []):
            from_id = rel.get("from")
            to_id = rel.get("to")
            
            # Find delay of source entity
            from_ent = next((e for e in entities if e.get("id") == from_id), None)
            
            # Connectors draw progressively after source appears
            from_delay = base_delay
            from_dur = 0.6
            if from_ent and isinstance(from_ent.get("animation"), dict):
                from_delay = from_ent["animation"].get("delay", base_delay)
                from_dur = from_ent["animation"].get("duration", 0.6)
            
            rel_anim = rel.get("animation", {})
            if not isinstance(rel_anim, dict):
                rel_anim = {"type": rel_anim} if isinstance(rel_anim, str) else {}
            rel_anim["delay"] = round(from_delay + from_dur * 0.5, 2)
            rel_anim["duration"] = 0.8
            rel["animation"] = rel_anim

    # -----------------------------------------------------------------------
    # 6. DESIGN CRITIC & AUTOCORRECTION METHOD
    # -----------------------------------------------------------------------
    @classmethod
    def audit_and_correct(cls, scene_data: Dict[str, Any], aspect_ratio: str = "vertical") -> Tuple[Dict[str, Any], List[str]]:
        """
        Audits semantic scene parameters, resolving overlaps (AABB), safe area violations,
        Cyrillic font compliance, and contrast issues. Returns polished scene data and logs of fixes.
        """
        corrected = json_clone(scene_data)
        style_profile = corrected.get("style_profile", {})
        entities = corrected.get("entities") or []
        relations = corrected.get("relations") or []
        corrected["relations"] = relations
        corrected["entities"] = entities
        
        fixes_log = []
        
        # 1. Audit Typography & Cyrillic compliance
        mood = corrected.get("mood", "neutral")
        font_pair = cls.get_font_pair(mood)
        
        base_font = style_profile.get("font_family")
        if base_font:
            validated_base = cls.validate_font(base_font)
            style_profile["font_family"] = validated_base
            if validated_base != base_font:
                fixes_log.append(f"Typography: Заменен некириллический шрифт '{base_font}' на '{validated_base}'")
        else:
            # Set default based on mood font pair!
            style_profile["font_family"] = font_pair["body"]
            fixes_log.append(f"Typography: Установлен шрифт '{font_pair['body']}' для body на основе настроения '{mood}'")
            
        for entity in entities:
            ent_styles = entity.get("styles", {})
            ent_font = ent_styles.get("font_family")
            if ent_font:
                validated_ent = cls.validate_font(ent_font)
                ent_styles["font_family"] = validated_ent
                if validated_ent != ent_font:
                    fixes_log.append(f"Typography: Заменен шрифт сущности '{ent_font}' на '{validated_ent}'")
            else:
                # If font family is not set, set it according to type
                if entity.get("type") == "headline":
                    ent_styles["font_family"] = font_pair["header"]
                else:
                    ent_styles["font_family"] = font_pair["body"]
            entity["styles"] = ent_styles

        # 2. Audit Colors & Contrast
        mood = corrected.get("mood", "neutral")
        default_palette = cls.get_palette(mood)
        
        # Ensure base colors are filled
        for key in ("bg_color", "border_color", "glow_color", "arrow_color", "arrow_width"):
            if key not in style_profile:
                style_profile[key] = default_palette[key]
                fixes_log.append(f"Color Skill: Автозаполнен цвет {key} на основе настроения '{mood}'")
        corrected["style_profile"] = style_profile
        
        for entity in entities:
            ent_styles = entity.get("styles", {})
            # Read text contrast
            bg_col = ent_styles.get("bg_color") or style_profile["bg_color"]
            text_col = ent_styles.get("color") or default_palette["color_text"]
            
            if cls.check_contrast(bg_col, text_col) < 0.5:
                # Override to ensure high legibility
                ent_styles["color"] = default_palette["color_text"]
                fixes_log.append(f"Color Critic: Исправлен контраст текста в '{entity.get('id')}' на '{default_palette['color_text']}'")
            entity["styles"] = ent_styles

        # 3. Safe Area Limits Validation & Bounds Correction
        safe_area = cls.get_safe_area(aspect_ratio)
        x_min, x_max = safe_area["x"]
        y_min, y_max = safe_area["y"]
        
        for entity in entities:
            e_type = entity.get("type")
            if e_type == "navbar":
                if entity.get("width") is None: entity["width"] = 90.0
                if entity.get("height") is None: entity["height"] = 7.0
            elif e_type == "input_field":
                if entity.get("width") is None: entity["width"] = 75.0
                if entity.get("height") is None: entity["height"] = 8.5
            elif e_type == "button":
                if entity.get("width") is None: entity["width"] = 45.0
                if entity.get("height") is None: entity["height"] = 7.0
            elif e_type == "tab_bar":
                if entity.get("width") is None: entity["width"] = 80.0
                if entity.get("height") is None: entity["height"] = 7.5

            x = entity.get("x", 50.0)
            y = entity.get("y", 50.0)
            w = entity.get("width", 28.0)
            h = entity.get("height", 12.0)
            
            # Constrain to safe zones
            new_x = max(x_min + w/2, min(x_max - w/2, x))
            new_y = max(y_min + h/2, min(y_max - h/2, y))
            
            if new_x != x or new_y != y:
                entity["x"] = round(new_x, 2)
                entity["y"] = round(new_y, 2)
                fixes_log.append(f"Composition: Сдвинут элемент '{entity.get('id')}' во избежание выхода за границы Safe Area")

        # 4. Resolve overlapping bounding boxes (AABB Push)
        # Run multiple passes to push apart elements that overlap
        for _ in range(3):
            overlap_detected = False
            for i in range(len(entities)):
                for j in range(i + 1, len(entities)):
                    e1 = entities[i]
                    e2 = entities[j]
                    
                    # Skip overlap logic if one of them is headline (usually separate)
                    if e1.get("type") == "headline" or e2.get("type") == "headline":
                        continue
                        
                    x1, y1 = e1.get("x", 50.0), e1.get("y", 50.0)
                    w1, h1 = e1.get("width", 28.0), e1.get("height", 12.0)
                    
                    x2, y2 = e2.get("x", 50.0), e2.get("y", 50.0)
                    w2, h2 = e2.get("width", 28.0), e2.get("height", 12.0)
                    
                    # Horizontal and vertical margins
                    margin_x = (w1 + w2) / 2.0
                    margin_y = (h1 + h2) / 2.0
                    
                    dx = x2 - x1
                    dy = y2 - y1
                    
                    abs_dx = abs(dx)
                    abs_dy = abs(dy)
                    
                    if abs_dx < margin_x and abs_dy < margin_y:
                        # Overlap detected! Push them apart
                        overlap_detected = True
                        overlap_x = margin_x - abs_dx
                        overlap_y = margin_y - abs_dy
                        
                        is_fixed1 = e1.get("type") in ("navbar",)
                        is_fixed2 = e2.get("type") in ("navbar",)
                        
                        # Push in direction of smaller overlap to minimize shift distance
                        if overlap_x < overlap_y:
                            push = (overlap_x / 2.0) + 1.0
                            sign = 1.0 if dx >= 0 else -1.0
                            # Push apart horizontally
                            if is_fixed1 and not is_fixed2:
                                e2["x"] = round(max(x_min + w2/2, min(x_max - w2/2, x2 + sign * push * 2)), 2)
                            elif is_fixed2 and not is_fixed1:
                                e1["x"] = round(max(x_min + w1/2, min(x_max - w1/2, x1 - sign * push * 2)), 2)
                            else:
                                e1["x"] = round(max(x_min + w1/2, min(x_max - w1/2, x1 - sign * push)), 2)
                                e2["x"] = round(max(x_min + w2/2, min(x_max - w2/2, x2 + sign * push)), 2)
                        else:
                            push = (overlap_y / 2.0) + 1.0
                            sign = 1.0 if dy >= 0 else -1.0
                            # Push apart vertically
                            if is_fixed1 and not is_fixed2:
                                e2["y"] = round(max(y_min + h2/2, min(y_max - h2/2, y2 + sign * push * 2)), 2)
                            elif is_fixed2 and not is_fixed1:
                                e1["y"] = round(max(y_min + h1/2, min(y_max - h1/2, y1 - sign * push * 2)), 2)
                            else:
                                e1["y"] = round(max(y_min + h1/2, min(y_max - h1/2, y1 - sign * push)), 2)
                                e2["y"] = round(max(y_min + h2/2, min(y_max - h2/2, y2 + sign * push)), 2)
                            
            if not overlap_detected:
                break
        
        # 5. Populate and Sync Animation & relation offsets
        # If entities do not have animation, generate them
        cls.apply_motion_and_relations(entities, relations, float(corrected.get("duration", 5.0)))
        corrected["entities"] = entities
        corrected["relations"] = relations
        
        return corrected, fixes_log

def json_clone(obj: Any) -> Any:
    """Fast JSON clone for deep copy."""
    return json_loads(json_dumps(obj))

def json_dumps(obj: Any) -> str:
    import json
    return json.dumps(obj, ensure_ascii=False)

def json_loads(s: str) -> Any:
    import json
    return json.loads(s)
