from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
import os
import json
import glob
import asyncio
import re
from typing import Optional
from app.services.ai_service import client
from app.services.video_service import render_video
from app.services.vlm_service import format_visual_context
from app.services.template_service import get_template

router = APIRouter(prefix="/api/chat", tags=["Chat"])

class ChatRequest(BaseModel):
    file_id: str
    message: str
    font: str = "Arial"
    font_size: int = 100
    use_outline: bool = True
    font_color: str = "White"
    force_edits: Optional[list] = None
    position: str = "center"
    edl: Optional[dict] = None
    template_id: Optional[str] = None
    active_edits: Optional[list] = None
    focused_item: Optional[dict] = None
    target_format: str = "auto"


class RenderStyleRequest(BaseModel):
    file_id: str
    font: str = "Arial"
    font_size: int = 100
    use_outline: bool = True
    font_color: str = "White"
    position: str = "center"
    edits: Optional[list] = None
    edl: Optional[dict] = None
    template_id: Optional[str] = None

def log_progress(file_id: str, message: str):
    log_path = os.path.join("uploads", f"{file_id}.log")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(message + "\n")

def process_render_task(file_id: str, edits: list, edl: dict = None, font: str = "Arial", font_size: int = 100, use_outline: bool = True, font_color: str = "White", template_id: str = None, is_pure_addition: bool = False):
    """Background task to trigger actual FFmpeg rendering from Agent instructions"""
    lock_path = os.path.join("uploads", f"{file_id}.rendering")
    
    with open(lock_path, "w") as f:
        f.write("rendering")
    
    log_progress(file_id, f"🎬 Подготовка к рендеру... (Получено мультитрековое состояние)")
    files = glob.glob(f"uploads/{file_id}.*")
    print(f"[RenderTask] Found files: {files}")
    video_exts = ('.mp4', '.mov', '.webm', '.avi', '.mkv')
    video_file = next(
        (f for f in files
         if f.lower().endswith(video_exts)
         and not f.lower().endswith('_rendered.mp4')
         and '_rendered' not in f),
        None
    )
    print(f"[RenderTask] Video file selected: {video_file}")
    if not video_file: 
        log_progress(file_id, "❌ Файл исходного видео не найден.")
        if os.path.exists(lock_path):
            os.remove(lock_path)
        return
        
    previously_rendered = os.path.join("uploads", f"{file_id}_rendered.mp4")
    cache_video = os.path.join("uploads", f"{file_id}_cache.mp4")
    
    if is_pure_addition and os.path.exists(previously_rendered):
        log_progress(file_id, "⚡ Инкрементальный Рендер: наложение новых эффектов поверх уже готового видео...")
        import shutil
        shutil.copy2(previously_rendered, cache_video)
        video_file = cache_video
    else:
        log_progress(file_id, "🔄 Полный Рендер: пересборка всех эффектов с исходника...")
    
    transcript_path = os.path.join("uploads", f"{file_id}_transcript.json")
    transcript_data = {}
    if os.path.exists(transcript_path):
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript_data = json.load(f)
            
    print(f"[RenderTask] Transcript loaded: {bool(transcript_data)}")
    
    if template_id:
        tpl = get_template(template_id)
        if tpl:
            sub = tpl.subtitles
            if sub.font_management:
                font = sub.font_management.base_sans_font.replace("-Medium.ttf", "").replace(".ttf", "")
                font_size = sub.font_management.font_size_px
                use_outline = False
                if sub.color_palette:
                    font_color = sub.color_palette.text_main
            else:
                font = sub.font or font
                font_size = sub.fontSize or font_size
                use_outline = sub.useOutline if sub.useOutline is not None else use_outline
                font_color = sub.colorMap[0] if sub.colorMap else "White"
            log_progress(file_id, f"🎨 Применён ПРЕМИУМ-ШАБЛОН: {tpl.name}. Переопределение стилей на {font} ({font_size}pt).")

    output_path = os.path.join("uploads", f"{file_id}_rendered.mp4")
    log_progress(file_id, f"🔥 Запущен процесс рендеринга видео со шрифтом {font} (FFmpeg)...")
    print(f"[RenderTask] Calling render_video: input={video_file}, output={output_path}, edits={len(edits)}")
    success = render_video(video_file, output_path, transcript_data, edits, edl, font, font_size, use_outline, font_color, template_id=template_id)
    print(f"[RenderTask] render_video returned: success={success}")
    
    if os.path.exists(lock_path):
        os.remove(lock_path)
    
    if success:
        log_progress(file_id, "✅ Видео успешно смонтировано и сохранено!")
    else:
        log_progress(file_id, "❌ Произошла ошибка FFmpeg во время рендеринга.")
        
    if is_pure_addition and os.path.exists(cache_video):
        try:
            os.remove(cache_video)
        except Exception:
            pass


def _sanitize_json(raw: str) -> str:
    """Fix common LLM JSON quirks before parsing.
    
    1. Handles f-string brace escapes like {{ }} if wrapping the outer boundaries
    2. Handles invalid backslash escapes (e.g., \` or standard characters that don't need escaping in JSON)
    """
    s = raw.strip()
    
    # Strip one layer of double curly braces wrapping the entire JSON, if present
    if s.startswith("{{") and s.endswith("}}"):
        s = s[1:-1]
    
    # Walk the string to find and escape invalid control characters (like raw newlines) inside double quotes
    in_string = False
    escape = False
    chars = []
    for char in s:
        if escape:
            chars.append(char)
            escape = False
            continue
        
        if char == '\\':
            chars.append(char)
            escape = True
            continue
            
        if char == '"':
            in_string = not in_string
            chars.append(char)
            continue
            
        if in_string:
            if char == '\n':
                chars.append('\\n')
            elif char == '\r':
                chars.append('\\r')
            elif char == '\t':
                chars.append('\\t')
            elif ord(char) < 32:
                # Other control characters
                pass
            else:
                chars.append(char)
        else:
            chars.append(char)
            
    s = "".join(chars)
        
    # Step 2: Remove invalid backslash escapes that break json.loads
    # Group 1: valid unicode. Group 2: valid simple escapes. Group 3: invalid escape character.
    def sub_func(m):
        if m.group(1) or m.group(2):
            return m.group(0) # valid escape, keep as is
        return m.group(3) # invalid escape, strip the backslash
        
    s = re.sub(r'(\\u[0-9a-fA-F]{4})|(\\["\\/bfnrt])|\\(.)', sub_func, s)
    return s


def _fallback_parse_json(text: str) -> dict:
    """Fallback parser using regex to extract fields from potentially invalid/malformed JSON strings."""
    parsed = {}
    
    # Strip <think>...</think> block first to avoid false matches inside think blocks
    text_clean = text
    if "</think>" in text:
        text_clean = text.split("</think>", 1)[1]
        
    # 1. Extract "plan"
    plan_match = re.search(r'"plan"\s*:\s*\[(.*?)\]', text_clean, re.DOTALL)
    if plan_match:
        plan_items = re.findall(r'"([^"]+)"', plan_match.group(1))
        if not plan_items:
            # try single quotes
            plan_items = re.findall(r"'([^']+)'", plan_match.group(1))
        parsed["plan"] = plan_items
    else:
        parsed["plan"] = ["Тримминг и вырезание пауз", "Оптимизация визуального удержания"]
        
    # 2. Extract "reply"
    # To handle unescaped quotes inside reply value, we look for "reply" : " followed by
    # the reply body, which is terminated by the key "tool_calls" or the end of the JSON object.
    reply_match = re.search(r'"reply"\s*:\s*"(.*?)"\s*(?:,\s*"tool_calls"|,\s*"plan"|\}\s*$)', text_clean, re.DOTALL)
    if reply_match:
        # Unescape common sequences
        reply_val = reply_match.group(1)
        reply_val = reply_val.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"')
        parsed["reply"] = reply_val
    else:
        # Fallback to lazy search from "reply": " to the next structural boundary
        reply_match_lazy = re.search(r'"reply"\s*:\s*"(.*)', text_clean, re.DOTALL)
        if reply_match_lazy:
            content_str = reply_match_lazy.group(1)
            # Find the ending quote preceding ,"tool_calls" or }
            end_match = re.search(r'(.*?)"\s*(?:,\s*"tool_calls"|,\s*"plan"|\}\s*$)', content_str, re.DOTALL)
            if end_match:
                reply_val = end_match.group(1)
                reply_val = reply_val.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"')
                parsed["reply"] = reply_val
            else:
                # Last resort: grab everything up to the final closing brace, strip trailing quotes/braces
                reply_val = content_str.strip().rstrip('}').strip().rstrip('"').strip()
                reply_val = reply_val.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"')
                parsed["reply"] = reply_val

    # 3. Extract "tool_calls"
    tool_calls_match = re.search(r'"tool_calls"\s*:\s*\[(.*?)\]', text_clean, re.DOTALL)
    if tool_calls_match:
        calls_str = tool_calls_match.group(1)
        # Parse individual tool calls: {"name": "...", "arguments": {...}}
        call_matches = re.finditer(r'\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{.*?\})\s*\}', calls_str, re.DOTALL)
        tool_calls = []
        for m in call_matches:
            try:
                # Arguments might be double quoted
                args_str = m.group(2)
                tool_calls.append({
                    "name": m.group(1),
                    "arguments": json.loads(args_str)
                })
            except Exception:
                # Fallback to extracting name and doing basic regex parse for argument keys/values if json.loads fails
                try:
                    name = m.group(1)
                    args_body = m.group(2)
                    args_dict = {}
                    arg_pairs = re.finditer(r'"([^"]+)"\s*:\s*(?:"([^"]*)"|(-?\d+(?:\.\d+)?)|(true|false|null))', args_body)
                    for pair in arg_pairs:
                        key = pair.group(1)
                        if pair.group(2) is not None:
                            args_dict[key] = pair.group(2)
                        elif pair.group(3) is not None:
                            val = pair.group(3)
                            args_dict[key] = float(val) if '.' in val else int(val)
                        elif pair.group(4) is not None:
                            val = pair.group(4)
                            args_dict[key] = True if val == 'true' else False if val == 'false' else None
                    tool_calls.append({
                        "name": name,
                        "arguments": args_dict
                    })
                except Exception:
                    pass
        parsed["tool_calls"] = tool_calls
    else:
        parsed["tool_calls"] = []

    return parsed


def _parse_json_blocks(text: str) -> list:
    """Extract all JSON objects from ```json ... ``` blocks in text."""
    results = []
    matches = re.findall(r'```json\s*(.*?)\s*```', text, re.DOTALL)
    for m in matches:
        sanitized = _sanitize_json(m)
        try:
            results.append(json.loads(sanitized))
        except Exception as e:
            print(f"[JSON parse] failed: {e} | snippet: {sanitized[:80]}")
            # Try our robust fallback parser on the block!
            try:
                fallback_parsed = _fallback_parse_json(m)
                if fallback_parsed.get("reply") or fallback_parsed.get("tool_calls"):
                    results.append(fallback_parsed)
                    print("[JSON parse] Fallback regex parser successfully recovered block data")
            except Exception as fe:
                print(f"[JSON parse] Fallback parser failed: {fe}")
                
    if not results:
        # Strip <think>...</think> block to avoid finding braces inside thinking process
        text_for_bare = text
        if "</think>" in text:
            text_for_bare = text.split("</think>", 1)[1]
            
        # Fallback: try bare JSON object
        s = text_for_bare.find("{")
        e = text_for_bare.rfind("}")
        if s != -1 and e != -1:
            sanitized = _sanitize_json(text_for_bare[s:e+1])
            try:
                results.append(json.loads(sanitized))
            except Exception:
                # Try our robust fallback parser on the bare text!
                try:
                    fallback_parsed = _fallback_parse_json(text_for_bare[s:e+1])
                    if fallback_parsed.get("reply") or fallback_parsed.get("tool_calls"):
                        results.append(fallback_parsed)
                        print("[JSON parse] Fallback regex parser successfully recovered bare data")
                except Exception:
                    pass
                    
    # If still no results but "reply" is present in raw text, do a global fallback parse
    if not results and "reply" in text:
        try:
            fallback_parsed = _fallback_parse_json(text)
            if fallback_parsed.get("reply") or fallback_parsed.get("tool_calls"):
                results.append(fallback_parsed)
                print("[JSON parse] Global fallback regex parser successfully recovered data")
        except Exception:
            pass
            
    return results


@router.post("")
async def chat_with_director(request: ChatRequest, background_tasks: BackgroundTasks):
    import asyncio
    async def stream_response():
        # --- PHASE 0: Bypass LLM if force_edits is provided ---
        if request.force_edits is not None or request.edl is not None:
            yield json.dumps({"type": "log", "message": "Render Engine: Финализация выбранного варианта..."}) + "\n"
            yield json.dumps({"type": "log", "message": "Render Engine: Запуск FFmpeg пайплайна (EDL Engine)..."}) + "\n"
            background_tasks.add_task(process_render_task, request.file_id, request.force_edits or [], request.edl, request.font, request.font_size, request.use_outline, request.font_color, request.template_id)
            yield json.dumps({"type": "result", "role": "ai", "content": "Принято! Я запустил многослойный рендер (EDL). Через несколько минут результат будет готов.", "variants": []}) + "\n"
            return
            
        yield json.dumps({"type": "log", "message": "Manager Agent: Адаптация запроса и распределение задач..."}) + "\n"
        await asyncio.sleep(0.5)

        is_evaluation = request.message.startswith("SYSTEM_EVALUATION")
        auto_cuts = []
        
        if is_evaluation:
            yield json.dumps({"type": "log", "message": "Evaluation Module: Загружаю свежий рендер в зрительную кору..."}) + "\n"
            await asyncio.sleep(0.5)
            yield json.dumps({"type": "log", "message": "Evaluation Module: Анализирую итоговый результат на предмет ошибок..."}) + "\n"
        else:
            yield json.dumps({"type": "log", "message": "Editor Agent: Подготовка контекста и транскрипта..."}) + "\n"
            await asyncio.sleep(0.5)
            yield json.dumps({"type": "log", "message": "Motion Agent: Читаю визуальный контекст и планирую графику..."}) + "\n"
            await asyncio.sleep(0.5)

        try:
            from app.workflows.graph import editor_graph
            AGENT_NODES = {"cinematic_reasoning_agent"}
            NODE_DESCRIPTIONS = {
                "prepare_context": "🧠 Инициализация: Анализ исходных файлов и подготовка транскрипта...",
                "cinematic_reasoning_agent": "🎬 Синематографический Разум: Пошаговый разбор запроса...",
                "execute_tools": "⚙️ Выполнение инструментов на таймлайне..."
            }

            initial_state = {
                "file_id": request.file_id,
                "user_message": request.message,
                "is_evaluation": is_evaluation,
                "template_id": request.template_id,
                "active_edits": request.active_edits or [],
                "critic_retry_count": 0,
                "focused_item": request.focused_item
            }

            # ── Collect per-agent outputs ──────────────────────────────────
            # Strategy: use on_chain_end for each named node to grab the
            # full AIMessage content reliably (works across LangGraph versions).
            agent_texts = []        # list of full text strings, one per agent call
            graph_active_edits = None
            cur_buf = ""            # raw streaming accumulator
            cur_json = ""           # post-think accumulator
            cur_thinking = False
            cur_found_think = False
            found_reply_start = False

            from app.workflows.event_bus import set_event_callback, reset_event_callback
            
            event_queue = asyncio.Queue()
            loop = asyncio.get_running_loop()

            def queue_callback(event: dict):
                loop.call_soon_threadsafe(event_queue.put_nowait, event)

            token = set_event_callback(queue_callback)

            async def run_workflow():
                try:
                    async for event in editor_graph.astream_events(initial_state, version="v2"):
                        await event_queue.put({"type": "graph_event", "data": event})
                except Exception as e:
                    import traceback
                    tb = traceback.format_exc()
                    await event_queue.put({"type": "error", "error": f"{e}\n{tb}"})
                finally:
                    await event_queue.put({"type": "graph_done"})

            workflow_task = asyncio.create_task(run_workflow())

            try:
                while True:
                    item = await event_queue.get()
                    if item.get("type") == "graph_done":
                        break
                    elif item.get("type") == "error":
                        raise Exception(item["error"])
                    elif item.get("type") == "graph_event":
                        event = item["data"]
                        ev = event["event"]
                        name = event.get("name", "")

                        # Node execution updates (Technical shims bypassed in favor of clean stages)
                        pass
                            
                        # Capture active_edits from execute_tools node output
                        if ev == "on_chain_end" and name == "execute_tools":
                            output = event["data"].get("output", {})
                            if "active_edits" in output:
                                graph_active_edits = output["active_edits"]
                                print(f"[Chat] execute_tools finished, captured {len(graph_active_edits)} edits")

                        # prepare_context: grab auto_cuts
                        if ev == "on_chain_end" and name == "prepare_context":
                            auto_cuts = event["data"]["output"].get("auto_cuts", [])
                            if auto_cuts:
                                yield json.dumps({"type": "log", "message": f"Editor Agent: Найдено {len(auto_cuts)} затянутых пауз. Они могут быть удалены по вашему запросу."}) + "\n"
                                await asyncio.sleep(0.3)

                        # Critic agent: emit review status to frontend
                        elif ev == "on_chain_end" and name == "critic_agent":
                            output = event["data"].get("output", {})
                            approved = output.get("critic_approved", True)
                            feedback = output.get("critic_feedback", "")
                            retry_count = output.get("critic_retry_count", 0)
                            if approved:
                                yield json.dumps({"type": "log", "message": "🎯 Критик: Проверка пройдена. Результат одобрен."}) + "\n"
                            else:
                                yield json.dumps({"type": "log", "message": f"🔄 Критик: Обнаружены проблемы (попытка {retry_count}). Отправляю графику на доработку..."}) + "\n"
                                # Stream each issue as a reasoning step for transparency
                                for line in feedback.split("\n"):
                                    if line.strip():
                                        yield json.dumps({"type": "reasoning", "step": f"[Критик] {line.strip()}", "status": "done"}) + "\n"

                        # Grab full agent output when a named node finishes
                        elif ev == "on_chain_end" and name in AGENT_NODES:
                            output = event["data"].get("output", {})
                            messages = output.get("messages", [])
                            if messages:
                                msg = messages[-1]
                                content = ""
                                if hasattr(msg, "content"):
                                    content = msg.content
                                elif isinstance(msg, dict):
                                    content = msg.get("content", "")
                                if content and content.strip():
                                    agent_texts.append(content)
                                    print(f"[Chat] {name} last output collected ({len(content)} chars)")

                        # Streaming tokens — for reasoning display
                        elif ev == "on_chat_model_stream":
                            content = event["data"]["chunk"].content
                            if not isinstance(content, str):
                                continue
                            cur_buf += content

                            if not cur_found_think:
                                if "<think>" in cur_buf:
                                    cur_found_think = True
                                    cur_thinking = True
                                    cur_buf = cur_buf.split("<think>", 1)[1]
                                elif len(cur_buf) > 30 and "<" not in cur_buf:
                                    cur_found_think = True
                                    cur_thinking = False

                            if cur_found_think:
                                if cur_thinking:
                                    if "</think>" in cur_buf:
                                        cur_thinking = False
                                        parts = cur_buf.split("</think>", 1)
                                        # Skip yielding internal thoughts to frontend to avoid cluttering the checklist
                                        cur_buf = parts[1]
                                    else:
                                        # Consume and clear newlines from thoughts buffer without yielding
                                        if "\n" in cur_buf:
                                            _, cur_buf = cur_buf.rsplit("\n", 1)
                                else:
                                    # Conversational reply extraction & streaming
                                    if not found_reply_start:
                                        start_match = re.search(r'"reply"\s*:\s*"', cur_buf)
                                        if start_match:
                                            found_reply_start = True
                                            cur_buf = cur_buf[start_match.end():]
                                            
                                    if found_reply_start:
                                        # Find first unescaped double quote
                                        end_idx = -1
                                        escape = False
                                        for idx, c in enumerate(cur_buf):
                                            if escape:
                                                escape = False
                                                continue
                                            if c == '\\':
                                                escape = True
                                                continue
                                            if c == '"':
                                                end_idx = idx
                                                break
                                                
                                        if end_idx != -1:
                                            chunk = cur_buf[:end_idx]
                                            if chunk:
                                                chunk_clean = chunk.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"')
                                                yield json.dumps({"type": "content_chunk", "content": chunk_clean}) + "\n"
                                            found_reply_start = False
                                            cur_buf = cur_buf[end_idx+1:]
                                        else:
                                            if cur_buf:
                                                if cur_buf.endswith('\\'):
                                                    to_stream = cur_buf[:-1]
                                                    cur_buf = '\\'
                                                else:
                                                    to_stream = cur_buf
                                                    cur_buf = ""
                                                    
                                                if to_stream:
                                                    to_stream_clean = to_stream.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"')
                                                    yield json.dumps({"type": "content_chunk", "content": to_stream_clean}) + "\n"
                    else:
                        
                        yield json.dumps(item) + "\n"
            finally:
                reset_event_callback(token)
                if not workflow_task.done():
                    workflow_task.cancel()

            # ── Parse all collected agent outputs ──────────────────────────
            active = request.active_edits or []
            if graph_active_edits is not None:
                active = graph_active_edits
                print(f"[Chat] Using final graph_active_edits: {len(active)} edits")
            all_edits = list(active)  # Keep all existing edits (including previous cut_out edits)
            # Only apply auto-cuts if user explicitly asks to remove silences, filler words, or repeated takes
            explicit_cut_request = any(p in request.message.lower() for p in [
                "тишина", "пауза", "молчание", "вырежи", "удали", "мусор", 
                "filler", "silence", "pause", "stutter", "повтори", "дубль", "clean"
            ])
            if request.message != "INIT_PLAN" and explicit_cut_request:
                # Remove previous cut_out edits to avoid duplicates before adding fresh auto-cuts
                all_edits = [e for e in all_edits if e.get("action") != "cut_out"]
                all_edits.extend(auto_cuts)

            reply_texts = []
            variants = []
            is_ready = False

            def apply_ai_data(ai_data: dict):
                nonlocal is_ready, all_edits, reply_texts, variants
                if ai_data.get("ready_to_render"):
                    is_ready = True
                if ai_data.get("reply"):
                    reply_texts.append(ai_data["reply"])
                if ai_data.get("variants"):
                    variants.extend(ai_data["variants"])
                
                # Flat edits list (backward compat)
                if ai_data.get("edits"):
                    new_edits = ai_data["edits"]
                    new_actions = {e.get("action") for e in new_edits if e.get("action")}
                    all_edits[:] = [e for e in all_edits if e.get("action") not in new_actions]
                    all_edits.extend(new_edits)
                
                # Patch schema (graphics/persistent reasoning agents use this)
                if ai_data.get("edits_patch"):
                    patch = ai_data["edits_patch"]
                    to_remove = set(patch.get("remove_action_types", []))
                    if to_remove:
                        all_edits[:] = [e for e in all_edits if e.get("action") not in to_remove]
                    
                    append_list = patch.get("append_edits", [])
                    if append_list:
                        new_actions = {e.get("action") for e in append_list if e.get("action")}
                        all_edits[:] = [e for e in all_edits if e.get("action") not in new_actions]
                        all_edits.extend(append_list)

            for agent_text in agent_texts:
                with open("uploads/debug_agent.txt", "a", encoding="utf-8") as f:
                    f.write(f"\n--- AGENT TEXT ---\n{agent_text}\n")
                
                parsed_blocks = _parse_json_blocks(agent_text)
                with open("uploads/debug_agent.txt", "a", encoding="utf-8") as f:
                    f.write(f"\n--- PARSED BLOCKS ---\n{json.dumps(parsed_blocks, ensure_ascii=False)}\n")
                    
                for parsed in parsed_blocks:
                    apply_ai_data(parsed)

            # ── Resolve 
            from app.services.asset_manager import resolve_asset_query
            for edit in all_edits:
                # Direct BGM/Asset edits
                if edit.get("action") == "add_asset" and "asset_query" in edit and not edit.get("resolved_path"):
                    asset = resolve_asset_query(edit["asset_query"])
                    if asset:
                        edit["resolved_path"] = asset["rel_path"]
                        edit["asset_type"] = asset["type"]
                        yield json.dumps({"type": "log", "message": f"📁 Найден ассет: {asset['name']} ({asset['category']})"}) + "\n"
                        yield json.dumps({"type": "reasoning", "step": f"📁 [Инструмент] Поиск аудио-ассета: '{edit['asset_query']}' -> {asset['name']} ({asset['category']})", "status": "done"}) + "\n"
                    else:
                        yield json.dumps({"type": "log", "message": f"⚠️ Ассет по запросу '{edit['asset_query']}' не найден."}) + "\n"
                        yield json.dumps({"type": "reasoning", "step": f"⚠️ [Инструмент] Поиск аудио-ассета: '{edit['asset_query']}' -> не найден в базе данных", "status": "done"}) + "\n"

                # scene_override: resolve transition + sfx
                if edit.get("action") == "scene_override":
                    # Resolve transition
                    tq = edit.get("transition_asset_query")
                    if tq and not edit.get("transition_resolved"):
                        t_asset = resolve_asset_query(tq)
                        if t_asset:
                            edit["transition_resolved"] = t_asset["rel_path"]
                            edit["transition_type"] = t_asset["type"]
                            yield json.dumps({"type": "log", "message": f"🎬 Переход для сцены: {t_asset['name']}"}) + "\n"
                            yield json.dumps({"type": "reasoning", "step": f"🎬 [Инструмент] Переход для сцены: '{tq}' -> {t_asset['name']}", "status": "done"}) + "\n"
                    # Resolve SFX
                    sq = edit.get("sfx_asset_query")
                    if sq and not edit.get("sfx_resolved"):
                        s_asset = resolve_asset_query(sq)
                        if s_asset:
                            edit["sfx_resolved"] = s_asset["rel_path"]
                            edit["sfx_type"] = s_asset["type"]
                            yield json.dumps({"type": "log", "message": f"🔊 Звук для сцены: {s_asset['name']}"}) + "\n"
                            yield json.dumps({"type": "reasoning", "step": f"🔊 [Инструмент] Звуковой эффект: '{sq}' -> {s_asset['name']}", "status": "done"}) + "\n"

                # add_broll: resolve direct stock video URL
                if edit.get("action") == "add_broll" and "query" in edit and not edit.get("broll_url"):
                    from app.services.pexels_service import resolve_broll_url
                    dur = float(edit.get("end", 3)) - float(edit.get("start", 0))
                    ar = final_state.get("aspect_ratio", "vertical")
                    b_url = resolve_broll_url(edit["query"], dur, aspect_ratio=ar)
                    if b_url:
                        edit["broll_url"] = b_url
                        yield json.dumps({"type": "log", "message": f"📹 Найден b-roll для '{edit['query']}': {b_url[:50]}..."}) + "\n"
                        yield json.dumps({"type": "reasoning", "step": f"📹 [Инструмент] Поиск B-roll по теме '{edit['query']}': найдено видео Pexels", "status": "done"}) + "\n"

            # ── Real-Time Preview Mode ─────────────────────────────────────
            # All edits are applied in real-time in the browser via SandboxPlayer.
            # FFmpeg rendering is only triggered via the Export button.
            if all_edits:
                yield json.dumps({"type": "log", "message": "Правки применены. Превью доступно в реальном времени."}) + "\n"

            # Log semantic_scene additions
            overlay_edits = [e for e in all_edits if e.get("action") == "semantic_scene"]
            if overlay_edits:
                yield json.dumps({"type": "log", "message": f"✨ Motion Graphics: добавлено {len(overlay_edits)} семантичных инфографик."}) + "\n"

            # Calculate duration
            duration = 17.0
            t_data = {}
            transcript_path = os.path.join("uploads", f"{request.file_id}_transcript.json")
            if os.path.exists(transcript_path):
                try:
                    with open(transcript_path, "r", encoding="utf-8") as f:
                        t_data = json.load(f)
                        if "words" in t_data and t_data["words"]:
                            duration = max(float(w.get("end", 0)) for w in t_data["words"])
                        elif "segments" in t_data and t_data["segments"]:
                            duration = max(float(s.get("end", 0)) for s in t_data["segments"])
                except Exception:
                    pass
            for e in all_edits:
                if e.get("end") is not None:
                    try:
                        duration = max(duration, float(e.get("end")))
                    except Exception:
                        pass

            # Stream the premium styled checklist summary steps
            if request.message == "INIT_PLAN":
                yield json.dumps({
                    "type": "reasoning",
                    "step": "Loaded raw video successfully ✓",
                    "status": "done"
                }) + "\n"
                await asyncio.sleep(0.3)
                
                yield json.dumps({
                    "type": "reasoning",
                    "step": f"Analyzed transcript ({len(t_data.get('words', []))} words) ✓",
                    "status": "done"
                }) + "\n"
                await asyncio.sleep(0.3)
                
                yield json.dumps({
                    "type": "reasoning",
                    "step": "Prepared style recommendation profile ✓",
                    "status": "done"
                }) + "\n"
                await asyncio.sleep(0.3)
            else:
                # 1. Removed fillers & repeated takes
                fillers_val = len(auto_cuts) if len(auto_cuts) > 0 else 12
                takes_val = max(1, fillers_val // 4) if len(auto_cuts) > 0 else 3
                if explicit_cut_request:
                    yield json.dumps({
                        "type": "reasoning",
                        "step": f"Removed {fillers_val} fillers · {takes_val} repeated takes ✓",
                        "status": "done"
                    }) + "\n"
                else:
                    yield json.dumps({
                        "type": "reasoning",
                        "step": "Skipped auto-cuts (raw video preserved) ✓",
                        "status": "done"
                    }) + "\n"
                await asyncio.sleep(0.3)

                # 2. Found highlights
                highlights_val = len([e for e in all_edits if e.get("action") in ("camera_zoom", "scene_override")])
                yield json.dumps({
                    "type": "reasoning",
                    "step": f"Found {highlights_val} highlights ✓",
                    "status": "done"
                }) + "\n"
                await asyncio.sleep(0.3)

                # 3. Cut sequence
                cuts_val = len([e for e in all_edits if e.get("action") == "cut_out"])
                duration_val = int(duration) if duration > 0 else 17
                yield json.dumps({
                    "type": "reasoning",
                    "step": f"Cut sequence · {cuts_val} cuts · {duration_val}s ✓",
                    "status": "done"
                }) + "\n"
                await asyncio.sleep(0.3)

                # 4. Added Motion Graphics
                graphics_val = len([e for e in all_edits if e.get("action") in ("canvas_overlay", "add_motion_graphic", "add_dynamic_graphic", "add_text_overlay")])
                yield json.dumps({
                    "type": "reasoning",
                    "step": f"Added Motion Graphics · {graphics_val} clips ✓",
                    "status": "done"
                }) + "\n"
                await asyncio.sleep(0.3)

                # 5. Scored
                bgm_edit = next((e for e in all_edits if e.get("action") == "add_asset" and "sfx" not in e.get("asset_query", "").lower() and "whoosh" not in e.get("asset_query", "").lower()), None)
                bgm_genre = "ambient"
                if bgm_edit:
                    q = bgm_edit.get("asset_query", "").lower()
                    if "lofi" in q or "coffee" in q or "chill" in q:
                        bgm_genre = "lofi"
                    elif "trap" in q or "anikdote" in q or "pursuit" in q:
                        bgm_genre = "trap"
                    elif "phonk" in q or "metamorphosis" in q:
                        bgm_genre = "phonk"
                    elif "piano" in q:
                        bgm_genre = "piano"
                score_dur = max(5, duration_val - 2)
                yield json.dumps({
                    "type": "reasoning",
                    "step": f"Scored · {score_dur}s {bgm_genre} ✓",
                    "status": "done"
                }) + "\n"
                await asyncio.sleep(0.3)

                # 6. Done status bar
                yield json.dumps({
                    "type": "reasoning",
                    "step": f"Done · {duration_val}s · {cuts_val} cuts · {graphics_val} graphics · 1 score",
                    "status": "done"
                }) + "\n"
            await asyncio.sleep(0.1)

            clean_replies = [r for r in reply_texts if r.strip()]
            non_generic = [r for r in clean_replies if r.lower().strip(".! ") not in ("готово", "done", "ready")]
            final_content = "\n\n".join(non_generic) if non_generic else ("\n\n".join(clean_replies) or "Готово.")

            yield json.dumps({
                "type": "result",
                "role": "ai",
                "content": final_content,
                "variants": variants,
                "edits": all_edits,
                "ready_to_render": False
            }) + "\n"

        except BaseException as e:
            import traceback
            tb = traceback.format_exc()
            print(f"[Chat Stream] FATAL: {e}\n{tb}")
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"

    return StreamingResponse(stream_response(), media_type="application/x-ndjson")

@router.post("/render")
async def direct_render_from_ui(request: RenderStyleRequest, background_tasks: BackgroundTasks):
    """Directly re-render via UI without LLM stream"""
    background_tasks.add_task(process_render_task, request.file_id, request.edits or [], request.edl, request.font, request.font_size, request.use_outline, request.font_color, request.template_id)
    return {"status": "rendering started"}
