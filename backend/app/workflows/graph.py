"""
Editor Graph — Re-architected Multi-Turn Cinematic Video Operating System workflow.
Flow:
  START → prepare_context → cinematic_reasoning_agent ──[has tools?]──➔ execute_single_tool ➔ cinematic_reasoning_agent
                                         │
                                       [no]
                                         ▼
                                     run_critic ──[approved or retries >= 3?]──➔ END
                                         │
                                       [no]
                                         ▼
                             cinematic_reasoning_agent
"""

from langgraph.graph import StateGraph, START, END
from app.workflows.state import VideoEditingState
from app.agents.context_preparation import prepare_context_node
from app.workflows.cinematic_reasoning_engine import (
    cinematic_reasoning_agent,
    execute_single_tool_node,
    retention_critic_node
)

def should_continue(state: VideoEditingState) -> str:
    """Conditional router that checks if the agent requested any tool calls in its latest response."""
    messages = state.get("messages", [])
    is_eval = state.get("is_evaluation", False)
    if not messages:
        return "run_critic" if is_eval else END

    last_message = messages[-1]
    content = last_message.content if hasattr(last_message, "content") else str(last_message)

    # Try to parse the tool calls from the JSON response
    try:
        from app.workflows.json_sanitizer import parse_json_blocks_from_text, safe_json_loads

        content_clean = content.strip()
        if "```json" in content_clean:
            content_clean = content_clean.split("```json")[1].split("```")[0].strip()
        elif "```" in content_clean:
            content_clean = content_clean.split("```")[1].split("```")[0].strip()

        parsed_blocks = parse_json_blocks_from_text(content)
        if parsed_blocks:
            parsed = parsed_blocks[0]
        else:
            parsed = safe_json_loads(content_clean)

        tool_calls = parsed.get("tool_calls", []) if parsed else []
        if tool_calls:
            return "execute_single_tool"
    except Exception:
        # Fallback to regex check for tools
        import re
        if re.search(r'"tool_calls"\s*:\s*\[\s*{', content):
            return "execute_single_tool"

    from app.services.beat_sheet import planned_calls_for_message
    if planned_calls_for_message(state.get("user_message") or ""):
        return "execute_single_tool"

    return "run_critic" if is_eval else END

def check_critic_result(state: VideoEditingState) -> str:
    """Conditional router that checks if critic approved or if we reached max retries."""
    approved = state.get("critic_approved", False)
    retry_count = state.get("critic_retry_count", 0)
    if approved or retry_count >= 3:
        return END
    return "cinematic_reasoning_agent"

builder = StateGraph(VideoEditingState)

# ── Nodes ──
builder.add_node("prepare_context", prepare_context_node)
builder.add_node("cinematic_reasoning_agent", cinematic_reasoning_agent)
builder.add_node("execute_single_tool", execute_single_tool_node)
builder.add_node("run_critic", retention_critic_node)

# ── Edges ──
builder.add_edge(START, "prepare_context")
builder.add_edge("prepare_context", "cinematic_reasoning_agent")
builder.add_conditional_edges(
    "cinematic_reasoning_agent",
    should_continue,
    {
        "execute_single_tool": "execute_single_tool",
        "run_critic": "run_critic",
        END: END
    }
)
# Execute tool once and terminate turn cleanly — no autonomous looping
builder.add_edge("execute_single_tool", END)
builder.add_conditional_edges(
    "run_critic",
    check_critic_result,
    {
        "cinematic_reasoning_agent": "cinematic_reasoning_agent",
        END: END
    }
)

editor_graph = builder.compile()


