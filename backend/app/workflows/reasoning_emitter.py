import contextvars
from typing import Any, Callable

# A context variable holding the callback for the current async task/request
_reasoning_callback: contextvars.ContextVar[Callable[[dict], None]] = contextvars.ContextVar("_reasoning_callback")

def set_reasoning_callback(callback: Callable[[dict], None]):
    return _reasoning_callback.set(callback)

def reset_reasoning_callback(token):
    _reasoning_callback.reset(token)

def emit(agent: str, step: str, details: str = "", status: str = "running", progress: float = 0.0):
    """Emit a unified reasoning event to the current request's SSE stream."""
    friendly_names = {
        "director_agent": "Director",
        "graphics_agent": "Graphics",
        "audio_agent": "Audio",
        "critic_agent": "Critic",
        "retention_agent": "Retention"
    }
    
    clean_agent = friendly_names.get(agent, agent)
    
    event = {
        "agent": clean_agent,
        "step": step,
        "details": details,
        "status": status,
        "progress": progress
    }
    
    try:
        from app.workflows.reasoning_humanizer import humanize_step
        event["step"] = humanize_step(step)
        if details:
            event["details"] = humanize_step(details)
    except Exception:
        pass
    
    try:
        callback = _reasoning_callback.get()
        callback(event)
    except LookupError:
        # Fallback for offline environments/tests
        print(f"[Reasoning - {clean_agent}] {step} ({details}) | status={status} | progress={progress}")
