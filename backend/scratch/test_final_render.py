import asyncio
import os
import json
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.video_service import render_video

def run_test():
    file_id = "f90bf311-1d8c-4895-af39-7f92d80edce3"
    upload_dir = r"c:\Users\User\Desktop\VibeEdit AI\backend\uploads"
    
    input_path = os.path.join(upload_dir, f"{file_id}.mp4")
    output_path = os.path.join(upload_dir, f"{file_id}_test_render.mp4")
    transcript_path = os.path.join(upload_dir, f"{file_id}_transcript.json")
    
    if not os.path.exists(input_path):
        print(f"Error: Input video not found at {input_path}")
        return
        
    with open(transcript_path, "r", encoding="utf-8") as f:
        transcript = json.load(f)
        
    # Mock edits: add subtitles with active style properties (yellow accent, Montserrat font, active scale 1.35)
    edits = [
        {
            "action": "add_subtitles",
            "font": "Montserrat-ExtraBold",
            "font_size": 90,
            "font_color": "White",
            "accent_color": "#00E5FF", # Neon blue accent
            "inactive_opacity": 0.45,
            "active_scale": 1.35,
            "text_case": "UPPER",
            "position": "bottom",
            "x": 50.0,
            "y": 80.0,
            "use_shadow": True,
            "shadow_blur": 16.0
        },
        {
            "action": "camera_zoom",
            "type": "zoom_in",
            "start": 1.0,
            "end": 3.0
        }
    ]
    
    print("[RenderTest] Starting render test...")
    success = render_video(
        input_path=input_path,
        output_path=output_path,
        transcript_data=transcript,
        edits=edits,
        font="Montserrat-ExtraBold",
        font_size=90,
        font_color="White"
    )
    
    if success and os.path.exists(output_path):
        print("[RenderTest] Render completed successfully!")
        print(f"Output video size: {os.path.getsize(output_path)} bytes")
        
        # Check generated ASS file
        ass_path = output_path.replace(".mp4", ".ass")
        if os.path.exists(ass_path):
            print("[RenderTest] ASS Subtitles file generated successfully!")
            print(f"ASS file size: {os.path.getsize(ass_path)} bytes")
            # Print first 25 lines of ASS file
            with open(ass_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            print("--- ASS SUBTITLE EXCERPT ---")
            for line in lines[:30]:
                print(line.strip())
            print("----------------------------")
    else:
        print("[RenderTest] Render failed!")

if __name__ == "__main__":
    run_test()
