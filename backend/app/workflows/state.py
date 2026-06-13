from typing import TypedDict, List, Dict, Any, Annotated, Optional
import operator
from langchain_core.messages import BaseMessage

class VideoEditingState(TypedDict, total=False):
    file_id: str
    user_message: str
    is_evaluation: bool
    transcript_text: str
    visual_context: str
    auto_cuts: List[Dict[str, Any]]
    template_id: Optional[str]
    template_config: Optional[Dict[str, Any]]
    active_edits: Optional[List[Dict[str, Any]]]
    focused_item: Optional[Dict[str, Any]]
    media_library: Optional[List[Dict[str, Any]]]

    
    # Langchain message stream for generating response
    messages: Annotated[List[BaseMessage], operator.add]
    
    # Resulting parse output
    ai_response_json: str
    edits: List[Dict[str, Any]]
    variants: List[Dict[str, Any]]
    ready_to_render: bool

    # ─── Style Engine ──────────────────────────────────────────────
    # Graphics template hint: "concept_explainer", "timeline", "cause_effect", or "auto"
    style_hint: Optional[str]

    # ─── Critic Agent Fields ────────────────────────────────────────
    # Feedback string from critic → graphics agent for retry loop
    critic_feedback: Optional[str]
    # How many times the graphics agent has been retried by the critic
    critic_retry_count: int
    # Whether the critic approved the output (used for conditional edge)
    critic_approved: bool

    # ─── Multi-Agent Long-Lived Session Fields ────────────────────────
    session_id: Optional[str]
    production_session: Optional[Dict[str, Any]]
    shared_memory: Optional[Dict[str, Any]]

