import asyncio
from app.services.mcp_client import mcp_client
from app.workflows.tool_registry import get_mcp_tools

async def main():
    await mcp_client.start()
    tools = get_mcp_tools()
    print("=== DISCOVERED MCP TOOLS ===")
    for name, data in tools.items():
        print(f"- {name}: {data['description']}")
    print("============================")
    await mcp_client.stop()

if __name__ == "__main__":
    asyncio.run(main())
