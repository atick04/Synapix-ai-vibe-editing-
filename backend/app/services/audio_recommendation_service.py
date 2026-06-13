import os
import json
from typing import Dict, Any, List, Optional
from app.services.ai_service import client
from app.services.template_service import get_template

async def get_audio_recommendation(file_id: str, template_id: str = "promotional") -> Dict[str, Any]:
    """
    Analyzes video visual metadata and speech transcript to recommend:
    1. BGM prompt for Stable Audio 2.5 (tailored to template genre tags and video mood).
    2. Event trigger map for SFX (e.g., video_hard_cut at scene transition points).
    """
    # 1. Load template config
    tpl = get_template(template_id) or get_template("promotional")
    
    genre_tags = ["ambient", "lofi", "beats"]
    sfx_map = []
    target_bpm = 100
    
    if tpl and tpl.sound_design:
        genre_tags = tpl.sound_design.background_music.genre_tags
        target_bpm = tpl.sound_design.background_music.target_bpm
        sfx_map = [item.model_dump() for item in tpl.sound_design.sfx_trigger_map]
    
    # 2. Read transcript and visual cues
    transcript_path = os.path.join("uploads", f"{file_id}_transcript.json")
    visual_path = os.path.join("uploads", f"{file_id}_visual.json")
    
    transcript_text = ""
    words_data = []
    if os.path.exists(transcript_path):
        try:
            with open(transcript_path, "r", encoding="utf-8") as f:
                t_data = json.load(f)
                transcript_text = t_data.get("text", "")
                words_data = t_data.get("words", [])
        except Exception as e:
            print(f"[AudioRec] Error loading transcript: {e}")
            
    scenes_data = []
    if os.path.exists(visual_path):
        try:
            with open(visual_path, "r", encoding="utf-8") as f:
                scenes_data = json.load(f)
        except Exception as e:
            print(f"[AudioRec] Error loading visual analysis: {e}")

    # 3. Construct prompt for LLM
    prompt = (
        "You are an expert Sound Designer and Film Composer.\n"
        f"You need to recommend background music (BGM) and sound effects (SFX) for a video project (ID: {file_id}) based on its visual scene descriptors and spoken text.\n\n"
        "--- VIDEO ANALYSIS ---\n"
        f"Speech transcript: \"{transcript_text}\"\n"
        "Visual scene descriptors over time:\n"
    )
    
    for s in scenes_data:
        prompt += f"- {s.get('time_sec', 0.0)}s: {s.get('scene', 'No description')}\n"
        
    prompt += (
        "\n--- SOUND DESIGN CONSTRAINTS ---\n"
        f"Template Music Genre Tags: {genre_tags}\n"
        f"Target BGM Tempo: {target_bpm} BPM\n"
        f"Available SFX events & files: {json.dumps(sfx_map)}\n\n"
        "--- INSTRUCTIONS ---\n"
        "1. Generate a highly detailed descriptive BGM Prompt for Stable Audio 2.5 (e.g. including instruments, textures, mood, bpm, high-fidelity) that blends the template's genre tags with the video's theme.\n"
        "2. Identify timestamps in the video where SFX should be triggered (like 'video_hard_cut' when a visual scene changes, 'accent_word_popup' for high-impact words, or 'bento_grid_appear' / 'screen_slide'). Provide the specific event type, the timestamp, and volume.\n"
        "3. Determine the optimal duration for the generated audio (between 5 and 30 seconds).\n\n"
        "Return ONLY a valid JSON object matching the structure below. Do not wrap in markdown, code blocks, or include any extra text:\n"
        "{\n"
        "  \"bgm_prompt\": \"Cinematic tech beats, soft pads, digital clicks, premium, 105 bpm, high-fidelity\",\n"
        "  \"bgm_duration\": 10,\n"
        "  \"sfx_events\": [\n"
        "    { \"event\": \"video_hard_cut\", \"time_sec\": 2.4, \"volume_scale\": 0.6 },\n"
        "    { \"event\": \"accent_word_popup\", \"time_sec\": 5.0, \"volume_scale\": 0.4 }\n"
        "  ]\n"
        "}"
    )

    try:
        # Use llama-3.3-70b-versatile via Groq
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=600
        )
        
        raw_text = response.choices[0].message.content.strip()
        print(f"[AudioRec] Raw LLM reply: {raw_text}")
        
        # Clean potential markdown fences
        if "```" in raw_text:
            parts = raw_text.split("```")
            for p in parts:
                p = p.strip()
                if p.startswith("json"):
                    p = p[4:].strip()
                if p.startswith("{"):
                    raw_text = p
                    break
                    
        rec = json.loads(raw_text)
        return rec
    except Exception as e:
        print(f"[AudioRec] LLM recommendation failed: {e}")
        # Return fallback values
        return {
            "bgm_prompt": f"Chill background beats, {', '.join(genre_tags)}, {target_bpm} bpm, high-fidelity",
            "bgm_duration": 10,
            "sfx_events": [
                { "event": "video_hard_cut", "time_sec": s.get("time_sec", 0.0), "volume_scale": 0.5 }
                for s in scenes_data[1:4]
            ]
        }
