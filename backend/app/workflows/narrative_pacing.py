"""
Narrative Pacing Engine — Analyzes speech speed (WPS), rhetorical triggers, 
and emotional stress peaks to suggest cinematic timing bounds and pacing strategies.
"""

import re
from typing import Dict, Any, List

class NarrativePacing:
    @staticmethod
    def analyze_transcript(transcript: str, total_duration: float = 0.0) -> Dict[str, Any]:
        """
        Analyze a Cyrillic transcript text to determine speech velocity,
        emotional emphasis peaks, and recommended visual interrupts.
        """
        if not transcript:
            return {
                "overall_wps": 0.0,
                "intensity_class": "calm",
                "peaks": [],
                "suggested_cuts": []
            }

        # ─── Calculate speech rate (WPS) ───
        words = transcript.split()
        word_count = len(words)
        wps = 2.3
        if total_duration > 0:
            wps = round(word_count / total_duration, 2)

        # ─── Track exclamations, caps, and keyword peaks ───
        exclamations = transcript.count("!")
        questions = transcript.count("?")
        all_caps = sum(1 for w in words if w.isupper() and len(w) > 1)

        emotional_keywords = [
            "ужас", "шок", "взрыв", "круто", "бомба", "огонь", "внимание", "секрет",
            "важно", "главное", "убийца", "опасно", "невероятно", "amazing", "insane",
            "crazy", "killer", "secret", "warning", "must", "attention", "explosion", "hype"
        ]
        keyword_hits = sum(1 for w in words if any(kw in w.lower() for kw in emotional_keywords))

        # ─── Calculate peak scoring metrics ───
        base_val = 0.35 + (abs(wps - 2.3) * 0.1)
        base_val += exclamations * 0.2
        base_val += all_caps * 0.15
        base_val += keyword_hits * 0.15
        
        peak_score = round(max(0.0, min(1.0, base_val)), 2)
        
        if peak_score > 0.72:
            intensity = "explosive"
        elif peak_score > 0.52:
            intensity = "dynamic"
        elif peak_score > 0.32:
            intensity = "narrative"
        else:
            intensity = "calm"

        # ─── Segment-level timestamp parsing ───
        peaks = []
        # Matches patterns like [0.0-3.5] Text
        segment_matches = re.findall(r'\[([\d.]+)-([\d.]+)\]\s*([^\[]+)', transcript)
        for start_str, end_str, text in segment_matches:
            start_t = float(start_str)
            end_t = float(end_str)
            seg_duration = end_t - start_t
            if seg_duration <= 0:
                continue
                
            seg_words = text.split()
            seg_wps = len(seg_words) / seg_duration
            
            # Local peak markers
            has_exclamation = "!" in text
            has_caps = any(w.isupper() and len(w) > 1 for w in seg_words)
            has_kw = any(any(kw in w.lower() for kw in emotional_keywords) for w in seg_words)
            
            local_score = 0.3
            if seg_wps > 3.0 or seg_wps < 1.6:
                local_score += 0.2
            if has_exclamation:
                local_score += 0.3
            if has_caps:
                local_score += 0.2
            if has_kw:
                local_score += 0.2
                
            local_score = min(1.0, local_score)
            
            if local_score >= 0.65:
                peaks.append({
                    "start": start_t,
                    "end": end_t,
                    "score": round(local_score, 2),
                    "text": text.strip(),
                    "recommended_action": "zoom_in" if local_score > 0.8 else "add_broll"
                })

        return {
            "overall_wps": wps,
            "intensity_class": intensity,
            "peak_score": peak_score,
            "peaks": peaks
        }
