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
    "add_youtube_broll": 8,
    "create_scene": 5,
}

METRIC_MAP = {
    "create_zoom": "zooms_count",
    "add_broll": "brolls_count",
    "add_youtube_broll": "brolls_count",
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

        # Resolve common alias names the Director might hallucinate
        TOOL_ALIASES = {
            # Music / audio
            "add_soundtrack":       "search_and_add_music",
            "add_music":            "search_and_add_music",
            "add_bgm":              "select_bgm",
            "add_background_music": "search_and_add_music",
            "set_music":            "search_and_add_music",
            "add_sfx":              "search_and_add_music",
            "add_sound":            "search_and_add_music",
            # Graphics / scenes
            "add_graphic":          "create_scene",
            "add_graphics":         "create_scene",
            "add_scene":            "create_scene",
            "add_motion_graphic":   "create_scene",
            "add_overlay":          "create_scene",
            "add_text":             "create_scene",
            "add_card":             "create_scene",
            # Zoom / camera
            "add_zoom":             "create_zoom",
            "zoom_in":              "create_zoom",
            "camera_zoom":          "create_zoom",
            "add_kinetic_zoom":     "create_zoom",
            "kinetic_zoom":         "create_zoom",
            "zoom":                 "create_zoom",
            # B-roll
            "insert_broll":         "add_broll",
            "add_cutaway":          "add_broll",
            # Subtitles
            "add_captions":         "build_kinetic_typography",
            "add_caption":          "build_kinetic_typography",
            "add_subtitle":         "build_kinetic_typography",
            "add_subtitles":        "build_kinetic_typography",
            # Stickers
            "add_emoji":            "search_and_add_sticker",
            "add_sticker":          "search_and_add_sticker",
            # Audio generation
            "generate_sfx":         "generate_audio",
            "generate_music":       "generate_audio",
            # Transitions, rotoscoping & text behind speaker
            "add_transition":           "build_transition",
            "transition":               "build_transition",
            "apply_transitions":        "apply_topic_transitions",
            "topic_transitions":        "apply_topic_transitions",
            "detect_transitions":       "apply_topic_transitions",
            "speaker_masking":          "set_video_background",
            "text_behind_speaker":      "set_video_background",
            "text_behind":              "set_video_background",
            "text_on_background":       "set_video_background",
            "hook_behind_speaker":      "set_video_background",
            "subtitles_behind_speaker": "set_video_background",
            # Motion presets / ReactBits
            "add_preset":               "add_motion_preset",
            "add_motion_preset":        "add_motion_preset",
            "add_reactbits":            "add_motion_preset",
            "add_title":                "add_motion_preset",
            "add_kinetic_title":        "add_motion_preset",
        }

        name = TOOL_ALIASES.get(name, name)

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

            # Smart argument normalization to prevent Pydantic validation crashes
            if isinstance(arguments, dict):
                if name in ("search_and_add_music", "select_bgm"):
                    q = (arguments.get("query") or arguments.get("asset_query") or
                         arguments.get("music_style") or arguments.get("style") or
                         arguments.get("prompt") or "lofi background")
                    arguments["query"] = q
                    arguments["asset_query"] = q

                elif name in ("add_broll", "add_youtube_broll"):
                    q = (arguments.get("query") or arguments.get("prompt") or
                         arguments.get("topic") or arguments.get("text") or
                         arguments.get("keyword") or arguments.get("concept") or "cinema broll")
                    arguments["query"] = q
                    if "start_time" not in arguments and "start" in arguments:
                        arguments["start_time"] = arguments["start"]
                    if "end_time" not in arguments and "end" in arguments:
                        arguments["end_time"] = arguments["end"]

                elif name in ("create_zoom", "zoom"):
                    if "start_time" not in arguments:
                        arguments["start_time"] = arguments.get("start") or arguments.get("timestamp") or 0.0
                    if "end_time" not in arguments:
                        st = float(arguments.get("start_time", 0.0))
                        arguments["end_time"] = arguments.get("end") or (st + 2.0)

                elif name == "create_scene":
                    if "start_time" not in arguments:
                        arguments["start_time"] = arguments.get("start") or arguments.get("timestamp") or 0.0
                    if "duration" not in arguments:
                        st = float(arguments.get("start_time", 0.0))
                        et = arguments.get("end_time") or arguments.get("end")
                        if et is not None:
                            arguments["duration"] = max(1.0, float(et) - st)
                        else:
                            arguments["duration"] = 3.0

                elif name == "build_transition":
                    if "start_time" not in arguments:
                        arguments["start_time"] = arguments.get("start") or arguments.get("timestamp") or 0.0

                elif name == "set_video_background":
                    if "text" not in arguments or not arguments["text"]:
                        arguments["text"] = (
                            arguments.get("phrase") or
                            arguments.get("word") or
                            arguments.get("title") or
                            arguments.get("caption") or
                            arguments.get("hook") or
                            arguments.get("query")
                        )


            # Validate schema
            validated_args = schema(**arguments).model_dump()

            
            # Execute local runner directly (supports sync and async runners)
            import inspect
            if inspect.iscoroutinefunction(runner):
                result = await runner(self.timeline, self.memory, validated_args)
            else:
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
