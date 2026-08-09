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
            
        # Rank top candidates using OpenAI CLIP aesthetic & semantic model
        candidates = data["videos"][:5]
        best_video = None
        
        try:
            from app.services.clip_service import get_clip_similarity
            scored_candidates = []
            for v in candidates:
                img_url = v.get("image")
                score = 0.5
                if img_url:
                    try:
                        img_res = requests.get(img_url, timeout=3)
                        tmp_img = f"uploads/_tmp_broll_{uuid.uuid4().hex[:6]}.jpg"
                        with open(tmp_img, "wb") as f:
                            f.write(img_res.content)
                        score = get_clip_similarity(query, tmp_img)
                        if os.path.exists(tmp_img):
                            os.remove(tmp_img)
                    except Exception:
                        pass
                scored_candidates.append((score, v))
            
            scored_candidates.sort(key=lambda x: x[0], reverse=True)
            best_video = scored_candidates[0][1]
            print(f"🧠 [OpenAI CLIP] Picked top aesthetic B-roll for '{query}' (CLIP score: {scored_candidates[0][0]:.3f})")
        except Exception as err:
            print(f"⚠️ CLIP B-roll ranking fallback: {err}")
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
