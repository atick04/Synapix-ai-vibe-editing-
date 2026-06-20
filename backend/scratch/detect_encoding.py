import json
import os

transcript_path = r"c:\Users\User\Desktop\VibeEdit AI\backend\uploads\f90bf311-1d8c-4895-af39-7f92d80edce3_transcript.json"

if os.path.exists(transcript_path):
    print("Transcript size:", os.path.getsize(transcript_path))
    # Let's try reading as cp1251 and utf-8 to see which one works
    for enc in ["utf-8", "cp1251", "latin-1"]:
        try:
            with open(transcript_path, "r", encoding=enc) as f:
                data = json.load(f)
            print(f"Success loading with {enc}!")
            words = data.get("words", [])
            print(f"Number of words: {len(words)}")
            if words:
                print("First 10 words:")
                for w in words[:10]:
                    print(repr(w.get("word")))
            break
        except Exception as e:
            print(f"Failed loading with {enc}: {e}")
else:
    print("Transcript not found!")
