import os
import uuid
import yt_dlp

def download_youtube_segment(query_or_url: str, start_time: float, duration: float) -> str:
    """
    Search for a video on YouTube (or use direct URL), download the specified segment,
    and save it in uploads/ as an mp4 file.
    """
    os.makedirs("uploads", exist_ok=True)
    url = query_or_url
    
    # If query is not a direct URL, search on YouTube first
    if not (query_or_url.startswith("http://") or query_or_url.startswith("https://")):
        print(f"[YouTube Service] Searching YouTube for: '{query_or_url}'...")
        ydl_opts = {
            'quiet': True,
            'default_search': 'ytsearch',
            'noprogress': True,
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"ytsearch1:{query_or_url}", download=False)
                if 'entries' in info and len(info['entries']) > 0:
                    url = info['entries'][0]['webpage_url']
                    title = info['entries'][0].get('title', 'Unknown')
                    print(f"[YouTube Service] Found top video: '{title}' ({url})")
                else:
                    print(f"[YouTube Service] No videos found for query: '{query_or_url}'")
                    return None
        except Exception as e:
            print(f"[YouTube Service] Search query failed: {e}")
            return None

    # Download specific segment using yt-dlp download_ranges
    output_filename = f"uploads/youtube_broll_{uuid.uuid4().hex[:8]}.mp4"
    print(f"[YouTube Service] Downloading segment {start_time}s - {start_time + duration}s from {url}...")
    
    ydl_opts = {
        'format': 'best[ext=mp4]/best',
        'outtmpl': output_filename,
        'quiet': True,
        'download_ranges': lambda info_dict, ydl: [{'start_time': start_time, 'end_time': start_time + duration}],
        'force_keyframes_at_cuts': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
            
        if os.path.exists(output_filename):
            print(f"[YouTube Service] Segment successfully downloaded to: {output_filename}")
            return output_filename
        else:
            # Fallback search in case of extension/naming mismatch
            import glob
            matches = glob.glob(output_filename.replace(".mp4", "*"))
            if matches:
                # Rename the best match to output_filename if different
                best_match = matches[0]
                if best_match != output_filename:
                    os.rename(best_match, output_filename)
                print(f"[YouTube Service] Segment found via fallback: {output_filename}")
                return output_filename
            print("[YouTube Service] Error: Output file not found after download.")
            return None
    except Exception as e:
        print(f"[YouTube Service] Download failed: {e}")
        return None
