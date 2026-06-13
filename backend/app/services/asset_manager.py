import os
import json
import uuid

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "../../assets")
INDEX_FILE = os.path.join(ASSETS_DIR, "index.json")

def get_file_type(ext):
    ext = ext.lower()
    if ext in ['.mp4', '.mov', '.avi']:
        return 'video'
    elif ext in ['.mp3', '.wav', '.aac', '.m4a']:
        return 'audio'
    elif ext in ['.png', '.jpg', '.jpeg', '.gif', '.svg']:
        return 'image'
    return 'unknown'

def build_index():
    if not os.path.exists(ASSETS_DIR):
        print(f"Directory not found: {ASSETS_DIR}")
        return

    assets_index = {
        "categories": set(),
        "assets": []
    }

    # Walk through the directory
    for root, dirs, files in os.walk(ASSETS_DIR):
        for file in files:
            if file == "index.json" or file.startswith("."):
                continue

            filepath = os.path.join(root, file)
            # Make path relative to backend/assets
            rel_path = os.path.relpath(filepath, ASSETS_DIR)
            
            # The category is the first folder inside assets/ (e.g., "SFX Sounds")
            path_parts = rel_path.split(os.sep)
            category = path_parts[0] if len(path_parts) > 1 else "Uncategorized"
            
            filename, ext = os.path.splitext(file)
            file_type = get_file_type(ext)
            
            assets_index["categories"].add(category)
            assets_index["assets"].append({
                "id": str(uuid.uuid4())[:8],  # Short unique ID
                "name": filename,
                "category": category,
                "type": file_type,
                "rel_path": rel_path.replace(os.sep, "/") # Use forward slashes for consistency
            })

    # Convert set to list for JSON serialization
    assets_index["categories"] = list(assets_index["categories"])

    # Save the index
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(assets_index, f, indent=4, ensure_ascii=False)
    
    print(f"Indexed {len(assets_index['assets'])} assets across {len(assets_index['categories'])} categories.")
    print(f"Index saved to {INDEX_FILE}")

def get_assets_by_category(category):
    if not os.path.exists(INDEX_FILE):
        return []
    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        index = json.load(f)
    return [a for a in index["assets"] if a["category"] == category]

def get_index_summary():
    if not os.path.exists(INDEX_FILE):
        return "Asset library is empty or not indexed."
    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        index = json.load(f)
    
    summary = f"БИБЛИОТЕКА АССЕТОВ ({len(index['assets'])} файлов):\n"
    for cat in index["categories"]:
        count = sum(1 for a in index["assets"] if a["category"] == cat)
        summary += f"- {cat}: {count} файлов\n"
    
    summary += "\nИспользуй команду 'add_asset' с параметром 'asset_query' (например 'glitch transition' или 'swoosh sfx') чтобы запросить нужный ассет."
    return summary

import random

# Semantic mapping for the high-fidelity animated GIFs in Graphic elements/Другое
ANIMATED_GIFS_MAP = {
    "rocket": "Graphic elements/Другое/AnimatedEmojies-512px-123.gif",        # Ракета, рост, стартап
    "idea_bulb": "Graphic elements/Другое/AnimatedEmojies-512px-93.gif",       # Лампочка, идея, креатив
    "thinking_brain": "Graphic elements/Другое/AnimatedEmojies-512px-140.gif",  # Мозг, размышления, ИИ
    "growth_chart": "Graphic elements/Другое/AnimatedEmojies-512px-179.gif",    # Растущий график, статистика
    "target_bullseye": "Graphic elements/Другое/AnimatedEmojies-512px-28.gif",   # Цель, фокус, задача
    "fire_trending": "Graphic elements/Друgoe/AnimatedEmojies-512px-144.gif",   # Огонь, хайп, тренд
    "lightning_fast": "Graphic elements/Другое/AnimatedEmojies-512px-142.gif",  # Молния, скорость, энергия
    "star_gold": "Graphic elements/Другое/AnimatedEmojies-512px-16.gif",        # Звезда, премиум, рейтинг
    "alert_warning": "Graphic elements/Другое/AnimatedEmojies-512px-346.gif",    # Восклицательный знак, опасность
    "time_clock": "Graphic elements/Другое/AnimatedEmojies-512px-372.gif",      # Часы, время, дедлайн
    "lock_secure": "Graphic elements/Другое/AnimatedEmojies-512px-184.gif",     # Замок, безопасность, приватность
    "gear_process": "Graphic elements/Другое/AnimatedEmojies-512px-355.gif",    # Шестеренка, настройки, процесс
    "question_mark": "Graphic elements/Другое/AnimatedEmojies-512px-345.gif",   # Вопрос, сомнение
    "check_success": "Graphic elements/Другое/AnimatedEmojies-512px-348.gif",   # Зеленая галочка, победа
    "money_bag": "Graphic elements/Другое/AnimatedEmojies-512px-19.gif",        # Мешок денег, бюджет, финансы
    "money_fly": "Graphic elements/Другое/AnimatedEmojies-512px-169.gif",       # Летающие доллары, расходы
}

def get_sticker_catalog(max_per_folder=5):
    """Return a compact summary of available image assets grouped by subfolder.
    Exposes both mapped high-fidelity animated GIFs and structured folders."""
    if not os.path.exists(INDEX_FILE):
        return ""
    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        index = json.load(f)
    
    images = [a for a in index["assets"] if a["category"] == "Graphic elements" and a["type"] == "image"]
    
    # Group by subfolder
    folders = {}
    for a in images:
        parts = a["rel_path"].split("/")
        folder = parts[1] if len(parts) > 2 else "Root"
        if folder not in folders:
            folders[folder] = []
        folders[folder].append(a)
    
    lines = []
    lines.append("════════════════════════════════════════")
    lines.append("🔥 СУПЕР-КАЧЕСТВЕННЫЕ АНИМИРОВАННЫЕ GIF (Визуализация мыслей):")
    lines.append("Используй их через asset_id (например, 'rocket') для выразительного визуального эффекта:")
    for key, rel_path in sorted(ANIMATED_GIFS_MAP.items()):
        # Double check path spelling
        clean_path = rel_path.replace("Graphic elements/Друgoe", "Graphic elements/Другое")
        lines.append(f"  - {key.upper()}: /assets/{clean_path}")
    lines.append("════════════════════════════════════════")
    
    lines.append("\nСТАТИЧНЫЕ СТИКЕРЫ (по папкам):")
    for folder, assets in sorted(folders.items()):
        if folder == "Другое":  # Skip raw gif folder since we exposed them semantically above
            continue
        sample = assets[:max_per_folder]
        names = ", ".join(a["name"] for a in sample)
        extra = f" (+{len(assets) - max_per_folder} ещё)" if len(assets) > max_per_folder else ""
        lines.append(f"  [{folder}]: {names}{extra}")
    
    return "\n".join(lines)


def resolve_asset_query(query: str):
    if not os.path.exists(INDEX_FILE):
        return None
    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        index = json.load(f)
    
    query = query.lower()
    keywords = query.split()
    
    matches = []
    for asset in index["assets"]:
        search_text = f"{asset['name']} {asset['category']} {asset['type']}".lower()
        if all(kw in search_text for kw in keywords):
            matches.append(asset)
            
    if not matches:
        for asset in index["assets"]:
            search_text = f"{asset['name']} {asset['category']} {asset['type']}".lower()
            if any(kw in search_text for kw in keywords):
                matches.append(asset)
                
    if matches:
        return random.choice(matches)
    
    return None

if __name__ == "__main__":
    print("Starting asset indexing...")
    build_index()
