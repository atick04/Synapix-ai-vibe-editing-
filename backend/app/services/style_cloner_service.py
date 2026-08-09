import os
import uuid
import yt_dlp
import json
from app.services.vlm_service import extract_frames

async def analyze_reference_video_style(url: str) -> dict:
    """
    Downloads a reference video using yt-dlp, extracts keyframes,
    and uses Gemini VLM to analyze and construct a detailed editing style profile.
    """
    # Ensure uploads directory exists
    os.makedirs("uploads", exist_ok=True)
    temp_ref_path = f"uploads/ref_video_{uuid.uuid4().hex[:8]}.mp4"
    print(f"[Style Cloner] Downloading reference video from {url}...")
    
    ydl_opts = {
        'format': 'worst[ext=mp4]/worst',  # download lowest resolution for speed
        'outtmpl': temp_ref_path,
        'quiet': True,
        'max_filesize': 15 * 1024 * 1024,  # max 15MB limit
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except Exception as e:
        print(f"[Style Cloner] Failed to download reference video: {e}")
        # Try fallback matching file name
        import glob
        matches = glob.glob(temp_ref_path.replace(".mp4", "*"))
        if matches:
            temp_ref_path = matches[0]
        else:
            temp_ref_path = None

    if not temp_ref_path or not os.path.exists(temp_ref_path):
        print("[Style Cloner] Reference video download file not found.")
        # Return a premium defaults profile in case of download failure
        return {
            "pacing_tempo": "fast",
            "broll_density": "high",
            "zoom_frequency": "high",
            "typography": {
                "font": "BebasNeue-Regular",
                "font_size": 90,
                "font_color": "#FFFFFF",
                "accent_color": "#FACC15",
                "position": "bottom"
            },
            "music_style": "phonk"
        }

    # Default profile to fall back to
    style_profile = {
        "pacing_tempo": "medium",
        "broll_density": "medium",
        "zoom_frequency": "medium",
        "typography": {
            "font": "Montserrat-ExtraBold",
            "font_size": 80,
            "font_color": "#FFFFFF",
            "accent_color": "#FACC15",
            "position": "bottom"
        },
        "music_style": "lofi"
    }

    try:
        import tempfile
        from pathlib import Path
        
        with tempfile.TemporaryDirectory() as tmpdir:
            # Extract 0.5 frames per second (1 frame every 2 seconds)
            frames = extract_frames(temp_ref_path, tmpdir, fps=0.5)
            if not frames:
                print("[Style Cloner] No frames extracted from reference.")
                return style_profile
            
            # Sample up to 12 frames
            step = max(1, len(frames) // 12)
            sampled = frames[::step][:12]
            
            # Call OpenRouter VLM to analyze the editing style of these frames
            from app.services.vlm_service import vlm_client, VLM_MODEL, _encode_image_b64
            
            content = [
                {
                    "type": "text",
                    "text": (
                        "You are analyzing keyframes from a reference video. "
                        "Determine the editing style and rhythm of this video to help us clone it. "
                        "Return ONLY a valid JSON object matching this structure exactly. Do not wrap in markdown code blocks or explanations:\n"
                        '{\n'
                        '  "pacing_tempo": "fast",\n'  # Choose 'fast', 'medium', 'slow'
                        '  "broll_density": "high",\n' # Choose 'high', 'medium', 'low'
                        '  "zoom_frequency": "medium",\n' # Choose 'high', 'medium', 'low'
                        '  "typography": {\n'
                        '    "font": "BebasNeue-Regular",\n' # 'BebasNeue-Regular', 'Inter_24pt-Bold', 'Rubik-Bold', 'Montserrat-ExtraBold'
                        '    "font_size": 90,\n'
                        '    "font_color": "#FFFFFF",\n'
                        '    "accent_color": "#FACC15",\n'
                        '    "position": "bottom"\n'
                        '  },\n'
                        '  "music_style": "phonk"\n' # 'lofi', 'ambient', 'active-trap', 'phonk'
                        '}'
                    )
                }
            ]
            
            for f in sampled:
                if os.path.exists(f):
                    content.append({
                        "type": "image_url",
                        "image_url": {"url": _encode_image_b64(f)}
                    })
            
            try:
                response = vlm_client.chat.completions.create(
                    model=VLM_MODEL,
                    messages=[{"role": "user", "content": content}],
                    temperature=0.1,
                    max_tokens=600
                )
                
                raw = response.choices[0].message.content.strip()
                # Strip markdown code blocks if any
                if "```" in raw:
                    parts = raw.split("```")
                    for part in parts:
                        part = part.strip()
                        if part.startswith("json"):
                            part = part[4:].strip()
                        if part.startswith("{"):
                            raw = part
                            break
                            
                parsed = json.loads(raw)
                style_profile.update(parsed)
                print(f"[Style Cloner] Cloned Style Profile successfully: {style_profile}")
            except Exception as inner_e:
                print(f"[Style Cloner] OpenRouter VLM failed: {inner_e}. Using premium defaults.")
                style_profile.update({
                    "pacing_tempo": "fast",
                    "broll_density": "high",
                    "zoom_frequency": "medium",
                    "typography": {
                        "font": "BebasNeue-Regular",
                        "font_size": 85,
                        "font_color": "#FFFFFF",
                        "accent_color": "#FACC15",
                        "position": "bottom"
                    },
                    "music_style": "phonk"
                })
    except Exception as e:
        print(f"[Style Cloner] Gemini style analysis failed: {e}. Using default template.")
    finally:
        # Cleanup downloaded video to save space
        try:
            if os.path.exists(temp_ref_path):
                os.remove(temp_ref_path)
        except Exception:
            pass
            
    return style_profile
