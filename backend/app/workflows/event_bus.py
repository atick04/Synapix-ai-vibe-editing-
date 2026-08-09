"""
Event Bus System — Async/thread-safe event broker.
Supports realtime event propagation for editing tool execution, reasoning loops, and pacing analysis.
"""

import contextvars
from typing import Any, Callable, Dict, Optional
import logging

logger = logging.getLogger(__name__)

# A context variable holding the callback for the current SSE/WS connection stream
_event_callback: contextvars.ContextVar[Callable[[dict], None]] = contextvars.ContextVar("_event_callback")

def set_event_callback(callback: Callable[[dict], None]):
    return _event_callback.set(callback)

def reset_event_callback(token):
    _event_callback.reset(token)

def emit(event_type: str, payload: Dict[str, Any]):
    """
    Emit a structured production system event.
    If a callback is registered for the current context, triggers it to stream back to the UI.
    """
    # Expose both tool status and unified reasoning steps in a backward-compatible schema
    event = {
        "type": event_type,
        **payload
    }
    
    # Map 'reasoning_update' directly to 'reasoning_event' type to match the frontend parser
    if event_type == "reasoning_update":
        event["type"] = "reasoning_event"
        # Map fields for chat UI checklist compatibility
        if "agent" not in event:
            event["agent"] = "Cinematic Brain"
        if "step" not in event:
            event["step"] = payload.get("message", "Processing")
            
    elif event_type in ("tool_started", "tool_completed"):
        event["type"] = "reasoning_event"
        event["agent"] = "Tool Executor"
        event["step"] = "EXECUTION: Последовательное применение монтажных инструментов на таймлайне"
        event["status"] = "running"
        
        # Humanize the tool execution state
        from app.workflows.reasoning_humanizer import humanize_step
        tool = payload.get("tool", "")
        msg = payload.get("message", "")
        friendly_desc = humanize_step(msg) if msg else humanize_step(tool)
        
        event["details"] = friendly_desc
        event["progress"] = 0.85 if event_type == "tool_completed" else 0.7
        
    elif event_type == "retention_warning":
        event["type"] = "reasoning_event"
        event["agent"] = "Retention Critic"
        event["step"] = "FINALIZATION: Проверка плотности графики, темпа смены кадров и аудит удержания внимания"
        event["status"] = "running"
        event["details"] = f"Предупреждение: {payload.get('message', '')}"
        event["progress"] = 0.95

    elif event_type == "graphics_generated":
        # Surface generative graphics completion in the chat activity feed
        event["type"] = "reasoning_event"
        event["agent"] = payload.get("agent") or "Graphics Developer"
        event["step"] = payload.get("step") or "GRAPHICS: Графическая сцена готова"
        event["status"] = payload.get("status") or "done"
        event["details"] = payload.get("details") or payload.get("message") or "Графика добавлена на таймлайн"
        event["progress"] = payload.get("progress", 0.88)

    elif event_type == "graphics_progress":
        event["type"] = "reasoning_event"
        event["agent"] = payload.get("agent") or "Graphics Developer"
        event["step"] = payload.get("step") or "GRAPHICS: Генерация сцены"
        event["status"] = payload.get("status") or "running"
        event["details"] = payload.get("details") or payload.get("message") or "Генерирую графическую сцену…"
        event["progress"] = payload.get("progress", 0.75)

    # Humanize step if it exists in the event
    if "step" in event:
        try:
            from app.workflows.reasoning_humanizer import humanize_step
            event["step"] = humanize_step(event["step"])
        except Exception as e:
            logger.error(f"Failed to humanize step: {e}")

    # Attach short human thought for chat UI (hide technical junk)
    if event.get("type") in ("reasoning_event", "reasoning", "graphics_progress", "graphics_generated"):
        try:
            from app.workflows.thought_narrator import enrich_event
            event = enrich_event(event)
        except Exception as e:
            logger.error(f"Failed to narrate thought: {e}")
            
    try:
        callback = _event_callback.get()
        callback(event)
    except LookupError:
        # Fallback print for offline tests / local regression suites
        msg = payload.get("message") or payload.get("step") or payload.get("tool") or ""
        try:
            print(f"[Event Bus - {event_type}] {msg}")
        except Exception:
            logger.info(f"[Event Bus - {event_type}] {msg}")

