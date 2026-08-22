import difflib
import re
from typing import List, Dict, Any

# Only true parasites / vocal stalls. Content words like «это», «вот», «просто»
# used to be cut as fillers and produced jump-cuts in the middle of a thought.
SINGLE_FILLERS = {
    "эээ", "ээ", "э-э", "ммм", "мм", "м-м", "ааа", "аа", "а-а", "эм", "э-эм",
    "типа", "короче", "слышь", "like", "uh", "um", "ah", "uhm",
}

MULTI_WORD_FILLERS = {
    "как бы", "в общем", "в общем-то", "так сказать", "это самое", 
    "в принципе", "понимаешь ли", "как сказать", "you know", "kind of"
}

def clean_word(word: str) -> str:
    """Clean word from punctuation and convert to lowercase."""
    word_clean = re.sub(r'\[[^\]]+\]|\([^\)]+\)', '', word)
    return re.sub(r'[^\w\s-]', '', word_clean).strip().lower()

def suggest_smart_cuts(transcript_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Analyzes transcript word timings and text content to suggest optimized cut-outs:
    - Initial and ending silences
    - Long pauses between words (> 1.15s) with 0.28s padding so breath and cadence survive
    - Expanded list of filler words & phrases
    - Duplicate attempts, stutters, and off-screen prompter prompts.
    """
    suggestions = []
    if not transcript_data or "words" not in transcript_data:
        return suggestions

    words = transcript_data["words"]
    if not words:
        return suggestions

    n = len(words)
    total_duration = transcript_data.get("duration")
    if not total_duration and n > 0:
        total_duration = float(words[-1].get("end", 0.0)) + 1.0

    # 1. Trim silence at the very start of the video
    first_w_start = float(words[0].get("start", 0.0))
    if first_w_start > 0.55:
        suggestions.append({
            "start": 0.0,
            "end": round(first_w_start - 0.22, 2),
            "reason": "silence_start",
            "text": "Начальная пауза"
        })

    # 2. Trim silence at the very end of the video
    last_w_end = float(words[-1].get("end", 0.0))
    if total_duration and total_duration - last_w_end > 0.7:
        suggestions.append({
            "start": round(last_w_end + 0.22, 2),
            "end": round(total_duration, 2),
            "reason": "silence_end",
            "text": "Финальная пауза"
        })

    # Helper for safe padding
    def get_safe_cut(target_start, target_end, idx_start, idx_end, padding=0.22):
        prev_end = float(words[idx_start - 1].get("end", 0.0)) if idx_start > 0 else 0.0
        next_start = float(words[idx_end + 1].get("start", target_end)) if idx_end < n - 1 else target_end + padding
        
        c_start = target_start - padding
        if c_start < prev_end + 0.05:
            c_start = prev_end + 0.05
            
        c_end = target_end + padding
        if c_end > next_start - 0.05:
            c_end = next_start - 0.05
            
        if c_start > target_start: c_start = target_start
        if c_end < target_end: c_end = target_end
            
        return round(c_start, 2), round(c_end, 2)

    # 3. Filler Words (Single and Multi-Word Phrases)
    words_to_cut_indices = set()
    
    # Scan for single filler words
    for idx, w in enumerate(words):
        word_text = w.get("word", "")
        clean_text = clean_word(word_text)
        if clean_text in SINGLE_FILLERS:
            words_to_cut_indices.add(idx)
            c_start, c_end = get_safe_cut(float(w.get("start", 0.0)), float(w.get("end", 0.0)), idx, idx)
            suggestions.append({
                "start": c_start,
                "end": c_end,
                "reason": "filler",
                "text": f"Слово-паразит: \"{word_text}\""
            })

    # Scan for multi-word filler phrases
    for idx in range(n - 1):
        w1 = words[idx]
        w2 = words[idx + 1]
        phrase = f"{clean_word(w1.get('word', ''))} {clean_word(w2.get('word', ''))}"
        if phrase in MULTI_WORD_FILLERS:
            words_to_cut_indices.add(idx)
            words_to_cut_indices.add(idx + 1)
            c_start, c_end = get_safe_cut(float(w1.get("start", 0.0)), float(w2.get("end", 0.0)), idx, idx + 1)
            suggestions.append({
                "start": c_start,
                "end": c_end,
                "reason": "filler",
                "text": f"Фраза-паразит: \"{w1.get('word','') } {w2.get('word','')}\""
            })

    # Scan for bracketed noise annotations in words list (e.g., [шум], [вздох], (смех))
    for idx, w in enumerate(words):
        word_text = w.get("word", "")
        if re.search(r'\[[^\]]+\]|\([^\)]+\)', word_text):
            words_to_cut_indices.add(idx)
            c_start, c_end = get_safe_cut(float(w.get("start", 0.0)), float(w.get("end", 0.0)), idx, idx)
            suggestions.append({
                "start": c_start,
                "end": c_end,
                "reason": "filler",
                "text": f"Неречевой шум: \"{word_text}\""
            })

    # Scan for off-screen/prompter segments and mark all words inside them to be cut
    segments = transcript_data.get("segments", [])
    for seg in segments:
        seg_text = seg.get("text", "").lower()
        if any(tag in seg_text for tag in ["за кадром", "голос за кадром", "подсказк", "off-screen", "prompter", "шум"]):
            seg_start = float(seg.get("start", 0.0))
            seg_end = float(seg.get("end", 0.0))
            for idx, w in enumerate(words):
                w_start = float(w.get("start", 0.0))
                w_end = float(w.get("end", 0.0))
                # Mark as cut if word resides inside the offscreen segment
                if w_start >= seg_start - 0.15 and w_end <= seg_end + 0.15:
                    words_to_cut_indices.add(idx)
                    suggestions.append({
                        "start": w_start,
                        "end": w_end,
                        "reason": "filler",
                        "text": f"Закадровый голос/подсказка: \"{w.get('word', '')}\""
                    })

    # 4. Long pauses only. 0.6–1.1s is natural breath — cutting it makes jump-cuts.
    for i in range(n - 1):
        if i in words_to_cut_indices or (i + 1) in words_to_cut_indices:
            continue
        w_curr = words[i]
        w_next = words[i + 1]
        
        end_curr = float(w_curr.get("end", 0.0))
        start_next = float(w_next.get("start", 0.0))
        
        pause_dur = start_next - end_curr
        if pause_dur > 1.15:
            cut_start = end_curr + 0.28
            cut_end = start_next - 0.28
            if cut_end > cut_start + 0.35:
                suggestions.append({
                    "start": round(cut_start, 2),
                    "end": round(cut_end, 2),
                    "reason": "silence",
                    "text": f"Затянутая пауза: {pause_dur:.1f} сек"
                })

    # 5. Duplicate Takes, Stutters, and Prompter Voice Detection
    # Look for repeating sequences of words (length 1 to 5)
    i = 0
    processed_indices = set()
    while i < n:
        if i in processed_indices or i in words_to_cut_indices:
            i += 1
            continue
            
        found_repeat = False
        
        # Check phrase lengths from 5 down to 1
        for L in range(5, 0, -1):
            if i + L > n:
                continue
                
            # Look ahead for a matching block starting at j
            for j in range(i + L, min(i + L + 18, n)):
                if j + L > n:
                    continue
                
                # Verify indices are not already processed
                if any(idx in processed_indices or idx in words_to_cut_indices for idx in range(i, i + L)) or \
                   any(idx in processed_indices or idx in words_to_cut_indices for idx in range(j, j + L)):
                    continue
                
                phrase1_words = words[i : i+L]
                phrase2_words = words[j : j+L]
                
                phrase1_clean = [clean_word(w.get("word", "")) for w in phrase1_words]
                phrase2_clean = [clean_word(w.get("word", "")) for w in phrase2_words]
                
                # Filter out fillers
                p1_cmp = [w for w in phrase1_clean if w and w not in SINGLE_FILLERS]
                p2_cmp = [w for w in phrase2_clean if w and w not in SINGLE_FILLERS]
                
                if not p1_cmp or not p2_cmp:
                    continue
                    
                is_match = False
                if len(p1_cmp) >= 2 and len(p2_cmp) >= 2:
                    ratio = difflib.SequenceMatcher(None, " ".join(p1_cmp), " ".join(p2_cmp)).ratio()
                    if ratio > 0.78:
                        is_match = True
                elif len(p1_cmp) == 1 and len(p2_cmp) == 1:
                    w1, w2 = p1_cmp[0], p2_cmp[0]
                    # Single word repeat check
                    if w1 == w2 and len(w1) > 3:
                        gap = float(phrase2_words[0].get("start", 0.0)) - float(phrase1_words[-1].get("end", 0.0))
                        has_filler_between = False
                        for idx in range(i + L, j):
                            if clean_word(words[idx].get("word", "")) in SINGLE_FILLERS:
                                has_filler_between = True
                                break
                        if gap > 0.4 or has_filler_between:
                            is_match = True
                
                if is_match:
                    # We found a repeat or a prompter prompt!
                    # Keep the second instance (clean repeat) and cut the first attempt + gap
                    cut_start = float(phrase1_words[0].get("start", 0.0))
                    cut_end = float(phrase2_words[0].get("start", 0.0))
                    
                    if cut_end > cut_start + 0.05:
                        text_p1 = " ".join([w.get("word", "") for w in phrase1_words])
                        text_p2 = " ".join([w.get("word", "") for w in phrase2_words])
                        suggestions.append({
                            "start": round(cut_start, 2),
                            "end": round(cut_end, 2),
                            "reason": "duplicate",
                            "text": f"Повтор/подсказка: \"{text_p1}\" (переснято в \"{text_p2}\")"
                        })
                        
                        # Mark all indices of the first attempt and the gap as processed
                        for idx in range(i, j):
                            processed_indices.add(idx)
                            
                        found_repeat = True
                        break
            if found_repeat:
                break
        
        if found_repeat:
            i = j
        else:
            i += 1

    suggestions.sort(key=lambda x: x["start"])
    merged: List[Dict[str, Any]] = []
    for s in suggestions:
        if merged and s["start"] <= merged[-1]["end"] + 0.08:
            merged[-1]["end"] = max(merged[-1]["end"], s["end"])
            if s.get("reason") == "duplicate":
                merged[-1]["reason"] = "duplicate"
            prev_text = merged[-1].get("text") or ""
            new_text = s.get("text") or ""
            if new_text and new_text not in prev_text:
                merged[-1]["text"] = f"{prev_text}; {new_text}" if prev_text else new_text
        else:
            merged.append(dict(s))
    return merged
