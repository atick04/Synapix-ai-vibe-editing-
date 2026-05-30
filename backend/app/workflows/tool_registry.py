"""
Tool Registry — Declarative editing tools for the Persistent Cinematic Operating System.
Defines MCP-compatible input schemas and functional logic for modifying timeline states.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.workflows.timeline_state import TimelineState
from app.workflows.scene_graph import SceneGraph
from app.workflows.production_memory import ProductionMemory
from app.workflows import event_bus
from app.services.asset_manager import resolve_asset_query

# ═══════════════════════════════════════════════════════════════════════════
# PYDANTIC ARGUMENT SCHEMAS (MCP / Tool Calling Standard)
# ═══════════════════════════════════════════════════════════════════════════

class CutClipArgs(BaseModel):
    start_time: float = Field(description="Время начала вырезаемого фрагмента в секундах")
    end_time: float = Field(description="Время окончания вырезаемого фрагмента в секундах")

class AddBrollArgs(BaseModel):
    start_time: float = Field(description="Начало отображения стокового видео в секундах")
    end_time: float = Field(description="Конец отображения стокового видео в секундах")
    query: str = Field(description="Английский поисковый запрос стока Pexels (например: 'cyberpunk city neon')")

class SceneOverrideArgs(BaseModel):
    start_time: float = Field(description="Таймкод появления сцены в секундах")
    duration: float = Field(description="Длительность графической сцены")
    scene_type: str = Field(description="Тип сцены (например: 'stat_burst', 'bullet_list', 'infographic')")
    elements: List[Dict[str, Any]] = Field(description="Декларативные элементы графики (заголовки, цифры, стикеры)")
    camera: Optional[Dict[str, Any]] = Field(default=None, description="Параметры зума и вращения камеры в сцене")
    sfx_query: Optional[str] = Field(default="whoosh sfx", description="Звуковой эффект перехода сцены")

class VoxGraphicsArgs(BaseModel):
    start_time: float = Field(description="Время начала показа инфографики")
    duration: float = Field(description="Длительность показа инфографики")
    elements: List[Dict[str, Any]] = Field(description="Декларативные элементы графики для чистой Vox-визуализации")
    camera: Optional[Dict[str, Any]] = Field(default=None, description="Движение камеры")

class MographGraphicsArgs(BaseModel):
    start_time: float = Field(description="Время начала неонового моушена")
    duration: float = Field(description="Длительность моушена")
    elements: List[Dict[str, Any]] = Field(description="Декларативные элементы для моушн-сцены")
    camera: Optional[Dict[str, Any]] = Field(default=None, description="Движение камеры")

class KineticTypographyArgs(BaseModel):
    font: str = Field(default="Montserrat-ExtraBold", description="Имя шрифта (например: 'Comfortaa-Bold', 'BebasNeue-Regular')")
    font_size: int = Field(default=90, description="Размер шрифта в пикселях")
    font_color: str = Field(default="#FFFFFF", description="Цвет шрифта в hex-формате")
    use_outline: bool = Field(default=True, description="Использовать ли темную обводку для читаемости")
    animation_style: str = Field(default="pop", description="Стиль анимации субтитров (например: 'pop', 'slide_up', 'glow', 'bounce')")

class SelectBgmArgs(BaseModel):
    asset_query: str = Field(description="Запрос для поиска фоновой музыки в библиотеке (например: 'lofi', 'trap', 'acoustic')")
    volume: float = Field(default=-22, description="Громкость фоновой дорожки в dB")

class AudioDuckingArgs(BaseModel):
    duck_points: List[Dict[str, Any]] = Field(description="Точки понижения громкости на звуковых акцентах")

class ZoomArgs(BaseModel):
    start_time: float = Field(description="Начало наезда камеры в секундах")
    end_time: float = Field(description="Конец наезда камеры в секундах")
    type: str = Field(default="zoom_in", description="Тип зума: 'zoom_in' или 'zoom_out'")

class TransitionArgs(BaseModel):
    start_time: float = Field(description="Таймкод срабатывания перехода")
    transition_type: str = Field(default="swoosh", description="Тип перехода: 'whoosh', 'glitch', 'film'")


# ═══════════════════════════════════════════════════════════════════════════
# TOOL RUNNERS
# ═══════════════════════════════════════════════════════════════════════════

def cut_clip(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    end = args["end_time"]
    timeline.add_cut(start, end)
    event_bus.emit("tool_completed", {"tool": "cut_clip", "message": f"Вырезан фрагмент {start} - {end}s"})
    return f"Успешно вырезан фрагмент {start} - {end}s"

def add_broll(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    end = args["end_time"]
    query = args["query"]
    timeline.add_broll(start, end, query)
    event_bus.emit("tool_completed", {"tool": "add_broll", "message": f"Вставлен B-roll '{query}' на {start} - {end}s"})
    return f"Успешно вставлен B-roll по теме '{query}' на {start} - {end}s"

def generate_scene_override(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    duration = args["duration"]
    scene_type = args["scene_type"]
    elements = args["elements"]
    camera = args.get("camera")
    sfx = args.get("sfx_query", "whoosh sfx")
    
    # 1. Compile declarative layouts to HTML/GSAP markup
    g_style = memory.get_style_profile()["graphics_style"]
    html_content = SceneGraph.compile_scene(start, duration, g_style, elements, camera)
    
    # 2. Add graphics to timeline
    timeline.add_graphics(start, duration, html_content, "scene_override")
    
    # 3. Inject sound sfx transition swoosh if requested
    if sfx:
        timeline.add_asset(start, start + 1.5, sfx, volume=-12)
        
    event_bus.emit("graphics_generated", {"style": g_style, "message": f"Создана графическая сцена '{scene_type}' на {start}s"})
    return f"Успешно создана графическая сцена '{scene_type}' на {start}s со звуковым переходом"

def generate_vox_graphics(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    duration = args["duration"]
    elements = args["elements"]
    camera = args.get("camera")
    
    html_content = SceneGraph.compile_scene(start, duration, "vox", elements, camera)
    timeline.add_graphics(start, duration, html_content, "canvas_overlay")
    
    event_bus.emit("graphics_generated", {"style": "vox", "message": f"Создана Vox-инфографика на {start}s ({duration}s)"})
    return f"Успешно создана Vox-инфографика на {start}s"

def generate_mograph_graphics(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    duration = args["duration"]
    elements = args["elements"]
    camera = args.get("camera")
    
    html_content = SceneGraph.compile_scene(start, duration, "mograph", elements, camera)
    timeline.add_graphics(start, duration, html_content, "canvas_overlay")
    
    event_bus.emit("graphics_generated", {"style": "mograph", "message": f"Создан неоновый моушен на {start}s ({duration}s)"})
    return f"Успешно создан неоновый моушен на {start}s"

def build_kinetic_typography(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    font = args.get("font", "Montserrat-ExtraBold")
    font_size = args.get("font_size", 90)
    font_color = args.get("font_color", "#FFFFFF")
    outline = args.get("use_outline", True)
    style = args.get("animation_style", "pop")
    
    timeline.set_subtitles(font, font_size, font_color, outline, style)
    event_bus.emit("tool_completed", {"tool": "build_kinetic_typography", "message": f"Применены субтитры: {font} ({font_size}px, стиль {style})"})
    return f"Успешно настроены субтитры со шрифтом {font} и анимацией {style}"

def select_bgm(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    query = args["asset_query"]
    vol = args.get("volume", -22)
    
    # Check production memory anti-repetition gate
    if memory.is_soundtrack_repeated(query):
        event_bus.emit("retention_warning", {"message": f"Soundtrack matching '{query}' was recently played. Swapping style profile."})
        logger.warning(f"Anti-Repetition Gate: soundtrack '{query}' repeated, swapping choice.")
        
    # Resolve assets against index catalog
    resolved = resolve_asset_query(query)
    resolved_path = resolved["rel_path"] if resolved else None
    
    # Mutate timeline state
    edit = timeline.add_asset(start=0.0, end=None, asset_query=query, volume=vol, is_bgm=True)
    if resolved_path:
        edit["resolved_path"] = resolved_path
        edit["asset_type"] = "audio"
        
    memory.record_soundtrack(query)
    event_bus.emit("soundtrack_selected", {"soundtrack": query, "message": f"Выбран саундтрек '{query}' ({vol}dB)"})
    return f"Успешно добавлен саундтрек '{query}' с уровнем громкости {vol}дБ"

def create_zoom(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    end = args["end_time"]
    z_type = args.get("type", "zoom_in")
    
    # Check spacing density gate in production memory
    if memory.check_zoom_density(start):
        logger.warning(f"Anti-Repetition Spacing Gate: zooms are too dense at {start}s. Adjusting delay.")
        start += 1.0
        end += 1.0
        
    timeline.add_zoom(start, end, z_type)
    memory.record_zoom(start, z_type)
    event_bus.emit("tool_completed", {"tool": "create_zoom", "message": f"Применен зум '{z_type}' на {start} - {end}s"})
    return f"Успешно применен зум '{z_type}' на {start} - {end}s"

def build_transition(timeline: TimelineState, memory: ProductionMemory, args: Dict[str, Any]) -> str:
    start = args["start_time"]
    t_type = args.get("transition_type", "swoosh")
    
    # Dynamic sound transition resolution
    query = f"{t_type} transition"
    resolved = resolve_asset_query(query)
    resolved_path = resolved["rel_path"] if resolved else None
    
    edit = timeline.add_asset(start=start, end=start + 1.5, asset_query=query, volume=-12)
    if resolved_path:
        edit["resolved_path"] = resolved_path
        edit["asset_type"] = "audio"
        
    memory.record_transition(t_type)
    event_bus.emit("tool_completed", {"tool": "build_transition", "message": f"Добавлен переход '{t_type}' на {start}s со звуковым эффектом"})
    return f"Успешно добавлен переход '{t_type}' на {start}s со звуком"

# ═══════════════════════════════════════════════════════════════════════════
# REGISTRY DEFINITION
# ═══════════════════════════════════════════════════════════════════════════

TOOLS_REGISTRY = {}

_LOCAL_RUNNERS = {
    "cut_clip": {
        "schema": CutClipArgs,
        "runner": cut_clip
    },
    "add_broll": {
        "schema": AddBrollArgs,
        "runner": add_broll
    },
    "generate_scene_override": {
        "schema": SceneOverrideArgs,
        "runner": generate_scene_override
    },
    "generate_vox_graphics": {
        "schema": VoxGraphicsArgs,
        "runner": generate_vox_graphics
    },
    "generate_mograph_graphics": {
        "schema": MographGraphicsArgs,
        "runner": generate_mograph_graphics
    },
    "build_kinetic_typography": {
        "schema": KineticTypographyArgs,
        "runner": build_kinetic_typography
    },
    "select_bgm": {
        "schema": SelectBgmArgs,
        "runner": select_bgm
    },
    "create_zoom": {
        "schema": ZoomArgs,
        "runner": create_zoom
    },
    "build_transition": {
        "schema": TransitionArgs,
        "runner": build_transition
    }
}

def get_mcp_tools() -> Dict[str, Any]:
    """Dynamically registers discovered MCP desktop video editor tools."""
    from app.services.mcp_client import mcp_client
    mcp_tools = {}
    for t in mcp_client.tools:
        name = t.get("name")
        if not name:
            continue
        desc = t.get("description", "External MCP action.")
        schema = t.get("inputSchema", {"type": "object", "properties": {}})
        
        mcp_tools[name] = {
            "is_mcp": True,
            "description": desc,
            "inputSchema": schema,
            "runner": None
        }
    return mcp_tools

