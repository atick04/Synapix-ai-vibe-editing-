import os
import base64
import subprocess
import tempfile
import json
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# VLM client configuration (supports both local LM Studio and cloud OpenRouter)
openrouter_key = os.getenv("OPENROUTER_API_KEY")
vlm_base_url = os.getenv("VLM_BASE_URL", "http://192.168.0.114:1234/v1")

if "openrouter.ai" in vlm_base_url and openrouter_key:
    vlm_client = OpenAI(
        api_key=openrouter_key,
        base_url=vlm_base_url,
        default_headers={
            "HTTP-Referer": "https://vibedit.ai",
            "X-Title": "VibeEdit AI Studio"
        }
    )
else:
    vlm_client = OpenAI(
        api_key=os.getenv("VLM_API_KEY", "lm-studio"),
        base_url=vlm_base_url
    )

VLM_MODEL = os.getenv("VLM_MODEL", "qwen/qwen3-vl-8b")


def extract_frames(video_path: str, output_dir: str, fps: float = 0.5) -> list[str]:
    """Extract frames from video using FFmpeg at given fps rate."""
    os.makedirs(output_dir, exist_ok=True)
    pattern = os.path.join(output_dir, "frame_%04d.jpg")

    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps={fps},scale=480:-1",
        "-q:v", "4",
        pattern,
        "-y", "-loglevel", "quiet"
    ]

    try:
        subprocess.run(cmd, check=True, timeout=120)
    except Exception as e:
        print(f"[VLM] Frame extraction error: {e}")
        return []

    frames = sorted(Path(output_dir).glob("frame_*.jpg"))
    return [str(f) for f in frames]


def _encode_image_b64(image_path: str) -> str:
    """Encode image as base64 data URL for vision API."""
    with open(image_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    return f"data:image/jpeg;base64,{data}"


async def analyze_with_gemini(sampled_frames: list[str], frame_times: list[float], fps: float) -> list[dict]:
    """Analyzes keyframes using Google Gemini 1.5/2.5 Flash as a cloud-based production VLM."""
    google_api_key = os.getenv("GOOGLE_API_KEY")
    if not google_api_key:
        print("[VLM] GOOGLE_API_KEY not found. Cannot run cloud visual analysis.")
        return []

    print("[VLM] Running cloud visual analysis with Google Gemini...")
    try:
        import google.generativeai as genai
        from PIL import Image

        genai.configure(api_key=google_api_key)

        pil_images = []
        for f in sampled_frames:
            pil_images.append(Image.open(f))

        prompt = (
            f"You are analyzing {len(sampled_frames)} keyframes from a video, sampled every {int(1/fps) if fps > 0 else 2} seconds. "
            "For each frame (in order, starting from 0 to N-1), write a SHORT description (max 8 words) of what you see "
            "and specify the 'safe_zone' (\"top\", \"bottom\", \"left\", \"right\", \"none\") where motion graphics can be placed without covering faces. "
            "Return ONLY a valid JSON array matching this structure exactly. Do not wrap in markdown or explanation:\n"
            '[{"frame": 0, "scene": "Speaker smiling...", "safe_zone": "left"}, ...]'
        )

        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content([prompt] + pil_images)
        raw = response.text.strip()

        # Clean markdown code fences if present
        if "```" in raw:
            parts = raw.split("```")
            for part in parts:
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("["):
                    raw = part
                    break

        parsed = json.loads(raw)
        result = []
        for item in parsed:
            idx = item.get("frame", 0)
            time_sec = frame_times[idx] if idx < len(frame_times) else round(idx / fps, 1)
            result.append({
                "time_sec": time_sec,
                "scene": item.get("scene", ""),
                "safe_zone": item.get("safe_zone", "none")
            })

        print(f"[VLM] ✅ Gemini Vision successfully analyzed {len(result)} scenes.")
        return result
    except Exception as e:
        print(f"[VLM] Gemini Vision failed: {e}")
        return []


async def analyze_video_scenes(video_path: str, fps: float = 0.5) -> list[dict]:
    """
    Analyzes video frames with Qwen3-VL (local LM Studio) or Google Gemini (cloud fallback) 
    to produce structured scene descriptions.
    Returns: [{"time_sec": 2.0, "scene": "Speaker smiling, pointing at camera", "safe_zone": "left"}]
    """
    print(f"[VLM] Starting visual analysis: {video_path}")

    with tempfile.TemporaryDirectory() as tmpdir:
        frames = extract_frames(video_path, tmpdir, fps=fps)
        if not frames:
            print("[VLM] No frames extracted.")
            return []

        print(f"[VLM] Extracted {len(frames)} frames. Sampling for analysis...")

        # Sample max 12 frames to stay within context window
        step = max(1, len(frames) // 12)
        sampled = frames[::step][:12]

        # Map sampled frame index to time
        frame_times = []
        for f in sampled:
            fname = Path(f).stem  # frame_0001
            frame_num = int(fname.split("_")[1])
            time_sec = round((frame_num - 1) / fps, 1)
            frame_times.append(time_sec)

        # Check if we should use local LM Studio or cloud Gemini VLM
        use_local = os.getenv("USE_LOCAL_VLM", "false").lower() == "true"
        vlm_url = os.getenv("VLM_BASE_URL", "")
        is_local_ip = "192.168" in vlm_url or "localhost" in vlm_url or "127.0.0.1" in vlm_url or not vlm_url

        if not use_local and is_local_ip:
            # Try Gemini Cloud VLM first
            result = await analyze_with_gemini(sampled, frame_times, fps)
            if result:
                return result
            print("[VLM] Cloud Gemini analysis returned empty or failed. Attempting local Qwen3-VL fallback...")

        # Invoke VLM Model
        print(f"[VLM] Using VLM Model: {VLM_MODEL} @ {vlm_url}")

        # Build vision message: mix of images and instructions
        content = [
            {
                "type": "text",
                "text": (
                    f"You are analyzing {len(sampled)} keyframes from a video, sampled every {int(1/fps)} seconds. "
                    "For each frame (in order), write a SHORT description (max 8 words) of what you see "
                    "and specify the 'safe_zone' (\"top\", \"bottom\", \"left\", \"right\", \"none\") where motion graphics can be placed without covering faces. "
                    "Return ONLY a valid JSON array, no markdown, no explanation:\n"
                    '[{"frame": 0, "scene": "Speaker smiling...", "safe_zone": "left"}, ...]\n\n'
                    "Frames follow in order:"
                )
            }
        ]

        for frame_path in sampled:
            content.append({
                "type": "image_url",
                "image_url": {"url": _encode_image_b64(frame_path)}
            })

        try:
            response = vlm_client.chat.completions.create(
                model=VLM_MODEL,
                messages=[{"role": "user", "content": content}],
                temperature=0.1,
                max_tokens=800
            )

            raw = response.choices[0].message.content.strip()
            print(f"[VLM] Raw response preview: {raw[:200]}")

            # Clean markdown code fences if present
            if "```" in raw:
                parts = raw.split("```")
                for part in parts:
                    part = part.strip()
                    if part.startswith("json"):
                        part = part[4:].strip()
                    if part.startswith("["):
                        raw = part
                        break

            parsed = json.loads(raw)

            result = []
            for item in parsed:
                idx = item.get("frame", 0)
                time_sec = frame_times[idx] if idx < len(frame_times) else round(idx / fps, 1)
                result.append({
                    "time_sec": time_sec,
                    "scene": item.get("scene", ""),
                    "safe_zone": item.get("safe_zone", "none")
                })

            print(f"[VLM] ✅ VLM Model analyzed {len(result)} scenes.")
            return result

        except json.JSONDecodeError as e:
            print(f"[VLM] JSON parse error: {e}. Raw: {raw[:300]}")
            return []
        except Exception as e:
            print(f"[VLM] VLM analysis error: {e}")
            return []


def format_visual_context(scenes: list[dict]) -> str:
    """Converts scene list into a compact string for LLM prompt injection."""
    if not scenes:
        return "Визуальный анализ недоступен."
    lines = [f"[{s['time_sec']:.1f}s] {s['scene']} (Безопасная зона: {s.get('safe_zone', 'none')})" for s in scenes]
    return "\n".join(lines)
