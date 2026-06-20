import os

ass_path = r"c:\Users\User\Desktop\VibeEdit AI\backend\uploads\f90bf311-1d8c-4895-af39-7f92d80edce3_test_render.ass"

if os.path.exists(ass_path):
    with open(ass_path, "rb") as f:
        data = f.read()
    
    # Try decoding as utf-8, ignore errors
    text = data.decode("utf-8", errors="replace")
    print("Length of file:", len(data))
    print("Does it contain invalid repl characters (\\ufffd)?", "\ufffd" in text)
    
    # Print lines that contain Dialogue using raw representation to see exact unicode characters
    lines = text.split("\n")
    dialogue_lines = [l for l in lines if l.startswith("Dialogue:")]
    print("Dialogue lines (first 10, raw):")
    for l in dialogue_lines[:10]:
        print(repr(l))
else:
    print("ASS file not found!")
