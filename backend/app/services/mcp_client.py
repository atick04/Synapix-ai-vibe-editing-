import sys
import os
import json
import logging
import asyncio
import subprocess
import threading
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

class MCPManager:
    """Simplified MCP Client connecting to the single local stdio MCP server."""
    def __init__(self):
        # Determine Python command to launch local mcp_server.py
        # Check if venv python exists relative to current backend cwd
        venv_python = os.path.join("venv", "Scripts", "python.exe")
        if os.path.exists(venv_python):
            self.args = [venv_python, "-m", "app.services.mcp_server"]
        else:
            # Fallback to sys.executable to run inside the same python environment
            self.args = [sys.executable, "-m", "app.services.mcp_server"]

        self.command = " ".join(self.args)
        self.name = "vibedit-local-mcp-server"
        self.status = "offline"  # online, connecting, offline, error
        self.error_message: Optional[str] = None
        self.tools: List[Dict[str, Any]] = []

        self._process: Optional[asyncio.subprocess.Process] = None
        self._reader_task: Optional[asyncio.Task] = None
        self._stderr_task: Optional[asyncio.Task] = None
        self._pending_futures: Dict[int, asyncio.Future] = {}
        self._next_id = 1
        self._lock = asyncio.Lock()

        self._is_sync = False
        self._sync_process: Optional[subprocess.Popen] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._stderr_thread: Optional[threading.Thread] = None
        self._last_stderr = ""

    async def start(self):
        """Spawns the local stdio MCP server subprocess and executes the handshake."""
        async with self._lock:
            if self.status in ("connected", "connecting"):
                return

            self.status = "connecting"
            self.error_message = None
            self.tools = []
            self._last_stderr = ""
            logger.info(f"🔌 [Local MCP Server] Spawning subprocess: {self.command}")

            try:
                # Spawn process directly without shell wrapper to avoid process orphaned hangs on Windows
                self._process = await asyncio.create_subprocess_exec(
                    *self.args,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                self._is_sync = False
                self._reader_task = asyncio.create_task(self._read_loop())
                self._stderr_task = asyncio.create_task(self._read_stderr_loop())
            except NotImplementedError:
                # Fallback to threaded Popen for SelectorEventLoop on Windows
                logger.info("🔄 [Local MCP Server] SelectorEventLoop detected on Windows. Falling back to threaded Popen...")
                try:
                    self._sync_process = subprocess.Popen(
                        self.args,
                        stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                    )
                    self._is_sync = True
                    self._reader_thread = threading.Thread(
                        target=self._sync_read_loop,
                        args=(asyncio.get_event_loop(),),
                        daemon=True
                    )
                    self._reader_thread.start()

                    self._stderr_thread = threading.Thread(
                        target=self._sync_stderr_read_loop,
                        daemon=True
                    )
                    self._stderr_thread.start()
                except Exception as ex:
                    self.status = "error"
                    self.error_message = f"Sync Popen fallback failed: {str(ex)}"
                    logger.error(f"❌ [Local MCP Server] Sync fallback failed: {ex}")
                    return
            except Exception as e:
                import traceback
                self.status = "error"
                self.error_message = f"Failed to spawn subprocess: {type(e).__name__} - {str(e)}"
                logger.error(f"❌ [Local MCP Server] Spawn failed: {type(e).__name__} - {e}\n{traceback.format_exc()}")
                return

            # 1. Handshake: initialize
            logger.info("🔌 [Local MCP Server] Sending initialize request...")
            init_id = self._get_next_id()
            fut = asyncio.get_event_loop().create_future()
            self._pending_futures[init_id] = fut

            init_req = {
                "jsonrpc": "2.0",
                "id": init_id,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "vibedit-ai-client-local",
                        "version": "1.0.0"
                    }
                }
            }

            try:
                await self._send_raw(init_req)
                init_res = await asyncio.wait_for(fut, timeout=10.0)
                logger.info("🔌 [Local MCP Server] Received initialize response.")
            except Exception as e:
                self.status = "error"
                await asyncio.sleep(0.5)  # Let reader thread capture trailing stderr
                stderr_msg = self._last_stderr.strip()
                if stderr_msg:
                    self.error_message = f"Handshake failed: {stderr_msg}"
                else:
                    self.error_message = f"Handshake failed: {type(e).__name__} - {str(e)}"
                logger.error(f"❌ [Local MCP Server] Handshake failed: {self.error_message}")
                await self.stop(silent=True)
                return

            # 2. Handshake: initialized notification
            init_notif = {
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            }
            try:
                await self._send_raw(init_notif)
                self.status = "connected"
                logger.info("🔌 [Local MCP Server] Connected successfully.")
            except Exception as e:
                self.status = "error"
                self.error_message = f"Failed sending initialized notification: {str(e)}"
                logger.error(f"❌ [Local MCP Server] Initialized notification failed: {e}")
                await self.stop(silent=True)
                return

            # 3. Discovery: query list of tools
            await self.discover_tools()

    async def discover_tools(self):
        """Fetches all tools exposed by this MCP server."""
        if self.status != "connected":
            return

        logger.info("🔌 [Local MCP Server] Querying tools list...")
        list_id = self._get_next_id()
        fut = asyncio.get_event_loop().create_future()
        self._pending_futures[list_id] = fut

        list_req = {
            "jsonrpc": "2.0",
            "id": list_id,
            "method": "tools/list"
        }

        try:
            await self._send_raw(list_req)
            res = await asyncio.wait_for(fut, timeout=10.0)
            result = res.get("result", {})
            self.tools = result.get("tools", [])
            logger.info(f"🔌 [Local MCP Server] Discovered {len(self.tools)} tools.")
        except Exception as e:
            self.status = "error"
            self.error_message = f"Failed listing tools: {str(e)}"
            logger.error(f"❌ [Local MCP Server] Failed to list tools: {e}")

    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Calls an MCP tool on this server and returns the response result."""
        if self.status != "connected":
            raise RuntimeError(f"Local MCP Server is not connected (current status: {self.status}). Error: {self.error_message}")

        call_id = self._get_next_id()
        fut = asyncio.get_event_loop().create_future()
        self._pending_futures[call_id] = fut

        call_req = {
            "jsonrpc": "2.0",
            "id": call_id,
            "method": "tools/call",
            "params": {
                "name": name,
                "arguments": arguments
            }
        }

        logger.info(f"🔌 [Local MCP Server] Calling tool '{name}' with ID {call_id}...")
        await self._send_raw(call_req)

        try:
            res = await asyncio.wait_for(fut, timeout=30.0)
            if "error" in res:
                raise RuntimeError(f"MCP tool error: {res['error']}")
            return res.get("result", {})
        except asyncio.TimeoutError:
            logger.error(f"⏰ [Local MCP Server] Timeout calling tool '{name}'")
            raise TimeoutError(f"Timeout calling tool '{name}' on local MCP server")
        finally:
            self._pending_futures.pop(call_id, None)

    async def stop(self, silent: bool = False):
        """Terminates the local MCP server subprocess cleanly."""
        self.status = "offline"
        if self._reader_task:
            self._reader_task.cancel()
            self._reader_task = None
        if self._stderr_task:
            self._stderr_task.cancel()
            self._stderr_task = None

        if self._is_sync:
            if self._sync_process:
                if not silent:
                    logger.info("🔌 [Local MCP Server] Terminating sync subprocess...")
                try:
                    self._sync_process.terminate()
                    self._sync_process.wait(timeout=2.0)
                except Exception:
                    try:
                        self._sync_process.kill()
                    except Exception:
                        pass
                self._sync_process = None
            self._is_sync = False
        else:
            if self._process:
                if not silent:
                    logger.info("🔌 [Local MCP Server] Terminating subprocess...")
                try:
                    self._process.terminate()
                    await self._process.wait()
                except Exception:
                    pass
                self._process = None

        self._pending_futures.clear()
        if not silent:
            logger.info("🔌 [Local MCP Server] Shut down successfully.")

    def _get_next_id(self) -> int:
        self._next_id += 1
        return self._next_id

    async def _send_raw(self, msg: Dict[str, Any]):
        payload = (json.dumps(msg) + "\n").encode('utf-8')
        if self._is_sync:
            if not self._sync_process or not self._sync_process.stdin:
                raise RuntimeError("Sync Process stdin is not open.")
            def write_sync():
                self._sync_process.stdin.write(payload)
                self._sync_process.stdin.flush()
            await asyncio.to_thread(write_sync)
        else:
            if not self._process or not self._process.stdin:
                raise RuntimeError("Process stdin is not open.")
            self._process.stdin.write(payload)
            await self._process.stdin.drain()

    async def _read_loop(self):
        try:
            while self._process and self._process.stdout:
                line = await self._process.stdout.readline()
                if not line:
                    break
                line_str = line.decode('utf-8', errors='replace').strip()
                if not line_str:
                    continue
                await self._handle_incoming_line(line_str)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in [Local MCP Server] reader loop: {e}")

    async def _read_stderr_loop(self):
        try:
            accumulated = []
            while self._process and self._process.stderr:
                line = await self._process.stderr.readline()
                if not line:
                    break
                line_str = line.decode('utf-8', errors='replace').strip()
                if line_str:
                    accumulated.append(line_str)
                    if len(accumulated) > 10:
                        accumulated.pop(0)
                    self._last_stderr = "\n".join(accumulated)
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    def _sync_read_loop(self, loop):
        try:
            while self._sync_process and self._sync_process.stdout:
                line = self._sync_process.stdout.readline()
                if not line:
                    break
                line_str = line.decode('utf-8', errors='replace').strip()
                if not line_str:
                    continue
                asyncio.run_coroutine_threadsafe(self._handle_incoming_line(line_str), loop)
        except Exception as e:
            logger.error(f"Error in [Local MCP Server] sync reader thread: {e}")

    def _sync_stderr_read_loop(self):
        try:
            accumulated = []
            while self._sync_process and self._sync_process.stderr:
                line = self._sync_process.stderr.readline()
                if not line:
                    break
                line_str = line.decode('utf-8', errors='replace').strip()
                if line_str:
                    accumulated.append(line_str)
                    if len(accumulated) > 10:
                        accumulated.pop(0)
                    self._last_stderr = "\n".join(accumulated)
        except Exception:
            pass

    async def _handle_incoming_line(self, line_str: str):
        try:
            msg = json.loads(line_str)
            if "id" in msg:
                msg_id = msg["id"]
                if msg_id in self._pending_futures:
                    self._pending_futures[msg_id].set_result(msg)
        except Exception:
            logger.debug(f"[Local MCP Server output] {line_str[:200]}")

mcp_client = MCPManager()
