import os
import subprocess
import tempfile
import json
import glob
from PIL import Image

def generate_speaker_mask_video(video_path: str) -> str:
    """
    Extracts frames from video, runs rembg to isolate the speaker,
    saves the alpha channel (mask) for each frame, and compiles
    a grayscale mask video file (black = background, white = subject).
    """
    # Make video_path absolute and standard
    video_path = os.path.abspath(video_path).replace("\\", "/")
    if not os.path.exists(video_path):
        print(f"[Masking Service] Input video not found: {video_path}")
        return None
        
    base_dir = os.path.dirname(video_path).replace("\\", "/")
    file_id = os.path.splitext(os.path.basename(video_path))[0]
    output_mask_path = os.path.join(base_dir, f"{file_id}_mask.mp4").replace("\\", "/")

    # If already generated and valid, return it
    if os.path.exists(output_mask_path) and os.path.getsize(output_mask_path) > 0:
        return output_mask_path

    # Get video properties (fps)
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=r_frame_rate,duration",
        "-of", "json", video_path
    ]
    fps = 24.0
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        probe = json.loads(res.stdout)
        r_fps = probe["streams"][0]["r_frame_rate"]
        if "/" in r_fps:
            num, den = map(float, r_fps.split("/"))
            fps = num / den
        else:
            fps = float(r_fps)
    except Exception as e:
        print(f"[Masking Service] Failed to probe video fps: {e}. Defaulting to 24fps.")

    print(f"[Masking Service] Generating speaker mask for {video_path} at {fps} fps...")

    try:
        from rembg import remove
    except ImportError:
        print("[Masking Service] Error: rembg is not installed in the environment.")
        return None

    import uuid
    tmp_dir = os.path.join(base_dir, f"tmp_mask_{uuid.uuid4().hex[:8]}").replace("\\", "/")
    input_frames_dir = os.path.join(tmp_dir, "input").replace("\\", "/")
    output_frames_dir = os.path.join(tmp_dir, "output").replace("\\", "/")
    os.makedirs(input_frames_dir, exist_ok=True)
    os.makedirs(output_frames_dir, exist_ok=True)

    try:
        # 1. Extract frames from original video (resize height to 540 for 5x speedup)
        # Use -map 0:v:0 to only extract the video stream
        cmd = [
            "ffmpeg", "-i", video_path,
            "-map", "0:v:0",
            "-vf", "scale=-2:540",
            os.path.join(input_frames_dir, "frame_%04d.png").replace("\\", "/"),
            "-y", "-loglevel", "error"
        ]
        try:
            subprocess.run(cmd, check=True)
        except Exception as e:
            print(f"[Masking Service] FFmpeg frame extraction failed: {e}")
            return None

        # 2. Segment each frame and extract alpha channel
        frames = sorted(glob.glob(os.path.join(input_frames_dir, "frame_*.png")))
        if not frames:
            print("[Masking Service] No frames extracted.")
            return None

        print(f"[Masking Service] Processing {len(frames)} frames with rembg ONNX...")
        for i, frame_path in enumerate(frames):
            try:
                # Open frame
                with Image.open(frame_path) as img:
                    # Remove background
                    subject_rgba = remove(img)
                    # Extract alpha channel
                    alpha = subject_rgba.split()[-1]
                    # Save alpha channel as a grayscale PNG
                    out_name = f"mask_{i+1:04d}.png"
                    alpha.save(os.path.join(output_frames_dir, out_name))
            except Exception as e:
                print(f"[Masking Service] Failed processing frame {i}: {e}")
                # Save black frame as fallback
                try:
                    with Image.open(frame_path) as img:
                        black_frame = Image.new("L", (img.width, img.height), 0)
                        black_frame.save(os.path.join(output_frames_dir, f"mask_{i+1:04d}.png"))
                except Exception:
                    pass

        # 3. Assemble mask frames back into a grayscale MP4 video
        cmd = [
            "ffmpeg", "-y", "-framerate", str(fps),
            "-i", os.path.join(output_frames_dir, "mask_%04d.png").replace("\\", "/"),
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "veryfast",
            output_mask_path.replace("\\", "/"),
            "-loglevel", "error"
        ]
        try:
            subprocess.run(cmd, check=True)
            print(f"[Masking Service] Successfully saved mask video: {output_mask_path}")
            return output_mask_path
        except Exception as e:
            print(f"[Masking Service] FFmpeg mask video assembly failed: {e}")
            return None
    finally:
        # Clean up temporary directory
        import shutil
        if os.path.exists(tmp_dir):
            try:
                shutil.rmtree(tmp_dir)
            except Exception as ce:
                print(f"[Masking Service] Temporary folder cleanup warning: {ce}")


def apply_speaker_masking(sub_free_path: str, subtitled_path: str, mask_edit: dict, width: int, height: int) -> bool:
    """
    Applies speaker segmentation and overlay effects (behind_text, blur_bg, replace_bg)
    using the masking service and FFmpeg alphamerge.
    """
    import shutil
    effect_type = mask_edit.get("effect_type", "behind_text")
    blur_strength = mask_edit.get("blur_strength", 10.0)
    
    print(f"[Masking] Applying speaker masking effect: {effect_type}...")
    
    # Make paths absolute and standard
    sub_free_path = os.path.abspath(sub_free_path).replace("\\", "/")
    subtitled_path = os.path.abspath(subtitled_path).replace("\\", "/")
    
    # 1. Run masking service to get the grayscale mask video
    mask_path = generate_speaker_mask_video(sub_free_path)
    if not mask_path or not os.path.exists(mask_path):
        print("[Masking] Failed to generate speaker mask video. Skipping effect.")
        return False
        
    temp_out = subtitled_path.replace(".mp4", "_masked_temp.mp4")
    
    # 2. Build FFmpeg command based on the effect
    if effect_type in ("behind_text", "blur_bg"):
        # Overlay the speaker (sub_free) on top of the subtitled/blurred video
        cmd = [
            "ffmpeg", "-y",
            "-i", subtitled_path,
            "-i", sub_free_path,
            "-i", mask_path,
            "-filter_complex", f"[2:v]scale={width}:{height}[scaled_mask];[1:v][scaled_mask]alphamerge[masked];[0:v][masked]overlay=shortest=1[out]",
            "-map", "[out]",
            "-map", "0:a?",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-c:a", "copy",
            temp_out
        ]
    elif effect_type == "replace_bg":
        # Overlay masked speaker on top of solid black canvas
        cmd = [
            "ffmpeg", "-y",
            "-i", subtitled_path,
            "-i", sub_free_path,
            "-i", mask_path,
            "-filter_complex", f"[2:v]scale={width}:{height}[scaled_mask];[1:v][scaled_mask]alphamerge[masked];color=c=black:s={width}x{height}[bg];[bg][masked]overlay=shortest=1[out]",
            "-map", "[out]",
            "-map", "0:a?",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-c:a", "copy",
            temp_out
        ]
    else:
        return False
        
    try:
        res = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if os.path.exists(temp_out):
            if os.path.exists(subtitled_path):
                os.remove(subtitled_path)
            shutil.move(temp_out, subtitled_path)
            print("[Masking] Successfully applied speaker masking!")
            return True
    except Exception as e:
        err_msg = ""
        if hasattr(e, "stderr") and e.stderr:
            err_msg = e.stderr.decode("utf-8", errors="replace")
        print(f"[Masking] FFmpeg masking apply failed: {e}. Stderr: {err_msg}")
        if os.path.exists(temp_out):
            os.remove(temp_out)
            
    return False
