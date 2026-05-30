"""
Production Memory System — Centralized repository style profiles, paces, and visual history.
Includes an anti-repetition engine to penalize repetitive transitions, zooms, and sound assets.
"""

from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

class ProductionMemory:
    def __init__(self, session_data: Optional[Dict[str, Any]] = None):
        self.session = session_data or {}
        if "visual_language" not in self.session:
            self.session["visual_language"] = {}
        if "used_transitions" not in self.session:
            self.session["used_transitions"] = []
        if "used_zooms" not in self.session:
            self.session["used_zooms"] = []
        if "used_soundtracks" not in self.session:
            self.session["used_soundtracks"] = []
        if "pacing_history" not in self.session:
            self.session["pacing_history"] = []

    def get_style_profile(self) -> Dict[str, Any]:
        """Retrieve unified style preferences."""
        return {
            "creative_goal": self.session.get("creative_goal", "Сделать вовлекающий и динамичный контент"),
            "style_profile": self.session.get("style_profile", "auto"),
            "graphics_style": self.session.get("visual_identity", {}).get("graphics_style", "vox"),
            "font_family": self.session.get("visual_identity", {}).get("font_family", "Montserrat-ExtraBold"),
            "dominant_color": self.session.get("visual_identity", {}).get("dominant_color", "White")
        }

    def record_transition(self, transition_type: str):
        """Record used transitions to avoid double triggers."""
        self.session["used_transitions"].append(transition_type.strip().lower())
        if len(self.session["used_transitions"]) > 10:
            self.session["used_transitions"] = self.session["used_transitions"][-10:]

    def record_zoom(self, zoom_time: float, zoom_type: str):
        """Record camera kinetic punch triggers."""
        self.session["used_zooms"].append({"time": round(zoom_time, 2), "type": zoom_type})
        if len(self.session["used_zooms"]) > 15:
            self.session["used_zooms"] = self.session["used_zooms"][-15:]

    def record_soundtrack(self, track_name: str):
        """Record chosen background soundtrack track names."""
        self.session["used_soundtracks"].append(track_name.strip().lower())
        if len(self.session["used_soundtracks"]) > 5:
            self.session["used_soundtracks"] = self.session["used_soundtracks"][-5:]

    def is_transition_repeated(self, transition_type: str) -> bool:
        """Check if a transition type was used very recently."""
        recent = self.session["used_transitions"][-2:] if self.session["used_transitions"] else []
        return transition_type.strip().lower() in recent

    def is_soundtrack_repeated(self, track_name: str) -> bool:
        """Verify if BGM soundtrack choice matches immediately prior choices."""
        recent = self.session["used_soundtracks"][-2:] if self.session["used_soundtracks"] else []
        return track_name.strip().lower() in recent

    def check_zoom_density(self, start_t: float, limit_per_10s: int = 2) -> bool:
        """Evaluate if camera zoom actions are too densely packed together."""
        recent_zooms = [
            z for z in self.session["used_zooms"] 
            if abs(start_t - z["time"]) < 10.0
        ]
        return len(recent_zooms) >= limit_per_10s

    def export_session_state(self) -> Dict[str, Any]:
        """Export the memory session for direct JSON DB storage persistence."""
        return self.session
