import os

video_service_path = r"c:\Users\User\Desktop\VibeEdit AI\backend\app\services\video_service.py"
video_api_path = r"c:\Users\User\Desktop\VibeEdit AI\backend\app\api\video.py"

# Read video_service.py
with open(video_service_path, "r", encoding="utf-8") as f:
    service_content = f.read()

# Define the new color_to_ass and opacity_to_ass_alpha helper functions and the new generate_ass function
new_helper_and_generate_ass = """def color_to_ass(c: str) -> str:
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
    \"\"\"Generate ASS subtitle file, adjusting timing for cut_out edits and injecting animation tags.\"\"\"
    from app.services.template_service import get_template
    cuts = sorted(cuts or [], key=lambda c: c.get('start', 0))
    
    def remap_time(t):
        \"\"\"Shift time t by the total duration of all cuts that start before t.\"\"\"
        shift = 0.0
        for cut in cuts:
            cs, ce = cut.get('start', 0), cut.get('end', 0)
            if cs >= t:
                break
            # How much of this cut region is before t?
            shift += min(ce, t) - cs
        return max(0.0, t - shift)
    
    def in_cut(start, end):
        \"\"\"Return True if the word/segment overlaps with any cut region.\"\"\"
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

    ass_header = f\"\"\"[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Premium,{base_font},{font_size_val},{main_col_ass},{main_col_ass},{outline_col_ass},{shadow_col_ass},1,0,0,0,100,100,0,0,1,{outline_val},{shadow_val},{alignment},{margin_l},{margin_r},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
\"\"\"
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
                f.write(f"Dialogue: 0,{start},{end},Premium,,0,0,0,,{anim}{text}\\n")
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
                        w_alpha_tag = f"\\\\1a{opacity_to_ass_alpha(inactive_opacity)}&"
                    
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
                    
                    tags = f"\\\\fn{w_font}\\\\fs{w_font_size}\\\\c{w_color}{w_alpha_tag}"
                    text_line += f"{{{tags}}}{word_str} "
                
                start_str = format_ass_time(w_start)
                end_str = format_ass_time(w_end)
                
                pos_tag = ""
                if custom_x is not None and custom_y is not None:
                    posX = int((custom_x / 100.0) * 1080)
                    posY = int((custom_y / 100.0) * 1920)
                    pos_tag = f"\\\\pos({posX},{posY})"
                
                f.write(f"Dialogue: 0,{start_str},{end_str},Premium,,0,0,0,,{{{pos_tag}}}{anim}{text_line.strip()}\\n")"""

# Let's locate the old generate_ass function.
# It starts at:
# def generate_ass(transcript, filepath, ...):
# and ends right before:
# def extract_audio(...)
old_func_start = service_content.find("def generate_ass(transcript")
if old_func_start == -1:
    print("Error: def generate_ass not found")
    exit(1)

old_func_end = service_content.find("def extract_audio(video_path")
if old_func_end == -1:
    print("Error: def extract_audio not found")
    exit(1)

# Perform replacement of generate_ass
service_content = service_content[:old_func_start] + new_helper_and_generate_ass + "\n\n" + service_content[old_func_end:]

# Now replace the call to generate_ass inside render_video
# The old call is:
# generate_ass(transcript_data, ass_path, position=position, font=font, font_size=font_size, use_outline=use_outline, font_color=font_color, cuts=cuts, animation_style=animation_style, template_id=template_id)
# Let's find it
old_call_text = 'generate_ass(transcript_data, ass_path, position=position, font=font, font_size=font_size, use_outline=use_outline, font_color=font_color, cuts=cuts, animation_style=animation_style, template_id=template_id)'
new_call_text = 'generate_ass(transcript_data, ass_path, position=position, font=font, font_size=font_size, use_outline=use_outline, font_color=font_color, cuts=cuts, animation_style=animation_style, template_id=template_id, subtitle_edit=subtitle_edit)'

if old_call_text in service_content:
    service_content = service_content.replace(old_call_text, new_call_text)
    print("Updated generate_ass call inside render_video")
else:
    # Try with line breaks/flexible spaces
    print("Warning: generate_ass call search failed, trying fuzzy matching...")
    import re
    pattern = r"generate_ass\s*\([^)]*template_id=template_id\s*\)"
    match = re.search(pattern, service_content)
    if match:
        matched_text = match.group(0)
        updated_text = matched_text.replace("template_id=template_id", "template_id=template_id, subtitle_edit=subtitle_edit")
        service_content = service_content.replace(matched_text, updated_text)
        print("Updated generate_ass call via regex")
    else:
        print("Error: generate_ass call not found in render_video")
        exit(1)

# Save video_service.py
with open(video_service_path, "w", encoding="utf-8") as f:
    f.write(service_content)
print("Successfully updated video_service.py!")


# Read video.py (API endpoint)
with open(video_api_path, "r", encoding="utf-8") as f:
    api_content = f.read()

# Let's add template_id=settings.template_id to render_video call inside run_export_task
# Let's find the render_video call
# We can find where 'render_video,' is called, and then locate 'font_color=settings.font_color or "white",' and insert 'template_id=settings.template_id,' after it.
target_line = 'font_color=settings.font_color or "white",'
replacement_line = 'font_color=settings.font_color or "white",\n            template_id=settings.template_id,'

if target_line in api_content:
    api_content = api_content.replace(target_line, replacement_line)
    print("Updated render_video call in video.py")
else:
    print("Error: font_color line not found in video.py")
    exit(1)

# Save video.py
with open(video_api_path, "w", encoding="utf-8") as f:
    f.write(api_content)
print("Successfully updated video.py!")
