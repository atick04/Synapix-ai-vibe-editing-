"""
Retention Critic — Performs high-fidelity visual and narrative quality audits on the compiled timeline edits.
Checks pacing rates, identifies boring segments, and suggests actionable visual fixes (zooms, B-rolls).
"""

import logging
from typing import List, Dict, Any
from app.workflows.timeline_metrics import TimelineMetrics

logger = logging.getLogger(__name__)

class RetentionCritic:
    @staticmethod
    def audit(edits: List[Dict[str, Any]], duration: float = 10.0) -> Dict[str, Any]:
        """
        Performs a full visual audit of the timeline edits list.
        Returns:
            - approved: bool (True if score >= 75)
            - score: int (0 to 100)
            - issues: List[str] (Structured warnings)
        """
        issues = []
        score = 100
        
        metrics = TimelineMetrics.calculate(edits, duration)
        
        # 1. Check for Boring Areas (Gaps of > 5.0 seconds without B-roll, Zoom, or Graphics)
        zooms = [e for e in edits if e.get("action") == "camera_zoom"]
        brolls = [e for e in edits if e.get("action") == "add_broll"]
        graphics = [e for e in edits if e.get("action") in ("canvas_overlay", "scene_override", "hyperframes_html", "add_hyperframes_graphics")]
        bgm = [e for e in edits if e.get("action") == "add_asset" and e.get("start") == 0.0 and "sfx" not in e.get("asset_query", "").lower()]
        
        boring_gaps = []
        in_gap = False
        gap_start = 0.0
        
        step = 0.5
        t = 0.0
        while t <= duration:
            has_visual_change = False
            for b in brolls:
                if b.get("start", 0) <= t <= b.get("end", duration):
                    has_visual_change = True
                    break
            for z in zooms:
                if z.get("start", 0) <= t <= z.get("end", duration):
                    has_visual_change = True
                    break
            for g in graphics:
                if g.get("start", 0) <= t <= g.get("end", duration):
                    has_visual_change = True
                    break
            
            if not has_visual_change:
                if not in_gap:
                    in_gap = True
                    gap_start = t
            else:
                if in_gap:
                    in_gap = False
                    gap_duration = t - gap_start
                    if gap_duration >= 5.0:
                        boring_gaps.append((gap_start, t, gap_duration))
            t += step
            
        if in_gap:
            gap_duration = duration - gap_start
            if gap_duration >= 5.0:
                boring_gaps.append((gap_start, duration, gap_duration))
                
        for start, end, gap_dur in boring_gaps:
            issues.append(f"⚠️ Скучный участок на {start:.1f}с - {end:.1f}с: говорящая голова без перебивок в течение {gap_dur:.1f} сек.")
            score -= int(gap_dur * 4)
            
        # 2. Check Graphics Over-saturation
        if metrics["visual_coverage_percentage"] > 40.0:
            issues.append(f"⚠️ Слишком много графики ({metrics['visual_coverage_percentage']:.1f}% таймлайна). Это перегружает внимание зрителя.")
            score -= 15
            
        # 3. Check pacing rates
        rate = metrics["pacing_rate_per_10s"]
        if rate < 2.0:
            issues.append(f"ℹ️ Низкий темп смены кадров: {rate:.1f} изменений на 10 сек. Зритель может заскучать.")
            score -= 10
        elif rate > 6.0:
            issues.append(f"⚠️ Сверхвысокий темп смены кадров ({rate:.1f}/10с). Монтаж слишком гиперактивный.")
            score -= 10
        else:
            issues.append(f"✓ Идеальный темп смены кадров: {rate:.1f} изменений на 10 сек (норма 2.5 - 3.5).")
            
        # 4. Check soundtrack BGM
        if not bgm:
            issues.append("⚠️ Отсутствует фоновая музыка. Видео без саундтрека снижает удержание на 30%.")
            score -= 15
            
        score = max(10, min(100, score))
        approved = score >= 75
        
        return {
            "approved": approved,
            "score": score,
            "issues": issues
        }

    @staticmethod
    def suggest_fixes(edits: List[Dict[str, Any]], duration: float = 10.0) -> List[Dict[str, Any]]:
        """
        Analyzes the edits list and generates structural recommendations to automatically improve the edit.
        """
        fixes = []
        
        zooms = [e for e in edits if e.get("action") == "camera_zoom"]
        brolls = [e for e in edits if e.get("action") == "add_broll"]
        graphics = [e for e in edits if e.get("action") in ("canvas_overlay", "scene_override", "hyperframes_html", "add_hyperframes_graphics")]
        bgm = [e for e in edits if e.get("action") == "add_asset" and e.get("start") == 0.0 and "sfx" not in e.get("asset_query", "").lower()]
        
        # 1. Identify Boring Zones and suggest camera zooms or B-rolls
        in_gap = False
        gap_start = 0.0
        step = 0.5
        t = 0.0
        
        while t <= duration:
            has_visual_change = False
            for b in brolls:
                if b.get("start", 0) <= t <= b.get("end", duration):
                    has_visual_change = True
                    break
            for z in zooms:
                if z.get("start", 0) <= t <= z.get("end", duration):
                    has_visual_change = True
                    break
            for g in graphics:
                if g.get("start", 0) <= t <= g.get("end", duration):
                    has_visual_change = True
                    break
            
            if not has_visual_change:
                if not in_gap:
                    in_gap = True
                    gap_start = t
            else:
                if in_gap:
                    in_gap = False
                    gap_duration = t - gap_start
                    if gap_duration >= 5.0:
                        # Suggest adding zoom in the middle of the boring zone
                        z_start = round(gap_start + 1.0, 2)
                        z_end = round(min(z_start + 2.5, t - 0.5), 2)
                        fixes.append({
                            "issue": "Boring talking head zone",
                            "recommendation": "add_zoom",
                            "start": z_start,
                            "end": z_end
                        })
            t += step
            
        if in_gap:
            gap_duration = duration - gap_start
            if gap_duration >= 5.0:
                z_start = round(gap_start + 1.0, 2)
                z_end = round(min(z_start + 2.5, duration - 0.5), 2)
                fixes.append({
                    "issue": "Boring talking head zone at ending",
                    "recommendation": "add_zoom",
                    "start": z_start,
                    "end": z_end
                })
                
        # 2. Check for missing BGM soundtrack and suggest select_bgm
        if not bgm:
            fixes.append({
                "issue": "Missing soundtrack BGM",
                "recommendation": "select_bgm",
                "start": 0.0,
                "end": duration
            })
            
        # 3. Check for slow pacing and suggest B-roll injection
        metrics = TimelineMetrics.calculate(edits, duration)
        if metrics["pacing_rate_per_10s"] < 2.0 and duration >= 8.0:
            fixes.append({
                "issue": "Low visual change frequency",
                "recommendation": "add_broll",
                "start": round(duration * 0.4, 2),
                "end": round(min(duration * 0.4 + 2.5, duration), 2)
            })
            
        return fixes
