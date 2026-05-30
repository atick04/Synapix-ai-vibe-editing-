import os
import json
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Папка для сохранения памяти (внутри uploads)
MEMORY_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")

def get_memory_path(file_id: str) -> str:
    """Возвращает путь к файлу общей памяти для заданного file_id."""
    return os.path.join(MEMORY_DIR, f"{file_id}_shared_memory.json")

def create_default_shared_memory(file_id: str) -> Dict[str, Any]:
    """Создает дефолтную структуру общей памяти."""
    return {
        "visual_language": {
            "colors": [],
            "fonts": [],
            "overall_mood": "neutral"
        },
        "used_patterns": [],           # История примененных стикеров, переходов, шрифтов
        "retention_problems": [],      # Проблемы спада удержания внимания
        "scene_energy_history": [],    # История энергии сцен (пэйсинг)
        "camera_history": [],          # История анимаций камеры (zoom_in, zoom_out, drift)
        "audio_motifs": [],            # История музыкальных мотивов и звуков (SFX)
        "narrative_state": {
            "current_chapter": "",
            "key_takeaway_delivered": False
        },
        "style_consistency": {
            "current_style": "auto",
            "last_style_update_time": 0.0
        }
    }

def load_shared_memory(file_id: str) -> Dict[str, Any]:
    """
    Загружает общую память из файла.
    Если файла не существует, инициализирует дефолтную структуру.
    """
    os.makedirs(MEMORY_DIR, exist_ok=True)
    path = get_memory_path(file_id)
    
    if not os.path.exists(path):
        logger.info(f"Shared memory file not found. Creating default for {file_id}")
        memory = create_default_shared_memory(file_id)
        save_shared_memory(file_id, memory)
        return memory
        
    try:
        with open(path, "r", encoding="utf-8") as f:
            memory = json.load(f)
            # Заполняем пропущенные ключи
            default = create_default_shared_memory(file_id)
            for k, v in default.items():
                if k not in memory:
                    memory[k] = v
            return memory
    except Exception as e:
        logger.error(f"Error loading shared memory for {file_id}: {e}")
        return create_default_shared_memory(file_id)

def save_shared_memory(file_id: str, memory: Dict[str, Any]) -> bool:
    """Сохраняет общую память в файл."""
    os.makedirs(MEMORY_DIR, exist_ok=True)
    path = get_memory_path(file_id)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(memory, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving shared memory for {file_id}: {e}")
        return False

def update_shared_memory(file_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Обновляет общую память."""
    memory = load_shared_memory(file_id)
    
    for key, value in updates.items():
        if key in memory and isinstance(memory[key], dict) and isinstance(value, dict):
            memory[key].update(value)
        else:
            memory[key] = value
            
    save_shared_memory(file_id, memory)
    return memory

# ─── Anti-Repetition Memory Engine ──────────────────────────────────────────

def record_pattern_usage(file_id: str, action: str, details: Dict[str, Any], start_time: float):
    """
    Записывает использование паттерна (переходы, стикеры, зумы, sfx) 
    для последующей фильтрации повторов.
    """
    memory = load_shared_memory(file_id)
    
    pattern = {
        "action": action,
        "details": details,
        "start": start_time
    }
    
    memory["used_patterns"].append(pattern)
    
    # Ограничиваем историю последних 50 паттернов для производительности
    if len(memory["used_patterns"]) > 50:
        memory["used_patterns"] = memory["used_patterns"][-50:]
        
    save_shared_memory(file_id, memory)

def validate_against_repetition(file_id: str, proposed_edit: Dict[str, Any]) -> Dict[str, Any]:
    """
    Анализирует предлагаемую правку и накладывает штрафы или корректировки 
    в случае обнаружения дублирующихся приёмов в недавнем времени.
    
    Возвращает словарь с результатом:
    - "approved": bool (одобрено или нет)
    - "reason": str (причина пенализации)
    - "suggested_alternative": Dict[str, Any] (рекомендуемая альтернатива)
    """
    memory = load_shared_memory(file_id)
    used_patterns = memory.get("used_patterns", [])
    
    action = proposed_edit.get("action")
    start = float(proposed_edit.get("start", 0))
    
    # 1. Проверка повторения переходов / SFX
    if action == "add_asset":
        query = proposed_edit.get("asset_query", "").lower()
        # Проверяем, был ли такой же переход/SFX в последние 12 секунд
        for pattern in reversed(used_patterns):
            if pattern["action"] == "add_asset" and abs(start - pattern["start"]) < 12.0:
                old_query = pattern["details"].get("asset_query", "").lower()
                if old_query == query:
                    # Корректируем альтернативу: предлагаем смену категории SFX или переход другого стиля
                    alternative = dict(proposed_edit)
                    if "transition" in query:
                        alternative["asset_query"] = "glitch transition" if "film" in query else "film transition"
                    elif "sfx" in query:
                        alternative["asset_query"] = "impact sfx" if "swoosh" in query else "swoosh sfx"
                        
                    return {
                        "approved": False,
                        "reason": f"Повторение медиа-ассета '{query}' на таймкоде {start}с слишком близко к предыдущему (интервал < 12с).",
                        "suggested_alternative": alternative
                    }

    # 2. Проверка последовательных зумов одного типа
    elif action == "camera_zoom":
        zoom_type = proposed_edit.get("type", "zoom_in")
        # Проверяем недавние зумы в интервале 8 секунд
        for pattern in reversed(used_patterns):
            if pattern["action"] == "camera_zoom" and abs(start - pattern["start"]) < 8.0:
                old_type = pattern["details"].get("type", "zoom_in")
                if old_type == zoom_type:
                    alternative = dict(proposed_edit)
                    alternative["type"] = "zoom_out" if zoom_type == "zoom_in" else "zoom_in"
                    return {
                        "approved": False,
                        "reason": f"Два последовательных зума типа '{zoom_type}' создают дергание кадра. Рекомендуется чередование.",
                        "suggested_alternative": alternative
                    }

    # 3. Проверка одинаковых стикеров (GIF) на экране
    elif action in ("canvas_overlay", "scene_override"):
        # Извлекаем картинки из предложенной графики
        elements = proposed_edit.get("elements", [])
        images = [el.get("image_url") for el in elements if el.get("image_url")]
        
        for img in images:
            for pattern in reversed(used_patterns):
                if pattern["action"] in ("canvas_overlay", "scene_override") and abs(start - pattern["start"]) < 20.0:
                    old_elements = pattern["details"].get("elements", [])
                    old_images = [el.get("image_url") for el in old_elements if el.get("image_url")]
                    if img in old_images:
                        # Нашли дубликат картинки/стикера в течение 20 секунд
                        alternative = dict(proposed_edit)
                        # Меняем дублирующийся стикер на случайный другой из той же папки или удаляем
                        for el in alternative.get("elements", []):
                            if el.get("image_url") == img:
                                # Предлагаем другой стикер (замена на альтернативный ассет)
                                el["image_url"] = "/assets/Graphic elements/Стрелки и указатели/HandDrawnArrow-512px-2.gif"
                        return {
                            "approved": False,
                            "reason": f"Стикер '{img}' уже использовался на таймкоде {pattern['start']}с. Рекомендуется разнообразить визуальный ряд.",
                            "suggested_alternative": alternative
                        }

    return {
        "approved": True,
        "reason": "",
        "suggested_alternative": proposed_edit
    }
