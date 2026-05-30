"""
Timeline Metrics Layer — Analyzes timeline state list to calculate pacing,
coverage, and counts. Used for validation, critic scoring, and budget enforcement.
"""

from typing import List, Dict, Any

class TimelineMetrics:
    @staticmethod
    def calculate(edits: List[Dict[str, Any]], duration: float = 10.0) -> Dict[str, Any]:
        """
        Compiles structured metrics from the active edits list.
        """
        # 1. Counts
        zooms = [e for e in edits if e.get("action") == "camera_zoom"]
        brolls = [e for e in edits if e.get("action") == "add_broll"]
        graphics = [e for e in edits if e.get("action") in ("canvas_overlay", "scene_override", "hyperframes_html", "add_hyperframes_graphics")]
        scenes = [e for e in edits if e.get("action") == "scene_override"]
        transitions = [e for e in edits if e.get("action") == "add_asset" and "transition" in e.get("asset_query", "").lower()]
        
        zooms_count = len(zooms)
        brolls_count = len(brolls)
        graphics_count = len(graphics)
        scenes_count = len(scenes)
        transitions_count = len(transitions)
        
        # 2. Coverage
        visual_segments = []
        for b in brolls:
            visual_segments.append((b.get("start", 0.0), b.get("end", duration)))
        for g in graphics:
            visual_segments.append((g.get("start", 0.0), g.get("end", duration)))
            
        # Merge overlapping intervals to get clean visual coverage duration
        visual_coverage = 0.0
        if visual_segments:
            sorted_segs = sorted(visual_segments, key=lambda x: x[0])
            merged = []
            curr = sorted_segs[0]
            for next_seg in sorted_segs[1:]:
                if next_seg[0] <= curr[1]:
                    curr = (curr[0], max(curr[1], next_seg[1]))
                else:
                    merged.append(curr)
                    curr = next_seg
            merged.append(curr)
            
            for start, end in merged:
                visual_coverage += max(0.0, end - start)
                
        # 3. Pacing Rates (Visual changes per 10s of video)
        total_interrupters = zooms_count + brolls_count + graphics_count
        pacing_rate = (total_interrupters / duration) * 10.0 if duration > 0 else 0.0
        
        return {
            "duration": duration,
            "zooms_count": zooms_count,
            "brolls_count": brolls_count,
            "graphics_count": graphics_count,
            "scenes_count": scenes_count,
            "transitions_count": transitions_count,
            "visual_coverage_seconds": round(visual_coverage, 2),
            "visual_coverage_percentage": round((visual_coverage / duration) * 100, 1) if duration > 0 else 0.0,
            "pacing_rate_per_10s": round(pacing_rate, 2),
            "total_interrupters": total_interrupters
        }
