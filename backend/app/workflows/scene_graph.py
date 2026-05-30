"""
Scene Graph System — Declarative representation of graphical layers.
Compiles clean parameters into robust, styled HTML/CSS/GSAP layouts.
"""

from typing import Dict, Any, List

class SceneGraph:
    @staticmethod
    def compile_scene(
        start: float,
        duration: float,
        style: str,
        elements: List[Dict[str, Any]],
        camera: Dict[str, Any] = None
    ) -> str:
        """
        Compile declarative parameters into highly premium responsive HTML
        using embedded CSS and GSAP animations.
        """
        style = style.lower()
        if style not in ("vox", "paper", "mograph"):
            style = "vox"

        html_blocks = []
        animations = []

        # ─── Style Specific Configurations ─────────────────────────────────────
        if style == "vox":
            bg_style = "background: rgba(26, 26, 46, 0.85); border-radius: 16px; backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.1);"
            font_family = "'Inter', sans-serif"
            primary_color = "#f59e0b"  # Amber
            secondary_color = "#3b82f6"  # Blue
            text_color = "#ffffff"
        elif style == "paper":
            bg_style = "background: rgba(245, 240, 232, 0.95); border: 2px solid #1a1a1a; clip-path: polygon(1% 1%, 99% 2%, 98% 98%, 2% 99%); box-shadow: 8px 8px 0px #1a1a1a;"
            font_family = "'Caveat', cursive"
            primary_color = "#e11d48"  # Rose
            secondary_color = "#e8c547"  # Yellow-Gold
            text_color = "#1a1a1a"
        else:  # mograph
            bg_style = "background: rgba(10, 10, 10, 0.9); border-radius: 4px; border: 2px solid #00ff88; box-shadow: 0 0 20px rgba(0, 255, 136, 0.35);"
            font_family = "'Outfit', sans-serif"
            primary_color = "#00ff88"  # Neon green
            secondary_color = "#ff3366"  # Neon pink
            text_color = "#ffffff"

        for idx, el in enumerate(elements):
            el_type = el.get("type", "text_block")
            delay = float(el.get("delay", 0.0))
            el_id = f"el_{idx}"

            # ─── Render Stats Card ───
            if el_type in ("vox_stats", "stats_card", "stat_burst"):
                title = el.get("title", "Metric")
                number = el.get("number", "100%")
                html = f"""
                <div id="{el_id}" class="clip" style="position: absolute; top: 120px; left: 80px; width: 920px; padding: 40px; {bg_style} opacity: 0;">
                    <div style="font-family: {font_family}; font-size: 32px; font-weight: 500; color: {text_color}; opacity: 0.8; margin-bottom: 12px;">{title}</div>
                    <div id="{el_id}_num" style="font-family: {font_family}; font-size: 110px; font-weight: 900; color: {primary_color}; line-height: 1;">{number}</div>
                    <svg width="800" height="20" style="margin-top: 24px; overflow: visible;">
                        <line id="{el_id}_line" x1="0" y1="10" x2="800" y2="10" stroke="{secondary_color}" stroke-width="4" stroke-linecap="round" />
                    </svg>
                </div>
                """
                html_blocks.append(html)

                # Append GSAP sequence
                anim = f"""
                tl.fromTo('#{el_id}', {{opacity: 0, y: 35}}, {{opacity: 1, y: 0, duration: 0.6, ease: 'power3.out'}}, {delay});
                tl.fromTo('#{el_id}_num', {{scale: 0.6, opacity: 0}}, {{scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.5)'}}, {delay + 0.3});
                tl.fromTo('#{el_id}_line', {{strokeDasharray: 800, strokeDashoffset: 800}}, {{strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut'}}, {delay + 0.5});
                """
                animations.append(anim)

            # ─── Render Bullet Highlights List ───
            elif el_type in ("bullet_list", "items_list"):
                title = el.get("title", "Highlights")
                items = el.get("items", [])
                items_html = "".join([f"<div class='item_{idx}' style='margin-bottom: 16px; opacity: 0; font-family: {font_family}; font-size: 36px; color: {text_color};'>• {item}</div>" for item in items])
                
                html = f"""
                <div id="{el_id}" class="clip" style="position: absolute; top: 250px; left: 80px; width: 920px; padding: 40px; {bg_style} opacity: 0;">
                    <div style="font-family: {font_family}; font-size: 40px; font-weight: 800; color: {primary_color}; margin-bottom: 24px; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 12px;">{title}</div>
                    <div id="{el_id}_list">{items_html}</div>
                </div>
                """
                html_blocks.append(html)

                anim = f"""
                tl.fromTo('#{el_id}', {{opacity: 0, y: 30}}, {{opacity: 1, y: 0, duration: 0.6, ease: 'power3.out'}}, {delay});
                """
                for item_idx in range(len(items)):
                    anim += f"\ntl.fromTo('#{el_id} .item_{item_idx}', {{opacity: 0, x: -20}}, {{opacity: 1, x: 0, duration: 0.4, ease: 'power2.out'}}, {delay + 0.3 + (item_idx * 0.2)});"
                animations.append(anim)

            # ─── Render Sticky Note / Polaroid Card ───
            else:
                title = el.get("title", "Note")
                text = el.get("text", "")
                html = f"""
                <div id="{el_id}" class="clip" style="position: absolute; top: 150px; left: 80px; width: 920px; padding: 36px; {bg_style} opacity: 0;">
                    <div style="font-family: {font_family}; font-size: 48px; font-weight: 700; color: {primary_color}; margin-bottom: 12px;">{title}</div>
                    <div style="font-family: {font_family}; font-size: 32px; font-weight: 400; color: {text_color}; line-height: 1.4;">{text}</div>
                </div>
                """
                html_blocks.append(html)

                anim = f"""
                tl.fromTo('#{el_id}', {{opacity: 0, scale: 0.8, rotation: -2}}, {{opacity: 1, scale: 1, rotation: 1, duration: 0.55, ease: 'back.out(1.3)'}}, {delay});
                """
                animations.append(anim)

        # ─── Camera Animations ───
        camera_anim = ""
        if camera:
            c_zoom = camera.get("zoom", 1.0)
            c_rotX = camera.get("rotationX", 0)
            c_rotY = camera.get("rotationY", 0)
            camera_anim = f"tl.to('#root', {{scale: {c_zoom}, rotationX: {c_rotX}, rotationY: {c_rotY}, duration: 1.0, ease: 'power2.out'}}, 0);"

        # Wrap in full standard template structure
        full_html = f"""
        <div id="root" data-composition-id="main" data-start="{start}" data-duration="{duration}" data-width="1080" data-height="1920">
            {"".join(html_blocks)}
            <script>
                const tl = gsap.timeline({{ paused: true }});
                {camera_anim}
                {"".join(animations)}
                window.__timelines = window.__timelines || {{}};
                window.__timelines['main'] = tl;
            </script>
        </div>
        """
        return full_html.strip()
