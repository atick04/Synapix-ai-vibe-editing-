"""
Timeline State Engine — Structured editable state for video tracks, clips, audio, captions, and graphics.
Replaces ad-hoc list modifications with declarative mutations.
"""

from typing import Dict, Any, List, Optional

# Fullscreen visual layers that cover the entire screen and are mutually exclusive
FULLSCREEN_VISUAL_LAYERS = {
    "add_broll",
    "semantic_scene",
    "scene_override",
    "canvas_overlay",
    "hyperframes_html",
    "add_hyperframes_graphics",
    "add_motion_graphic"
}

class TimelineState:
    def __init__(self, initial_edits: Optional[List[Dict[str, Any]]] = None):
        self.edits = []
        if initial_edits:
            # Deep copy or copy to prevent side effects
            self.edits = [dict(e) for e in initial_edits]

    def add_cut(self, start: float, end: float) -> Dict[str, Any]:
        """Mark a region for cutting out silence or repeated takes."""
        edit = {
            "action": "cut_out",
            "start": round(start, 2),
            "end": round(end, 2)
        }
        self.edits.append(edit)
        return edit

    def add_broll(self, start: float, end: float, query: str, layout: str = "full") -> Dict[str, Any]:
        """Insert a B-roll clip from stock database."""
        # Remove any existing conflicting visual layers (B-roll, scenes, html overlays)
        self.remove_visual_collisions(start, end)
        
        edit = {
            "action": "add_broll",
            "start": round(start, 2),
            "end": round(end, 2),
            "query": query.strip(),
            "layout": layout
        }
        self.edits.append(edit)
        return edit

    def add_youtube_broll(self, start: float, end: float, query_or_url: str, resolved_path: str, layout: str = "full") -> Dict[str, Any]:
        """Insert a YouTube or web-search downloaded B-roll clip."""
        self.remove_visual_collisions(start, end)
        
        edit = {
            "action": "add_broll",
            "start": round(start, 2),
            "end": round(end, 2),
            "query": query_or_url.strip(),
            "resolved_path": resolved_path,
            "layout": layout
        }
        self.edits.append(edit)
        return edit

    def add_zoom(self, start: float, end: float, type: str = "zoom_in", intensity: float = 1.14) -> Dict[str, Any]:
        """Add a cinematic camera punch/zoom effect (smooth settle, no hard cut)."""
        edit = {
            "action": "camera_zoom",
            "type": type,
            "intensity": round(float(intensity or 1.14), 3),
            "start": round(start, 2),
            "end": round(end, 2)
        }
        self.remove_overlapping("camera_zoom", start, end)
        self.edits.append(edit)
        return edit

    def set_subtitles(
        self,
        font: Optional[str] = None,
        font_size: Optional[int] = None,
        font_color: Optional[str] = None,
        use_outline: Optional[bool] = None,
        animation_style: Optional[str] = None,
        position: Optional[str] = None,
        accent_color: Optional[str] = None,
        use_shadow: Optional[bool] = None,
        shadow_blur: Optional[int] = None,
        text_case: Optional[str] = None,
        max_words: Optional[int] = None,
        font_pairing: Optional[str] = None,
        word_styles: Optional[str] = None,
        inactive_opacity: Optional[float] = None,
        active_scale: Optional[float] = None,
        x: Optional[float] = None,
        y: Optional[float] = None,
        behind_speaker: Optional[bool] = None
    ) -> Dict[str, Any]:
        """Apply global kinetic typography configurations (all style parameters, incremental merge)."""
        # Find existing subtitles edit or create a default one
        edit = next((e for e in self.edits if e.get("action") == "add_subtitles"), None)
        if edit is None:
            edit = {
                "action": "add_subtitles",
                "font": "Montserrat-ExtraBold",
                "font_size": 80,
                "font_color": "#FFFFFF",
                "accent_color": "#FACC15",
                "use_outline": False,
                "use_shadow": True,
                "shadow_blur": 18,
                "animation_style": "pop",
                "position": "bottom",
                "text_case": "UPPER",
                "max_words": 3
            }
            self.edits.append(edit)

        # Merge only non-None arguments to preserve state on incremental tool calls
        if font is not None: edit["font"] = font
        if font_size is not None: edit["font_size"] = font_size
        if font_color is not None: edit["font_color"] = font_color
        if use_outline is not None: edit["use_outline"] = use_outline
        if animation_style is not None: edit["animation_style"] = animation_style
        if position is not None: 
            edit["position"] = position
            if position == "behind_speaker":
                edit["behind_speaker"] = True
        if accent_color is not None: edit["accent_color"] = accent_color
        if use_shadow is not None: edit["use_shadow"] = use_shadow
        if shadow_blur is not None: edit["shadow_blur"] = shadow_blur
        if text_case is not None: edit["text_case"] = text_case
        if max_words is not None: edit["max_words"] = max_words
        if font_pairing is not None: edit["font_pairing"] = font_pairing
        if word_styles is not None: edit["word_styles"] = word_styles
        if inactive_opacity is not None: edit["inactive_opacity"] = inactive_opacity
        if active_scale is not None: edit["active_scale"] = active_scale
        if x is not None: edit["x"] = x
        if y is not None: edit["y"] = y
        if behind_speaker is not None: edit["behind_speaker"] = behind_speaker

        return edit

    def add_asset(self, start: float, end: Optional[float], asset_query: str, volume: float = -22, is_bgm: bool = False) -> Dict[str, Any]:
        """Add background music or dynamic audio sound effects."""
        edit = {
            "action": "add_asset",
            "start": round(start, 2),
            "asset_query": asset_query.strip(),
            "volume": volume
        }
        if end is not None:
            edit["end"] = round(end, 2)
            
        if is_bgm:
            # BGM is exclusive at start 0, remove other full BGMs
            self.edits = [
                e for e in self.edits 
                if not (e.get("action") == "add_asset" and e.get("start") == 0.0 and "sfx" not in e.get("asset_query", "").lower() and "click" not in e.get("asset_query", "").lower() and "whoosh" not in e.get("asset_query", "").lower() and "impact" not in e.get("asset_query", "").lower())
            ]
            
        self.edits.append(edit)
        return edit

    def add_graphics(
        self,
        start: float,
        duration: float,
        data: Any,
        type: str = "canvas_overlay",
        mode: str = "overlay",
        layout: Optional[str] = None,
        design_aspect: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Add overlay plates or fullscreen graphic B-rolls. Persists mode for preview/export."""
        end = start + duration
        normalized_mode = "full_broll" if mode in ("full_broll", "fullscreen", "cover", "full") else (
            "split" if mode == "split" or layout == "split" else "overlay"
        )

        # Fullscreen idea-plates wipe other covering layers; overlay cards only replace other HTML plates
        if normalized_mode == "full_broll":
            self.remove_visual_collisions(start, end)
        else:
            for action in (
                "hyperframes_html",
                "canvas_overlay",
                "add_hyperframes_graphics",
                "add_motion_graphic",
                "add_dynamic_graphic",
                "semantic_scene",
                "scene_override",
            ):
                self.remove_overlapping(action, start, end)

        edit = {
            "action": type,
            "start": round(start, 2),
            "end": round(end, 2),
            "mode": normalized_mode,
            "layout": layout or normalized_mode,
            "design_aspect": design_aspect or "16:9",
        }
        if type == "semantic_scene":
            edit["scene_data"] = data
        else:
            edit["html_content"] = data

        self.edits.append(edit)
        return edit

    def remove_overlapping(self, action_type: str, start: float, end: float):
        """Helper to ensure clean timeline layering by removing overlapping edits of the same type."""
        def overlaps(e):
            if e.get("action") != action_type:
                return False
            e_start = e.get("start")
            e_end = e.get("end")
            if e_start is None or e_end is None:
                return False
            # Check overlap: max(start1, start2) < min(end1, end2)
            return max(start, e_start) < min(end, e_end)

        self.edits = [e for e in self.edits if not overlaps(e)]

    def remove_visual_collisions(self, start: float, end: float):
        """Remove any overlapping fullscreen visual elements to prevent visual clutter/stacking."""
        def overlaps(e):
            if e.get("action") not in FULLSCREEN_VISUAL_LAYERS:
                return False
            e_start = e.get("start")
            e_end = e.get("end")
            if e_start is None or e_end is None:
                return False
            # Check overlap: max(start1, start2) < min(end1, end2)
            return max(start, e_start) < min(end, e_end)

        self.edits = [e for e in self.edits if not overlaps(e)]

    def remove_action_types(self, action_types: List[str]):
        """Clear specific tool types entirely from the timeline."""
        self.edits = [e for e in self.edits if e.get("action") not in action_types]

    def toggle_speaker_masking(self, enabled: bool, effect_type: str = "behind_text", blur_strength: float = 10.0) -> Dict[str, Any]:
        """Toggle AI speaker masking and background separation effects."""
        # Remove any existing speaker masking edits
        self.edits = [e for e in self.edits if e.get("action") != "speaker_masking"]
        
        edit = {
            "action": "speaker_masking",
            "enabled": enabled,
            "effect_type": effect_type,
            "blur_strength": blur_strength
        }
        self.edits.append(edit)
        return edit

    def add_motion_graphic(self, start: float, duration: float, text: str, subtext: str = "", position: str = "top-right", style: str = "cinematic", accent_color: str = "#a78bfa", geometry: str = None, material: str = None, custom_shader: str = None, animation: str = None, particle_count: int = None, speed: float = None) -> Dict[str, Any]:
        """Add premium Three.js motion graphics overlay (cinematic, blueprint, liquid, or custom)."""
        end = start + duration
        self.remove_visual_collisions(start, end)
        edit = {
            "action": "add_motion_graphic",
            "start": round(start, 2),
            "end": round(end, 2),
            "text": text,
            "subtext": subtext,
            "position": position,
            "style": style,
            "accent_color": accent_color
        }
        if geometry:
            edit["geometry"] = geometry
        if material:
            edit["material"] = material
        if custom_shader:
            edit["custom_shader"] = custom_shader
        if animation:
            edit["animation"] = animation
        if particle_count is not None:
            edit["particle_count"] = particle_count
        if speed is not None:
            edit["speed"] = speed
            
        self.edits.append(edit)
        return edit

    def set_vibe_config(self, vibe_config: Dict[str, Any]) -> Dict[str, Any]:
        """Set the global visual identity and animation physics tokens."""
        # Remove any existing set_vibe_config edit to keep it unique
        self.edits = [e for e in self.edits if e.get("action") != "set_vibe_config"]
        
        edit = {
            "action": "set_vibe_config",
            "vibe_config": vibe_config
        }
        self.edits.append(edit)
        return edit

    def get_serialized_edits(self) -> List[Dict[str, Any]]:
        """Return the flat list representation for video compile and preview rendering."""
        return self.edits
