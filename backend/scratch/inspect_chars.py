import json
import os

transcript_path = r"c:\Users\User\Desktop\VibeEdit AI\backend\uploads\f90bf311-1d8c-4895-af39-7f92d80edce3_transcript.json"

if os.path.exists(transcript_path):
    with open(transcript_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    words = data.get("words", [])
    if words:
        w = words[0].get("word", "")
        print("Word:", repr(w))
        print("Chars and their unicode points:")
        for c in w:
            print(f"  char={repr(c)}, code={ord(c):04X}")
else:
    print("Transcript not found!")
