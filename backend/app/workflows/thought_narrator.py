"""
Thought Narrator — turns raw agent/tool events into short human RU thoughts
for the chat reasoning chain (Claude/AI-SDK style).
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional


# Patterns that should never appear in the user-facing thought chain
_JUNK_PATTERNS = [
    r"skipped auto-cuts",
    r"found \d+ highlights",
    r"cut sequence",
    r"added motion graphics",
    r"scored\s*·",
    r"^done\s*·",
    r"loaded raw video",
    r"analyzed transcript",
    r"prepared style",
    r"tool_calls",
    r"mcp",
    r"ffmpeg",
    r"edl",
    r"retention critic",
    r"оценка:\s*\d+/100",
    r"попытка\s*\d+",
    r"json",
    r"window\.__timelines",
]


def _is_junk(text: str) -> bool:
    low = text.lower().strip()
    if not low or len(low) < 3:
        return True
    for pat in _JUNK_PATTERNS:
        if re.search(pat, low):
            return True
    return False


def _first_line(text: str) -> str:
    if not text:
        return ""
    return text.replace("\r", "").split("\n")[0].strip()


def _strip_noise(text: str) -> str:
    t = text.strip()
    t = re.sub(r"^[🎬🔍🧠📁⚠️🔊📹⚙️⚒️🛠️✓✗🎨📊●▸]\s*", "", t)
    t = re.sub(r"^(GRAPHICS|REASONING|ANALYSIS|PLANNING|EXECUTION|FINALIZATION|LOG)\s*:\s*", "", t, flags=re.I)
    t = re.sub(r"^\[(?:Инструмент|Критик)\]\s*", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _extract_concept(text: str) -> Optional[str]:
    m = re.search(r"[«\"]([^»\"]{3,80})[»\"]", text)
    if m:
        return m.group(1).strip()
    m = re.search(r"«([^»]{3,80})»", text)
    if m:
        return m.group(1).strip()
    return None


def narrate_thought(
    *,
    step: str = "",
    details: str = "",
    message: str = "",
    agent: str = "",
    status: str = "running",
    event_type: str = "",
) -> Optional[Dict[str, Any]]:
    """
    Returns { text, phase, status } for the UI thought chain, or None to hide.
    """
    raw = details or message or step or ""
    raw_l = raw.lower()
    step_l = (step or "").lower()
    combined = f"{step} {raw}".strip()

    # ── Friendly rewrites for known technical cases ──
    if "превышен бюджет" in raw_l or "budget" in raw_l and "create_scene" in raw_l:
        return {
            "text": "Уже много графики на таймлайне — не перегружаю ролик, оставляю самые сильные сцены.",
            "phase": "review",
            "status": "done" if status == "done" else "running",
        }

    if "все запланированные монтажные инструменты" in raw_l:
        return {
            "text": "Основные шаги монтажа выполнены.",
            "phase": "execute",
            "status": "done",
        }

    if _is_junk(combined) and "graphics:" not in step_l and "reasoning:" not in step_l:
        # Still allow a few stage-level cues from step labels
        if "analysis" in step_l or "анализ" in step_l:
            return {"text": "Смотрю исходное видео и ваш запрос…", "phase": "think", "status": status or "running"}
        if "planning" in step_l or "план" in step_l:
            return {"text": "Думаю, что добавить, чтобы ролик стал живее…", "phase": "plan", "status": status or "running"}
        if "finalization" in step_l or "финализ" in step_l or "retention" in raw_l:
            return {"text": "Проверяю, не перегружен ли кадр графикой…", "phase": "review", "status": status or "running"}
        return None

    concept = _extract_concept(raw) or _extract_concept(step or "")

    # Graphics pipeline
    if "graphics" in step_l or "graphics developer" in (agent or "").lower() or "графич" in raw_l:
        if "жду ответ" in raw_l or "llm" in raw_l:
            tip = f"«{concept}»" if concept else "сцену"
            return {
                "text": f"Создаю анимацию для {tip}…",
                "phase": "create",
                "status": status or "running",
            }
        if "разбираю html" in raw_l or "нормализ" in raw_l:
            return {
                "text": "Подгоняю размеры плашки под формат кадра…",
                "phase": "create",
                "status": status or "running",
            }
        if "готово" in raw_l or status == "done":
            tip = f"«{concept}»" if concept else "графическую сцену"
            return {
                "text": f"Готово — добавил {tip} на таймлайн.",
                "phase": "create",
                "status": "done",
            }
        if "fallback" in raw_l:
            return {
                "text": "Сцена сложнее обычного — ставлю аккуратную запасную плашку.",
                "phase": "create",
                "status": status or "running",
            }
        if "full_broll" in raw_l or "полноэкран" in raw_l:
            tip = f"«{concept}»" if concept else "мысль"
            return {
                "text": f"Рисую полноэкранную графику про {tip}…",
                "phase": "create",
                "status": status or "running",
            }
        if "плашк" in raw_l or "overlay" in raw_l:
            tip = f"«{concept}»" if concept else "тезис"
            return {
                "text": f"Рисую стеклянную плашку про {tip}…",
                "phase": "create",
                "status": status or "running",
            }
        tip = f"«{concept}»" if concept else "кадр"
        return {
            "text": f"Генерирую графику для {tip}…",
            "phase": "create",
            "status": status or "running",
        }

    # Visual reasoning
    if "reasoning" in step_l or "зрительн" in raw_l or "visual" in raw_l:
        return {
            "text": "Смотрю, где лицо спикера и куда лучше поставить графику…",
            "phase": "analyze",
            "status": "done" if status == "done" else "running",
        }

    # Tool-friendly lines from executor
    if "создан" in raw_l and "график" in raw_l:
        tip = f"«{concept}»" if concept else "сцену"
        return {"text": f"Добавил графику {tip}.", "phase": "create", "status": "done"}

    if "zoom" in raw_l or "зум" in raw_l:
        return {
            "text": "Добавляю мягкий зум, чтобы акцент попал в нужный момент…",
            "phase": "polish",
            "status": status or "running",
        }

    if "bgm" in raw_l or "саундтрек" in raw_l or "музык" in raw_l or "select_bgm" in raw_l:
        return {
            "text": "Подбираю фоновую музыку под настроение речи…",
            "phase": "audio",
            "status": status or "running",
        }

    if "subtitle" in raw_l or "титр" in raw_l or "subtit" in raw_l or "kinetic" in raw_l:
        return {
            "text": "Настраиваю стиль субтитров под ролик…",
            "phase": "polish",
            "status": status or "running",
        }

    if "переход" in raw_l or "transition" in raw_l or "whoosh" in raw_l:
        return {
            "text": "Ставлю лёгкий переход на смене мысли…",
            "phase": "polish",
            "status": status or "running",
        }

    if "b-roll" in raw_l or "broll" in raw_l or "сток" in raw_l:
        return {
            "text": "Ищу визуальную перебивку под речь…",
            "phase": "create",
            "status": status or "running",
        }

    if "сырое" in raw_l or "raw video" in raw_l or "оригинальн" in raw_l:
        return {
            "text": "Вижу, что видео почти сырое — добавлю графику для эстетики кадра.",
            "phase": "analyze",
            "status": status or "running",
        }

    # Planning / analysis stages
    if "analysis" in step_l:
        return {"text": "Анализирую ваш запрос…", "phase": "think", "status": status or "running"}
    if "planning" in step_l:
        return {"text": "Составляю короткий план монтажа…", "phase": "plan", "status": status or "running"}
    if "execution" in step_l:
        cleaned = _strip_noise(_first_line(raw) or step)
        if cleaned and not _is_junk(cleaned) and len(cleaned) < 140:
            # Soften "Применение [1/3]: ..."
            cleaned = re.sub(r"Применение\s*\[\d+/\d+\]:\s*", "", cleaned)
            cleaned = re.sub(r"Запуск с параметрами:.*", "Запускаю следующий шаг монтажа…", cleaned)
            cleaned = re.sub(r"Запуск:.*", "Запускаю следующий шаг монтажа…", cleaned)
            if "create_scene" in cleaned.lower() or "графическ" in cleaned.lower():
                tip = f"«{concept}»" if concept else "ключевой тезис"
                return {"text": f"Рисую графику про {tip}…", "phase": "create", "status": status or "running"}
            if cleaned.startswith("Готово:"):
                body = cleaned[7:].strip()
                if body and not _is_junk(body):
                    return {"text": _strip_noise(body)[:160], "phase": "execute", "status": "done"}
                return {"text": "Шаг готов.", "phase": "execute", "status": "done"}
            return {"text": cleaned[:160], "phase": "execute", "status": status or "running"}
        return {"text": "Применяю правки на таймлайне…", "phase": "execute", "status": status or "running"}

    # Generic fallback — only if readable Russian-ish short line
    cleaned = _strip_noise(_first_line(raw) or step)
    if not cleaned or _is_junk(cleaned):
        return None
    if len(cleaned) > 160:
        cleaned = cleaned[:157] + "…"
    # Drop lines that still look like code/params
    if any(x in cleaned for x in ("{", "}", "start_time", "html_content", "0.0")):
        return None
    return {
        "text": cleaned,
        "phase": "execute",
        "status": status or "running",
    }


def enrich_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Attach thought + user_visible flags onto a streamed event dict."""
    thought = narrate_thought(
        step=str(event.get("step") or ""),
        details=str(event.get("details") or ""),
        message=str(event.get("message") or ""),
        agent=str(event.get("agent") or ""),
        status=str(event.get("status") or "running"),
        event_type=str(event.get("type") or ""),
    )
    if thought:
        event["thought"] = thought["text"]
        event["phase"] = thought["phase"]
        event["user_visible"] = True
        # Prefer human status from narrator when provided
        if thought.get("status"):
            event["status"] = thought["status"]
    else:
        event["user_visible"] = False
    return event
