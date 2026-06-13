import os
import requests
import uuid

def download_broll(query: str, duration: float, aspect_ratio: str = "vertical") -> str:
    api_key = os.getenv("PEXELS_API_KEY")
    if not api_key or api_key == "YOUR_PEXELS_KEY":
        print("Pexels API: Не найден ключ (PEXELS_API_KEY). Оверлей отменен.")
        return None
        
    orientation = "landscape" if aspect_ratio == "horizontal" else "portrait"
    print(f"[Motion Agent] Ищу b-roll по запросу: '{query}' (orientation: {orientation})...")
    url = f"https://api.pexels.com/videos/search?query={query}&per_page=15&orientation={orientation}"
    headers = {"Authorization": api_key}
    
    try:
        res = requests.get(url, headers=headers)
        data = res.json()
        if not data.get("videos"):
            print(f"Pexels API Error: Видео не найдено для '{query}'")
            return None
            
        best_video = None
        for v in data["videos"]:
            if v.get("duration", 0) >= duration:
                best_video = v
                break
        
        if not best_video:
            best_video = data["videos"][0]
            
        video_files = best_video.get("video_files", [])
        hd_files = [f for f in video_files if f.get("quality") == "hd" and f.get("width", 0) >= 720]
        if not hd_files:
            hd_files = video_files
            
        if not hd_files:
            return None
            
        download_link = sorted(hd_files, key=lambda x: x.get("width", 0), reverse=True)[0]["link"]
        
        print(f"[Motion Agent] Скачивание видео с Pexels: {download_link}")
        vid_res = requests.get(download_link, stream=True)
        filename = f"uploads/broll_{uuid.uuid4().hex[:8]}.mp4"
        with open(filename, "wb") as f:
            for chunk in vid_res.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                
        print(f"[Motion Agent] B-roll успешно сохранен: {filename}")
        return filename
    except Exception as e:
        print(f"Pexels Request Error: {e}")
        return None

def resolve_broll_url(query: str, duration: float, aspect_ratio: str = "vertical") -> str:
    api_key = os.getenv("PEXELS_API_KEY")
    if not api_key or api_key == "YOUR_PEXELS_KEY":
        return None
    orientation = "landscape" if aspect_ratio == "horizontal" else "portrait"
    url = f"https://api.pexels.com/videos/search?query={query}&per_page=15&orientation={orientation}"
    headers = {"Authorization": api_key}
    try:
        res = requests.get(url, headers=headers)
        data = res.json()
        if not data.get("videos"):
            return None
        best_video = None
        for v in data["videos"]:
            if v.get("duration", 0) >= duration:
                best_video = v
                break
        if not best_video:
            best_video = data["videos"][0]
        video_files = best_video.get("video_files", [])
        hd_files = [f for f in video_files if f.get("quality") == "hd" and f.get("width", 0) >= 720]
        if not hd_files:
            hd_files = video_files
        if not hd_files:
            return None
        download_link = sorted(hd_files, key=lambda x: x.get("width", 0), reverse=True)[0]["link"]
        return download_link
    except Exception as e:
        print(f"Pexels Resolve Error: {e}")
        return None
