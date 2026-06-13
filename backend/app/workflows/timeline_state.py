"""
Timeline State Engine — Structured editable state for video tracks, clips, audio, captions, and graphics.
Replaces ad-hoc list modifications with declarative mutations.
"""

from typing import Dict, Any, List, Optional

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

    def add_broll(self, start: float, end: float, query: str) -> Dict[str, Any]:
        """Insert a B-roll clip from stock database."""
        edit = {
            "action": "add_broll",
            "start": round(start, 2),
            "end": round(end, 2),
            "query": query.strip()
        }
        # Remove any existing conflicting B-rolls at overlapping timesteps
        self.remove_overlapping("add_broll", start, end)
        self.edits.append(edit)
        return edit

    def add_zoom(self, start: float, end: float, type: str = "zoom_in") -> Dict[str, Any]:
        """Add a cinematic camera punch/zoom effect."""
        edit = {
            "action": "camera_zoom",
            "type": type,
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
        y: Optional[float] = None
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
                "use_outline": True,
                "use_shadow": False,
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
        if position is not None: edit["position"] = position
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

    def add_graphics(self, start: float, duration: float, data: Any, type: str = "canvas_overlay") -> Dict[str, Any]:
        """Add highly engaging infographic or styled sticker layers."""
        edit = {
            "action": type,
            "start": round(start, 2),
            "end": round(start + duration, 2)
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

    def remove_action_types(self, action_types: List[str]):
        """Clear specific tool types entirely from the timeline."""
        self.edits = [e for e in self.edits if e.get("action") not in action_types]

    def get_serialized_edits(self) -> List[Dict[str, Any]]:
        """Return the flat list representation for video compile and preview rendering."""
        return self.edits
