"""
Download Cyrillic-capable font files for export / ASS / canvas fallbacks.
Prefer Google Fonts GitHub OFL TTF (full glyph coverage) over latin-only fontsource woff2.
"""
import os
import requests

out_dir = os.path.join(os.getcwd(), "fonts")
os.makedirs(out_dir, exist_ok=True)

# Raw TTF from google/fonts (Cyrillic included for these families)
FONTS = {
    "Inter_24pt-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bslnt%2Cwght%5D.ttf",
    "Montserrat-ExtraBold.ttf": "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf",
    "Manrope-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/manrope/Manrope%5Bwght%5D.ttf",
    "Rubik-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/rubik/Rubik%5Bwght%5D.ttf",
    "Oswald-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/oswald/Oswald%5Bwght%5D.ttf",
    "Comfortaa-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/comfortaa/Comfortaa%5Bwght%5D.ttf",
    "JetBrainsMono-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
    "IBMPlexSans-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/ibmplexsans/IBMPlexSans-Bold.ttf",
    "Unbounded-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/unbounded/Unbounded%5Bwght%5D.ttf",
    "PlayfairDisplay-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf",
    # Latin-forward accent (avoid for primary Cyrillic titles)
    "Lobster-Regular.ttf": "https://github.com/google/fonts/raw/main/ofl/lobster/Lobster-Regular.ttf",
    "BebasNeue-Regular.ttf": "https://github.com/google/fonts/raw/main/ofl/bebasneue/BebasNeue-Regular.ttf",
}

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

print(f"Saving Cyrillic-capable fonts to: {out_dir}\n")
for filename, url in FONTS.items():
    dest = os.path.join(out_dir, filename)
    if os.path.exists(dest) and os.path.getsize(dest) > 50_000:
        print(f"  OK {filename} already exists ({os.path.getsize(dest)//1024}KB)")
        continue
    print(f"  Downloading {filename} ...")
    try:
        res = requests.get(url, headers=headers, timeout=60)
        if res.status_code == 200 and len(res.content) > 1000:
            with open(dest, "wb") as f:
                f.write(res.content)
            print(f"    -> OK ({len(res.content)//1024}KB)")
        else:
            print(f"    -> FAILED HTTP {res.status_code}, size={len(res.content)}")
    except Exception as e:
        print(f"    -> ERROR: {e}")

print("\nDone! Prefer Montserrat / Inter / Rubik / Unbounded for Russian titles.")
