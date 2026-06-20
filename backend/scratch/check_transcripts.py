import os
import json

upload_dir = r"c:\Users\User\Desktop\VibeEdit AI\backend\uploads"
for f in os.listdir(upload_dir):
    if f.endswith("_transcript.json"):
        path = os.path.join(upload_dir, f)
        try:
            with open(path, "r", encoding="utf-8") as file:
                data = json.load(file)
            words = data.get("words", [])
            valid_words = [w.get("word") for w in words if "\ufffd" not in w.get("word", "")]
            invalid_words = [w.get("word") for w in words if "\ufffd" in w.get("word", "")]
            print(f"{f}: Total words={len(words)}, Valid={len(valid_words)}, Invalid={len(invalid_words)}")
            if len(words) > 0:
                print("  Sample word:", repr(words[0].get("word")))
        except Exception as e:
            print(f"Error reading {f}: {e}")
