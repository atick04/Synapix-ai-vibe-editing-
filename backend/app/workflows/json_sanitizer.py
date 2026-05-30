"""
Robust JSON Sanitizer & Parser for AI agent responses.
Cleans common LLM syntax bugs (like escaped backticks, double curly braces, or single-quote escapes)
before standard JSON parsing.
"""

import re
import json

def sanitize_json_str(raw: str) -> str:
    """Fix common LLM JSON quirks before parsing."""
    s = raw.strip()
    
    # Strip one layer of double curly braces wrapping the entire JSON, if present
    if s.startswith("{{") and s.endswith("}}"):
        s = s[1:-1]
        
    # Walk the string to find and escape invalid control characters (like raw newlines) inside double quotes
    in_string = False
    escape = False
    chars = []
    for char in s:
        if escape:
            chars.append(char)
            escape = False
            continue
        
        if char == '\\':
            chars.append(char)
            escape = True
            continue
            
        if char == '"':
            in_string = not in_string
            chars.append(char)
            continue
            
        if in_string:
            if char == '\n':
                chars.append('\\n')
            elif char == '\r':
                chars.append('\\r')
            elif char == '\t':
                chars.append('\\t')
            elif ord(char) < 32:
                # Other control characters
                pass
            else:
                chars.append(char)
        else:
            chars.append(char)
            
    s = "".join(chars)
        
    # 2. Remove invalid backslash escapes that break json.loads
    # Group 1: valid unicode. Group 2: valid simple escapes. Group 3: invalid escape character.
    def sub_func(m):
        if m.group(1) or m.group(2):
            return m.group(0) # valid escape, keep as is
        return m.group(3) # invalid escape, strip the backslash
        
    s = re.sub(r'(\\u[0-9a-fA-F]{4})|(\\["\\/bfnrt])|\\(.)', sub_func, s)
    return s

def safe_json_loads(raw: str):
    """Sanitize and load a single JSON string."""
    return json.loads(sanitize_json_str(raw))

def parse_json_blocks_from_text(text: str) -> list:
    """Extract all JSON objects from raw text (checking code blocks and bare JSON)."""
    results = []
    # 1. Try ```json ... ``` blocks first
    matches = re.findall(r'```json\s*(.*?)\s*```', text, re.DOTALL)
    for m in matches:
        try:
            results.append(safe_json_loads(m))
        except Exception:
            pass
            
    # 2. Try raw ``` ... ``` blocks
    if not results:
        matches_raw = re.findall(r'```\s*(.*?)\s*```', text, re.DOTALL)
        for m in matches_raw:
            try:
                results.append(safe_json_loads(m))
            except Exception:
                pass

    # 3. Fallback: find outer braces { ... }
    if not results:
        s = text.find("{")
        e = text.rfind("}")
        if s != -1 and e != -1:
            try:
                results.append(safe_json_loads(text[s:e+1]))
            except Exception:
                pass
                
    return results
