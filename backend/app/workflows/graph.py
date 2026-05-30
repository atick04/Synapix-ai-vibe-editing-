"""
Editor Graph — Re-architected Multi-Turn Cinematic Video Operating System workflow.
Flow:
  START → prepare_context → cinematic_reasoning_agent ──[has tools?]──➔ execute_tools ➔ cinematic_reasoning_agent
                                         │
                                       [no]
                                         ▼
                                        END
"""

from langgraph.graph import StateGraph, START, END
from app.workflows.state import VideoEditingState
from app.agents.context_preparation import prepare_context_node
from app.workflows.cinematic_reasoning_engine import cinematic_reasoning_agent, execute_tools_node

def should_continue(state: VideoEditingState) -> str:
    """Conditional router that checks if the agent requested any tool calls in its latest response."""
    messages = state.get("messages", [])
    if not messages:
        return END
        
    last_message = messages[-1]
    content = last_message.content if hasattr(last_message, "content") else str(last_message)
    
    # Try to parse the tool calls from the JSON response
    try:
        from app.workflows.json_sanitizer import parse_json_blocks_from_text, safe_json_loads
        import re
        
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
            
        tool_calls = parsed.get("tool_calls", [])
        if tool_calls:
            # Prevent infinite loop: clear tool_calls to ensure we don't repeat them indefinitely if parser behaves weirdly
            return "execute_tools"
    except Exception:
        # Fallback to regex check for tools
        import re
        if re.search(r'"tool_calls"\s*:\s*\[\s*{', content):
            return "execute_tools"
            
    return END

builder = StateGraph(VideoEditingState)

# ── Nodes ──
builder.add_node("prepare_context", prepare_context_node)
builder.add_node("cinematic_reasoning_agent", cinematic_reasoning_agent)
builder.add_node("execute_tools", execute_tools_node)

# ── Edges ──
builder.add_edge(START, "prepare_context")
builder.add_edge("prepare_context", "cinematic_reasoning_agent")
builder.add_conditional_edges(
    "cinematic_reasoning_agent",
    should_continue,
    {
        "execute_tools": "execute_tools",
        END: END
    }
)
builder.add_edge("execute_tools", "cinematic_reasoning_agent")

editor_graph = builder.compile()
