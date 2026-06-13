import urllib.request
import json

def test_endpoints():
    try:
        # Test stickers search
        url_stickers = "http://localhost:8000/api/video/search_stickers?query=fire"
        print(f"Testing GET {url_stickers} ...")
        with urllib.request.urlopen(url_stickers) as res:
            data = json.loads(res.read().decode())
            print(f"Stickers matched: {len(data)}")
            print("First item:", json.dumps(data[0], indent=2, ensure_ascii=False) if data else "None")
        
        # Test music search
        url_music = "http://localhost:8000/api/video/search_music?query=cozy"
        print(f"\nTesting GET {url_music} ...")
        with urllib.request.urlopen(url_music) as res:
            data = json.loads(res.read().decode())
            print(f"Music matched: {len(data)}")
            print("First item:", json.dumps(data[0], indent=2, ensure_ascii=False) if data else "None")
            
    except Exception as e:
        print("Test failed with error:", e)

if __name__ == "__main__":
    test_endpoints()
