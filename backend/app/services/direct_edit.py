"""Run a clear single-tool chat command without waiting on the director LLM."""

from typing import Any, Dict, List, Optional, Tuple

from app.services.beat_sheet import planned_calls_for_message, reply_for_tools, targeted_allowlist


async def apply_direct_intent(
    file_id: str,
    message: str,
    active_edits: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Tuple[List[Dict[str, Any]], str]]:
    if not targeted_allowlist(message):
        return None
    calls = planned_calls_for_message(message)
    if not calls:
        return None

    from app.workflows.production_memory import ProductionMemory
    from app.workflows.production_session import load_session, update_session
    from app.workflows.timeline_state import TimelineState
    from app.workflows.tool_executor import ToolExecutor

    session = load_session(file_id) or {}
    if not session.get("project_id"):
        session["project_id"] = file_id
    timeline = TimelineState(list(active_edits or []))
    memory = ProductionMemory(session)
    executor = ToolExecutor(timeline, memory)
    for call in calls:
        await executor.execute_tool(call.get("name") or "", call.get("arguments") or {})

    edits = timeline.get_serialized_edits()
    try:
        update_session(file_id, {"active_edits": edits})
    except Exception:
        pass
    return edits, reply_for_tools(calls)
