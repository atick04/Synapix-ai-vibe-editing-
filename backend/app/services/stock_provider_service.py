import os
import requests
import unicodedata
from typing import List, Dict, Any

STICKER_CATALOG = [
    {
        "id": "sticker_subscribe_red",
        "name": "Subscribe Red Button",
        "query": "subscribe button sign red yt youtube подписка кнопка",
        "url": "https://upload.wikimedia.org/wikipedia/commons/e/e1/YouTube_Subscribe_Button.png",
        "description": "YouTube style red subscribe button overlay"
    },
    {
        "id": "sticker_like_thumb",
        "name": "Like Blue Button",
        "query": "like button blue thumb up yt youtube лайк палец вверх",
        "url": "https://upload.wikimedia.org/wikipedia/commons/5/54/YouTube_like_png.png",
        "description": "YouTube style blue like thumb button"
    },
    {
        "id": "sticker_arrow_red",
        "name": "Arrow Pointer Red",
        "query": "arrow pointer red target direction direct стрелка красная",
        "url": "https://upload.wikimedia.org/wikipedia/commons/e/ec/Red_Arrow_Left.png",
        "description": "Red target indicator arrow element"
    },
    {
        "id": "sticker_warning_alert",
        "name": "Warning Alert Symbol",
        "query": "warning alert danger caution yellow sign symbol опасность внимание восклицательный",
        "url": "https://upload.wikimedia.org/wikipedia/commons/3/3b/Triangle_Warning_Sign_Symbol_Yellow.png",
        "description": "Yellow warning alert caution sign"
    },
    {
        "id": "sticker_bell_notify",
        "name": "Notification Bell Icon",
        "query": "notification bell notification ring alert yt youtube колокольчик уведомление",
        "url": "https://upload.wikimedia.org/wikipedia/commons/a/a2/YouTube_Notification_Bell_Icon.png",
        "description": "YouTube style notification bell alert icon"
    }
]

MUSIC_CATALOG = [
    {
        "id": "music_lofi_cozy",
        "title": "Cozy Autumn Lofi Beat",
        "artist": "Lofi Dreamer",
        "query": "lofi cozy chill autumn study sleep relaxing beat лоуфай уютный расслабляющий",
        "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        "duration": 372.0,
        "description": "Warm acoustic keys and chill lofi beats for background vibes"
    },
    {
        "id": "music_electronic_synth",
        "title": "Neon Grid Cyber Synthwave",
        "artist": "RetroWave",
        "query": "synthwave electronic upbeat fast runner cyber neon 80s синтвейв электроника ритм",
        "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
        "duration": 302.0,
        "description": "High tempo energetic synth wave beat for active segments"
    },
    {
        "id": "music_acoustic_chill",
        "title": "Sunny Day Acoustic Surf",
        "artist": "Island Grooves",
        "query": "acoustic guitar surf sunshine happy positive bright beach акустика гитара пляж солнце",
        "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
        "duration": 318.0,
        "description": "Upbeat acoustic guitar strumming for cheerful and warm visual content"
    },
    {
        "id": "music_cinematic_epic",
        "title": "Chronicles of Adventure",
        "artist": "Symphony Orchestra",
        "query": "orchestral cinematic epic chase dramatic slow ambient hero эпик кино оркестр приключения",
        "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3",
        "duration": 344.0,
        "description": "Powerful cinematic orchestral strings and brass for dramatic highlights"
    }
]

EMOJI_MAP = {
    "fire": "🔥",
    "огонь": "🔥",
    "heart": "❤️",
    "сердце": "❤️",
    "rocket": "🚀",
    "ракета": "🚀",
    "cool": "😎",
    "круто": "😎",
    "clapping": "👏",
    "аплодисменты": "👏",
    "sparkles": "✨",
    "блестки": "✨",
    "money": "💸",
    "деньги": "💸",
    "trophy": "🏆",
    "кубок": "🏆",
    "star": "⭐",
    "звезда": "⭐",
    "laughing": "😂",
    "смех": "😂",
    "lol": "😂",
    "warning": "⚠️",
    "опасность": "⚠️",
    "thumbs up": "👍",
    "класс": "👍",
    "thumbs_up": "👍",
    "arrow": "➡️",
    "стрелка": "➡️"
}

def search_stock_stickers(query: str) -> List[Dict[str, Any]]:
    q = query.lower().strip()
    results = []
    
    # 1. Search curated sticker list
    for item in STICKER_CATALOG:
        if q in item["name"].lower() or any(keyword in item["query"] for keyword in q.split()):
            results.append({
                "id": item["id"],
                "name": item["name"],
                "type": "sticker",
                "url": item["url"],
                "description": item["description"]
            })
            
    # 2. Search Twemoji using unicodedata / map
    emoji_char = None
    if q in EMOJI_MAP:
        emoji_char = EMOJI_MAP[q]
    else:
        try:
            emoji_char = unicodedata.lookup(q.upper())
        except KeyError:
            try:
                emoji_char = unicodedata.lookup(f"{q.upper()} SIGN")
            except KeyError:
                try:
                    emoji_char = unicodedata.lookup(f"{q.upper()} FACE")
                except KeyError:
                    pass

    if emoji_char:
        codepoints = [f"{ord(c):x}" for c in emoji_char if ord(c) != 0xfe0f] # skip variation selector
        codepoint_str = "-".join(codepoints)
        url = f"https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/{codepoint_str}.png"
        
        # Prevent duplicate entries
        if not any(r["id"] == f"emoji_{codepoint_str}" for r in results):
            results.append({
                "id": f"emoji_{codepoint_str}",
                "name": f"Emoji: {q.capitalize()}",
                "type": "emoji",
                "url": url,
                "description": f"Twemoji sticker overlay for '{q}'"
            })
            
    return results

def search_stock_music(query: str) -> List[Dict[str, Any]]:
    q = query.lower().strip()
    results = []
    
    for item in MUSIC_CATALOG:
        if q in item["title"].lower() or q in item["artist"].lower() or any(keyword in item["query"] for keyword in q.split()):
            results.append({
                "id": item["id"],
                "title": item["title"],
                "artist": item["artist"],
                "type": "music",
                "url": item["url"],
                "duration": item["duration"],
                "description": item["description"]
            })
    return results

def download_stock_asset(asset_id: str, download_url: str) -> str:
    os.makedirs("uploads", exist_ok=True)
    ext = ".mp3" if download_url.lower().endswith(".mp3") else ".png"
    filename = f"uploads/{asset_id}{ext}"
    
    if os.path.exists(filename):
        return filename
        
    try:
        print(f"[StockService] Downloading: {download_url} -> {filename}")
        res = requests.get(download_url, stream=True, timeout=20)
        res.raise_for_status()
        with open(filename, "wb") as f:
            for chunk in res.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        print(f"[StockService] Download complete: {filename}")
        return filename
    except Exception as e:
        print(f"[StockService] Failed to download {download_url}: {e}")
        return None
