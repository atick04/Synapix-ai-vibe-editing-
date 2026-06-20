import ffmpeg
import os
import json
import subprocess
import argparse
from app.services.pexels_service import download_broll

def format_ass_time(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    cents = int((seconds - int(seconds)) * 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{cents:02d}"

def get_animation_tag(style: str) -> str:
    """Return ASS override tags for the given animation preset."""
    # All positions are in PlayRes space: 1080x1920
    styles = {
        # Simple fade in/out — universally safe
        "fade":       r"{\fad(250,200)}",
        # TikTok pop — scale from 130% + alpha, snap to normal
        "pop":        r"{\fscx130\fscy130\alpha&HFF&\t(0,300,\fscx100\fscy100\alpha&H00&)}",
        # Slide from below — works for bottom alignment (alignment=2, marginV~250)
        "slide_up":   r"{\move(540,1820,540,1670,0,400)\fad(300,80)}",
        # Bounce — overshoot scale spring
        "bounce":     r"{\fscx140\fscy140\fad(100,0)\t(0,180,\fscx90\fscy90)\t(180,320,\fscx108\fscy108)\t(320,430,\fscx98\fscy98)\t(430,520,\fscx100\fscy100)}",
        # Glow burst — blur dissolves in
        "glow":       r"{\blur30\alpha&H88&\t(0,400,\blur0\alpha&H00&)}",
        # Slide from left
        "slide_left":  r"{\move(400,1670,540,1670,0,350)\fad(250,50)}",
        # Slide from right
        "slide_right": r"{\move(680,1670,540,1670,0,350)\fad(250,50)}",
        # No animation (still karaoke word-highlight via \k tags)
        "karaoke":    "",
    }
    return styles.get(style, styles["fade"])

def hex_to_ass_color(hex_str: str) -> str:
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 6:
        r, g, b = hex_str[0:2], hex_str[2:4], hex_str[4:6]
        return f"&H00{b}{g}{r}"
    return "&H00FFFFFF"

def color_to_ass(c: str) -> str:
    if not c:
        return "&H00FFFFFF"
    c_lower = c.lower()
    color_map = {
        "white": "&H00FFFFFF",
        "yellow": "&H0000D7FF", # Gold-yellow
        "green": "&H0055FF55",
        "red": "&H005555FF",
        "cyan": "&H00FFFF00",
        "black": "&H00000000",
        "blue": "&H00FF5555"
    }
    if c_lower in color_map:
        return color_map[c_lower]
    if c.startswith("#"):
        hex_str = c.lstrip('#')
        if len(hex_str) == 6:
            r, g, b = hex_str[0:2], hex_str[2:4], hex_str[4:6]
            return f"&H00{b}{g}{r}"
    return "&H00FFFFFF"

def opacity_to_ass_alpha(opacity: float) -> str:
    alpha = int((1.0 - opacity) * 255)
    alpha = min(255, max(0, alpha))
    return f"{alpha:02X}"

def generate_ass(transcript, filepath, position="center", font="Impact", font_size=110, use_outline=True, font_color="White", cuts=None, animation_style="fade", template_id=None, subtitle_edit=None):
    """Generate ASS subtitle file, adjusting timing for cut_out edits and injecting animation tags."""
    from app.services.template_service import get_template
    cuts = sorted(cuts or [], key=lambda c: c.get('start', 0))
    
    def remap_time(t):
        """Shift time t by the total duration of all cuts that start before t."""
        shift = 0.0
        for cut in cuts:
            cs, ce = cut.get('start', 0), cut.get('end', 0)
            if cs >= t:
                break
            # How much of this cut region is before t?
            shift += min(ce, t) - cs
        return max(0.0, t - shift)
    
    def in_cut(start, end):
        """Return True if the word/segment overlaps with any cut region."""
        for cut in cuts:
            cs, ce = cut.get('start', 0), cut.get('end', 0)
            if start < ce and end > cs:  # Overlap
                return True
        return False

    # Premium Margin and Positioning defaults
    base_font = font or "Inter"
    font_pairing = None
    font_size_val = font_size or 72
    text_main_color = "#FFFFFF"
    text_accent_color = "#FACC15" # Default yellow/gold
    text_case = "Sentence_Case"
    max_words = 3
    shadow_val = 3
    outline_val = 0
    alignment = 2
    margin_v = 180
    margin_l = 80
    margin_r = 80
    custom_x = None
    custom_y = None
    inactive_opacity = 0.45
    active_scale = 1.25
    use_aesthetic_styling = False

    if template_id:
        tpl = get_template(template_id)
        if tpl and tpl.subtitles:
            sub = tpl.subtitles
            if sub.font_management:
                use_aesthetic_styling = True
                base_font = sub.font_management.base_sans_font.replace("-Medium.ttf", "").replace(".ttf", "")
                font_pairing = sub.font_management.accent_serif_font.replace("-Italic.ttf", "").replace(".ttf", "").replace("CormorantGaramond", "Cormorant Garamond").replace("MarckScript-Regular", "Marck Script").replace("MarckScript", "Marck Script")
                font_size_val = sub.font_management.font_size_px
                
                if sub.color_palette:
                    text_main_color = sub.color_palette.text_main
                    text_accent_color = sub.color_palette.text_accent
                    
                if sub.layout:
                    text_case = sub.layout.text_case
                    max_words = sub.layout.max_words_per_screen
                    shadow_val = int(sub.layout.shadow_blur_px // 2) if sub.layout.shadow_blur_px else 3

    if subtitle_edit:
        if subtitle_edit.get("font"):
            base_font = subtitle_edit.get("font")
        if subtitle_edit.get("font_size"):
            font_size_val = int(subtitle_edit.get("font_size"))
        if subtitle_edit.get("font_color"):
            color_name_map = {
                "White": "#FFFFFF",
                "Yellow": "#FACC15",
                "Green": "#55FF55",
                "Red": "#FF5555",
                "Cyan": "#FFFF00"
            }
            text_main_color = color_name_map.get(subtitle_edit.get("font_color"), subtitle_edit.get("font_color"))
        if subtitle_edit.get("accent_color"):
            text_accent_color = subtitle_edit.get("accent_color")
        if subtitle_edit.get("font_pairing"):
            font_pairing = subtitle_edit.get("font_pairing")
        if subtitle_edit.get("inactive_opacity") is not None:
            inactive_opacity = float(subtitle_edit.get("inactive_opacity"))
        if subtitle_edit.get("active_scale") is not None:
            active_scale = float(subtitle_edit.get("active_scale"))
        if subtitle_edit.get("text_case"):
            text_case = subtitle_edit.get("text_case")
        if subtitle_edit.get("max_words"):
            max_words = int(subtitle_edit.get("max_words"))
            
        pos_preset = subtitle_edit.get("position") or position or "bottom"
        if pos_preset == "top":
            alignment = 8
            margin_v = 200
        elif pos_preset == "center":
            alignment = 5
            margin_v = 0
        elif pos_preset == "bottom":
            alignment = 2
            margin_v = 180
            
        if subtitle_edit.get("x") is not None:
            custom_x = float(subtitle_edit.get("x"))
        if subtitle_edit.get("y") is not None:
            custom_y = float(subtitle_edit.get("y"))
            
        use_outline = subtitle_edit.get("use_outline", use_outline)
        outline_val = 3 if use_outline else 0
        shadow_val = 3 if subtitle_edit.get("use_shadow", True) else 0
        if subtitle_edit.get("shadow_blur") is not None:
            shadow_val = int(float(subtitle_edit.get("shadow_blur")) / 4.0)
            shadow_val = min(10, max(0, shadow_val))

    main_col_ass = color_to_ass(text_main_color)
    accent_col_ass = color_to_ass(text_accent_color)
    outline_col_ass = "&H00000000"
    shadow_col_ass = "&H99000000"

    ass_header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Premium,{base_font},{font_size_val},{main_col_ass},{main_col_ass},{outline_col_ass},{shadow_col_ass},1,0,0,0,100,100,0,0,1,{outline_val},{shadow_val},{alignment},{margin_l},{margin_r},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(ass_header)
        
        anim = get_animation_tag(animation_style)
        
        words = transcript.get("words", [])
        if not words:
            segments = transcript.get("segments", [])
            for seg in segments:
                s, e = seg.get("start", 0.0), seg.get("end", 0.0)
                if in_cut(s, e):
                    continue
                start = format_ass_time(remap_time(s))
                end = format_ass_time(remap_time(e))
                text = seg.get('text', '').strip()
                if text_case == "UPPER":
                    text = text.upper()
                elif text_case == "lower":
                    text = text.lower()
                elif text_case == "Sentence_Case":
                    text = text.capitalize()
                f.write(f"Dialogue: 0,{start},{end},Premium,,0,0,0,,{anim}{text}\n")
            return

        # Group words into chunks of max_words, skip cut regions
        chunks, cur_chunk = [], []
        for w in words:
            ws, we = w.get('start', 0.0), w.get('end', 0.0)
            if in_cut(ws, we):
                if cur_chunk:
                    chunks.append(cur_chunk)
                    cur_chunk = []
                continue
            cur_chunk.append(w)
            if len(cur_chunk) == max_words:
                chunks.append(cur_chunk)
                cur_chunk = []
        if cur_chunk:
            chunks.append(cur_chunk)
            
        for chunk in chunks:
            # Build Dialogue line for each word being active in the chunk
            for active_i, active_w in enumerate(chunk):
                w_start = remap_time(active_w.get('start', 0.0))
                # Active word highlighting displays until the next word starts
                if active_i == len(chunk) - 1:
                    w_end = remap_time(chunk[-1].get('end', 0.0))
                else:
                    w_end = remap_time(chunk[active_i + 1].get('start', 0.0))
                
                if w_start >= w_end:
                    w_end = w_start + 0.1
                
                # Build styled text line for this state
                text_line = ""
                for i, w in enumerate(chunk):
                    word_str = w.get('word', '').strip()
                    
                    if text_case == "Sentence_Case":
                        if i == 0:
                            word_str = word_str.capitalize()
                        else:
                            word_str = word_str.lower()
                    elif text_case == "UPPER":
                        word_str = word_str.upper()
                    elif text_case == "lower":
                        word_str = word_str.lower()
                    
                    is_active = (i == active_i)
                    
                    w_font_size = font_size_val
                    if is_active:
                        w_font_size = int(font_size_val * active_scale)
                    
                    w_color = accent_col_ass if is_active else main_col_ass
                    w_alpha_tag = ""
                    if not is_active and inactive_opacity < 1.0:
                        w_alpha_tag = f"\\1a{opacity_to_ass_alpha(inactive_opacity)}&"
                    
                    # Font pairing
                    w_font = base_font
                    is_accent_word = False
                    if len(chunk) == 3:
                        is_accent_word = (i == 1)
                    elif len(chunk) == 2:
                        is_accent_word = (i == 1)
                    elif len(chunk) == 4:
                        is_accent_word = (i == 1 or i == 2)
                    elif len(chunk) > 4:
                        is_accent_word = (i == 1 or i == 3)
                        
                    if is_accent_word and font_pairing:
                        w_font = font_pairing
                    
                    tags = f"\\fn{w_font}\\fs{w_font_size}\\c{w_color}{w_alpha_tag}"
                    text_line += f"{{{tags}}}{word_str} "
                
                start_str = format_ass_time(w_start)
                end_str = format_ass_time(w_end)
                
                pos_tag = ""
                if custom_x is not None and custom_y is not None:
                    posX = int((custom_x / 100.0) * 1080)
                    posY = int((custom_y / 100.0) * 1920)
                    pos_tag = f"\\pos({posX},{posY})"
                
                f.write(f"Dialogue: 0,{start_str},{end_str},Premium,,0,0,0,,{{{pos_tag}}}{anim}{text_line.strip()}\n")

def extract_audio(video_path: str, output_audio_path: str) -> str:
    try:
        stream = ffmpeg.input(video_path)
        stream = ffmpeg.output(stream, output_audio_path, acodec='libmp3lame', q=4)
        ffmpeg.run(stream, overwrite_output=True, quiet=True)
        return output_audio_path
    except ffmpeg.Error as e:
        print(f"FFmpeg audio extraction error: {e.stderr.decode('utf8') if e.stderr else str(e)}")
        return ""


def apply_zoom(input_path: str, output_path: str, zoom_type: str,
               start: float, end: float, original_duration: float) -> bool:
    """
    Apply zoom-in or zoom-out to a specific segment using FFmpeg subprocess.
    Splits video into before/segment/after, applies scale+crop to the segment, then concats.
    zoom_in: scale to 150%, center-crop to original size.
    zoom_out: scale to 70%, pad with black borders.
    """
    try:
        before_out = output_path.replace('.mp4', '_z_before.mp4')
        seg_out = output_path.replace('.mp4', '_z_seg.mp4')
        after_out = output_path.replace('.mp4', '_z_after.mp4')
        list_file = output_path.replace('.mp4', '_z_list.txt')

        if zoom_type == "zoom_in":
            vf = "scale=iw*1.5:ih*1.5,crop=iw/1.5:ih/1.5"
        elif zoom_type == "zoom_out":
            vf = "scale=iw*0.7:ih*0.7,pad=iw/0.7:ih/0.7:(ow-iw)/2:(oh-ih)/2:black"
        else:
            return False

        segments = []

        if start > 0.1:
            subprocess.run([
                'ffmpeg', '-i', input_path, '-ss', '0', '-to', str(start),
                '-c', 'copy', before_out, '-y', '-loglevel', 'quiet'
            ], check=True)
            segments.append(before_out)

        subprocess.run([
            'ffmpeg', '-i', input_path,
            '-ss', str(start), '-to', str(end),
            '-vf', vf,
            '-c:v', 'libx264', '-c:a', 'aac',
            seg_out, '-y', '-loglevel', 'quiet'
        ], check=True)
        segments.append(seg_out)

        if end < original_duration - 0.1:
            subprocess.run([
                'ffmpeg', '-i', input_path, '-ss', str(end),
                '-c', 'copy', after_out, '-y', '-loglevel', 'quiet'
            ], check=True)
            segments.append(after_out)

        with open(list_file, 'w') as lf:
            for s in segments:
                lf.write(f"file '{os.path.abspath(s)}'\n")

        subprocess.run([
            'ffmpeg', '-f', 'concat', '-safe', '0', '-i', list_file,
            '-c', 'copy', output_path, '-y', '-loglevel', 'quiet'
        ], check=True)

        for tmp in [before_out, seg_out, after_out, list_file]:
            if os.path.exists(tmp):
                os.remove(tmp)

        print(f"[Zoom] ✅ {zoom_type} applied from {start}s to {end}s")
        return True
    except Exception as e:
        print(f"[Zoom] Error: {e}")
        return False


def apply_speed_ramp(input_path: str, output_path: str, start: float, end: float,
                     speed: float, original_duration: float) -> bool:
    """
    Speed up or slow down a segment using FFmpeg setpts + atempo.
    speed > 1.0 = faster, speed < 1.0 = slower.
    This approach processes the file in Python subprocess for precision.
    """
    try:
        pts_factor = round(1.0 / speed, 4)
        tempo = round(speed, 4)
        # Clamp atempo to 0.5-2.0 range
        tempo = max(0.5, min(2.0, tempo))

        # We split: before + sped segment + after, then concat
        before_out = output_path.replace('.mp4', '_sr_before.mp4')
        seg_out = output_path.replace('.mp4', '_sr_seg.mp4')
        after_out = output_path.replace('.mp4', '_sr_after.mp4')
        list_file = output_path.replace('.mp4', '_sr_list.txt')

        segments = []
        if start > 0:
            subprocess.run([
                'ffmpeg', '-i', input_path, '-ss', '0', '-to', str(start),
                '-c', 'copy', before_out, '-y', '-loglevel', 'quiet'
            ], check=True)
            segments.append(before_out)

        subprocess.run([
            'ffmpeg', '-i', input_path,
            '-ss', str(start), '-to', str(end),
            '-vf', f'setpts={pts_factor}*PTS',
            '-af', f'atempo={tempo}',
            seg_out, '-y', '-loglevel', 'quiet'
        ], check=True)
        segments.append(seg_out)

        if end < original_duration:
            subprocess.run([
                'ffmpeg', '-i', input_path, '-ss', str(end),
                '-c', 'copy', after_out, '-y', '-loglevel', 'quiet'
            ], check=True)
            segments.append(after_out)

        with open(list_file, 'w') as f:
            for s in segments:
                f.write(f"file '{os.path.abspath(s)}'\n")

        subprocess.run([
            'ffmpeg', '-f', 'concat', '-safe', '0', '-i', list_file,
            '-c', 'copy', output_path, '-y', '-loglevel', 'quiet'
        ], check=True)

        # Cleanup temp files
        for tmp in [before_out, seg_out, after_out, list_file]:
            if os.path.exists(tmp):
                os.remove(tmp)
        return True
    except Exception as e:
        print(f"[SpeedRamp] Error: {e}")
        return False

def build_drawtext_kwargs(text: str, start: float, end: float,
                           x: str = "(w-text_w)/2", y: str = "h*0.15",
                           fontsize: int = 72, color: str = "white") -> dict:
    """Build kwargs for FFmpeg drawtext filter."""
    safe_text = text.replace(":", "\\:")
    return {
        "text": safe_text,
        "fontsize": fontsize,
        "fontcolor": color,
        "x": x,
        "y": y,
        "enable": f"between(t,{start},{end})",
        "borderw": 4,
        "bordercolor": "black@0.8",
        "shadowx": 3,
        "shadowy": 3,
        "shadowcolor": "black@0.5",
        "font": "Arial",
    }

LUT_PRESETS = {
    "cinema": {"brightness": 1.0, "contrast": 1.1, "saturation": 1.1, "hue": 0},
    "vintage": {"brightness": 0.95, "contrast": 0.9, "saturation": 0.8, "hue": 5},
    "cyberpunk": {"brightness": 1.0, "contrast": 1.2, "saturation": 1.4, "hue": -10},
    "monochrome": {"brightness": 1.0, "contrast": 1.2, "saturation": 0.0, "hue": 0},
    "teal_orange": {"brightness": 1.0, "contrast": 1.1, "saturation": 1.2, "hue": 10},
    "vibrant": {"brightness": 1.0, "contrast": 1.1, "saturation": 1.3, "hue": 0},
    "cold": {"brightness": 1.0, "contrast": 1.05, "saturation": 0.9, "hue": -15},
    "warm": {"brightness": 1.05, "contrast": 1.0, "saturation": 1.1, "hue": 15}
}

def apply_color_corrections(stream, edits):
    cc_edits = [e for e in edits if e.get("action") == "color_correction"]
    for cc in cc_edits:
        cc_start = float(cc.get("start", 0))
        cc_end = float(cc.get("end", 0))
        if cc_start >= cc_end:
            continue
            
        preset_key = cc.get("preset") or cc.get("lut") or "cinema"
        base = LUT_PRESETS.get(preset_key, {"brightness": 1.0, "contrast": 1.0, "saturation": 1.0, "hue": 0})
        
        user_b = cc.get("brightness") if cc.get("brightness") is not None else 100
        user_c = cc.get("contrast") if cc.get("contrast") is not None else 100
        user_s = cc.get("saturation") if cc.get("saturation") is not None else 100
        user_h = cc.get("hue") if cc.get("hue") is not None else 0
        
        final_b = base["brightness"] * (user_b / 100.0)
        final_c = base["contrast"] * (user_c / 100.0)
        final_s = base["saturation"] * (user_s / 100.0)
        final_h = base["hue"] + user_h
        
        ffmpeg_b = final_b - 1.0
        ffmpeg_c = final_c
        ffmpeg_s = final_s
        ffmpeg_h = f"{final_h}*PI/180"
        
        stream = stream.filter('eq', brightness=ffmpeg_b, contrast=ffmpeg_c, saturation=ffmpeg_s, enable=f"between(t,{cc_start},{cc_end})")
        stream = stream.filter('hue', h=ffmpeg_h, enable=f"between(t,{cc_start},{cc_end})")
        
    return stream

def render_video(input_path: str, output_path: str, transcript_data: dict, edits: list, edl: dict = None, font: str = "Arial", font_size: int = 100, use_outline: bool = True, font_color: str = "White", template_id: str = None):
    """Advanced Rendering Pipeline using FFmpeg Concat, ASS overlays, Zoom, Speed, Text and EDL"""
    ass_path = output_path.replace(".mp4", ".ass")

    subtitle_edit = next((e for e in edits if e.get("action") == "add_subtitles"), None)
    has_subtitles = subtitle_edit is not None
    
    if has_subtitles:
        position = subtitle_edit.get("position", "center")
        font = subtitle_edit.get("font", font)
        font_size = subtitle_edit.get("font_size", font_size)
        use_outline = subtitle_edit.get("use_outline", use_outline)
        font_color = subtitle_edit.get("font_color", font_color)
        animation_style = subtitle_edit.get("animation_style", "fade")
    else:
        position = "center"
        animation_style = "fade"

    cuts = [e for e in edits if e.get("action") == "cut_out"]
    zoom_edits = [e for e in edits if e.get("action") == "camera_zoom"]
    speed_edits = [e for e in edits if e.get("action") == "speed_ramp"]
    text_overlays = [e for e in edits if e.get("action") == "add_text_overlay"]

    # Generate ASS AFTER parsing cuts so timing can be remapped
    print(f"[ASS] animation_style={animation_style}, position={position}, template_id={template_id}")
    generate_ass(transcript_data, ass_path, position=position, font=font, font_size=font_size, use_outline=use_outline, font_color=font_color, cuts=cuts, animation_style=animation_style, template_id=template_id, subtitle_edit=subtitle_edit)
    safe_ass = ass_path.replace("\\", "/")

    print(f"[Render] Step 0: Probing video metadata for {input_path}")
    try:
        # ffmpeg.probe() uses subprocess without timeout - can hang on iPhone HEVC.
        # Use our own timeout-safe probe instead.
        probe_result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', input_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30
        )
        if probe_result.returncode == 0:
            probe_data = json.loads(probe_result.stdout)
            duration = float(probe_data['format']['duration'])
            video_stream = next((s for s in probe_data['streams'] if s.get('codec_type') == 'video'), {})
            width = int(video_stream.get('width', 1080))
            height = int(video_stream.get('height', 1920))
            # iPhone HEVC stores frames in landscape with rotate=90/270 metadata
            # The actual display dimensions after rotation are swapped
            rotation = int(video_stream.get('tags', {}).get('rotate', 0))
            side_data = video_stream.get('side_data_list', [])
            for sd in side_data:
                if sd.get('side_data_type') == 'Display Matrix':
                    rotation = sd.get('rotation', rotation)
            if abs(rotation) in (90, 270):
                width, height = height, width
                print(f"[Render] Detected rotation={rotation}°, display dims swapped to {width}x{height}")
        else:
            raise RuntimeError(probe_result.stderr.decode(errors='replace')[:200])
    except subprocess.TimeoutExpired:
        print(f"[Render] ⏰ ffprobe timed out! Using defaults.")
        duration = 10000.0
        width, height = 1080, 1920
    except Exception as ex:
        print(f"[Render] probe error: {ex}, using defaults")
        duration = 10000.0
        width, height = 1080, 1920
    # Ensure dimensions are even numbers (required by libx264)
    width = width if width % 2 == 0 else width - 1
    height = height if height % 2 == 0 else height - 1
    print(f"[Render] Display dimensions: {width}x{height}, duration={duration:.1f}s")

    print(f"[Render] Step 1: Speed ramp edits={len(speed_edits)}")
    working_path = input_path
    if speed_edits:
        speed_tmp = output_path.replace('.mp4', '_speed.mp4')
        for se in speed_edits:
            speed = float(se.get('speed', 1.5))
            ok = apply_speed_ramp(working_path, speed_tmp, se.get('start', 0), se.get('end', duration), speed, duration)
            if ok:
                working_path = speed_tmp
                print(f"[SpeedRamp] Applied {speed}x on [{se.get('start')}-{se.get('end')}]")

    # --- Step 1b: Camera zoom (subprocess-based) ---
    if zoom_edits:
        zoom_tmp = output_path.replace('.mp4', '_zoom.mp4')
        for ze in zoom_edits:
            zoom_type = ze.get('type', 'zoom_in')
            z_start = float(ze.get('start', 0))
            z_end = float(ze.get('end', z_start + 2.0))
            print(f"[Zoom] Applying {zoom_type} from {z_start}s to {z_end}s")
            ok = apply_zoom(working_path, zoom_tmp, zoom_type, z_start, z_end, duration)
            if ok:
                working_path = zoom_tmp

    # --- Step 1c: Color correction (subprocess-based, before graphic overlays) ---
    cc_edits = [e for e in edits if e.get("action") == "color_correction"]
    if cc_edits:
        print(f"[RenderEngine] Applying {len(cc_edits)} color correction segments to source video...")
        color_tmp = output_path.replace('.mp4', '_color.mp4')
        filters = []
        for cc in cc_edits:
            cc_start = float(cc.get("start", 0))
            cc_end = float(cc.get("end", 0))
            if cc_start >= cc_end:
                continue
                
            preset_key = cc.get("preset") or cc.get("lut") or "cinema"
            base = LUT_PRESETS.get(preset_key, {"brightness": 1.0, "contrast": 1.0, "saturation": 1.0, "hue": 0})
            
            user_b = cc.get("brightness") if cc.get("brightness") is not None else 100
            user_c = cc.get("contrast") if cc.get("contrast") is not None else 100
            user_s = cc.get("saturation") if cc.get("saturation") is not None else 100
            user_h = cc.get("hue") if cc.get("hue") is not None else 0
            
            final_b = base["brightness"] * (user_b / 100.0)
            final_c = base["contrast"] * (user_c / 100.0)
            final_s = base["saturation"] * (user_s / 100.0)
            final_h = base["hue"] + user_h
            
            ffmpeg_b = final_b - 1.0
            ffmpeg_c = final_c
            ffmpeg_s = final_s
            ffmpeg_h = f"{final_h}*PI/180"
            
            filters.append(f"eq=brightness={ffmpeg_b}:contrast={ffmpeg_c}:saturation={ffmpeg_s}:enable='between(t,{cc_start},{cc_end})'")
            filters.append(f"hue=h='{ffmpeg_h}':enable='between(t,{cc_start},{cc_end})'")
            
        if filters:
            filter_str = ",".join(filters)
            cmd = [
                "ffmpeg", "-i", working_path,
                "-vf", filter_str,
                "-c:v", "libx264", "-c:a", "copy",
                "-preset", "fast",
                color_tmp, "-y", "-loglevel", "error"
            ]
            try:
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
                if res.returncode == 0 and os.path.exists(color_tmp):
                    working_path = color_tmp
                    print("[RenderEngine] ✅ Color correction subprocess applied successfully.")
                else:
                    print(f"[RenderEngine] Color correction subprocess failed: {res.stderr.decode(errors='replace')}")
            except subprocess.TimeoutExpired:
                print("[RenderEngine] ⏰ Color correction subprocess timed out!")

    # --- Step 2: Extract EDL tracks ---
    v1_keeps = []
    a1_keeps = []

    if edl and "v1" in edl and "a1" in edl:
        # User defined EDL tracks independent
        v_segs = edl.get("v1", [])
        a_segs = edl.get("a1", [])
        for seg in v_segs:
            v1_keeps.append((float(seg["start"]), float(seg["end"])))
        for seg in a_segs:
            a1_keeps.append((float(seg["start"]), float(seg["end"])))
    else:
        # Fallback to shared cut_outs logic
        if not cuts:
            v1_keeps.append((0.0, duration))
            a1_keeps.append((0.0, duration))
        else:
            cuts_sorted = sorted(cuts, key=lambda x: x['start'])
            current_time = 0.0
            for cut in cuts_sorted:
                if cut['start'] > current_time:
                    v1_keeps.append((current_time, cut['start']))
                    a1_keeps.append((current_time, cut['start']))
                current_time = max(current_time, cut['end'])
            if current_time < duration:
                v1_keeps.append((current_time, duration))
                a1_keeps.append((current_time, duration))

    print(f"[Render] Step 2: Building FFmpeg filter graph. v1_keeps={len(v1_keeps)}, a1_keeps={len(a1_keeps)}")
    # We must explicitly handle empty lists (meaning track is entirely muted)
    stream = ffmpeg.input(working_path)
    streams_v, streams_a = [], []

    if not v1_keeps: 
        # Create a dummy blank video if v1 is completely empty
        # A bit complex, but usually V1 is not totally empty
        pass
    else:
        for (start, end) in v1_keeps:
            # force consistent display dimensions to avoid concat 'parameters do not match'
            # (iPhone videos have rotation metadata that causes inconsistent segment sizes)
            v = (
                stream.video
                .trim(start=start, end=end)
                .setpts('PTS-STARTPTS')
                .filter('scale', width, height)
                .filter('setsar', '1')
            )
            streams_v.append(v)
            
    if not a1_keeps:
        pass
    else:
        for (start, end) in a1_keeps:
            a = stream.audio.filter('atrim', start=start, end=end).filter('asetpts', 'PTS-STARTPTS')
            streams_a.append(a)

    # Composite composite streams
    v_out = None
    a_out = None
    
    if streams_v:
        v_out = ffmpeg.concat(*streams_v, v=1, a=0) if len(streams_v) > 1 else streams_v[0]
    if streams_a:
        a_out = ffmpeg.concat(*streams_a, v=0, a=1) if len(streams_a) > 1 else streams_a[0]

    if not v_out or not a_out:
        print("[RenderEngine] Error: V1 or A1 is completely empty. Not supported in this simplified compositing format currently.")
        return False

    # --- Step 2.5: Mix Audio Assets (select_bgm, SFX, transitions) ---
    audio_edits = [e for e in edits if e.get("action") == "add_asset" and e.get("resolved_path")]
    if audio_edits and a_out is not None:
        print(f"[RenderEngine] Mixing {len(audio_edits)} audio assets onto A1...")
        mix_inputs = [a_out]
        
        for ae in audio_edits:
            asset_path = ae.get("resolved_path")
            
            # Resolve relative/absolute path safely on Windows
            if not os.path.isabs(asset_path):
                # Search in potential project folders
                for prefix in ("", "backend", "../backend", ".."):
                    p = os.path.join(prefix, asset_path)
                    if os.path.exists(p):
                        asset_path = p
                        break
            
            if not os.path.exists(asset_path):
                print(f"[RenderEngine] Audio asset not found: {ae.get('resolved_path')}")
                continue
                
            db = ae.get("volume", -20.0)
            vol_factor = 10 ** (db / 20.0)
            start_time = float(ae.get("start", 0.0))
            start_ms = int(start_time * 1000)
            
            # Load audio stream
            if ae.get("is_bgm"):
                # Loop background music automatically
                a_stream = ffmpeg.input(asset_path, stream_loop=-1).audio
            else:
                a_stream = ffmpeg.input(asset_path).audio
                
            # Apply volume and delay to start at correct timestamp
            a_processed = a_stream.filter('volume', vol_factor).filter('adelay', f"{start_ms}|{start_ms}")
            mix_inputs.append(a_processed)
            
        if len(mix_inputs) > 1:
            # Mix all streams into one without dropping main volume (normalize=0)
            a_out = ffmpeg.filter(mix_inputs, 'amix', inputs=len(mix_inputs), normalize=0)
            print(f"[RenderEngine] ✅ Mixed {len(mix_inputs) - 1} audio tracks successfully.")

    # --- Step 3: Camera zoom — already handled above via subprocess ---

    # --- Step 4: Text overlays (drawtext) ---
    if text_overlays:
        for to in text_overlays:
            x_pct = to.get('x', 50.0)
            y_pct = to.get('y', 78.0)
            w_pct = to.get('width', 82.0)
            raw_text = to.get('text', '')
            
            # Estimate wrapping based on width percentage
            fontsize = int(to.get('fontsize') or to.get('font_size') or 72)
            wrapped_text = raw_text
            if w_pct:
                max_w_px = (w_pct / 100.0) * width
                char_w = fontsize * 0.46
                words = raw_text.split(" ")
                lines = []
                current_line = []
                current_width = 0
                for word in words:
                    word_w = len(word) * char_w
                    if current_width + word_w > max_w_px and current_line:
                        lines.append(" ".join(current_line))
                        current_line = [word]
                        current_width = word_w
                    else:
                        current_line.append(word)
                        current_width += word_w + char_w
                if current_line:
                    lines.append(" ".join(current_line))
                wrapped_text = "\n".join(lines)

            # Map percent coordinates to FFmpeg math expressions
            x_expr = f"(w*{x_pct/100.0})-text_w/2"
            y_expr = f"(h*{y_pct/100.0})-text_h/2"
            
            kwargs = build_drawtext_kwargs(
                text=wrapped_text,
                start=float(to.get('start', 0)),
                end=float(to.get('end', 3)),
                fontsize=fontsize,
                color=to.get('font_color') or to.get('color') or 'white',
                x=x_expr,
                y=y_expr
            )
            v_out = v_out.drawtext(**kwargs)

    # --- Step 4.25: Motion Graphics via Remotion (Premium Quality) ---
    motion_edits = [e for e in edits if e.get("action") == "add_motion_graphic"]
    if motion_edits:
        for me in motion_edits:
            text = me.get("text", "Info")
            subtext = me.get("subtext", "")
            start = float(me.get("start", 0))
            end = float(me.get("end", start + 3))
            position = me.get("position", "top-right")
            style = me.get("style", "cinematic")  # cinematic | blueprint | liquid
            accent = me.get("accent_color", "#a78bfa")

            # Map position to FFmpeg overlay expression
            pos_map = {
                "top-right":    "W-w-60:60",
                "top-left":     "60:60",
                "bottom-right": "W-w-60:H-h-60",
                "bottom-left":  "60:H-h-60",
                "center":       "(W-w)/2:(H-h)/2",
                "left":         "60:(H-h)/2",
                "right":        "W-w-60:(H-h)/2",
            }
            pos_expr = pos_map.get(position, pos_map["top-right"])
            duration_sec = end - start
            duration_frames = min(89, max(30, int(duration_sec * 30)))  # Cap at 89 (composition is 90 frames)

            # Remotion dir
            remotion_dir = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "..", "remotion")
            )
            comp_map = {"cinematic": "CinematicDark", "blueprint": "TechBlueprint", "liquid": "LiquidOrganic"}
            composition = comp_map.get(style, "CinematicDark")

            # Write props JSON (avoids Windows quote-escaping issues)
            props_file = os.path.join(remotion_dir, "props", "_render_props.json")
            os.makedirs(os.path.dirname(props_file), exist_ok=True)
            import json as _json
            with open(props_file, "w", encoding="utf-8") as _f:
                _json.dump({
                    "styleType": style,
                    "text": text.upper(),
                    "subtext": subtext.upper(),
                    "accentColor": accent,
                    "transparent": True,   # Overlay mode: only the card, no background
                }, _f, ensure_ascii=False)

            overlay_path = os.path.abspath(working_path.replace(".mp4", f"_remotion_{int(start)}.webm"))
            overlay_output = os.path.abspath(working_path.replace(".mp4", f"_after_mg_{int(start)}.mp4"))

            print(f"[MotionGraphic] Rendering Remotion {composition} at t={start}s")

            # Step A: Render the Remotion template to transparent WebM
            # NOTE: shell=True is required on Windows because npx is a .cmd script
            # NOTE: Paths must be quoted to handle spaces in "montage AI" directory name
            # NOTE: yuva420p requires --image-format png for transparent frames
            # NOTE: --background-color=00000000 tells Remotion to use a transparent background
            render_cmd = (
                f'npx remotion render src/index.ts {composition}'
                f' "{overlay_path}"'
                f' "--props={props_file}"'
                f' --frames 0-{duration_frames - 1}'
                f' --codec vp8'
                f' --image-format png'
                f' --pixel-format yuva420p'
                f' --background-color 00000000'
                f' --log error'
            )
            try:
                render_result = subprocess.run(
                    render_cmd,
                    cwd=remotion_dir,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    shell=True,
                    timeout=120,  # 2 min max per graphic render
                )
            except subprocess.TimeoutExpired:
                print(f"[MotionGraphic] ⏰ Remotion render timed out, skipping")
                continue
            if render_result.returncode != 0:
                print(f"[MotionGraphic] Remotion failed: {render_result.stderr.decode(errors='replace')[:200]}")
                continue

            if not os.path.exists(overlay_path):
                print(f"[MotionGraphic] No overlay file produced, skipping")
                continue

            # Step B: Composite WebM onto source video with alpha support
            # format=yuva420p keeps the alpha channel through scale,
            # overlay format=auto uses it as transparency mask
            filter_complex = (
                f"[0:v]trim=0:{start},setpts=PTS-STARTPTS[before];"
                f"[0:v]trim={start}:{end},setpts=PTS-STARTPTS[during];"
                f"[0:v]trim={end},setpts=PTS-STARTPTS[after];"
                f"[1:v]scale=1920:1080,format=yuva420p[webm];"
                f"[during][webm]overlay=0:0:format=auto[during_out];"
                f"[before][during_out][after]concat=n=3:v=1:a=0[out]"
            )
            overlay_cmd = [
                "ffmpeg",
                "-i", working_path,
                "-i", overlay_path,
                "-filter_complex", filter_complex,
                "-map", "[out]",
                "-map", "0:a",
                "-c:v", "libx264",
                "-c:a", "aac",
                "-preset", "fast",
                overlay_output,
                "-y", "-loglevel", "error",
            ]
            try:
                ov_result = subprocess.run(overlay_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
            except subprocess.TimeoutExpired:
                print(f"[MotionGraphic] ⏰ FFmpeg overlay timed out, skipping")
                continue
            if ov_result.returncode == 0 and os.path.exists(overlay_output):
                os.replace(overlay_output, working_path)
                print(f"[MotionGraphic] ✅ Overlaid {composition} at {start}s")
            else:
                print(f"[MotionGraphic] FFmpeg overlay failed: {ov_result.stderr.decode()}")

            # Cleanup temp WebM
            if os.path.exists(overlay_path):
                os.remove(overlay_path)


    # --- Step 4.3: Dynamic Canvas (AI-assembled primitive scenes) ---
    dynamic_edits = [e for e in edits if e.get("action") == "add_dynamic_graphic"]
    if dynamic_edits:
        for de in dynamic_edits:
            elements = de.get("elements", [])
            start = float(de.get("start", 0))
            end = float(de.get("end", start + 3))
            if not elements:
                continue

            duration_sec = end - start
            duration_frames = min(89, max(30, int(duration_sec * 30)))

            remotion_dir = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "..", "remotion")
            )

            # Write elements JSON for DynamicCanvas
            props_file = os.path.join(remotion_dir, "props", "_dynamic_props.json")
            os.makedirs(os.path.dirname(props_file), exist_ok=True)
            import json as _json
            with open(props_file, "w", encoding="utf-8") as _f:
                _json.dump({"elements": elements}, _f, ensure_ascii=False)

            overlay_path = os.path.abspath(working_path.replace(".mp4", f"_dynamic_{int(start)}.webm"))
            overlay_output = os.path.abspath(working_path.replace(".mp4", f"_after_dyn_{int(start)}.mp4"))

            print(f"[DynamicCanvas] Rendering {len(elements)} elements at t={start}s")
            render_cmd = (
                f'npx remotion render src/index.ts DynamicCanvas'
                f' "{overlay_path}"'
                f' "--props={props_file}"'
                f' --frames 0-{duration_frames - 1}'
                f' --codec vp8'
                f' --image-format png'
                f' --pixel-format yuva420p'
                f' --background-color 00000000'
                f' --log error'
            )
            try:
                render_result = subprocess.run(
                    render_cmd, cwd=remotion_dir,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    shell=True, timeout=120,  # 2 min max per graphic render
                )
            except subprocess.TimeoutExpired:
                print(f"[DynamicCanvas] ⏰ Remotion render timed out, skipping")
                continue

            if render_result.returncode != 0 or not os.path.exists(overlay_path):
                err = render_result.stderr.decode(errors="replace")[:300]
                print(f"[DynamicCanvas] Render failed: {err}")
                continue

            # FFmpeg overlay at the correct timestamp
            offset = start
            filter_complex = (
                f"[0:v]trim=0:{offset},setpts=PTS-STARTPTS[before];"
                f"[0:v]trim={offset}:{end},setpts=PTS-STARTPTS[during_raw];"
                f"[0:v]trim={end},setpts=PTS-STARTPTS[after];"
                # ↓ format=yuva420p preserves alpha channel through scale
                f"[1:v]scale={width}:{height},format=yuva420p[overlay_sc];"
                f"[during_raw][overlay_sc]overlay=0:0:format=auto[during];"
                f"[before][during][after]concat=n=3:v=1:a=0[out]"
            )
            overlay_cmd = [
                "ffmpeg", "-i", working_path, "-i", overlay_path,
                "-filter_complex", filter_complex,
                "-map", "[out]", "-map", "0:a",
                "-c:v", "libx264", "-c:a", "aac", "-preset", "fast",
                overlay_output, "-y", "-loglevel", "error",
            ]
            try:
                ov_result = subprocess.run(overlay_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
            except subprocess.TimeoutExpired:
                print(f"[DynamicCanvas] ⏰ FFmpeg overlay timed out, skipping")
                continue
            if ov_result.returncode == 0 and os.path.exists(overlay_output):
                os.replace(overlay_output, working_path)
                print(f"[DynamicCanvas] ✅ Overlaid {len(elements)} elements at {start}s")
            else:
                print(f"[DynamicCanvas] FFmpeg failed: {ov_result.stderr.decode()[:200]}")

            if os.path.exists(overlay_path):
                os.remove(overlay_path)


    # --- Step 4.4: Hyperframes HTML Canvas & Semantic Scenes ---
    hyperframes_edits = [e for e in edits if e.get("action") in ("hyperframes_html", "canvas_overlay")]
    semantic_edits = [e for e in edits if e.get("action") == "semantic_scene" and e.get("scene_data")]
    
    if hyperframes_edits or semantic_edits:
        print(f"[Hyperframes] Found {len(hyperframes_edits)} html injections and {len(semantic_edits)} semantic scenes. Compositing...")
        hyperframes_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'hyperframes_studio'))
        os.makedirs(hyperframes_dir, exist_ok=True)
        
        # Bounding time box calculations
        import re
        min_start = float(duration)
        max_end = 0.0
        
        # Track starts and ends for both types of edits
        for e in hyperframes_edits:
            html = e.get("html_content", "")
            clip_matches = re.findall(r'<div[^>]*class=[\'"][^\'"]*clip[^\'"]*[\'"][^>]*>', html)
            starts = []
            durs = []
            for tag in clip_matches:
                s_m = re.search(r"data-start=['\"]([\d.]+)['\"]", tag)
                d_m = re.search(r"data-duration=['\"]([\d.]+)['\"]", tag)
                if s_m: starts.append(float(s_m.group(1)))
                if d_m: durs.append(float(d_m.group(1)))
                
            if starts:
                s = min(starts)
                if s < min_start: min_start = s
                d = max(durs) if durs else 5.0
                if s + d > max_end: max_end = s + d
                
        for e in semantic_edits:
            s = e.get("start", 0.0)
            e_end = e.get("end", s + 5.0)
            if s < min_start: min_start = s
            if e_end > max_end: max_end = e_end
                
        if max_end <= 0.1:
            max_end = float(duration)
                
        combined_html = "\n".join([e.get("html_content", "") for e in hyperframes_edits])
        
        # Construct semantic scene canvas elements and script code
        semantic_canvas_html = ""
        semantic_scripts = ""
        draw_calls = ""
        
        for idx, se in enumerate(semantic_edits):
            semantic_canvas_html += f'<canvas id="semantic-canvas-{idx}" width="1080" height="1920" style="position: absolute; top: 0; left: 0; width: 1080px; height: 1920px; pointer-events: none;"></canvas>\n'
            
            scene_data_json = json.dumps(se.get("scene_data"), ensure_ascii=False)
            start = se.get("start", 0.0)
            end = se.get("end", 5.0)
            
            semantic_scripts += f"""
            const sceneData_{idx} = {scene_data_json};
            const sceneStart_{idx} = {start};
            const sceneEnd_{idx} = {end};
            """
            
            draw_calls += f"drawSemanticScene('semantic-canvas-{idx}', sceneData_{idx}, sceneStart_{idx}, sceneEnd_{idx}, t);\n"

        # Scale the 1080x1920 design to the actual video resolution
        scale_factor = width / 1080.0
        
        if combined_html:
            combined_html = re.sub(r'data-width=[\'"]1080[\'"]', f'data-width="{width}"', combined_html)
            combined_html = re.sub(r'data-height=[\'"]1920[\'"]', f'data-height="{height}"', combined_html)
            
        html_doc = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={width}, height={height}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;700&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&family=Manrope:wght@400;700&family=Montserrat:wght@400;700;800&family=Playfair+Display:ital,wght@0,700;1,400&family=Rubik:wght@400;700&family=Unbounded:wght@700&display=swap" rel="stylesheet" />
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: {width}px; height: {height}px; overflow: hidden; background: transparent !important; }}
      .clip {{ position: absolute; }}
      #root {{ 
          width: 1080px !important; 
          height: 1920px !important; 
          transform-origin: top left !important; 
          transform: scale({scale_factor}) !important; 
      }}
    </style>
    <script>
      tailwind.config = {{
        theme: {{
          extend: {{
            fontFamily: {{
              inter: ['Inter', 'sans-serif'],
              montserrat: ['Montserrat', 'sans-serif'],
              rubik: ['Rubik', 'sans-serif'],
              manrope: ['Manrope', 'sans-serif'],
              unbounded: ['Unbounded', 'sans-serif'],
              comfortaa: ['Comfortaa', 'sans-serif'],
              mono: ['JetBrains Mono', 'monospace'],
              playfair: ['Playfair Display', 'serif']
            }}
          }}
        }}
      }}
    </script>
  </head>
  <body style="background: transparent;">
    <div id="root">
{combined_html}
{semantic_canvas_html}
    </div>
    <script>
      function drawRoundedRect(ctx, x, y, w, h, r) {{
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + w - r, y);
          ctx.arcTo(x + w, y, x + w, y + r, r);
          ctx.lineTo(x + w, y + h - r);
          ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
          ctx.lineTo(x + r, y + h);
          ctx.arcTo(x, y + h, x, y + h - r, r);
          ctx.lineTo(x, y + r);
          ctx.arcTo(x, y, x + r, y, r);
          ctx.closePath();
      }}
      function getEmojiForIcon(id) {{
          const mapping = {{
              'rocket': '🚀', 'fire': '🔥', 'warning': '⚠️', 'check': '✅',
              'star': '⭐', 'lightning': '⚡', 'chart': '📊', 'crm': '💻',
              'sales': '📈', 'money': '💰', 'arrow': '➡️', 'brain': '🧠'
          }};
          return mapping[id] || id;
      }}
      function drawArrowhead(ctx, fromX, fromY, toX, toY, size) {{
          const angle = Math.atan2(toY - fromY, toX - fromX);
          ctx.beginPath();
          ctx.moveTo(toX, toY);
          ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
      }}
      function drawSemanticScene(canvasId, sceneData, start, end, t) {{
          const canvas = document.getElementById(canvasId);
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const W = canvas.width;
          const H = canvas.height;
          ctx.clearRect(0, 0, W, H);
          if (t < start || t >= end) return;
          const styleProfile = sceneData.style_profile || {{}};
          const entities = sceneData.entities || [];
          const relations = sceneData.relations || [];
          const bgColor = styleProfile.bg_color || 'rgba(20, 20, 25, 0.65)';
          const borderColor = styleProfile.border_color || 'rgba(255, 255, 255, 0.15)';
          const glowColor = styleProfile.glow_color || 'rgba(255, 255, 255, 0.04)';
          const baseFontFamily = styleProfile.font_family || 'Inter, sans-serif';
          const elapsed = t - start;
          entities.forEach(entity => {{
              const xPercent = entity.x ?? 50;
              const yPercent = entity.y ?? 50;
              const wPercent = entity.width ?? 28;
              const hPercent = entity.height ?? 12;
              const targetX = (xPercent / 100) * W;
              const targetY = (yPercent / 100) * H;
              const targetW = (wPercent / 100) * W;
              const targetH = (hPercent / 100) * H;
              const anim = entity.animation || {{}};
              const animType = anim.type || 'fade';
              const animDuration = anim.duration || 0.6;
              const animDelay = anim.delay || 0.0;
              const progress = Math.min(1, Math.max(0, (elapsed - animDelay) / animDuration));
              let easeProgress = progress;
              if (anim.easing === 'linear') {{
                  easeProgress = progress;
              }} else if (anim.easing === 'bounce') {{
                  const c4 = (2 * Math.PI) / 3;
                  easeProgress = progress === 0 ? 0 : progress === 1 ? 1 : Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * c4) + 1;
              }} else {{
                  easeProgress = progress * progress * (3 - 2 * progress);
              }}
              let currentX = targetX;
              let currentY = targetY;
              let currentOpacity = 1.0;
              let currentScale = 1.0;
              let currentRotation = 0;
              const startOpacity = anim.opacity_start !== undefined ? anim.opacity_start : (animType === 'fade' || animType === 'pop' || animType === 'slide_in' ? 0.0 : 1.0);
              const endOpacity = anim.opacity_end !== undefined ? anim.opacity_end : 1.0;
              currentOpacity = startOpacity + (endOpacity - startOpacity) * easeProgress;
              const startScale = anim.scale_start !== undefined ? anim.scale_start : (animType === 'pop' ? 0.5 : 1.0);
              const endScale = anim.scale_end !== undefined ? anim.scale_end : 1.0;
              currentScale = startScale + (endScale - startScale) * easeProgress;
              const startRotation = anim.rotation_start !== undefined ? anim.rotation_start : 0;
              const endRotation = anim.rotation_end !== undefined ? anim.rotation_end : 0;
              currentRotation = startRotation + (endRotation - startRotation) * easeProgress;
              const xOffsetPercent = anim.x_offset !== undefined ? anim.x_offset : (animType === 'slide_in' ? -10 : 0);
              const yOffsetPercent = anim.y_offset !== undefined ? anim.y_offset : 0;
              const startX = targetX + (xOffsetPercent / 100) * W;
              const startY = targetY + (yOffsetPercent / 100) * H;
              currentX = startX + (targetX - startX) * easeProgress;
              currentY = startY + (targetY - startY) * easeProgress;
              ctx.save();
              ctx.globalAlpha = currentOpacity;
              if (currentScale !== 1.0) {{
                  ctx.translate(currentX, currentY);
                  ctx.scale(currentScale, currentScale);
                  ctx.translate(-currentX, -currentY);
              }}
              if (currentRotation !== 0) {{
                  ctx.translate(currentX, currentY);
                  ctx.rotate(currentRotation * Math.PI / 180);
                  ctx.translate(-currentX, -currentY);
              }}
              const styles = entity.styles || {{}};
              const itemBg = styles.bg_color || bgColor;
              const itemBorder = styles.border_color || borderColor;
              const itemGlow = styles.glow_color || glowColor;
              const itemFont = styles.font_family || baseFontFamily;
              
              if (entity.type === 'loading_bar' || entity.is_loading_bar) {{
                  // Render Apple-style loading bar
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                  ctx.strokeStyle = itemBorder;
                  ctx.lineWidth = 1.0;
                  drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, targetW, targetH, targetH / 2);
                  ctx.fill();
                  ctx.stroke();
                  
                  ctx.fillStyle = styleProfile.color_accent || '#0A84FF';
                  const activeW = targetW * easeProgress;
                  drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, activeW, targetH, targetH / 2);
                  ctx.fill();
                  
                  const textVal = entity.text || '';
                  if (textVal) {{
                      ctx.fillStyle = '#FFFFFF';
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.font = `bold ${{Math.round(targetH * 0.5)}}px ${{itemFont}}`;
                      ctx.fillText(textVal + ' ' + Math.round(easeProgress * 100) + '%', currentX, currentY);
                  }}
              }} else if (entity.type !== 'headline') {{
                  ctx.shadowColor = itemGlow;
                  ctx.shadowBlur = 28;
                  ctx.shadowOffsetY = 4;
                  ctx.fillStyle = itemBg;
                  ctx.strokeStyle = itemBorder;
                  ctx.lineWidth = 1.5;
                  drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, targetW, targetH, 16);
                  ctx.fill();
                  ctx.shadowColor = 'transparent';
                  ctx.shadowBlur = 0;
                  ctx.stroke();
              }}
              
              if (entity.type !== 'loading_bar' && !entity.is_loading_bar) {{
                  const textVal = entity.text || '';
                  if (textVal) {{
                      const lines = textVal.split('\\n');
                      const textColor = styles.color || '#F5F7FA';
                      const fontSize = styles.font_size || Math.round(H * 0.024);
                      ctx.fillStyle = textColor;
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.font = `${{styles.bold ? 'bold ' : ''}}${{styles.italic ? 'italic ' : ''}}${{fontSize}}px ${{itemFont}}`;
                      const totalTextHeight = lines.length * (fontSize * 1.35);
                      const startY = currentY - (totalTextHeight / 2) + (fontSize / 2);
                      lines.forEach((lineText, lIdx) => {{
                          ctx.fillText(lineText, currentX, startY + lIdx * (fontSize * 1.35));
                      }});
                  }}
                  const iconId = entity.asset_id || entity.icon;
                  if (entity.type === 'icon' && iconId) {{
                      ctx.fillStyle = styles.color || '#3B82F6';
                      ctx.font = `${{Math.round(targetH * 0.5)}}px ${{itemFont}}`;
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillText(getEmojiForIcon(iconId), currentX, currentY);
                  }}
              }}
              ctx.restore();
          }});
          relations.forEach(rel => {{
              const fromEnt = entities.find(e => e.id === rel.from);
              const toEnt = entities.find(e => e.id === rel.to);
              if (!fromEnt || !toEnt) return;
              const fromX = ( (fromEnt.x ?? 50) / 100 ) * W;
              const fromY = ( (fromEnt.y ?? 50) / 100 ) * H;
              const toX = ( (toEnt.x ?? 50) / 100 ) * W;
              const toY = ( (toEnt.y ?? 50) / 100 ) * H;
              ctx.save();
              ctx.strokeStyle = styleProfile.arrow_color || styleProfile.border_color || 'rgba(59, 130, 246, 0.6)';
              ctx.lineWidth = styleProfile.arrow_width || 3.0;
              const anim = styleProfile.relation_animation || {{}};
              const rDelay = anim.delay || 0.4;
              const rDur = anim.duration || 0.8;
              const rProgress = Math.min(1, Math.max(0, (elapsed - rDelay) / rDur));
              const rEase = rProgress * rProgress * (3 - 2 * rProgress);
              if (rProgress > 0) {{
                  const currentEndX = fromX + (toX - fromX) * rEase;
                  const currentEndY = fromY + (toY - fromY) * rEase;
                  ctx.beginPath();
                  ctx.moveTo(fromX, fromY);
                  ctx.lineTo(currentEndX, currentEndY);
                  ctx.stroke();
                  if (rProgress >= 0.95) {{
                      drawArrowhead(ctx, fromX, fromY, toX, toY, 12);
                  }}
              }}
              ctx.restore();
          }});
      }}
      
      {semantic_scripts}
      
      function drawAllScenes(t) {{
          {draw_calls}
      }}

      function scaleRoot(){{
        const r=document.getElementById('root');
        if(!r)return;
        const s=Math.min(window.innerWidth/1080,window.innerHeight/1920);
        r.style.transform='scale('+s+')';
        const scaledW=1080*s, scaledH=1920*s;
        r.style.left=((window.innerWidth-scaledW)/2)+'px';
        r.style.top=((window.innerHeight-scaledH)/2)+'px';
      }}
      window.addEventListener('resize',scaleRoot);
      scaleRoot();

      let isSynced = false;
      window.addEventListener('message', (event) => {{
          if (event.data && event.data.type === 'sync_time') {{
              isSynced = true;
              const t = event.data.time;
              if (window.__timelines && window.__timelines["main"]) {{
                  window.__timelines["main"].pause();
                  window.__timelines["main"].seek(t);
              }}
              drawAllScenes(t);
          }}
      }});
      
      function tick() {{
          requestAnimationFrame(tick);
      }}
      requestAnimationFrame(tick);
    </script>
  </body>
</html>"""
        
        os.makedirs(hyperframes_dir, exist_ok=True)
        idx_file = os.path.join(hyperframes_dir, "index.html")
        with open(idx_file, "w", encoding="utf-8") as f:
            f.write(html_doc)
        
        base_name, _ = os.path.splitext(working_path)
        # Bypassing Puppeteer/Chrome browser rendering completely to reduce CPU/RAM load.
        # Direct Pillow and FFmpeg rendering is kept as the single optimized graphics pipeline.
        browser_render_success = False
            
        # If browser rendering failed or skipped, execute the high-fidelity Pillow + FFmpeg fallback!
        if not browser_render_success and semantic_edits:
            print("[SemanticRenderer] Headless render failed. Activating high-fidelity Pillow & FFmpeg fallback overlay...")
            from app.services.semantic_renderer import render_semantic_scene_to_image
            
            for idx, se in enumerate(semantic_edits):
                start = float(se.get("start", 0.0))
                end = float(se.get("end", start + 5.0))
                scene_data = se.get("scene_data", {})
                
                # Render transparent PNG frame
                png_path = os.path.join(hyperframes_dir, f"semantic_fallback_{idx}.png")
                render_semantic_scene_to_image(scene_data, png_path, width=width, height=height)
                
                if os.path.exists(png_path):
                    temp_out = base_name + f"_fallback_blend_{idx}.mp4"
                    fallback_cmd = [
                        "ffmpeg", "-i", working_path,
                        "-i", png_path,
                        "-filter_complex", f"[0:v][1:v]overlay=0:0:format=auto:enable='between(t,{start},{end})'[outv]",
                        "-map", "[outv]", "-map", "0:a",
                        "-c:v", "libx264", "-c:a", "copy", "-preset", "fast",
                        temp_out, "-y", "-loglevel", "error"
                    ]
                    fallback_res = subprocess.run(fallback_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
                    if fallback_res.returncode == 0 and os.path.exists(temp_out):
                        os.replace(temp_out, working_path)
                        print(f"[SemanticRenderer] ✅ Pillow overlay successfully applied for scene {idx} ({start}s-{end}s)")
                    else:
                        print(f"[SemanticRenderer] FFmpeg fallback overlay failed: {fallback_res.stderr.decode()}")
                    
                    # Cleanup temp PNG
                    try:
                        os.remove(png_path)
                    except:
                        pass


    # --- Step 4.5: B-Roll overlay ---
    broll_edits = [e for e in edits if e.get("action") == "add_broll"]
    if broll_edits:
        for broll in broll_edits:
            start = float(broll.get("start", 0))
            end = float(broll.get("end", start + 3))
            duration = end - start
            
            broll_path = broll.get("resolved_path")
            if broll_path:
                if not os.path.isabs(broll_path):
                    for prefix in ("", "backend", "../backend", ".."):
                        p = os.path.join(prefix, broll_path)
                        if os.path.exists(p):
                            broll_path = p
                            break
                if not os.path.exists(broll_path):
                    broll_path = None
                    
            if not broll_path:
                q = broll.get("query", "technology")
                broll_path = download_broll(q, duration)
            if broll_path:
                print(f"[RenderEngine] Overlaying broll {broll_path} at {start}-{end}s")
                # Load B-Roll
                b_in = ffmpeg.input(broll_path).video
                # Scale and crop to target resolution, adjust PTS to start at exact timestamp
                b_scaled = b_in.filter('scale', width, height, force_original_aspect_ratio='increase').filter('crop', width, height).filter('setpts', f'PTS-STARTPTS+{start}/TB')
                # Apply user color correction to B-Roll
                b_scaled = apply_color_corrections(b_scaled, edits)
                # Overlay it onto main video
                v_out = ffmpeg.overlay(v_out, b_scaled, enable=f"between(t,{start},{end})", eof_action='pass')
            else:
                # Local professional fallback: Use the original input video stream, but apply a zoom + cyberpunk color grading!
                print(f"[RenderEngine] No Pexels B-Roll downloaded. Using cinematic fallback grade on input video at {start}-{end}s")
                b_scaled = (
                    ffmpeg.input(input_path).video
                    .filter('trim', start=start, end=end)
                    .filter('setpts', 'PTS-STARTPTS')
                    .filter('scale', width, height, force_original_aspect_ratio='increase')
                    .filter('crop', width, height)
                    .filter('eq', saturation=1.8, contrast=1.2, brightness=0.05)  # Professional pop color grading
                    .filter('hue', h="120")  # Cyberpunk gold/cyan tint
                    .filter('setpts', f'PTS-STARTPTS+{start}/TB')
                )
                # Apply user color correction on top of the fallback B-roll
                b_scaled = apply_color_corrections(b_scaled, edits)
                v_out = ffmpeg.overlay(v_out, b_scaled, enable=f"between(t,{start},{end})", eof_action='pass')

    # --- Step 5: Subtitles via separate subprocess pass (avoids Windows path/space issues) ---
    # We do NOT add the ASS filter to the main graph. Instead we run the main 
    # pipeline first, then apply subtitles in a second ffmpeg subprocess call.
    # This is necessary because ffmpeg's 'ass' filter on Windows fails silently
    # when the path contains spaces (e.g. "montage AI").

    def _run_ffmpeg_with_timeout(stream, timeout_sec=600):
        """Run ffmpeg-python stream with a hard timeout to prevent infinite hangs."""
        proc = stream.run_async(pipe_stdout=True, pipe_stderr=True, overwrite_output=True)
        try:
            _, stderr_bytes = proc.communicate(timeout=timeout_sec)
            if proc.returncode != 0:
                return False, stderr_bytes.decode("utf-8", errors="replace")
            return True, ""
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            return False, f"FFmpeg timed out after {timeout_sec}s"

    try:
        if has_subtitles and a_out is not None:
            pre_sub_output = output_path.replace('.mp4', '_presub.mp4')
            out = ffmpeg.output(v_out, a_out, pre_sub_output, vcodec='libx264', acodec='aac', preset='fast')
            ok, err = _run_ffmpeg_with_timeout(out)
            if not ok:
                print(f"[RenderEngine] Main FFmpeg FAILED: {err[:300]}")
                return False
        else:
            out = ffmpeg.output(v_out, a_out, output_path, vcodec='libx264', acodec='aac', preset='fast')
            ok, err = _run_ffmpeg_with_timeout(out)
            if not ok:
                print(f"[RenderEngine] Main FFmpeg FAILED: {err[:300]}")
                return False
            return True
    except Exception as e:
        print(f"[RenderEngine] Main FFmpeg Exception: {e}")
        return False

    # --- Step 6: Apply ASS subtitles via subprocess (Windows-safe) ---
    if has_subtitles and os.path.exists(ass_path) and os.path.exists(pre_sub_output):
        import tempfile, shutil
        
        temp_dir = tempfile.gettempdir()
        # Use a SIMPLE filename with no colons/spaces/special chars for the filter string
        simple_ass_name = "montage_sub_tmp.ass"
        temp_ass_path = os.path.join(temp_dir, simple_ass_name)
        shutil.copy2(ass_path, temp_ass_path)
        
        # Copy fonts dir to temp (no spaces in path)
        fonts_src = os.path.abspath('fonts')
        temp_fonts = os.path.join(temp_dir, 'montage_fonts')
        if os.path.exists(fonts_src) and not os.path.exists(temp_fonts):
            try:
                shutil.copytree(fonts_src, temp_fonts)
            except Exception as e:
                print(f"[Subtitles] Font copy warning: {e}")
        
        # KEY FIX: Run FFmpeg from temp_dir using RELATIVE filename in filter string.
        # This avoids ALL Windows path escaping issues (drive letter colons, spaces).
        # -i and output use absolute paths which FFmpeg handles normally.
        if os.path.exists(temp_fonts):
            vf_filter = f"ass=filename={simple_ass_name}:fontsdir=montage_fonts"
        else:
            vf_filter = f"ass={simple_ass_name}"
        
        abs_presub = os.path.abspath(pre_sub_output)
        abs_output = os.path.abspath(output_path)
        
        print(f"[Subtitles] cwd={temp_dir}, filter={vf_filter}")
        
        try:
            result = subprocess.run(
                ['ffmpeg', '-i', abs_presub, '-vf', vf_filter,
                 '-c:a', 'copy', abs_output, '-y', '-loglevel', 'warning'],
                cwd=temp_dir,
                stderr=subprocess.PIPE, stdout=subprocess.PIPE,
                timeout=300,  # 5 min max for subtitle burn-in
            )
            
            if result.returncode != 0:
                err = result.stderr.decode('utf-8', errors='replace')
                print(f"[Subtitles] FAILED (code {result.returncode}): {err}")
                shutil.move(abs_presub, abs_output)
            else:
                if os.path.exists(abs_presub):
                    os.remove(abs_presub)
                print(f"[Subtitles] SUCCESS")
        except Exception as e:
            print(f"[Subtitles] Exception: {e}")
            if os.path.exists(abs_presub):
                shutil.move(abs_presub, abs_output)
        
        return True
    
    # --- Step 7: Audio normalization (loudnorm) ---
    # Equalizes volume: makes quiet parts louder, loud parts softer
    if os.path.exists(output_path):
        print("[Audio] Applying loudnorm normalization...")
        norm_output = output_path.replace('.mp4', '_norm.mp4')
        try:
            norm_result = subprocess.run(
                ['ffmpeg', '-i', output_path,
                 '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
                 '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                 norm_output, '-y', '-loglevel', 'warning'],
                stderr=subprocess.PIPE, stdout=subprocess.PIPE,
                timeout=300,
            )
            if norm_result.returncode == 0 and os.path.exists(norm_output):
                os.replace(norm_output, output_path)
                print("[Audio] ✅ Loudnorm normalization applied successfully")
            else:
                err = norm_result.stderr.decode('utf-8', errors='replace')
                print(f"[Audio] Normalization failed (non-critical): {err[:200]}")
                if os.path.exists(norm_output):
                    os.remove(norm_output)
        except Exception as e:
            print(f"[Audio] Normalization exception (non-critical): {e}")
            if os.path.exists(norm_output):
                os.remove(norm_output)
    
    return True


async def render_hyperframes_composition(file_id: str, html_content: str, callback) -> str:
    from app.main import TMP_DIR
    hyperframes_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../hyperframes_studio"))
    
    # Save html to hyperframes_studio/index.html
    html_path = os.path.join(hyperframes_dir, "index.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
        
    output_path = os.path.abspath(os.path.join(TMP_DIR, f"{file_id}_hyperframes.mp4"))
    
    if callback:
        await callback("🖌️ Запуск Hyperframes движка (рендеринг в браузере)...")
    
    cmd = [
        "npx", "--yes", "hyperframes", "render",
        "--output", output_path
    ]
    
    import asyncio
    process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=hyperframes_dir,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    stdout, stderr = await process.communicate()
    
    if process.returncode != 0:
        err = stderr.decode('utf-8', errors='replace')
        print(f"[Hyperframes] Render failed: {err}")
        return ""
        
    print(f"[Hyperframes] SUCCESS -> {output_path}")
    return output_path

