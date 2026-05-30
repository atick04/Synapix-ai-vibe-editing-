"""
Automated Integration Tests for the Single Persistent Cinematic Reasoning Engine & Tool Calling OS.
"""

import asyncio
import json
import logging
from dotenv import load_dotenv
load_dotenv()

from langchain_core.messages import AIMessage
from app.workflows.state import VideoEditingState
from app.workflows.graph import editor_graph
from app.workflows.timeline_state import TimelineState
from app.workflows.production_memory import ProductionMemory
from app.workflows import event_bus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TestCinematicOS")

def test_timeline_state():
    logger.info("🧪 Testing Timeline State Operations...")
    timeline = TimelineState()
    
    # 1. Test B-roll conflict overlap resolution
    timeline.add_broll(5.0, 10.0, "skyline")
    timeline.add_broll(8.0, 12.0, "beach")  # Should remove the previous due to overlap
    
    edits = timeline.get_serialized_edits()
    assert len(edits) == 1
    assert edits[0]["query"] == "beach"
    
    # 2. Test BGM exclusivity
    timeline.add_asset(0.0, None, "trap background", volume=-22, is_bgm=True)
    timeline.add_asset(0.0, None, "lofi background", volume=-20, is_bgm=True)  # Should replace the old BGM
    
    edits = timeline.get_serialized_edits()
    bgm_clips = [e for e in edits if e.get("action") == "add_asset" and e.get("start") == 0.0]
    assert len(bgm_clips) == 1
    assert bgm_clips[0]["asset_query"] == "lofi background"
    
    logger.info("✅ Timeline State Operations tests passed successfully.")

def test_production_memory_gates():
    logger.info("🧪 Testing Production Memory Gates (Anti-Repetition)...")
    memory = ProductionMemory()
    
    # 1. Test soundtrack repetition
    memory.record_soundtrack("trap beat")
    assert memory.is_soundtrack_repeated("trap beat") is True
    assert memory.is_soundtrack_repeated("lofi coffee") is False
    
    # 2. Test zoom density gate
    memory.record_zoom(2.0, "zoom_in")
    assert memory.check_zoom_density(3.0) is False  # 1 zoom is fine
    memory.record_zoom(4.0, "zoom_in")
    assert memory.check_zoom_density(5.0) is True   # 2 zooms in 10s is too dense!
    
    logger.info("✅ Production Memory Gates tests passed successfully.")

async def test_full_operating_system_pipeline():
    logger.info("🧪 Testing Full Cinematic Operating System Pipeline...")
    
    events_collected = []
    def log_event(event):
        events_collected.append(event)
        
    token = event_bus.set_event_callback(log_event)
    
    # Define request input state
    initial_state = {
        "file_id": "test_narrative_video",
        "user_message": "добавь чилловую фоновую музыку и сделай приближение камеры на слове шок",
        "transcript_text": "[0.0-3.0] Внимание! [3.0-6.0] Это полный шок и взрыв! [6.0-10.0] Мы увеличили эффективность монтажа.",
        "active_edits": [],
        "is_evaluation": False
    }
    
    from app.services.mcp_client import mcp_client
    
    try:
        # Start the local MCP Client
        await mcp_client.start()
        
        # Run the re-architected single-node graph orchestrator!
        final_state = await editor_graph.ainvoke(initial_state)
        
        # Print LLM responses for debugging
        print("\n=== FINAL STATE MESSAGES ===")
        for m in final_state.get("messages", []):
            content_str = m.content if hasattr(m, 'content') else str(m)
            print(f"[{type(m).__name__}]: {content_str[:200]}...")
        print("============================\n")

        # Also write to debug file in UTF-8
        with open("uploads/debug_test_agent.txt", "w", encoding="utf-8") as f:
            for m in final_state.get("messages", []):
                content_str = m.content if hasattr(m, 'content') else str(m)
                f.write(f"[{type(m).__name__}]: {content_str}\n")

        # Verify result contains the modified timeline edits
        assert "active_edits" in final_state
        edits = final_state["active_edits"]
        assert len(edits) > 0, "Pipeline should have outputted timeline edits"
        
        # Verify BGM select_bgm tool triggered
        bgm_exists = any(e.get("action") == "add_asset" and e.get("start") == 0.0 for e in edits)
        assert bgm_exists is True, "BGM choice should be set on timeline"
        
        # Verify camera_zoom tool triggered
        zoom_exists = any(e.get("action") == "camera_zoom" for e in edits)
        assert zoom_exists is True, "Camera zoom highlight should be set on timeline"
        
        # Check event bus captured reasoning steps and tool completion signals
        assert len(events_collected) > 0
        reasoning_steps = [ev for ev in events_collected if ev.get("type") == "reasoning_event"]
        assert len(reasoning_steps) > 0, "Should stream unified reasoning logs"
        
        logger.info(f"🎤 Streamed Checklist Logs: {[r.get('step') for r in reasoning_steps]}")
        logger.info("✅ Full Cinematic Operating System Pipeline tests passed successfully.")
        
    finally:
        await mcp_client.stop()
        event_bus.reset_event_callback(token)

if __name__ == "__main__":
    test_timeline_state()
    test_production_memory_gates()
    asyncio.run(test_full_operating_system_pipeline())
