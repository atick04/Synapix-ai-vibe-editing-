"""
Idea map — overlay of the speaker's thought.

Kind (path/compare/steps/funnel/cause) is inferred from THIS transcript chunk.
Visual (rail/split/stack/thesis) is chosen from kind. Face stays visible.
Look family only paints the overlay.
"""

from __future__ import annotations

import html
import re
from typing import Any, Dict, List, Optional, Sequence

KINDS = ("path", "compare", "steps", "funnel", "cause")
VISUALS = ("rail", "split", "stack", "thesis")

_STOP = {
    "это", "как", "что", "для", "или", "если", "просто", "очень", "там", "тут",
    "the", "and", "for", "that", "with", "this", "you", "your", "are", "not",
    "меня", "тебя", "когда", "чтобы", "было", "будет", "можно", "нужно",
    "есть", "вот", "уже", "ещё", "еще", "так", "всё", "все", "они", "она",
    "его", "её", "их", "мы", "вы", "он", "я", "в", "на", "по", "из", "от",
    "до", "за", "к", "о", "у", "же", "ли", "бы", "не", "ни", "но", "а",
    "то", "тот", "эта", "этот", "которые", "который", "про", "без", "при",
    "мой", "моя", "наш", "ваша", "сам", "сама", "тут", "там", "сейчас",
    "потом", "сначала", "затем", "поэтому", "потому", "значит", "типа",
    "короче", "вообще", "просто", "реально", "типа", "listen", "like", "just",
}

_COMPARE = (
    r"\bvs\b", r"против", r"а не\b", r"лучше чем", r"хуже чем",
    r"раньше.{0,12}сейчас", r"было.{0,12}стало",
)
_CAUSE = ("потому что", "из-за", "поэтому", " значит", "из за")
_STEPS = ("сначала", "потом", "затем", "шаг", "этап", "после этого", "во-первых", "во-вторых")
_PATH = ("переех", "путь", "пришёл", "пришел", "ушёл", "ушел", "преврати")


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def infer_kind(text: str) -> Optional[str]:
    t = f" {_norm(text).lower()} "
    if any(re.search(p, t) for p in _COMPARE):
        return "compare"
    if any(k in t for k in _CAUSE) or re.search(r"\bесли\b.{2,48}\bто\b", t):
        return "cause"
    if any(k in t for k in _STEPS):
        return "steps"
    if "воронк" in t or ("трафик" in t and "конверси" in t):
        return "funnel"
    if re.search(r"\bиз\s+\w+\s+в\s+\w+", t) or re.search(r"\bот\s+\w+\s+до\s+\w+", t):
        return "path"
    if any(k in t for k in _PATH):
        return "path"
    if " стало " in t and "было" in t:
        return "path"
    return None


def _content_words(text: str) -> List[str]:
    words = re.findall(r"[A-Za-zА-Яа-яЁё0-9%]+", text or "")
    out: List[str] = []
    for w in words:
        low = w.lower()
        if low in _STOP or len(low) < 3:
            continue
        if low.isdigit() and len(low) > 4:
            continue
        out.append(w)
    return out


def _clip_node(words: Sequence[str], limit: int = 2, max_chars: int = 16) -> str:
    take = [w for w in words if w][:limit]
    out = " ".join(take).strip()
    if len(out) > max_chars:
        one = take[0] if take else ""
        out = one if len(one) <= max_chars else one[:max_chars]
    return out


def _split_sides(text: str, patterns: Sequence[str]) -> List[str]:
    blob = _norm(text)
    for pat in patterns:
        parts = re.split(pat, blob, maxsplit=1, flags=re.I)
        if len(parts) == 2 and parts[0].strip() and parts[1].strip():
            return [parts[0].strip(), parts[1].strip()]
    return []


def _edge_nodes(left: str, right: str) -> List[str]:
    """Keep the words touching the conjunction, not leftover speech crumbs."""
    a = _clip_node(_content_words(left)[-2:], 2)
    b = _clip_node(_content_words(right)[:2], 2)
    return [n for n in (a, b) if n]


def extract_nodes(text: str, kind: str) -> List[str]:
    raw = _norm(text)
    if kind == "compare":
        sides = _split_sides(
            raw,
            (r"\bvs\b", r"\bпротив\b", r"\bа не\b", r"лучше чем", r"хуже чем", r"\bстало\b"),
        )
        if not sides:
            sides = re.split(r"\bсейчас\b", raw, maxsplit=1, flags=re.I)
            if len(sides) != 2:
                sides = []
        nodes = _edge_nodes(sides[0], sides[1]) if len(sides) == 2 else []
        if len(nodes) >= 2:
            return nodes[:2]

    if kind == "cause":
        sides = _split_sides(raw, (r"потому что", r"из-за", r"поэтому", r"\bзначит\b", r"\bесли\b.{0,48}\bто\b"))
        nodes = _edge_nodes(sides[0], sides[1]) if len(sides) == 2 else []
        if len(nodes) >= 2:
            return nodes[:2]

    if kind in ("steps", "path", "funnel"):
        chunks = re.split(
            r"\b(?:сначала|потом|затем|после этого|во-первых|во-вторых|и потом)\b",
            raw,
            flags=re.I,
        )
        nodes = [_clip_node(_content_words(c), 2) for c in chunks]
        nodes = [n for n in nodes if n]
        # unique while preserving order
        seen = set()
        uniq: List[str] = []
        for n in nodes:
            key = n.lower()
            if key in seen:
                continue
            seen.add(key)
            uniq.append(n)
        if len(uniq) >= 2:
            return uniq[:4]
        return uniq

    return []


def pick_visual(kind: str, nodes: Sequence[str]) -> str:
    """Map thought-shape → overlay format. Never a fullscreen staircase."""
    n = len([x for x in nodes if str(x).strip()])
    k = (kind or "").lower()
    if k in ("compare", "cause"):
        return "split"
    if k in ("steps", "path", "funnel") and n >= 2:
        return "rail"
    if n <= 2:
        return "thesis"
    return "stack"


def _short_title(text: str) -> str:
    words = _content_words(text)[:2]
    return " ".join(words).upper() if words else "МЫСЛЬ"


def build_idea_map(text: str, look: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    look = look or {}
    family = str(look.get("family") or "ink")
    density = str((look.get("montage") or {}).get("graphic_density") or "low")
    kind = infer_kind(text)
    if not kind:
        return None
    if family == "raw" and density == "minimal":
        if kind not in ("path", "cause") or len(_norm(text)) < 36:
            return None
    nodes = extract_nodes(text, kind)
    nodes = [n for n in nodes if n]
    if kind in ("compare", "cause") and len(nodes) < 2:
        return None
    if len(nodes) < 2:
        return None
    nodes = nodes[:4]
    visual = pick_visual(kind, nodes)
    seed = sum(ord(c) for c in _norm(text).lower()) % 7
    return {
        "kind": kind,
        "visual": visual,
        "nodes": nodes,
        "title": _short_title(text),
        "seed": seed,
        "family": family,
        "source": _norm(text)[:180],
    }


def concept_from_map(spec: Optional[Dict[str, Any]]) -> str:
    if not spec:
        return ""
    kind = spec.get("kind") or "path"
    visual = spec.get("visual") or pick_visual(kind, spec.get("nodes") or [])
    nodes = spec.get("nodes") or []
    arrow = " → ".join(str(n) for n in nodes)
    return f"MAP:{kind}/{visual} | {arrow}"


def parse_idea_map(concept_prompt: str, look: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    raw = (concept_prompt or "").strip()
    m = re.match(r"MAP:([a-z_]+)(?:/([a-z_]+))?\s*\|\s*(.+)$", raw, re.I | re.S)
    if not m:
        return build_idea_map(raw, look)
    kind = m.group(1).lower().strip()
    visual_hint = (m.group(2) or "").lower().strip()
    if kind not in KINDS:
        kind = "path"
    parts = re.split(r"\s*(?:→|->|—|–|,)\s*", m.group(3).strip())
    nodes = [p.strip() for p in parts if p.strip()][:4]
    if len(nodes) < 2:
        return build_idea_map(raw, look)
    visual = visual_hint if visual_hint in VISUALS else pick_visual(kind, nodes)
    family = str((look or {}).get("family") or "ink")
    return {
        "kind": kind,
        "visual": visual,
        "nodes": nodes,
        "title": (look or {}).get("title") or nodes[0].upper(),
        "seed": sum(ord(c) for c in raw.lower()) % 7,
        "family": family,
        "source": raw[:180],
    }


def _gsap_shell(hold: float, extra_in: str) -> str:
    return f"""
<script>
window.__timelines = window.__timelines || {{}};
if (window.gsap) {{
  const tl = gsap.timeline({{ paused: true }});
  window.__timelines["main"] = tl;
  {extra_in}
  tl.to("#card", {{ opacity: 0, y: 8, duration: 0.28, ease: "power2.in" }}, {hold});
}}
</script>
"""


def _rail_html(nodes: List[str], accent: str, paper: str, start: float, dur: float, is_v: bool) -> str:
    hold = max(1.05, float(dur) - 0.72)
    items = []
    for i, label in enumerate(nodes):
        safe = html.escape(label.upper()[:16])
        items.append(
            f'<div class="rail-item" id="rail-{i}">'
            f'<span class="rail-num">{i + 1:02d}</span>'
            f'<span class="rail-text">{safe}</span></div>'
        )
    w = "42%" if is_v else "28%"
    fs_num = "2.6cqw" if is_v else "1.35cqw"
    fs_txt = "2.4cqw" if is_v else "1.2cqw"
    return f"""
<div class="clip" data-start="{start}" data-duration="{dur}"
     style="position:absolute;inset:0;width:100%;height:100%;background:transparent;overflow:visible;">
  <div class="idea-rail" data-plate="1" data-idea-visual="rail" id="card">
    <div class="plate-content" data-plate-content="1">
      {''.join(items)}
    </div>
  </div>
</div>
<style>
.idea-rail {{
  position:absolute;right:5%;left:auto;top:auto !important;bottom:8% !important;
  width:{w};max-width:48%;height:auto !important;max-height:18% !important;
  display:flex;flex-direction:column;gap:0.55cqh;z-index:2;
}}
.idea-rail .plate-content {{ width:100%;display:flex;flex-direction:column;gap:0.55cqh; }}
.rail-item {{ display:flex;align-items:baseline;gap:1cqw;min-width:0; }}
.rail-num {{
  font-family:'Unbounded',sans-serif;font-weight:800;font-size:{fs_num};
  color:{accent};letter-spacing:0.04em;min-width:1.8em;opacity:0.9;flex:0 0 auto;
}}
.rail-text {{
  font-family:'Unbounded',sans-serif;font-weight:800;font-size:{fs_txt};
  color:{paper};letter-spacing:-0.03em;line-height:1.1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;
  text-shadow:0 8px 24px rgba(0,0,0,0.45);
}}
</style>
{_gsap_shell(hold, '''tl.fromTo(".rail-item", { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.34, stagger: 0.09, ease: "power3.out" }, 0.1);''')}
"""


def _split_html(nodes: List[str], kind: str, accent: str, paper: str, field: str, start: float, dur: float, is_v: bool) -> str:
    hold = max(1.05, float(dur) - 0.72)
    left = html.escape((nodes[0] if nodes else "A").upper()[:16])
    right = html.escape((nodes[1] if len(nodes) > 1 else "B").upper()[:16])
    join = "VS" if kind == "compare" else "→"
    fs = "2.6cqw" if is_v else "1.25cqw"
    join_fs = "2.1cqw" if is_v else "1.05cqw"
    return f"""
<div class="clip" data-start="{start}" data-duration="{dur}"
     style="position:absolute;inset:0;width:100%;height:100%;background:transparent;overflow:visible;">
  <div class="idea-split" data-plate="1" data-idea-visual="split" id="card">
    <div class="plate-content" data-plate-content="1">
      <div class="idea-pane" id="pane-a">{left}</div>
      <div class="idea-join" id="pane-j">{join}</div>
      <div class="idea-pane" id="pane-b">{right}</div>
    </div>
  </div>
</div>
<style>
.idea-split {{
  position:absolute;left:5%;right:5%;width:auto;top:auto !important;bottom:8% !important;
  height:auto !important;max-height:16% !important;z-index:2;
}}
.idea-split .plate-content {{
  display:flex;align-items:center;gap:1.2cqw;width:100%;min-width:0;
}}
.idea-pane {{
  flex:1;min-width:0;padding:0.7cqh 1.3cqw;background:{field}cc;border:1px solid {accent}55;
  font-family:'Unbounded',sans-serif;font-weight:800;font-size:{fs};
  color:{paper};letter-spacing:-0.03em;line-height:1.1;text-align:center;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}}
.idea-join {{
  font-family:'Unbounded',sans-serif;font-weight:800;font-size:{join_fs};
  color:{accent};letter-spacing:0.12em;flex:0 0 auto;
}}
</style>
{_gsap_shell(hold, '''tl.fromTo("#pane-a", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 0.08);
  tl.fromTo("#pane-j", { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" }, 0.18);
  tl.fromTo("#pane-b", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 0.22);''')}
"""


def _stack_html(nodes: List[str], accent: str, paper: str, start: float, dur: float, is_v: bool) -> str:
    hold = max(1.05, float(dur) - 0.72)
    chips = []
    for i, label in enumerate(nodes):
        safe = html.escape(label.upper()[:16])
        chips.append(f'<div class="stack-chip" id="chip-{i}">{safe}</div>')
    fs = "2.5cqw" if is_v else "1.2cqw"
    return f"""
<div class="clip" data-start="{start}" data-duration="{dur}"
     style="position:absolute;inset:0;width:100%;height:100%;background:transparent;overflow:visible;">
  <div class="idea-stack" data-plate="1" data-idea-visual="stack" id="card">
    <div class="plate-content" data-plate-content="1">{''.join(chips)}</div>
  </div>
</div>
<style>
.idea-stack {{
  position:absolute;left:6%;right:auto;top:auto !important;bottom:8% !important;
  width:72%;max-width:78%;height:auto !important;max-height:18% !important;
  display:flex;flex-direction:column;align-items:flex-start;gap:0.45cqh;z-index:2;
}}
.idea-stack .plate-content {{ width:100%;display:flex;flex-direction:column;gap:0.45cqh; }}
.stack-chip {{
  font-family:'Unbounded',sans-serif;font-weight:800;font-size:{fs};
  color:{paper};letter-spacing:-0.03em;line-height:1.1;
  padding:0.2em 0.55em 0.2em 0;border-bottom:1px solid {accent}66;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;
  text-shadow:0 8px 24px rgba(0,0,0,0.4);
}}
</style>
{_gsap_shell(hold, '''tl.fromTo(".stack-chip", { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.3, stagger: 0.08, ease: "power3.out" }, 0.1);''')}
"""


def _thesis_html(nodes: List[str], accent: str, paper: str, start: float, dur: float, is_v: bool) -> str:
    hold = max(1.05, float(dur) - 0.72)
    head = html.escape((nodes[0] if nodes else "МЫСЛЬ").upper()[:18])
    sats = nodes[1:3]
    sat_html = "".join(
        f'<span class="thesis-sat" id="sat-{i}">{html.escape(s.upper()[:14])}</span>'
        for i, s in enumerate(sats)
    )
    fs = "3.4cqw" if is_v else "1.6cqw"
    sat_fs = "2.0cqw" if is_v else "1.05cqw"
    return f"""
<div class="clip" data-start="{start}" data-duration="{dur}"
     style="position:absolute;inset:0;width:100%;height:100%;background:transparent;overflow:visible;">
  <div class="idea-thesis" data-plate="1" data-idea-visual="thesis" id="card">
    <div class="plate-content" data-plate-content="1">
      <div class="thesis-head" id="thesis-h">{head}</div>
      <div class="thesis-sats">{sat_html}</div>
    </div>
  </div>
</div>
<style>
.idea-thesis {{
  position:absolute;left:50%;top:auto !important;bottom:8% !important;transform:translateX(-50%);
  width:86%;max-width:90%;height:auto !important;max-height:16% !important;
  text-align:center;z-index:2;
}}
.thesis-head {{
  font-family:'Unbounded',sans-serif;font-weight:800;font-size:{fs};
  color:{paper};letter-spacing:-0.03em;line-height:1.08;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-shadow:0 10px 28px rgba(0,0,0,0.5);
}}
.thesis-sats {{ margin-top:0.45em;display:flex;justify-content:center;gap:1.4cqw;flex-wrap:nowrap;min-width:0; }}
.thesis-sat {{
  font-family:'Unbounded',sans-serif;font-weight:700;font-size:{sat_fs};
  color:{accent};letter-spacing:0.04em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42%;
}}
</style>
{_gsap_shell(hold, '''tl.fromTo("#thesis-h", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.38, ease: "power3.out" }, 0.1);
  tl.fromTo(".thesis-sat", { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.26, stagger: 0.07, ease: "power2.out" }, 0.28);''')}
"""


def fallback_html(
    spec: Dict[str, Any],
    start_time: float,
    duration: float,
    aspect_ratio: str,
    look: Optional[Dict[str, Any]] = None,
) -> str:
    """Overlay thought graphic. Visual is chosen from kind — face stays visible."""
    from app.services.content_look import default_look

    look = look if look and look.get("palette") else default_look(spec.get("family") or "ink")
    pal = look["palette"]
    accent = pal["accent"]
    paper = pal["paper"]
    field = pal["field"]
    kind = spec.get("kind") or "path"
    nodes = [str(n).strip() for n in (spec.get("nodes") or []) if str(n).strip()][:4]
    if len(nodes) < 2:
        nodes = ["МЫСЛЬ", "СМЫСЛ"]
    visual = spec.get("visual") or pick_visual(kind, nodes)
    ar_l = (aspect_ratio or "9:16").lower()
    is_v = "9:16" in ar_l or "vertical" in ar_l or "portrait" in ar_l
    if visual == "split":
        return _split_html(nodes, kind, accent, paper, field, start_time, duration, is_v)
    if visual == "stack":
        return _stack_html(nodes, accent, paper, start_time, duration, is_v)
    if visual == "thesis":
        return _thesis_html(nodes, accent, paper, start_time, duration, is_v)
    return _rail_html(nodes, accent, paper, start_time, duration, is_v)

