"""
Base Agent — shared LLM configuration and utilities for all agents.

Centralizes:
- LLM instance (Groq / LLaMA)
- Filler-word dictionary
- Common constants (safe zones, color palettes)
"""

import os
import re
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

openrouter_key = os.getenv("OPENROUTER_API_KEY")

# ─── Shared LLM Instance (Director / Core Orchestration) ────────────────────
if openrouter_key:
    llm = ChatOpenAI(
        model=os.getenv("DIRECTOR_MODEL", "meta-llama/llama-3.3-70b-instruct"),
        api_key=openrouter_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0.3,
        max_tokens=6000,
        default_headers={
            "HTTP-Referer": "https://vibedit.ai",
            "X-Title": "VibeEdit AI Studio"
        }
    )
else:
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        max_tokens=6000,
        streaming=True,
    )

# ─── Dedicated Graphics LLM Instance (Graphics / Layout Specialist) ─────────
graphics_model_name = os.getenv("GRAPHICS_MODEL", "google/gemini-2.5-flash-lite" if openrouter_key else "llama-3.1-8b-instant")

if openrouter_key:
    graphics_llm = ChatOpenAI(
        model=graphics_model_name,
        api_key=openrouter_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0.4,  # Increased to 0.4 for more creative and diverse visual layout compositions
        max_tokens=6000,
        default_headers={
            "HTTP-Referer": "https://vibedit.ai",
            "X-Title": "VibeEdit AI Studio"
        }
    )
else:
    graphics_llm = ChatGroq(
        model=graphics_model_name,
        temperature=0.4,  # Increased to 0.4 for more creative layout compositions
        max_tokens=6000,
        streaming=True,
    )

# ─── Filler Words (Russian) ────────────────────────────────────────────────
FILLER_WORDS = {
    "аааааа", "ээ", "мм", "эм", "ну", "типа", "короче",
    "в общем", "значит", "как бы", "аа", "э-э", "м-м",
    "эээ", "ммм", "ну типа",
}

# ─── Typography Presets ─────────────────────────────────────────────────────
FONT_PRESETS = {
    "tech":      "Inter_24pt-Bold",
    "tiktok":    "BebasNeue-Regular",
    "blog":      "Rubik-Bold",
    "strict":    "Oswald-Bold",
    "modern":    "Manrope-Bold",
    "code":      "JetBrainsMono-Bold",
    "lifestyle": "Comfortaa-Bold",
    "universal": "Montserrat-ExtraBold",
}

# ─── Canvas Safe Zones (1080x1920) ──────────────────────────────────────────
CANVAS_WIDTH = 1080
CANVAS_HEIGHT = 1920
SAFE_ZONE_TOP = (0, 450)       # y: 0-450 px
SAFE_ZONE_BOTTOM = (1410, 1920) # y: 1410-1920 px
FACE_ZONE = (450, 1410)         # y: 450-1410 px — never overlap



async def invoke_llm(system_prompt: str, user_message: str):
    """Invoke the shared LLM with a system + user message pair.
    Returns the raw AIMessage response."""
    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ])
    return response


async def invoke_graphics_llm(system_prompt: str, user_message: str):
    """Invoke the dedicated graphics LLM with a system + user message pair.
    Returns the raw AIMessage response."""
    response = await graphics_llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ])
    return response
