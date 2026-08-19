import json
import os
import glob
from app.schemas.template import TemplateConfig

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "..", "templates", "library")

# Product focus: Instagram Reels only. Other library JSON files stay on disk for later.
DEFAULT_TEMPLATE_ID = "instagram_reels"
ACTIVE_TEMPLATE_IDS = {DEFAULT_TEMPLATE_ID}

# Old upload/format URLs still resolve to the Reels template.
TEMPLATE_ALIASES = {
    "promotional": DEFAULT_TEMPLATE_ID,
    "youtube_long": DEFAULT_TEMPLATE_ID,
    "tutorial": DEFAULT_TEMPLATE_ID,
    "coaching": DEFAULT_TEMPLATE_ID,
    "saas": DEFAULT_TEMPLATE_ID,
    "aesthetic_cursive": DEFAULT_TEMPLATE_ID,
    "educational": DEFAULT_TEMPLATE_ID,
    "ui_animation": DEFAULT_TEMPLATE_ID,
    "reels": DEFAULT_TEMPLATE_ID,
    "instagram": DEFAULT_TEMPLATE_ID,
}


def _load_all_from_disk():
    templates = []
    if not os.path.exists(TEMPLATE_DIR):
        return templates

    for filepath in glob.glob(os.path.join(TEMPLATE_DIR, "*.json")):
        with open(filepath, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
                templates.append(TemplateConfig(**data))
            except Exception as e:
                print(f"Error loading template {filepath}: {e}")
    return templates


def load_templates():
    """Public catalog — Reels only."""
    all_templates = _load_all_from_disk()
    active = [t for t in all_templates if t.id in ACTIVE_TEMPLATE_IDS]
    if active:
        return active
    # Safety: if reels file missing, fall back to first available
    return all_templates[:1]


def get_template(template_id: str):
    if not template_id:
        template_id = DEFAULT_TEMPLATE_ID
    resolved = TEMPLATE_ALIASES.get(template_id, template_id)
    for t in _load_all_from_disk():
        if t.id == resolved:
            return t
    for t in _load_all_from_disk():
        if t.id == DEFAULT_TEMPLATE_ID:
            return t
    templates = _load_all_from_disk()
    return templates[0] if templates else None


def get_default_template_id() -> str:
    return DEFAULT_TEMPLATE_ID
