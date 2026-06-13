import os
import urllib.request
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Common font URLs for beautiful typography
FONT_URLS = {
    "bold": "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bslnt%2Cwght%5D.ttf",
    "regular": "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bslnt%2Cwght%5D.ttf" # Inter is variable, we can just use default
}

def get_font(size: int, weight="bold") -> ImageFont.FreeTypeFont:
    """Returns a Pillow font, downloading it if necessary."""
    font_dir = os.path.join(os.path.dirname(__file__), "..", "..", "fonts")
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
        # For variable fonts like Inter, we can't easily set weight without specific instances, 
        # but the default usually looks fine or we can fall back to standard system fonts if needed.
        # As a fallback for Windows, use Arial if Inter fails
        return ImageFont.truetype(font_path, size)
    except Exception:
        try:
            return ImageFont.truetype("arialbd.ttf" if weight == "bold" else "arial.ttf", size)
        except:
            return ImageFont.load_default()

def render_semantic_scene_to_image(scene_data: dict, output_path: str, width: int = 1080, height: int = 1920):
    """
    Renders a semantic JSON scene into a transparent PNG overlay for FFmpeg compositing.
    """
    # Create base transparent image
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    entities = scene_data.get("entities", [])
    
    # Responsive scaling
    is_horizontal = width > height
    base_dim = min(width, height)
    scale = base_dim / 1080.0
    
    # Fonts
    font_title = get_font(int(84 * scale), "bold")
    font_role = get_font(int(24 * scale), "bold")
    font_text = get_font(int(52 * scale), "bold")
    
    # Layout state
    y_offset = int(height * (0.2 if is_horizontal else 0.3))
    
    for i, entity in enumerate(entities):
        role = (entity.get("visual_role") or entity.get("type") or "").upper()
        text = entity.get("text") or entity.get("asset_id") or ""
        
        is_title = "TITLE" in role or "HEADLINE" in role
        
        if is_title:
            try:
                bbox = draw.textbbox((0, 0), text, font=font_title)
                text_w = bbox[2] - bbox[0]
            except Exception:
                text_w = len(text) * int(45 * scale)
                
            x_pos = (width - text_w) // 2
            
            # Text shadow
            draw.text((x_pos+4, y_offset-120+4), text, font=font_title, fill=(0,0,0,180))
            draw.text((x_pos, y_offset-120), text, font=font_title, fill=(255,255,255,255))
        else:
            # Face-safe role positioning
            if "LEFT" in role:
                card_width = int(width * 0.3)
                card_x = int(width * 0.1)
            elif "RIGHT" in role:
                card_width = int(width * 0.3)
                card_x = width - card_width - int(width * 0.1)
            else:
                card_width = min(int(800 * scale), width - 100)
                card_x = (width - card_width) // 2
                
            card_height = int(180 * scale)
            
            # Card background
            card_box = [card_x, y_offset, card_x + card_width, y_offset + card_height]
            draw.rounded_rectangle(card_box, radius=int(32 * scale), fill=(255, 255, 255, 20), outline=(255, 255, 255, 60), width=2)
            
            # Role text
            role_str = f"ROLE: {role}"
            try:
                r_bbox = draw.textbbox((0, 0), role_str, font=font_role)
                r_w = r_bbox[2] - r_bbox[0]
            except:
                r_w = len(role_str) * int(15 * scale)
            draw.text((card_x + (card_width - r_w)//2, y_offset + int(30 * scale)), role_str, font=font_role, fill=(161, 161, 170, 255))
            
            # Main text
            try:
                t_bbox = draw.textbbox((0, 0), text, font=font_text)
                t_w = t_bbox[2] - t_bbox[0]
            except:
                t_w = len(text) * int(30 * scale)
            draw.text((card_x + (card_width - t_w)//2, y_offset + int(80 * scale)), text, font=font_text, fill=(255, 255, 255, 255))
            
            y_offset += card_height + int(40 * scale)
            
    # Save the final PNG
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, "PNG")
    print(f"[SemanticRenderer] Saved transparent overlay to {output_path}")
    return output_path
