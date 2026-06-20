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

                    # Expanded Russian and English single-word fillers
                    SINGLE_FILLERS = {
                        "эээ", "ээ", "э-э", "ммм", "мм", "м-м", "ааа", "аа", "а-а", "эм", "э-эм", 
                        "ну", "типа", "короче", "просто", "собственно", "вообще", "вот", "конкретно", 
                        "значит", "слушай", "знаешь", "слышь", "наверное", "понимаешь", "практически", 
                        "фактически", "также", "это", "like", "uh", "um", "ah", "okay", "so"
                    }

                    # Multi-word filler phrases
                    MULTI_WORD_FILLERS = {
                        "как бы", "в общем", "в общем-то", "так сказать", "это самое", 
                        "в принципе", "понимаешь ли", "как сказать", "you know", "kind of"
                    }

                    words_to_cut = set()

                    # Step 1: Detect single and multi-word filler words
                    for i in range(len(words)):
                        w_current = words[i]
                        text_curr = w_current.get('word', '').strip()
                        clean_curr = re.sub(r'[^\w\s-]', '', text_curr).lower()

                        # Check single fillers
                        if clean_curr in SINGLE_FILLERS:
                            words_to_cut.add(i)

                        # Check multi-word fillers
                        if i < len(words) - 1:
                            w_next = words[i+1]
                            text_next = w_next.get('word', '').strip()
                            clean_next = re.sub(r'[^\w\s-]', '', text_next).lower()

                            combined_phrase = f"{clean_curr} {clean_next}"
                            if combined_phrase in MULTI_WORD_FILLERS:
                                words_to_cut.add(i)
                                words_to_cut.add(i+1)

                    # Step 2: Build segments/phrases to detect duplicate sentences/takes
                    segments = []
                    current_segment = []
                    for i, w in enumerate(words):
                        if i in words_to_cut:
                            continue
                        text = w.get('word', '').strip()
                        start = w.get('start', 0.0)
                        end = w.get('end', 0.0)

                        if current_segment:
                            prev_w = words[current_segment[-1]]
                            prev_end = prev_w.get('end', 0.0)
                            prev_text = prev_w.get('word', '').strip()

                            pause = start - prev_end
                            ends_sentence = prev_text.endswith(('.', '?', '!'))

                            # Split segment on significant pauses (> 1.0s) or sentence boundaries
                            if pause > 1.0 or ends_sentence:
                                seg_text = " ".join(words[idx].get('word', '').strip() for idx in current_segment)
                                segments.append({
                                    "indices": current_segment,
                                    "text": seg_text,
                                    "start": words[current_segment[0]].get('start', 0.0),
                                    "end": words[current_segment[-1]].get('end', 0.0)
                                })
                                current_segment = []

                        current_segment.append(i)

                    if current_segment:
                        seg_text = " ".join(words[idx].get('word', '').strip() for idx in current_segment)
                        segments.append({
                            "indices": current_segment,
                            "text": seg_text,
                            "start": words[current_segment[0]].get('start', 0.0),
                            "end": words[current_segment[-1]].get('end', 0.0)
                        })

                    # Step 3: Compare segments for duplicate takes/stuttering and mark for deletion (keep last take)
                    def get_similarity(s1, s2):
                        c1 = re.sub(r'[^\w\s]', '', s1).lower().strip()
                        c2 = re.sub(r'[^\w\s]', '', s2).lower().strip()
                        if len(c1.split()) < 2 or len(c2.split()) < 2:
                            return 0.0
                        return SequenceMatcher(None, c1, c2).ratio()

                    for k in range(len(segments)):
                        # Compare k with k+1 and k+2
                        for offset in (1, 2):
                            if k + offset < len(segments):
                                sim = get_similarity(segments[k]["text"], segments[k+offset]["text"])
                                if sim >= 0.78:
                                    # Mark all indices of segments[k] (the earlier duplicate take) for deletion!
                                    for idx in segments[k]["indices"]:
                                        words_to_cut.add(idx)
                                    break

                    # Step 4: Group contiguous cut indices into compact, professional cut_out patches
                    cut_indices = sorted(list(words_to_cut))
                    groups = []
                    if cut_indices:
                        current_group = [cut_indices[0]]
                        for idx in cut_indices[1:]:
                            if idx == current_group[-1] + 1:
                                current_group.append(idx)
                            else:
                                groups.append(current_group)
                                current_group = [idx]
                        groups.append(current_group)

                    for grp in groups:
                        start_idx = grp[0]
                        end_idx = grp[-1]

                        start_w = words[start_idx].get('start', 0.0)
                        end_w = words[end_idx].get('end', 0.0)

                        prev_end = words[start_idx-1].get('end', 0.0) if start_idx > 0 else 0.0
                        next_start = words[end_idx+1].get('start', end_w + 0.5) if end_idx < len(words) - 1 else end_w + 0.5

                        safe_start = max(start_w - 0.05, prev_end + 0.01)
                        safe_end = min(end_w + 0.05, next_start - 0.01)

                        if safe_end > safe_start:
                            auto_cuts.append({
                                "action": "cut_out",
                                "start": round(safe_start, 2),
                                "end": round(safe_end, 2),
                                "reason": f"Слово-паразит / Повторение дубля: '{words[start_idx].get('word','')}'"
                            })

                    # Step 5: Trim overlong pauses (> 0.8s) between remaining non-cut words
                    remaining_indices = [idx for idx in range(len(words)) if idx not in words_to_cut]
                    for idx_ptr in range(len(remaining_indices) - 1):
                        i = remaining_indices[idx_ptr]
                        j = remaining_indices[idx_ptr + 1]

                        end_w = words[i].get('end', 0.0)
                        start_next = words[j].get('start', 0.0)

                        pause_duration = start_next - end_w
                        if pause_duration > 0.8:
                            safe_cut_start = end_w + 0.15
                            safe_cut_end = start_next - 0.15
                            if safe_cut_end > safe_cut_start:
                                auto_cuts.append({
                                    "action": "cut_out",
                                    "start": round(safe_cut_start, 2),
                                    "end": round(safe_cut_end, 2),
                                    "reason": "Затянутая пауза"
                                })

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
    if os.path.exists(visual_path):
        try:
            with open(visual_path, "r", encoding="utf-8") as f:
                scenes = json.load(f)
            visual_context_text = format_visual_context(scenes)
        except Exception:
            pass

    # ── Aspect Ratio & Resolution Detection ──
    width, height = 1080, 1920  # Default vertical
    video_path = os.path.join("uploads", f"{file_id}.mp4")
    if os.path.exists(video_path):
        try:
            cmd = [
                "ffprobe", "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=width,height", "-of", "json",
                video_path
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            probe_data = json.loads(res.stdout)
            if "streams" in probe_data and probe_data["streams"]:
                width = int(probe_data["streams"][0].get("width", 1080))
                height = int(probe_data["streams"][0].get("height", 1920))
        except Exception as e:
            print(f"[PrepareContext] ffprobe display dims check failed: {e}")

    aspect_ratio = "horizontal" if width > height else "vertical"
    print(f"[PrepareContext] Detected display resolution: {width}x{height} ({aspect_ratio})")

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
        f"Анализ завершен. Загружен транскрипт и обнаружено {len(auto_cuts)} пауз для удаления. "
        f"Параметры видео: {aspect_ratio} ({width}x{height})."
    )

    return {
        "transcript_text": transcript_text,
        "visual_context": visual_context_text,
        "auto_cuts": auto_cuts,
        "template_config": template_config,
        "production_session": session,
        "shared_memory": shared_memory,
        "session_id": session.get("session_id"),
        "aspect_ratio": aspect_ratio,
        "width": width,
        "height": height,
        "media_library": media_library
    }
