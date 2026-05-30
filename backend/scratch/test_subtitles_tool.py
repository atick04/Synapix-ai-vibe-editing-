import asyncio
import json
import sys
import os

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv()

from app.workflows.graph import editor_graph
from app.services.mcp_client import mcp_client

async def run_test(user_message: str):
    print(f"\n========================================\nTESTING QUERY: '{user_message}'\n========================================")
    initial_state = {
        "file_id": "test_subtitles_video",
        "user_message": user_message,
        "transcript_text": "[0.0-3.0] Привет всем! [3.0-6.0] Сегодня мы тестируем новый инструмент. [6.0-10.0] Это полный восторг!",
        "active_edits": [],
        "is_evaluation": False,
        "aspect_ratio": "vertical",
        "width": 1080,
        "height": 1920
    }
    
    await mcp_client.start()
    try:
        final_state = await editor_graph.ainvoke(initial_state)
        print("\n=== AGENT RESPONSE ===")
        for m in final_state.get("messages", []):
            content_str = m.content if hasattr(m, 'content') else str(m)
            print(content_str)
        
        print("\n=== TIMELINE EDITS ===")
        print(json.dumps(final_state.get("active_edits", []), indent=2, ensure_ascii=False))
    finally:
        await mcp_client.stop()

if __name__ == "__main__":
    query = "уменьшить субтитры"
    if len(sys.argv) > 1:
        query = sys.argv[1]
    asyncio.run(run_test(query))
