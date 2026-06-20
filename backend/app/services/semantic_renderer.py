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
        
        # 2. Standard Card & Headline Renderer
        else:
            if e_type != "headline":
                radius = int(min(width, height) * 0.015)
                draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=ent_bg, outline=ent_border, width=2)
                
            text_val = entity.get("text", "")
            if text_val:
                styles = entity.get("styles", {})
                font_size = int(styles.get("font_size") or (height * 0.024))
                font = get_font(font_size, "bold" if styles.get("bold", True) else "regular")
                
                lines = text_val.split('\n')
                text_color = parse_color(styles.get("color"), (245, 247, 250, 255))
                
                total_text_height = len(lines) * (font_size * 1.35)
                start_y = target_y - (total_text_height / 2) + (font_size / 2)
                
                for l_idx, line in enumerate(lines):
                    try:
                        bbox = draw.textbbox((0, 0), line, font=font)
                        line_w = bbox[2] - bbox[0]
                        line_h = bbox[3] - bbox[1]
                    except:
                        line_w = len(line) * (font_size * 0.5)
                        line_h = font_size
                    
                    if e_type == "headline":
                        r = text_color[0] if len(text_color) > 0 else 255
                        g = text_color[1] if len(text_color) > 1 else 255
                        b = text_color[2] if len(text_color) > 2 else 255
                        brightness = (r * 299 + g * 587 + b * 114) / 1000
                        stroke_fill = (255, 255, 255, 180) if brightness < 128 else (0, 0, 0, 180)
                        stroke_width = max(1, int(font_size * 0.05))
                        draw.text(
                            (target_x - line_w / 2, start_y + l_idx * (font_size * 1.35) - line_h / 2),
                            line,
                            font=font,
                            fill=text_color,
                            stroke_width=stroke_width,
                            stroke_fill=stroke_fill
                        )
                    else:
                        draw.text(
                            (target_x - line_w / 2, start_y + l_idx * (font_size * 1.35) - line_h / 2),
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
