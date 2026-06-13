import re

# Dictionary mapping raw/technical tool calls and events to humanized premium titles
TRANSLATIONS = {
    # Tool Registry MCP tools
    "build_kinetic_typography": "Building cinematic subtitles",
    "select_bgm": "Selecting cinematic soundtrack",
    "create_zoom": "Adding dynamic camera zooms",
    "cut_clip": "Trimming unnecessary footage",
    "add_broll": "Injecting contextual stock footage (B-roll)",
    "create_scene": "Designing semantic infographic scenes",
    "build_transition": "Adding stylized scene transitions",
    "modify_clip": "Modifying specific focused segment on the timeline",
    
    # Common technical status logs
    "prepare_context": "Analyzing source media and script context",
    "cinematic_reasoning_agent": "Decomposing prompt & mapping creative intent",
    "execute_tools": "Executing timeline modification pipeline",
    
    # Internal agent/engine step descriptions
    "🔍 Анализ сценария и темпа речи спикера": "Analyzing script and speaker's narrative pacing",
    "🧠 Оценка результатов выполнения инструментов и финализация": "Evaluating timeline modifications and final compilation",
    "🎬 Синематографический Разум: Пошаговый разбор запроса...": "Decomposing prompt creative intent",
    "Синхронизация дорожек таймлайна и EDL-монтажа выполнена": "Synchronizing track timeline and EDL edits",
}

def humanize_step(step: str) -> str:
    """
    Translates a raw technical or tool-executor log line into a premium, humanized,
    cinematic thought process step.
    """
    if not step:
        return step
        
    step_clean = step.strip()
    
    # 1. Exact match translation
    if step_clean in TRANSLATIONS:
        return TRANSLATIONS[step_clean]
        
    # 2. Match Calling MCP tool '...' patterns
    mcp_call_match = re.search(r"Вызов MCP инструмента '([^']+)'(?:\.\.\.)?", step_clean)
    if mcp_call_match:
        tool_name = mcp_call_match.group(1)
        return TRANSLATIONS.get(tool_name, f"Running creative pipeline for {tool_name}")
        
    # 3. Match tool logs like 'select_bgm()'
    if "select_bgm()" in step_clean:
        return TRANSLATIONS["select_bgm"]
    if "build_kinetic_typography()" in step_clean or "build_kinetic_typography" in step_clean.lower():
        return TRANSLATIONS["build_kinetic_typography"]
        
    # 4. Handle resolved tool results
    if "Применены субтитры:" in step_clean:
        return "Kinematic subtitles applied successfully"
    if "Выбран саундтрек" in step_clean:
        match = re.search(r"Выбран саундтрек '([^']+)'", step_clean)
        track = match.group(1) if match else "lofi calm"
        return f"Scoring timeline with soundtrack '{track}'"
    if "Применен зум" in step_clean:
        return "Camera zooms generated and aligned"
    if "Переход для сцены" in step_clean:
        return "Transition assets fetched and loaded"
    if "Звуковой эффект" in step_clean:
        return "Sound effects resolved and mixed"
    if "B-roll по теме" in step_clean:
        return "Injecting contextual stock footage (B-roll)"
        
    # Strip emojis and technical prefixes if not translated
    step_clean = re.sub(r"^[🎬🔍🧠📁⚠️🔊📹⚙️⚒️🛠️✓✗]\s*", "", step_clean)
    step_clean = re.sub(r"^\[(?:Инструмент|Критик)\]\s*", "", step_clean)
    
    return step_clean
