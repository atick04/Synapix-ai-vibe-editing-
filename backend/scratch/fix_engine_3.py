import re

file_path = r"c:\Users\User\Desktop\VibeEdit AI\backend\app\workflows\cinematic_reasoning_engine.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Define the fresh action-oriented user_prompt definition block
new_prompt_block = '''        else:
            user_prompt = f"""
==== ИНСТРУКЦИЯ ДЛЯ ВЫПОЛНЕНИЯ ====
Пользователь прислал конкретный запрос на монтаж: "{user_message}"
Ты ДОЛЖЕН сразу же проанализировать этот запрос и вызвать соответствующие инструменты из Tools Registry для его выполнения на основе транскрипта и pacing-отчета!
Не пиши пустой список "tool_calls" и не задавай лишних вопросов, если пользователь дал четкую команду (например: добавить музыку -> вызови `select_bgm`; сделать зум -> вызови `create_zoom` на таймкод из pacing peaks или транскрипта).

==== ТЕКУЩИЙ КОНТЕКСТ ====
1. Запрос пользователя: "{user_message}"
2. Текущие примененные правки: {json.dumps(active_edits, ensure_ascii=False)}
3. Стилевой профиль проекта: {json.dumps(style_info, ensure_ascii=False)}
4. Отчет темпа речи (Pacing): {json.dumps(pacing_report, ensure_ascii=False)}
5. Визуальный контекст (VLM): "{visual_context}"
6. Характеристики видео: {width}x{height} (формат: {aspect_ratio})
7. Полный транскрипт с таймкодами:
========================
{transcript_text}
========================

ДОСТУПНЫЕ ИНСТРУМЕНТЫ (Tools Registry):
{tools_desc}

Проанализируй запрос, определи нужные таймкоды из транскрипта/pacing, составь список вызовов инструментов и верни ответ СТРОГО в формате JSON с ключами 'reply' и 'tool_calls'.
"""'''

# Let's locate the else block and replace it
pattern = r'else:\s*user_prompt\s*=\s*f""".*?Сделай пошаговый разбор запроса, объясни свою творческую концепцию, вызови нужные инструменты и верни ответ СТРОГО в формате JSON\.\s*"""'
match = re.search(pattern, content, re.DOTALL)
if match:
    span = match.span()
    content = content[:span[0]] + new_prompt_block + content[span[1]:]
    print("Success replacing user prompt block!")
else:
    # generic fallback search
    content, count = re.subn(r'else:\s*user_prompt\s*=\s*f""".*?Сделай пошаговый разбор запроса.*?JSON\.\s*"""', new_prompt_block, content, flags=re.DOTALL)
    print(f"Generic replacement count: {count}")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done!")
