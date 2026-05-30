"""
Reasoning Manager — Manages the lifecycle and state of the 4 unified premium stages:
1. ANALYSIS: Evaluating media, transcript, pacing, and styling profiles.
2. PLANNING: Structuring production plan and editing workflow steps.
3. EXECUTION: Applying high-performance visual edits directly to timeline tracks.
4. FINALIZATION: Checking retention pacing, graphics limits, and quality gates.
"""

from typing import List, Dict, Any, Optional
from app.workflows import event_bus

class ReasoningManager:
    # High-level clean stage descriptions
    STAGE_ANALYSIS = "ANALYSIS: Анализ запроса, исходного видео и темпа речи спикера"
    STAGE_PLANNING = "PLANNING: Разработка пошагового сценария и плана монтажа"
    STAGE_EXECUTION = "EXECUTION: Последовательное применение монтажных инструментов на таймлайне"
    STAGE_FINALIZATION = "FINALIZATION: Проверка плотности графики, темпа смены кадров и аудит удержания внимания"

    @classmethod
    def start_analysis(cls, details: str = "Инициализация и парсинг аудио/видео контекста..."):
        event_bus.emit("reasoning_update", {
            "step": cls.STAGE_ANALYSIS,
            "status": "running",
            "progress": 0.1,
            "agent": "Cinematic Brain",
            "details": details
        })

    @classmethod
    def complete_analysis(cls, details: str = "Анализ исходного контекста успешно завершен."):
        event_bus.emit("reasoning_update", {
            "step": cls.STAGE_ANALYSIS,
            "status": "done",
            "progress": 0.25,
            "agent": "Cinematic Brain",
            "details": details
        })

    @classmethod
    def start_planning(cls, details: str = "Сборка пошагового плана монтажа и удержания внимания..."):
        event_bus.emit("reasoning_update", {
            "step": cls.STAGE_PLANNING,
            "status": "running",
            "progress": 0.35,
            "agent": "Cinematic Brain",
            "details": details
        })

    @classmethod
    def complete_planning(cls, plan: List[str], details: Optional[str] = None):
        plan_bullet = "\n".join([f"- {item}" for item in plan])
        plan_details = f"Составлен сценарный план монтажа:\n{plan_bullet}"
        if details:
            plan_details += f"\n\n{details}"
            
        event_bus.emit("reasoning_update", {
            "step": cls.STAGE_PLANNING,
            "status": "done",
            "progress": 0.5,
            "agent": "Cinematic Brain",
            "details": plan_details
        })

    @classmethod
    def start_execution(cls, total_tools: int, details: str = "Инициализация правок на таймлайне..."):
        event_bus.emit("reasoning_update", {
            "step": cls.STAGE_EXECUTION,
            "status": "running",
            "progress": 0.6,
            "agent": "Tool Executor",
            "details": details
        })

    @classmethod
    def update_execution(cls, current_tool_name: str, index: int, total_tools: int, details: str = ""):
        progress = 0.6 + ((index / max(1, total_tools)) * 0.3)
        event_bus.emit("reasoning_update", {
            "step": cls.STAGE_EXECUTION,
            "status": "running",
            "progress": round(progress, 2),
            "agent": "Tool Executor",
            "details": f"Применение [{index + 1}/{total_tools}]: {current_tool_name}...\n{details}"
        })

    @classmethod
    def complete_execution(cls, details: str = "Все запланированные монтажные инструменты успешно выполнены."):
        event_bus.emit("reasoning_update", {
            "step": cls.STAGE_EXECUTION,
            "status": "done",
            "progress": 0.9,
            "agent": "Tool Executor",
            "details": details
        })

    @classmethod
    def start_finalization(cls, details: str = "Запуск аудита удержания внимания (Retention Critic)..."):
        event_bus.emit("reasoning_update", {
            "step": cls.STAGE_FINALIZATION,
            "status": "running",
            "progress": 0.95,
            "agent": "Retention Critic",
            "details": details
        })

    @classmethod
    def complete_finalization(cls, score: int, issues: List[str], suggested_fixes: List[Dict[str, Any]] = None):
        approved_icon = "✓" if score >= 75 else "⚠️"
        summary = f"Аудит удержания внимания завершен ({approved_icon} Оценка: {score}/100).\n\n"
        
        if issues:
            summary += "**Выявленные замечания:**\n" + "\n".join([f"- {i}" for i in issues]) + "\n"
        else:
            summary += "✓ Замечания отсутствуют. Монтажный темп и плотность графики идеальны.\n"
            
        if suggested_fixes:
            summary += "\n**Предложенные авто-корректировки:**\n"
            for fix in suggested_fixes:
                summary += f"- {fix['issue']} -> {fix['recommendation']} ({fix['start']:.1f}с - {fix['end']:.1f}с)\n"
                
        event_bus.emit("reasoning_update", {
            "step": cls.STAGE_FINALIZATION,
            "status": "done",
            "progress": 1.0,
            "agent": "Retention Critic",
            "details": summary
        })
