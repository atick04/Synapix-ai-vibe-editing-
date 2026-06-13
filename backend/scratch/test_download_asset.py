import urllib.request
import json
import os

def test_download():
    # Make sure we clean up any previous file for test accuracy
    test_filepath = "uploads/stock_sticker_emoji_1f525.png"
    if os.path.exists(test_filepath):
        os.remove(test_filepath)
        
    url = "http://localhost:8000/api/video/download_asset"
    payload = {
        "asset_id": "stock_sticker_emoji_1f525",
        "url": "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f525.png",
        "type": "sticker",
        "file_id": "test_project_session"
    }
    
    headers = {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    
    try:
        print(f"Testing POST {url} ...")
        with urllib.request.urlopen(req) as res:
            data = json.loads(res.read().decode())
            print("Response:", json.dumps(data, indent=2))
            
            # Check if file actually exists on disk
            if os.path.exists(test_filepath):
                print(f"✅ Success: File exists at {test_filepath} with size {os.path.getsize(test_filepath)} bytes")
            else:
                print(f"❌ Error: File not found at {test_filepath}")
    except Exception as e:
        print("Download test failed:", e)

if __name__ == "__main__":
    test_download()
