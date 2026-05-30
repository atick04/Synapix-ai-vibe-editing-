import os
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Папка для сохранения сессий (внутри uploads)
SESSIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")

def get_session_path(file_id: str) -> str:
    """Возвращает абсолютный путь к файлу сессии для заданного file_id."""
    return os.path.join(SESSIONS_DIR, f"{file_id}_session.json")

def create_default_session(file_id: str) -> Dict[str, Any]:
    """Создает дефолтную структуру сессии."""
    return {
        "project_id": file_id,
        "session_id": f"session_{file_id}",
        "creative_goal": "Сделать динамичное и вовлекающее видео с профессиональным ритмом монтажа.",
        "style_profile": "auto",
        "target_retention": 0.85,
        "narrative_arc": {
            "hook": "",
            "problem": "",
            "solution": "",
            "call_to_action": ""
        },
        "visual_identity": {
            "dominant_color": "White",
            "font_family": "Montserrat-ExtraBold",
            "graphics_style": "vox"
        },
        "editing_strategy": {
            "zoom_frequency": "medium",
            "broll_frequency": "medium",
            "pacing": "normal"
        },
        "scene_history": [],
        "agent_memory": {},
        "production_state": {
            "status": "initialized",
            "current_scene_index": 0,
            "render_quality": 1.0
        }
    }

def load_session(file_id: str) -> Dict[str, Any]:
    """
    Загружает сессию из файла.
    Если файла не существует, инициализирует дефолтную сессию и сохраняет её.
    """
    os.makedirs(SESSIONS_DIR, exist_ok=True)
    path = get_session_path(file_id)
    
    if not os.path.exists(path):
        logger.info(f"Session file not found. Creating default session for {file_id}")
        session = create_default_session(file_id)
        save_session(file_id, session)
        return session
        
    try:
        with open(path, "r", encoding="utf-8") as f:
            session = json.load(f)
            # Гарантируем наличие базовых ключей при миграции структуры
            default = create_default_session(file_id)
            for k, v in default.items():
                if k not in session:
                    session[k] = v
            return session
    except Exception as e:
        logger.error(f"Error loading session for {file_id}: {e}")
        return create_default_session(file_id)

def save_session(file_id: str, session: Dict[str, Any]) -> bool:
    """Сохраняет сессию в файл."""
    os.makedirs(SESSIONS_DIR, exist_ok=True)
    path = get_session_path(file_id)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(session, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving session for {file_id}: {e}")
        return False

def update_session(file_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    Обновляет сессию новыми полями (поддерживает плоские ключи и глубокие словари для базовых настроек).
    """
    session = load_session(file_id)
    
    for key, value in updates.items():
        if key in session and isinstance(session[key], dict) and isinstance(value, dict):
            # Глубокое обновление для вложенных словарей (narrative_arc, visual_identity и т.д.)
            session[key].update(value)
        else:
            session[key] = value
            
    save_session(file_id, session)
    return session
