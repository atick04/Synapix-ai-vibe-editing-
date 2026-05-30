"""
nodes.py — BACKWARD COMPATIBILITY SHIM

All agent logic has been refactored into the app.agents package:
- app.agents.base_agent            — shared LLM, constants
- app.agents.context_preparation   — transcript + visual context loader
- app.agents.director_agent        — main editing brain
- app.agents.graphics_agent        — paper animation motion designer
- app.agents.critic_agent          — supervisor / quality validator
- app.agents.audio_agent           — sound design (placeholder)

This file re-exports the node functions so that any existing imports
from app.workflows.nodes continue to work without changes.
"""

# Re-export all node functions for backward compatibility
from app.agents.context_preparation import prepare_context_node
from app.agents.director_agent import director_agent_node
from app.agents.graphics_agent import graphics_agent_node
from app.agents.critic_agent import critic_agent_node
from app.agents.base_agent import FILLER_WORDS, llm
