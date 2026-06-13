import os
import subprocess
import json

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
print(f"Scanning directory: {UPLOAD_DIR}")

def convert_all():
    files = os.listdir(UPLOAD_DIR)
    for f in files:
        if f.endswith(".mov") and not "_rendered" in f:
            base_id = os.path.splitext(f)[0]
            mov_path = os.path.join(UPLOAD_DIR, f)
            mp4_path = os.path.join(UPLOAD_DIR, f"{base_id}.mp4")
            
            if not os.path.exists(mp4_path):
                print(f"\nConverting {f} to {base_id}.mp4...")
                cmd = [
                    "ffmpeg", "-y", "-i", mov_path,
                    "-c:v", "libx264", "-preset", "superfast", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k",
                    mp4_path
                ]
                try:
                    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    print(f"Successfully converted to {mp4_path}")
                except subprocess.CalledProcessError as e:
                    print(f"Error converting {f}: {e}")
                    continue
            else:
                print(f"MP4 version already exists for {f}")
                
            # Update media library json
            lib_path = os.path.join(UPLOAD_DIR, f"{base_id}_media_library.json")
            if os.path.exists(lib_path):
                try:
                    with open(lib_path, "r", encoding="utf-8") as lf:
                        library = json.load(lf)
                    modified = False
                    for item in library:
                        if item.get("id") == "main" and item.get("path", "").endswith(".mov"):
                            item["path"] = item["path"].replace(".mov", ".mp4")
                            modified = True
                    if modified:
                        with open(lib_path, "w", encoding="utf-8") as lf:
                            json.dump(library, lf, ensure_ascii=False, indent=2)
                        print(f"Updated media library config at {lib_path}")
                except Exception as e:
                    print(f"Failed to update media library config: {e}")

if __name__ == "__main__":
    convert_all()
