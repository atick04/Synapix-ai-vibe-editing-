import asyncio
import json
import httpx

async def test():
    req = {
        "file_id": "8c59f0f9-a868-45e0-82ea-297eb066928e", # Need to use a real ID from the app if possible, or just a dummy
        "message": "добавь моушн графику где говорят про 10 секунд",
        "active_edits": []
    }
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", "http://127.0.0.1:8000/api/chat", json=req) as response:
            async for line in response.aiter_lines():
                if line:
                    print(line)
                    
asyncio.run(test())
