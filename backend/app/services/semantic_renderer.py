import os
import urllib.request
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Common font URLs for beautiful typography
FONT_URLS = {
    "bold": "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bslnt%2Cwght%5D.ttf",
    "regular": "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bslnt%2Cwght%5D.ttf"
}

def get_font(size: int, weight="bold") -> ImageFont.FreeTypeFont:
    """Returns a Pillow font, downloading it if necessary."""
    font_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "fonts"))
    font_path = os.path.join(font_dir, f"Inter-{weight}.ttf")
    
    if not os.path.exists(font_path):
        os.makedirs(font_dir, exist_ok=True)
        url = FONT_URLS.get(weight, FONT_URLS["bold"])
        try:
            print(f"[SemanticRenderer] Downloading font {weight}...")
            urllib.request.urlretrieve(url, font_path)
        except Exception as e:
            print(f"[SemanticRenderer] Warning: Failed to download font: {e}")
            return ImageFont.load_default()
            
    try:
        return ImageFont.truetype(font_path, size)
    except Exception:
        try:
            return ImageFont.truetype("arialbd.ttf" if weight == "bold" else "arial.ttf", size)
        except:
            return ImageFont.load_default()

def get_emoji_for_icon(icon_id: str) -> str:
    mapping = {
        'rocket': '🚀', 'fire': '🔥', 'warning': '⚠️', 'check': '✅',
        'star': '⭐', 'lightning': '⚡', 'chart': '📊', 'crm': '💻',
        'sales': '📈', 'money': '💰', 'arrow': '➡️', 'brain': '🧠'
    }
    return mapping.get(icon_id, icon_id)

def render_semantic_scene_to_image(scene_data: dict, output_path: str, width: int = 1080, height: int = 1920):
    """
    Renders a semantic JSON scene into a transparent PNG overlay for FFmpeg compositing (Fallback mode).
    Renders the scene at progress = 1.0 (final state).
    """
    # Create base transparent image
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    style_profile = scene_data.get("style_profile", {})
    entities = scene_data.get("entities", [])
    relations = scene_data.get("relations", [])
    
    bg_color = style_profile.get("bg_color", "rgba(0, 0, 0, 0.65)")
    border_color = style_profile.get("border_color", "rgba(255, 255, 255, 0.1)")
    glow_color = style_profile.get("glow_color", "rgba(255, 255, 255, 0.05)")
    
    def parse_color(color_str, default_color):
        if not color_str:
            return default_color
        color_str = color_str.strip()
        if color_str.startswith("rgba"):
            try:
                parts = color_str.replace("rgba(", "").replace(")", "").split(",")
                r = int(parts[0].strip())
                g = int(parts[1].strip())
                b = int(parts[2].strip())
                a = int(float(parts[3].strip()) * 255)
                return (r, g, b, a)
            except:
                pass
        elif color_str.startswith("rgb"):
            try:
                parts = color_str.replace("rgb(", "").replace(")", "").split(",")
                r = int(parts[0].strip())
                g = int(parts[1].strip())
                b = int(parts[2].strip())
                return (r, g, b, 255)
            except:
                pass
        elif color_str.startswith("#"):
            h = color_str.lstrip('#')
            try:
                if len(h) == 6:
                    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (255,)
                elif len(h) == 8:
                    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4, 6))
            except:
                pass
        return default_color

    parsed_bg = parse_color(bg_color, (0, 0, 0, 166))
    parsed_border = parse_color(border_color, (255, 255, 255, 26))

    # Render entities
    for entity in entities:
        x_pct = entity.get("x", 50)
        y_pct = entity.get("y", 50)
        w_pct = entity.get("width", 28)
        h_pct = entity.get("height", 12)
        
        target_x = (x_pct / 100.0) * width
        target_y = (y_pct / 100.0) * height
        target_w = (w_pct / 100.0) * width
        target_h = (h_pct / 100.0) * height
        
        ent_bg = parse_color(entity.get("styles", {}).get("bg_color"), parsed_bg)
        ent_border = parse_color(entity.get("styles", {}).get("border_color"), parsed_border)
        
        # Bounding box
        x1 = target_x - target_w / 2
        y1 = target_y - target_h / 2
        x2 = target_x + target_w / 2
        y2 = target_y + target_h / 2
        
        e_type = entity.get("type")
        
        # 1. Custom UI Primitive Renderers
        if e_type == "navbar":
            radius = int(target_h / 2)
            draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=ent_bg, outline=ent_border, width=2)
            
            logo_text = entity.get("text", "Logo")
            logo_size = int(target_h * 0.38)
            logo_font = get_font(logo_size, "bold")
            draw.text((x1 + target_h * 0.6, target_y - logo_size / 2), logo_text, font=logo_font, fill=(255, 255, 255, 255))
            
            nav_items = entity.get("items", ["Home", "Features", "Pricing"])
            if nav_items:
                nav_size = int(target_h * 0.28)
                nav_font = get_font(nav_size, "regular")
                link_spacing = target_w * 0.15
                total_links_w = (len(nav_items) - 1) * link_spacing
                start_link_x = target_x - total_links_w / 2
                for idx, item in enumerate(nav_items):
                    try:
                        bbox = draw.textbbox((0, 0), item, font=nav_font)
                        item_w = bbox[2] - bbox[0]
                    except:
                        item_w = len(item) * (nav_size * 0.5)
                    draw.text((start_link_x + idx * link_spacing - item_w / 2, target_y - nav_size / 2), item, font=nav_font, fill=(255, 255, 255, 190))
                    
            act_text = entity.get("action_text", "Get Started")
            act_size = int(target_h * 0.28)
            act_font = get_font(act_size, "bold")
            act_btn_w = target_w * 0.18
            act_btn_h = target_h * 0.64
            act_btn_x1 = x2 - act_btn_w - target_h * 0.4
            act_btn_y1 = target_y - act_btn_h / 2
            act_btn_x2 = act_btn_x1 + act_btn_w
            act_btn_y2 = act_btn_y1 + act_btn_h
            
            color_accent = parse_color(style_profile.get("color_accent"), (10, 132, 255, 255))
            draw.rounded_rectangle([act_btn_x1, act_btn_y1, act_btn_x2, act_btn_y2], radius=int(act_btn_h/2), fill=color_accent)
            
            try:
                bbox = draw.textbbox((0, 0), act_text, font=act_font)
                act_w = bbox[2] - bbox[0]
            except:
                act_w = len(act_text) * (act_size * 0.5)
            draw.text((act_btn_x1 + act_btn_w / 2 - act_w / 2, target_y - act_size / 2), act_text, font=act_font, fill=(255, 255, 255, 255))
            
        elif e_type == "input_field":
            label_text = str(entity.get("label", "INPUT FIELD")).upper()
            label_size = int(target_h * 0.22)
            label_font = get_font(label_size, "bold")
            draw.text((x1 + 4, y1 - label_size - 6), label_text, font=label_font, fill=(255, 255, 255, 150))
            
            draw.rounded_rectangle([x1, y1, x2, y2], radius=8, fill=(255, 255, 255, 20), outline=ent_border, width=2)
            
            text_offset = target_h * 0.4
            icon_id = entity.get("icon") or entity.get("asset_id")
            if icon_id:
                emoji = get_emoji_for_icon(icon_id)
                emoji_size = int(target_h * 0.45)
                try:
                    emoji_font = ImageFont.truetype("seguiemj.ttf", emoji_size)
                except:
                    emoji_font = get_font(emoji_size, "regular")
                
                try:
                    bbox = draw.textbbox((0, 0), emoji, font=emoji_font)
                    emo_w = bbox[2] - bbox[0]
                    emo_h = bbox[3] - bbox[1]
                except:
                    emo_w, emo_h = emoji_size, emoji_size
                draw.text((x1 + target_h * 0.5 - emo_w / 2, target_y - emo_h / 2), emoji, font=emoji_font, fill=(255, 255, 255, 255))
                text_offset = target_h * 1.0
                
            text_val = entity.get("text", "Enter text...")
            is_placeholder = not entity.get("text")
            text_size = int(target_h * 0.34)
            text_font = get_font(text_size, "regular")
            fill_color = (255, 255, 255, 115) if is_placeholder else (255, 255, 255, 255)
            draw.text((x1 + text_offset, target_y - text_size / 2), text_val, font=text_font, fill=fill_color)
            
        elif e_type == "button":
            btn_style = entity.get("style_variant", "filled")
            color_accent = parse_color(style_profile.get("color_accent"), (10, 132, 255, 255))
            
            if btn_style == "filled":
                draw.rounded_rectangle([x1, y1, x2, y2], radius=int(target_h/2), fill=color_accent)
            elif btn_style == "outline":
                draw.rounded_rectangle([x1, y1, x2, y2], radius=int(target_h/2), fill=(255, 255, 255, 5), outline=color_accent, width=2)
            else:
                draw.rounded_rectangle([x1, y1, x2, y2], radius=int(target_h/2), fill=ent_bg, outline=ent_border, width=2)
                
            text_val = entity.get("text", "Button")
            icon_id = entity.get("icon") or entity.get("asset_id")
            
            btn_size = int(target_h * 0.38)
            btn_font = get_font(btn_size, "bold")
            
            display_text = text_val
            if icon_id:
                emoji = get_emoji_for_icon(icon_id)
                display_text = f"{emoji} {text_val}"
                
            try:
                bbox = draw.textbbox((0, 0), display_text, font=btn_font)
                txt_w = bbox[2] - bbox[0]
            except:
                txt_w = len(display_text) * (btn_size * 0.5)
                
            text_fill = color_accent if btn_style == "outline" else (255, 255, 255, 255)
            draw.text((target_x - txt_w / 2, target_y - btn_size / 2), display_text, font=btn_font, fill=text_fill)
            
        elif e_type == "tab_bar":
            draw.rounded_rectangle([x1, y1, x2, y2], radius=int(target_h/2), fill=(20, 20, 25, 115), outline=ent_border, width=2)
            
            tabs = entity.get("items", ["Overview", "Settings"])
            active_index = entity.get("active_index", 0)
            
            tab_w = target_w / len(tabs)
            tab_h = target_h - 6
            
            active_x1 = x1 + active_index * tab_w + 3
            active_y1 = target_y - tab_h / 2
            active_x2 = active_x1 + tab_w - 6
            active_y2 = active_y1 + tab_h
            draw.rounded_rectangle([active_x1, active_y1, active_x2, active_y2], radius=int(tab_h/2), fill=(255, 255, 255, 40))
            
            tab_size = int(target_h * 0.34)
            for idx, tab_text in enumerate(tabs):
                is_active = (idx == active_index)
                tab_font = get_font(tab_size, "bold" if is_active else "regular")
                try:
                    bbox = draw.textbbox((0, 0), tab_text, font=tab_font)
                    txt_w = bbox[2] - bbox[0]
                except:
                    txt_w = len(tab_text) * (tab_size * 0.5)
                
                label_x = x1 + idx * tab_w + tab_w / 2
                text_fill = (255, 255, 255, 255) if is_active else (255, 255, 255, 150)
                draw.text((label_x - txt_w / 2, target_y - tab_size / 2), tab_text, font=tab_font, fill=text_fill)

        elif e_type == "loading_bar" or entity.get("is_loading_bar"):
            draw.rounded_rectangle([x1, y1, x2, y2], radius=int(target_h/2), fill=(255, 255, 255, 38), outline=ent_border, width=2)
            color_accent = parse_color(style_profile.get("color_accent"), (10, 132, 255, 255))
            draw.rounded_rectangle([x1, y1, x2, y2], radius=int(target_h/2), fill=color_accent)
            
            text_val = entity.get("text", "")
            if text_val:
                text_size = int(target_h * 0.5)
                text_font = get_font(text_size, "bold")
                display_text = f"{text_val} 100%"
                try:
                    bbox = draw.textbbox((0, 0), display_text, font=text_font)
                    txt_w = bbox[2] - bbox[0]
                except:
                    txt_w = len(display_text) * (text_size * 0.5)
                draw.text((target_x - txt_w / 2, target_y - text_size / 2), display_text, font=text_font, fill=(255, 255, 255, 255))

        elif e_type == "code_block":
            draw.rounded_rectangle([x1, y1, x2, y2], radius=12, fill=(15, 15, 18, 255), outline=(255, 255, 255, 20), width=2)
            header_h = min(32, target_h * 0.22)
            draw.line([x1, y1 + header_h, x2, y1 + header_h], fill=(255, 255, 255, 15), width=1)
            
            dot_radius = max(3, int(header_h * 0.16))
            dot_y = y1 + header_h / 2
            dot_spacing = dot_radius * 3
            start_dot_x = x1 + dot_spacing * 1.5
            
            colors = [(255, 95, 86, 255), (255, 189, 46, 255), (39, 201, 63, 255)]
            for idx, col in enumerate(colors):
                cx = start_dot_x + idx * dot_spacing
                draw.ellipse([cx - dot_radius, dot_y - dot_radius, cx + dot_radius, dot_y + dot_radius], fill=col)
                
            label_text = entity.get("label") or entity.get("title") or "terminal.sh"
            label_size = max(8, int(header_h * 0.45))
            label_font = get_font(label_size, "bold")
            try:
                bbox = draw.textbbox((0, 0), label_text, font=label_font)
                lbl_w = bbox[2] - bbox[0]
            except:
                lbl_w = len(label_text) * (label_size * 0.5)
            draw.text((target_x - lbl_w / 2, dot_y - label_size / 2), label_text, font=label_font, fill=(255, 255, 255, 128))
            
            text_val = entity.get("text", "")
            if text_val:
                raw_lines = text_val.split('\n')
                client_h = target_h - header_h
                max_lines = max(1, len(raw_lines))
                font_size = max(9, min(18, int(client_h * 0.72 / max_lines)))
                code_font = get_font(font_size, "regular")
                
                pad_x = max(12, int(target_w * 0.06))
                start_x = x1 + pad_x
                start_y = y1 + header_h + (client_h / (max_lines + 1))
                step_y = client_h / (max_lines + 1)
                
                for l_idx, line in enumerate(raw_lines):
                    line_y = start_y + l_idx * step_y
                    fill_col = (255, 255, 255, 100) if line.strip().startswith("//") else (244, 244, 245, 255)
                    draw.text((start_x, line_y - font_size / 2), line, font=code_font, fill=fill_col)

        elif e_type == "metric_card":
            val_text = entity.get("value") or entity.get("number") or entity.get("text") or "$12,450"
            sub_label = entity.get("label") or entity.get("sublabel") or entity.get("text_label") or "Metric"
            trend_val = entity.get("trend", "")
            color_accent = parse_color(style_profile.get("color_accent"), (10, 132, 255, 255))
            
            draw.rounded_rectangle([x1, y1, x2, y2], radius=16, fill=ent_bg, outline=ent_border, width=2)
            
            val_size = int(target_h * 0.32)
            sub_size = int(target_h * 0.15)
            
            val_font = get_font(val_size, "bold")
            sub_font = get_font(sub_size, "bold")
            
            try:
                bbox = draw.textbbox((0, 0), val_text, font=val_font)
                val_w = bbox[2] - bbox[0]
            except:
                val_w = len(val_text) * (val_size * 0.5)
                
            trend_w = 0
            trend_badge_h = 0
            if trend_val:
                trend_badge_h = int(val_size * 0.45)
                trend_font = get_font(int(trend_badge_h * 0.7), "bold")
                try:
                    bbox = draw.textbbox((0, 0), trend_val, font=trend_font)
                    trend_w = (bbox[2] - bbox[0]) + trend_badge_h * 1.2
                except:
                    trend_w = len(trend_val) * (trend_badge_h * 0.35) + trend_badge_h * 1.2
                    
            gap = 16
            total_w = val_w + (gap + trend_w if trend_val else 0)
            row_start_x = target_x - total_w / 2
            row_y = target_y - target_h * 0.12
            sub_y = target_y + target_h * 0.24
            
            draw.text((row_start_x, row_y - val_size / 2), val_text, font=val_font, fill=color_accent)
            
            if trend_val:
                trend_x = row_start_x + val_w + gap
                trend_y = row_y
                is_pos = trend_val.startswith('+') or not trend_val.startswith('-')
                badge_bg = (52, 199, 89, 38) if is_pos else (255, 59, 48, 38)
                badge_fg = (52, 199, 89, 255) if is_pos else (255, 59, 48, 255)
                
                draw.rounded_rectangle([trend_x, trend_y - trend_badge_h / 2, trend_x + trend_w, trend_y + trend_badge_h / 2], radius=int(trend_badge_h/2), fill=badge_bg)
                trend_font = get_font(int(trend_badge_h * 0.65), "bold")
                try:
                    bbox = draw.textbbox((0, 0), trend_val, font=trend_font)
                    tw = bbox[2] - bbox[0]
                except:
                    tw = len(trend_val) * (trend_badge_h * 0.32)
                draw.text((trend_x + trend_w / 2 - tw / 2, trend_y - (trend_badge_h * 0.65) / 2), trend_val, font=trend_font, fill=badge_fg)
                
            try:
                bbox = draw.textbbox((0, 0), sub_label, font=sub_font)
                sub_w = bbox[2] - bbox[0]
            except:
                sub_w = len(sub_label) * (sub_size * 0.5)
            draw.text((target_x - sub_w / 2, sub_y - sub_size / 2), sub_label, font=sub_font, fill=(255, 255, 255, 150))

        elif e_type == "circular_progress":
            color_accent = parse_color(style_profile.get("color_accent"), (10, 132, 255, 255))
            draw.rounded_rectangle([x1, y1, x2, y2], radius=16, fill=ent_bg, outline=ent_border, width=2)
            
            static_progress = entity.get("progress")
            progress_val = float(static_progress) if static_progress is not None else 100.0
            progress_val = max(0.0, min(100.0, progress_val))
            
            sub_label = entity.get("text") or entity.get("label") or "Progress"
            radius = min(target_w, target_h) * 0.28
            cx, cy = target_x, target_y - target_h * 0.08
            sub_y = target_y + target_h * 0.32
            
            ring_w = max(4, int(radius * 0.12))
            draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=(255, 255, 255, 20), width=ring_w)
            
            start_deg = -90
            end_deg = -90 + (progress_val / 100.0) * 360
            draw.arc([cx - radius, cy - radius, cx + radius, cy + radius], start=start_deg, end=end_deg, fill=color_accent, width=ring_w)
            
            pct_text = f"{int(progress_val)}%"
            pct_size = int(radius * 0.45)
            pct_font = get_font(pct_size, "bold")
            try:
                bbox = draw.textbbox((0, 0), pct_text, font=pct_font)
                pct_w = bbox[2] - bbox[0]
            except:
                pct_w = len(pct_text) * (pct_size * 0.5)
            draw.text((cx - pct_w / 2, cy - pct_size / 2), pct_text, font=pct_font, fill=(255, 255, 255, 255))
            
            sub_size = int(target_h * 0.14)
            sub_font = get_font(sub_size, "bold")
            try:
                bbox = draw.textbbox((0, 0), sub_label, font=sub_font)
                sub_w = bbox[2] - bbox[0]
            except:
                sub_w = len(sub_label) * (sub_size * 0.5)
            draw.text((target_x - sub_w / 2, sub_y - sub_size / 2), sub_label, font=sub_font, fill=(255, 255, 255, 150))

        elif e_type == "audio_waveform":
            color_accent = parse_color(style_profile.get("color_accent"), (10, 132, 255, 255))
            draw.rounded_rectangle([x1, y1, x2, y2], radius=16, fill=ent_bg, outline=ent_border, width=2)
            
            bar_count = 12
            bar_w = max(3, int(target_w * 0.035))
            gap = (target_w - bar_count * bar_w) / (bar_count + 1)
            start_x = x1 + gap
            
            heights = [0.35, 0.65, 0.8, 0.45, 0.7, 0.9, 0.5, 0.6, 0.85, 0.4, 0.55, 0.3]
            for i in range(bar_count):
                wave_val = heights[i % len(heights)]
                bar_h = target_h * 0.15 + target_h * 0.65 * wave_val
                bx_ = start_x + i * (bar_w + gap)
                by_ = target_y - bar_h / 2
                draw.rounded_rectangle([bx_, by_, bx_ + bar_w, by_ + bar_h], radius=int(bar_w/2), fill=color_accent)

        elif e_type == "sparkline":
            color_accent = parse_color(style_profile.get("color_accent"), (10, 132, 255, 255))
            draw.rounded_rectangle([x1, y1, x2, y2], radius=16, fill=ent_bg, outline=ent_border, width=2)
            
            data = entity.get("data") or [20, 45, 30, 80, 60, 95]
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except:
                    data = [20, 45, 30, 80, 60, 95]
            
            start_cx = x1 + target_w * 0.08
            end_cx = x2 - target_w * 0.08
            chart_w = end_cx - start_cx
            chart_h = target_h * 0.5
            base_cy = target_y + target_h * 0.22
            
            points = []
            for i, val in enumerate(data):
                px = start_cx + (i / (len(data) - 1)) * chart_w
                py = base_cy - (val / 100.0) * chart_h
                points.append((px, py))
                
            if len(points) >= 2:
                draw.line(points, fill=color_accent, width=max(3, int(target_h * 0.05)), joint="round")
                tip_x, tip_y = points[-1]
                tip_r = max(5, int(target_h * 0.06))
                draw.ellipse([tip_x - tip_r, tip_y - tip_r, tip_x + tip_r, tip_y + tip_r], fill=(255, 255, 255, 255))
                
            sub_label = entity.get("text") or entity.get("label") or ""
            if sub_label:
                sub_size = int(target_h * 0.12)
                sub_font = get_font(sub_size, "bold")
                try:
                    bbox = draw.textbbox((0, 0), sub_label, font=sub_font)
                    sub_w = bbox[2] - bbox[0]
                except:
                    sub_w = len(sub_label) * (sub_size * 0.5)
                draw.text((target_x - sub_w / 2, target_y - target_h * 0.38), sub_label, font=sub_font, fill=(255, 255, 255, 128))

        elif e_type == "toggle_card":
            draw.rounded_rectangle([x1, y1, x2, y2], radius=16, fill=ent_bg, outline=ent_border, width=2)
            
            label_text = entity.get("text") or entity.get("label") or "Enable Setting"
            font_size = int(target_h * 0.22)
            text_font = get_font(font_size, "bold")
            draw.text((x1 + target_w * 0.08, target_y - font_size / 2), label_text, font=text_font, fill=(255, 255, 255, 255))
            
            tw = target_h * 0.62 * 1.7
            th = target_h * 0.62
            trx = x2 - target_w * 0.08 - tw
            try_ = target_y - th / 2
            
            draw.rounded_rectangle([trx, try_, trx + tw, try_ + th], radius=int(th/2), fill=(52, 199, 89, 255))
            
            radius = th * 0.42
            thumb_x = trx + tw - th / 2
            draw.ellipse([thumb_x - radius, target_y - radius, thumb_x + radius, target_y + radius], fill=(255, 255, 255, 255))

        elif e_type == "profile_card":
            draw.rounded_rectangle([x1, y1, x2, y2], radius=16, fill=ent_bg, outline=ent_border, width=2)
            
            d = target_h * 0.46
            ax = x1 + target_w * 0.08 + d / 2
            ay = target_y - target_h * 0.16
            
            draw.ellipse([ax - d / 2, ay - d / 2, ax + d / 2, ay + d / 2], fill=(255, 42, 104, 255))
            
            initials = entity.get("initials") or entity.get("label", "AI")[:2].upper()
            init_size = int(d * 0.42)
            init_font = get_font(init_size, "bold")
            try:
                bbox = draw.textbbox((0, 0), initials, font=init_font)
                init_w = bbox[2] - bbox[0]
            except:
                init_w = len(initials) * (init_size * 0.5)
            draw.text((ax - init_w / 2, ay - init_size / 2), initials, font=init_font, fill=(255, 255, 255, 255))
            
            name_text = entity.get("name") or entity.get("username") or "@user_account"
            name_size = int(target_h * 0.16)
            name_font = get_font(name_size, "bold")
            nx = x1 + target_w * 0.08 + d + 12
            draw.text((nx, ay - name_size / 2), name_text, font=name_font, fill=(255, 255, 255, 255))
            
            try:
                bbox = draw.textbbox((0, 0), name_text, font=name_font)
                name_w = bbox[2] - bbox[0]
            except:
                name_w = len(name_text) * (name_size * 0.5)
            bx = nx + name_w + 16
            br = target_h * 0.075
            draw.ellipse([bx - br, ay - br, bx + br, ay + br], fill=(10, 132, 255, 255))
            draw.line([bx - br * 0.4, ay + br * 0.1, bx - br * 0.1, ay + br * 0.4, bx + br * 0.4, ay - br * 0.3], fill=(255, 255, 255, 255), width=2)
            
            body_text = entity.get("text") or "This tool changed how I edit videos!"
            body_size = int(target_h * 0.125)
            body_font = get_font(body_size, "regular")
            
            bx_text = x1 + target_w * 0.08
            by_text = target_y + target_h * 0.16
            max_text_w = target_w * 0.84
            
            words = body_text.split(' ')
            line = ''
            current_y_offset = 0
            line_height = int(body_size * 1.35)
            
            for word in words:
                test_line = line + word + ' '
                try:
                    bbox = draw.textbbox((0, 0), test_line, font=body_font)
                    test_w = bbox[2] - bbox[0]
                except:
                    test_w = len(test_line) * (body_size * 0.5)
                if test_w > max_text_w and line != '':
                    draw.text((bx_text, by_text + current_y_offset), line, font=body_font, fill=(255, 255, 255, 184))
                    line = word + ' '
                    current_y_offset += line_height
                else:
                    line = test_line
            if line:
                draw.text((bx_text, by_text + current_y_offset), line, font=body_font, fill=(255, 255, 255, 184))

        elif e_type == "comparison_table":
            draw.rounded_rectangle([x1, y1, x2, y2], radius=16, fill=ent_bg, outline=ent_border, width=2)
            
            left_title = entity.get("left_title", "Before")
            right_title = entity.get("right_title", "After")
            left_items = entity.get("left_items", ["Manual cuts", "No graphics"])
            right_items = entity.get("right_items", ["Smart trim", "Interactive graphics"])
            
            title_size = int(target_h * 0.16)
            item_size = int(target_h * 0.12)
            
            title_font = get_font(title_size, "bold")
            item_font = get_font(item_size, "regular")
            
            # Draw vertical divider
            draw.line([target_x, y1 + target_h * 0.08, target_x, y2 - target_h * 0.08], fill=parsed_border, width=2)
            
            # Draw titles
            try:
                bbox = draw.textbbox((0, 0), left_title, font=title_font)
                w_l = bbox[2] - bbox[0]
            except:
                w_l = len(left_title) * (title_size * 0.5)
            draw.text((x1 + target_w * 0.25 - w_l / 2, y1 + target_h * 0.12), left_title, font=title_font, fill=(255, 59, 48, 255))
            
            try:
                bbox = draw.textbbox((0, 0), right_title, font=title_font)
                w_r = bbox[2] - bbox[0]
            except:
                w_r = len(right_title) * (title_size * 0.5)
            draw.text((x1 + target_w * 0.75 - w_r / 2, y1 + target_h * 0.12), right_title, font=title_font, fill=(52, 199, 89, 255))
            
            # Draw items
            start_y = y1 + target_h * 0.32
            step_y = target_h * 0.15
            
            for idx, item in enumerate(left_items[:4]):
                ly = start_y + idx * step_y
                draw.text((x1 + target_w * 0.08, ly - item_size / 2), "❌  " + item, font=item_font, fill=(255, 255, 255, 180))
                
            for idx, item in enumerate(right_items[:4]):
                ry = start_y + idx * step_y
                draw.text((x1 + target_w * 0.58, ry - item_size / 2), "✅  " + item, font=item_font, fill=(255, 255, 255, 255))

        elif e_type == "feature_grid":
            features = entity.get("features", [
                {"icon": "⚡", "title": "Speed", "desc": "10x render"},
                {"icon": "🎨", "title": "Design", "desc": "Premium styles"},
                {"icon": "🧠", "title": "AI Cut", "desc": "Auto trim silence"},
                {"icon": "🔊", "title": "Audio", "desc": "Smart recommendation"}
            ])
            
            grid_fill = (ent_bg[0], ent_bg[1], ent_bg[2], min(255, ent_bg[3] + 30))
            
            col_w = (target_w - 24) / 2
            row_h = (target_h - 24) / 2
            
            title_size = int(target_h * 0.12)
            desc_size = int(target_h * 0.08)
            
            title_font = get_font(title_size, "bold")
            desc_font = get_font(desc_size, "regular")
            
            for idx, f in enumerate(features[:4]):
                col = idx % 2
                row = idx // 2
                
                bx1 = x1 + col * (col_w + 24)
                by1 = y1 + row * (row_h + 24)
                bx2 = bx1 + col_w
                by2 = by1 + row_h
                
                draw.rounded_rectangle([bx1, by1, bx2, by2], radius=10, fill=grid_fill, outline=ent_border, width=1)
                
                icon = f.get("icon", "🌟")
                title = f.get("title", "Feature")
                desc = f.get("desc", "Description")
                
                ic_font = get_font(int(row_h * 0.28), "regular")
                draw.text((bx1 + 12, by1 + 10), icon, font=ic_font, fill=(255, 255, 255, 255))
                
                tx = bx1 + 12
                ty = by1 + 12 + int(row_h * 0.28)
                draw.text((tx, ty), title, font=title_font, fill=(255, 255, 255, 255))
                
                dy = ty + title_size + 6
                draw.text((tx, dy), desc, font=desc_font, fill=(255, 255, 255, 160))

        elif e_type == "progress_steps":
            steps = entity.get("steps", ["Upload", "Analyze", "Export"])
            color_accent = parse_color(style_profile.get("color_accent"), (10, 132, 255, 255))
            
            step_count = len(steps)
            step_w = target_w / step_count
            circle_r = min(target_h * 0.25, step_w * 0.2)
            
            line_y = target_y - target_h * 0.1
            draw.line([x1 + step_w / 2, line_y, x2 - step_w / 2, line_y], fill=parsed_border, width=4)
            draw.line([x1 + step_w / 2, line_y, x2 - step_w / 2, line_y], fill=color_accent, width=4)
            
            step_size = int(target_h * 0.12)
            step_font = get_font(step_size, "bold")
            
            for idx, step_name in enumerate(steps):
                cx = x1 + idx * step_w + step_w / 2
                cy = line_y
                
                draw.ellipse([cx - circle_r, cy - circle_r, cx + circle_r, cy + circle_r], fill=color_accent, outline=(255, 255, 255, 255), width=2)
                
                num_str = str(idx + 1)
                num_size = int(circle_r * 1.1)
                num_font = get_font(num_size, "bold")
                try:
                    bbox = draw.textbbox((0, 0), num_str, font=num_font)
                    nw = bbox[2] - bbox[0]
                except:
                    nw = num_size * 0.4
                draw.text((cx - nw / 2, cy - num_size / 2 - 2), num_str, font=num_font, fill=(255, 255, 255, 255))
                
                label_y = cy + circle_r + 10
                try:
                    bbox = draw.textbbox((0, 0), step_name, font=step_font)
                    lbl_w = bbox[2] - bbox[0]
                except:
                    lbl_w = len(step_name) * (step_size * 0.5)
                draw.text((cx - lbl_w / 2, label_y), step_name, font=step_font, fill=(255, 255, 255, 255))

        elif e_type == "user_review":
            draw.rounded_rectangle([x1, y1, x2, y2], radius=16, fill=ent_bg, outline=ent_border, width=2)
            
            name = entity.get("name", "Alexander")
            username = entity.get("username", "@alex_v")
            review_text = entity.get("text", "Great tool! Saves so much time.")
            rating = int(entity.get("rating", 5))
            
            avatar_d = target_h * 0.32
            ax = x1 + target_w * 0.08 + avatar_d / 2
            ay = y1 + target_h * 0.22
            
            draw.ellipse([ax - avatar_d / 2, ay - avatar_d / 2, ax + avatar_d / 2, ay + avatar_d / 2], fill=(10, 132, 255, 255))
            
            initials = name[:2].upper()
            init_size = int(avatar_d * 0.45)
            init_font = get_font(init_size, "bold")
            try:
                bbox = draw.textbbox((0, 0), initials, font=init_font)
                init_w = bbox[2] - bbox[0]
            except:
                init_w = len(initials) * (init_size * 0.5)
            draw.text((ax - init_w / 2, ay - init_size / 2), initials, font=init_font, fill=(255, 255, 255, 255))
            
            name_size = int(target_h * 0.12)
            name_font = get_font(name_size, "bold")
            username_size = int(target_h * 0.09)
            username_font = get_font(username_size, "regular")
            
            nx = x1 + target_w * 0.08 + avatar_d + 12
            draw.text((nx, ay - name_size - 2), name, font=name_font, fill=(255, 255, 255, 255))
            draw.text((nx, ay + 2), username, font=username_font, fill=(255, 255, 255, 140))
            
            star_str = "⭐" * rating
            star_size = int(target_h * 0.12)
            try:
                star_font = ImageFont.truetype("seguiemj.ttf", star_size)
            except:
                star_font = get_font(star_size, "regular")
            try:
                bbox = draw.textbbox((0, 0), star_str, font=star_font)
                star_w = bbox[2] - bbox[0]
            except:
                star_w = len(star_str) * (star_size * 0.5)
            draw.text((x2 - target_w * 0.08 - star_w, ay - star_size / 2), star_str, font=star_font, fill=(255, 255, 255, 255))
            
            body_size = int(target_h * 0.11)
            body_font = get_font(body_size, "regular")
            
            bx_text = x1 + target_w * 0.08
            by_text = y1 + target_h * 0.52
            max_text_w = target_w * 0.84
            
            words = review_text.split(' ')
            line = ''
            current_y_offset = 0
            line_height = int(body_size * 1.35)
            
            for word in words:
                test_line = line + word + ' '
                try:
                    bbox = draw.textbbox((0, 0), test_line, font=body_font)
                    test_w = bbox[2] - bbox[0]
                except:
                    test_w = len(test_line) * (body_size * 0.5)
                if test_w > max_text_w and line != '':
                    draw.text((bx_text, by_text + current_y_offset), line, font=body_font, fill=(255, 255, 255, 210))
                    line = word + ' '
                    current_y_offset += line_height
                else:
                    line = test_line
            if line:
                draw.text((bx_text, by_text + current_y_offset), line, font=body_font, fill=(255, 255, 255, 210))

        elif e_type == "bar_chart":
            draw.rounded_rectangle([x1, y1, x2, y2], radius=16, fill=ent_bg, outline=ent_border, width=2)
            
            bars = entity.get("bars", [
                {"label": "Direct", "value": 75},
                {"label": "Social", "value": 50},
                {"label": "Organic", "value": 90}
            ])
            color_accent = parse_color(style_profile.get("color_accent"), (10, 132, 255, 255))
            
            bar_count = min(3, len(bars))
            start_y = y1 + target_h * 0.16
            step_y = target_h * 0.26
            
            label_size = int(target_h * 0.1)
            val_size = int(target_h * 0.09)
            
            label_font = get_font(label_size, "bold")
            val_font = get_font(val_size, "bold")
            
            max_bar_w = target_w * 0.54
            
            for idx, bar in enumerate(bars[:bar_count]):
                by = start_y + idx * step_y
                label = bar.get("label", "Bar")
                val = float(bar.get("value", 50))
                
                draw.text((x1 + target_w * 0.08, by), label, font=label_font, fill=(255, 255, 255, 255))
                
                bx = x1 + target_w * 0.32
                b_y = by + 2
                b_h = int(target_h * 0.08)
                
                draw.rounded_rectangle([bx, b_y, bx + max_bar_w, b_y + b_h], radius=int(b_h/2), fill=(255, 255, 255, 25))
                
                act_w = max_bar_w * (val / 100.0)
                draw.rounded_rectangle([bx, b_y, bx + act_w, b_y + b_h], radius=int(b_h/2), fill=color_accent)
                
                val_str = f"{int(val)}%"
                draw.text((bx + max_bar_w + 10, by), val_str, font=val_font, fill=(255, 255, 255, 200))
        
        # 2. Standard Card & Headline Renderer
        else:
            if e_type != "headline":
                radius = int(min(width, height) * 0.015)
                draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=ent_bg, outline=ent_border, width=2)
                
            text_val = entity.get("text", "")
            if text_val:
                styles = entity.get("styles", {})
                is_headline = e_type == "headline"
                base_font_size = int(styles.get("font_size") or (height * (0.028 if is_headline else 0.015)))
                font = get_font(base_font_size, "bold" if styles.get("bold", True) else "regular")
                
                # Word wrapping
                max_w = target_w - 24
                words = text_val.split(' ')
                lines = []
                current_line = ''
                
                for word in words:
                    test_line = f"{current_line} {word}".strip()
                    try:
                        bbox = draw.textbbox((0, 0), test_line, font=font)
                        test_w = bbox[2] - bbox[0]
                    except:
                        test_w = len(test_line) * (base_font_size * 0.5)
                        
                    if test_w > max_w and current_line:
                        lines.append(current_line)
                        current_line = word
                    else:
                        current_line = test_line
                if current_line:
                    lines.append(current_line)
                    
                # Scale down font size if height overflows
                final_font_size = base_font_size
                max_allowed_h = target_h - 16
                while len(lines) * (final_font_size * 1.35) > max_allowed_h and final_font_size > 12:
                    final_font_size -= 2
                    font = get_font(final_font_size, "bold" if styles.get("bold", True) else "regular")
                    # Re-wrap
                    lines = []
                    current_line = ''
                    for word in words:
                        test_line = f"{current_line} {word}".strip()
                        try:
                            bbox = draw.textbbox((0, 0), test_line, font=font)
                            test_w = bbox[2] - bbox[0]
                        except:
                            test_w = len(test_line) * (final_font_size * 0.5)
                        if test_w > max_w and current_line:
                            lines.append(current_line)
                            current_line = word
                        else:
                            current_line = test_line
                    if current_line:
                        lines.append(current_line)
                
                text_color = parse_color(styles.get("color"), (245, 247, 250, 255))
                total_text_height = len(lines) * (final_font_size * 1.35)
                start_y = target_y - (total_text_height / 2) + (final_font_size / 2)
                
                for l_idx, line in enumerate(lines):
                    try:
                        bbox = draw.textbbox((0, 0), line, font=font)
                        line_w = bbox[2] - bbox[0]
                        line_h = bbox[3] - bbox[1]
                    except:
                        line_w = len(line) * (final_font_size * 0.5)
                        line_h = final_font_size
                    
                    if is_headline:
                        r = text_color[0] if len(text_color) > 0 else 255
                        g = text_color[1] if len(text_color) > 1 else 255
                        b = text_color[2] if len(text_color) > 2 else 255
                        brightness = (r * 299 + g * 587 + b * 114) / 1000
                        stroke_fill = (255, 255, 255, 180) if brightness < 128 else (0, 0, 0, 180)
                        stroke_width = max(1, int(final_font_size * 0.05))
                        draw.text(
                            (target_x - line_w / 2, start_y + l_idx * (final_font_size * 1.35) - line_h / 2),
                            line,
                            font=font,
                            fill=text_color,
                            stroke_width=stroke_width,
                            stroke_fill=stroke_fill
                        )
                    else:
                        draw.text(
                            (target_x - line_w / 2, start_y + l_idx * (final_font_size * 1.35) - line_h / 2),
                            line,
                            font=font,
                            fill=text_color
                        )
                    
            icon_id = entity.get("asset_id") or entity.get("icon")
            if e_type == "icon" and icon_id:
                emoji = get_emoji_for_icon(icon_id)
                font_size = int(target_h * 0.5)
                try:
                    font = ImageFont.truetype("seguiemj.ttf", font_size)
                except:
                    font = get_font(font_size, "regular")
                
                try:
                    bbox = draw.textbbox((0, 0), emoji, font=font)
                    e_w = bbox[2] - bbox[0]
                    e_h = bbox[3] - bbox[1]
                except:
                    e_w, e_h = font_size, font_size
                draw.text((target_x - e_w/2, target_y - e_h/2), emoji, font=font, fill=(255, 255, 255, 255))

    # Render Relations (Arrows)
    for rel in relations:
        from_ent = next((e for e in entities if e.get("id") == rel.get("from")), None)
        to_ent = next((e for e in entities if e.get("id") == rel.get("to")), None)
        if not from_ent or not to_ent:
            continue
            
        fx = (from_ent.get("x", 50) / 100.0) * width
        fy = (from_ent.get("y", 50) / 100.0) * height
        tx = (to_ent.get("x", 50) / 100.0) * width
        ty = (to_ent.get("y", 50) / 100.0) * height
        
        arrow_color = parse_color(style_profile.get("arrow_color") or style_profile.get("border_color"), (59, 130, 246, 150))
        arrow_width = int(style_profile.get("arrow_width", 3))
        
        draw.line([fx, fy, tx, ty], fill=arrow_color, width=arrow_width)
        
        # Draw arrowhead
        angle = math.atan2(ty - fy, tx - fx)
        size = 15
        ax1 = tx - size * math.cos(angle - math.pi / 6)
        ay1 = ty - size * math.sin(angle - math.pi / 6)
        ax2 = tx - size * math.cos(angle + math.pi / 6)
        ay2 = ty - size * math.sin(angle + math.pi / 6)
        draw.polygon([tx, ty, ax1, ay1, ax2, ay2], fill=arrow_color)

    # Save the final PNG
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, "PNG")
    print(f"[SemanticRenderer] Saved transparent overlay to {output_path}")
    return output_path
