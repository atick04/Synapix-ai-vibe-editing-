"""
Tool Executor Engine — High-performance execution engine that runs editing tools
directly on the Timeline State, bypassing the slow MCP client subprocess bridging layer.
Integrates a Tool Budget System to maintain visual rhythm and prevent over-saturation.
"""

from typing import Dict, Any, List
import logging
from app.workflows.timeline_state import TimelineState
from app.workflows.production_memory import ProductionMemory
from app.workflows import event_bus
from app.workflows.timeline_metrics import TimelineMetrics

logger = logging.getLogger(__name__)

# Hard budget thresholds per video segment to enforce elite retention standards
MAX_BUDGETS = {
    "create_zoom": 6,
    "add_broll": 8,
    "create_scene": 5,
}

METRIC_MAP = {
    "create_zoom": "zooms_count",
    "add_broll": "brolls_count",
    "create_scene": "graphics_count",
}

class ToolExecutor:
    def __init__(self, timeline: TimelineState, memory: ProductionMemory):
        self.timeline = timeline
        self.memory = memory

    async def execute_tool(self, name: str, arguments: Dict[str, Any]) -> str:
        """
        Executes an editing tool directly in python, enforcing visual budgets
        and bypassing MCP JSON-RPC subprocess layers.
        """
        from app.workflows.tool_registry import _LOCAL_RUNNERS
        
        if name not in _LOCAL_RUNNERS:
            err_msg = f"Unknown editing tool: '{name}'"
            logger.error(err_msg)
            event_bus.emit("retention_warning", {"message": err_msg})
            return err_msg

        # 1. Enforce Tool Budget System constraints
        session_state = self.memory.export_session_state() or {}
        duration = session_state.get("duration", 10.0)
        metrics = TimelineMetrics.calculate(self.timeline.get_serialized_edits(), duration)
        
        if name in MAX_BUDGETS:
            limit = MAX_BUDGETS[name]
            metric_field = METRIC_MAP.get(name)
            if metric_field:
                current_val = metrics.get(metric_field, 0)
                if current_val >= limit:
                    warn_msg = f"⚠️ Превышен бюджет инструмента '{name}' ({current_val}/{limit}). Пропуск для удержания темпа."
                    logger.warning(warn_msg)
                    event_bus.emit("retention_warning", {"message": warn_msg})
                    return warn_msg

        # 2. Run Direct Local Tool Call
        event_bus.emit("tool_started", {"tool": name, "message": f"Запуск: {name}..."})
        logger.info(f"⚡ Tool Executor: Executing tool '{name}' locally...")

        try:
            runner_meta = _LOCAL_RUNNERS[name]
            schema = runner_meta["schema"]
            runner = runner_meta["runner"]

            # Validate schema
            validated_args = schema(**arguments).model_dump()
            
            # Execute local runner directly
            result = runner(self.timeline, self.memory, validated_args)
            logger.info(f"✅ Tool Executor: Completed local execution for '{name}' -> '{result}'")
            
            event_bus.emit("tool_completed", {"tool": name, "message": result})
            return result

        except Exception as e:
            err_msg = f"Ошибка локального выполнения инструмента '{name}': {str(e)}"
            logger.exception(err_msg)
            event_bus.emit("retention_warning", {"message": err_msg})
            return err_msg

    async def execute_batch(self, tool_calls: List[Dict[str, Any]]) -> List[str]:
        """Execute a sequential queue of tool calls locally."""
        results = []
        for call in tool_calls:
            name = call.get("name")
            args = call.get("arguments", {}) or {}
            res = await self.execute_tool(name, args)
            results.append(res)
        return results
