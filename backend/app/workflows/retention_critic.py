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
    def audit(edits: List[Dict[str, Any]], duration: float = 10.0, beat_sheet: Dict[str, Any] | None = None) -> Dict[str, Any]:
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
            skip = False
            for b in (beat_sheet or {}).get("beats") or []:
                if b.get("job") != "face":
                    continue
                if start >= float(b.get("start", 0)) - 0.2 and end <= float(b.get("end", 0)) + 0.2 and gap_dur < 6.5:
                    skip = True
                    break
            if skip:
                continue
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

        html_graphics = [
            e for e in edits
            if e.get("action") in ("canvas_overlay", "scene_override", "hyperframes_html", "add_hyperframes_graphics")
        ]
        titles = [
            e for e in html_graphics
            if e.get("graphic_kind") == "title" or e.get("mode") in ("full_broll", "fullscreen")
        ]
        overlays = [e for e in html_graphics if e not in titles]
        if duration >= 20 and overlays and not titles:
            title_beats = [b for b in ((beat_sheet or {}).get("beats") or []) if b.get("job") == "title"]
            if title_beats:
                issues.append("Нет TITLE B-roll: в beat sheet есть title, а на таймлайне полноэкранного кадра нет.")
                score -= 12
        broll_beats = [b for b in ((beat_sheet or {}).get("beats") or []) if b.get("job") == "broll"]
        if duration >= 28 and not brolls and broll_beats:
            issues.append("Beat sheet ждал B-roll, на таймлайне его нет.")
            score -= 6
        elif duration >= 28 and not brolls and not beat_sheet:
            issues.append("Нет стокового B-roll. Если в речи есть конкретный визуальный образ — вставь 1.5–3.5с футаж.")
            score -= 6
            
        # 4. Check soundtrack BGM
        if not bgm:
            issues.append("⚠️ Отсутствует фоновая музыка. Видео без саундтрека снижает удержание на 30%.")
            score -= 15

        beats = list((beat_sheet or {}).get("beats") or [])
        from app.services.beat_sheet import overlapping_accents
        for lo, hi in overlapping_accents(edits):
            issues.append(f"Two accents overlap ({lo:.1f}-{hi:.1f}s). One beat, one move.")
            score -= 10
        if beats:
            for b in beats:
                if b.get("job") != "face":
                    continue
                bs, be = float(b["start"]), float(b["end"])
                covered = 0.0
                for g in titles:
                    lo, hi = max(bs, float(g.get("start") or 0)), min(be, float(g.get("end") or 0))
                    if hi > lo:
                        covered += hi - lo
                if covered >= 1.6:
                    issues.append(
                        f"Бит {b.get('id')} job=face перекрыт TITLE на {covered:.1f}с. Лицо должно остаться."
                    )
                    score -= 8
            for b in beats:
                if b.get("job") != "title":
                    continue
                bs, be = float(b["start"]), float(b["end"])
                hit = any(
                    max(bs, float(g.get("start") or 0)) < min(be, float(g.get("end") or 0))
                    for g in titles
                )
                if not hit and duration >= 12:
                    issues.append(f"Бит {b.get('id')} job=title пустой — нужен fullscreen TITLE «{b.get('concept')}».")
                    score -= 8

        score = max(10, min(100, score))
        approved = score >= 75
        
        return {
            "approved": approved,
            "score": score,
            "issues": issues
        }

    @staticmethod
    def suggest_fixes(edits: List[Dict[str, Any]], duration: float = 10.0, beat_sheet: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
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
                            "recommendation": "create_zoom",
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
                    "recommendation": "create_zoom",
                    "start": z_start,
                    "end": z_end
                })
                
        # 2. Check for missing BGM soundtrack and suggest design_sound
        if not bgm:
            fixes.append({
                "issue": "Missing soundtrack BGM",
                "recommendation": "design_sound",
                "start": 0.0,
                "end": duration
            })
            
        # 3. Check for slow pacing and suggest B-roll injection
        metrics = TimelineMetrics.calculate(edits, duration)
        broll_beats = [b for b in ((beat_sheet or {}).get("beats") or []) if b.get("job") == "broll"]
        if metrics["pacing_rate_per_10s"] < 2.0 and duration >= 8.0 and (not beat_sheet or broll_beats):
            target = broll_beats[0] if broll_beats else None
            fixes.append({
                "issue": "Low visual change frequency",
                "recommendation": "add_broll",
                "start": round(target["start"], 2) if target else round(duration * 0.4, 2),
                "end": round(target["end"], 2) if target else round(min(duration * 0.4 + 2.5, duration), 2),
            })

        html_graphics = [
            e for e in edits
            if e.get("action") in ("canvas_overlay", "scene_override", "hyperframes_html", "add_hyperframes_graphics")
        ]
        titles = [
            e for e in html_graphics
            if e.get("graphic_kind") == "title" or e.get("mode") in ("full_broll", "fullscreen")
        ]
        if duration >= 20 and html_graphics and not titles:
            title_beats = [b for b in ((beat_sheet or {}).get("beats") or []) if b.get("job") == "title"]
            tb = title_beats[0] if title_beats else None
            fixes.append({
                "issue": "All graphics are overlay plates — missing Reels TITLE punch",
                "recommendation": "create_scene",
                "layout": "fullscreen",
                "start": round(tb["start"], 2) if tb else round(min(duration * 0.35, duration - 3.0), 2),
                "end": round(tb["end"], 2) if tb else round(min(duration * 0.35 + 3.0, duration), 2),
            })

        for b in (beat_sheet or {}).get("beats") or []:
            bs, be = float(b.get("start") or 0), float(b.get("end") or 0)
            job = b.get("job")
            if job == "title":
                hit = any(
                    e.get("mode") in ("full_broll", "fullscreen") or e.get("graphic_kind") == "title"
                    for e in html_graphics
                    if max(bs, float(e.get("start") or 0)) < min(be, float(e.get("end") or 0))
                )
                if not hit:
                    fixes.append({
                        "issue": f"Empty title beat {b.get('id')}",
                        "recommendation": "create_scene",
                        "layout": "fullscreen",
                        "start": bs,
                        "end": be,
                        "description": f"TITLE «{b.get('concept')}»",
                    })
            if job == "face" and b.get("zoom"):
                zhit = any(
                    e.get("action") == "camera_zoom"
                    and max(bs, float(e.get("start") or 0)) < min(be, float(e.get("end") or 0))
                    for e in edits
                )
                if not zhit:
                    fixes.append({
                        "issue": f"Face beat {b.get('id')} needs zoom",
                        "recommendation": "create_zoom",
                        "start": round(bs + 0.15, 2),
                        "end": round(min(be, bs + 2.2), 2),
                        "description": "зум на лице",
                    })

        return fixes
