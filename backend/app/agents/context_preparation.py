"""
Context Preparation — loads transcript, visual analysis, and auto-detects
filler words / long pauses for automatic cut-out.

This is a pure data-preparation node (no LLM calls). It runs first in the
graph and feeds its output to the Director and Graphics agents.
"""

import os
import json
import re
import subprocess
from app.agents.base_agent import FILLER_WORDS
from app.workflows.state import VideoEditingState
from app.services.vlm_service import format_visual_context
from app.services.template_service import get_template
from app.workflows.production_session import load_session
from app.workflows.shared_memory import load_shared_memory


async def prepare_context_node(state: VideoEditingState) -> VideoEditingState:
    """LangGraph node: load transcript + visual context, detect filler words."""
    from app.workflows.reasoning_manager import ReasoningManager
    
    file_id = state.get("file_id")
    is_evaluation = state.get("is_evaluation", False)
    
    ReasoningManager.start_analysis()
    
    # Загружаем постоянную сессию и общую память
    session = load_session(file_id)
    shared_memory = load_shared_memory(file_id)

    transcript_path = os.path.join("uploads", f"{file_id}_transcript.json")
    visual_path = os.path.join("uploads", f"{file_id}_visual.json")

    transcript_text = state.get("transcript_text") or "Транскрипт пока не готов."
    visual_context_text = state.get("visual_context") or "Визуальный анализ кадров недоступен."
    auto_cuts = []
    topic_boundaries = []

    # Template config
    template_id = state.get("template_id")
    template_config = None
    if template_id:
        tpl = get_template(template_id)
        if tpl:
            template_config = tpl.dict()

    # 1. Transcript + Auto Cuts
    if not is_evaluation and os.path.exists(transcript_path):
        try:
            with open(transcript_path, "r", encoding="utf-8") as f:
                data = json.load(f)

                words = data.get("words", [])
                if words:
                    # Hook Auto Detection
                    narrative_arc = session.get("narrative_arc", {})
                    if not narrative_arc.get("hook"):
                        try:
                            from app.services.hook_detector import detect_hook_phrase
                            from app.workflows.production_session import save_session
                            
                            hook_res = await detect_hook_phrase(words)
                            if hook_res and hook_res.get("hook"):
                                session["narrative_arc"] = {
                                    "hook": hook_res["hook"],
                                    "problem": narrative_arc.get("problem", ""),
                                    "solution": narrative_arc.get("solution", ""),
                                    "call_to_action": narrative_arc.get("call_to_action", ""),
                                    "hook_start": hook_res["hook_start"],
                                    "hook_end": hook_res["hook_end"]
                                }
                                save_session(file_id, session)
                                print(f"[PrepareContext] Auto-detected hook: '{hook_res['hook']}' ({hook_res['hook_start']}s - {hook_res['hook_end']}s)")
                        except Exception as hook_err:
                            print(f"[PrepareContext] Hook detection failed: {hook_err}")

                    from difflib import SequenceMatcher

                    # Step 1: Detect auto-cuts using the advanced unified suggest_smart_cuts service
                    from app.services.smart_cut_service import suggest_smart_cuts
                    raw_cuts = suggest_smart_cuts(data)
                    for c in raw_cuts:
                        auto_cuts.append({
                            "action": "cut_out",
                            "start": round(c["start"], 2),
                            "end": round(c["end"], 2),
                            "reason": c.get("reason", "cut"),
                            "text": c.get("text", "Авто-обрезка"),
                        })

                    # Step 1b: Detect topic-change moments for transitions
                    try:
                        from app.services.topic_transition_service import detect_topic_boundaries
                        topic_boundaries = detect_topic_boundaries(data)
                        if topic_boundaries:
                            print(
                                f"[PrepareContext] Detected {len(topic_boundaries)} topic-change "
                                f"transition points"
                            )
                    except Exception as topic_err:
                        print(f"[PrepareContext] Topic boundary detection failed: {topic_err}")

                    # Step 2: Determine which word indices are remaining (not cut out)
                    remaining_indices = []
                    for idx, w in enumerate(words):
                        w_start = float(w.get("start", 0.0))
                        w_end = float(w.get("end", 0.0))
                        is_cut = False
                        for cut in auto_cuts:
                            if cut["start"] <= w_start + 0.01 and w_end - 0.01 <= cut["end"]:
                                is_cut = True
                                break
                        if not is_cut:
                            remaining_indices.append(idx)

                    # Reconstruct readable clean transcript context mapping
                    context_lines = []
                    for idx in remaining_indices:
                        w = words[idx]
                        context_lines.append(f"{w.get('word','')}[{w.get('start',0.0):.1f}-{w.get('end',0.0):.1f}]")
                    transcript_text = " ".join(context_lines)
                else:
                    transcript_text = data.get("text", transcript_text)
        except Exception as e:
            print(f"Error Loading transcript: {e}")

    # 2. Visual Context
    scenes = []
    if os.path.exists(visual_path):
        try:
            with open(visual_path, "r", encoding="utf-8") as f:
                scenes = json.load(f)
            session["visual_scenes"] = scenes
            visual_context_text = format_visual_context(scenes)
        except Exception:
            scenes = []

    look_path = os.path.join("uploads", f"{file_id}_look.json")
    try:
        from app.services.content_look import load_look, infer_content_look, save_look, transcript_blob
        from app.workflows.production_session import save_session

        look = load_look(look_path)
        if not look:
            video_guess = os.path.join("uploads", f"{file_id}.mp4")
            look = infer_content_look(
                video_path=video_guess if os.path.exists(video_guess) else "",
                scenes=scenes,
                transcript=transcript_blob({"text": transcript_text}),
            )
            save_look(look_path, look)
        session["content_look"] = look
        save_session(file_id, session)
    except Exception as look_err:
        print(f"[PrepareContext] content look failed: {look_err}")

    try:
        from app.services.beat_sheet import build_beat_sheet
        from app.workflows.production_session import save_session

        transcript_data = {}
        if os.path.exists(transcript_path):
            with open(transcript_path, "r", encoding="utf-8") as f:
                transcript_data = json.load(f)
        hook_arc = session.get("narrative_arc") or {}
        extra_clips = 0
        lib_guess = os.path.join("uploads", f"{file_id}_media_library.json")
        if os.path.exists(lib_guess):
            try:
                with open(lib_guess, "r", encoding="utf-8") as f:
                    extra_clips = sum(
                        1 for item in json.load(f)
                        if str(item.get("id") or "").startswith("additional_")
                    )
            except Exception:
                extra_clips = 0
        words = transcript_data.get("words") or []
        dur = float(session.get("duration") or 0.0)
        if not dur and words:
            dur = float(words[-1].get("end") or 0.0)
        sheet = build_beat_sheet(
            transcript_data,
            hook=hook_arc.get("hook") or "",
            hook_start=float(hook_arc.get("hook_start") or 0.0),
            hook_end=float(hook_arc.get("hook_end") or 0.0),
            look=session.get("content_look") or {},
            topic_boundaries=topic_boundaries,
            duration=dur,
            has_user_broll=extra_clips > 0,
        )
        session["beat_sheet"] = sheet
        session["transcript_data"] = transcript_data
        save_session(file_id, session)
        print(f"[PrepareContext] Beat sheet: {len(sheet.get('beats') or [])} beats")
    except Exception as beat_err:
        print(f"[PrepareContext] beat sheet failed: {beat_err}")

    # ── Aspect Ratio & Resolution Detection ──
    width, height = 1080, 1920  # Default vertical
    video_path = os.path.join("uploads", f"{file_id}.mp4")
    if os.path.exists(video_path):
        try:
            from app.services.reframe import probe_video_display_size
            dw, dh, _rot = probe_video_display_size(video_path)
            if dw and dh:
                width, height = dw, dh
        except Exception as e:
            print(f"[PrepareContext] ffprobe display dims check failed: {e}")

    aspect_ratio = "horizontal" if width > height else "vertical"
    print(f"[PrepareContext] Detected display resolution: {width}x{height} ({aspect_ratio})")
    source_w, source_h = width, height

    # ── Override with Manual Format ──
    target_format = state.get("target_format", "auto")
    if target_format == "16:9":
        width, height = 1920, 1080
        aspect_ratio = "horizontal"
        print(f"[PrepareContext] Manual override to 16:9 ({width}x{height})")
    elif target_format == "9:16":
        width, height = 1080, 1920
        aspect_ratio = "vertical"
        print(f"[PrepareContext] Manual override to 9:16 ({width}x{height})")

    # Landscape talking-head → lock a 9:16 cover crop on the timeline
    if target_format != "16:9":
        try:
            from app.services.reframe import format_edit, needs_vertical_reframe
            if needs_vertical_reframe(source_w, source_h):
                existing = (session or {}).get("active_edits") or []
                if not any(e.get("action") == "change_format" for e in existing):
                    from app.workflows.production_session import update_session
                    update_session(file_id, {
                        "active_edits": [format_edit(), *existing],
                        "needs_reframe": True,
                    })
                width, height = 1080, 1920
                aspect_ratio = "vertical"
                print("[PrepareContext] Auto reframe 16:9 → 9:16 cover crop")
        except Exception as reframe_err:
            print(f"[PrepareContext] Auto reframe skipped: {reframe_err}")

    # ── Load Media Library ──
    media_library = []
    lib_path = os.path.join("uploads", f"{file_id}_media_library.json")
    duration = session.get("duration", 0.0) if session else 0.0
    if os.path.exists(lib_path):
        try:
            with open(lib_path, "r", encoding="utf-8") as f:
                media_library = json.load(f)
        except Exception:
            pass
    if not media_library:
        media_library = [{
            "id": "main",
            "filename": "Original Video",
            "path": f"uploads/{file_id}.mp4",
            "duration": duration
        }]

    ReasoningManager.complete_analysis(
        f"Анализ завершен. Загружен транскрипт, обнаружено {len(auto_cuts)} пауз для удаления "
        f"и {len(topic_boundaries)} смен темы для переходов. "
        f"Beat sheet: {len((session.get('beat_sheet') or {}).get('beats') or [])} битов. "
        f"Параметры видео: {aspect_ratio} ({width}x{height})."
    )

    return {
        "transcript_text": transcript_text,
        "visual_context": visual_context_text,
        "auto_cuts": auto_cuts,
        "topic_boundaries": topic_boundaries,
        "template_config": template_config,
        "production_session": session,
        "shared_memory": shared_memory,
        "session_id": session.get("session_id"),
        "aspect_ratio": aspect_ratio,
        "width": width,
        "height": height,
        "media_library": media_library,
        "tools_run_in_session": 0
    }
