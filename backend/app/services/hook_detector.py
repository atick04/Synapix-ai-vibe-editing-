import os
import json
import logging
from typing import List, Dict, Any
from app.agents.base_agent import llm
from langchain_core.messages import SystemMessage, HumanMessage
from app.workflows.json_sanitizer import parse_json_blocks_from_text

logger = logging.getLogger(__name__)

async def detect_hook_phrase(transcript_words: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Анализирует первые 15 секунд транскрипта и находит самую вовлекающую фразу (хук) с помощью LLM.
    
    Возвращает словарь:
    {
        "hook": "фраза",
        "hook_start": 1.2,
        "hook_end": 4.5
    }
    """
    if not transcript_words:
        return {"hook": "", "hook_start": 0.0, "hook_end": 0.0}

    # Отбираем слова, начинающиеся в первые 15 секунд видео
    filtered_words = [w for w in transcript_words if w.get("start", 0.0) <= 15.0]
    if not filtered_words:
        # Если слов в первые 15 секунд нет, берем первые 10 слов всего транскрипта
        filtered_words = transcript_words[:10]

    # Формируем промпт со словами и их индексами/таймкодами
    word_entries = []
    for idx, w in enumerate(filtered_words):
        word_entries.append(f"{idx}: {w.get('word', '').strip()} ({w.get('start', 0.0):.2f} - {w.get('end', 0.0):.2f})")
    
    transcript_context = "\n".join(word_entries)

    system_prompt = (
        "Ты — эксперт по удержанию внимания (retention) и видеомонтажу в социальных сетях (TikTok, Instagram Reels, YouTube Shorts).\n"
        "Твоя задача — проанализировать первые 15 секунд транскрипта видео и найти ОДНУ самую цепляющую, яркую и ключевую фразу-хук (hook), которая завлекает зрителя с первых секунд.\n\n"
        "Хук должен быть:\n"
        "1. Естественным, непрерывным фрагментом из транскрипта.\n"
        "2. Не содержать лишних пауз или оговорок.\n"
        "3. Быть коротким и емким (обычно от 3 до 8 слов).\n"
        "4. Начинаться и заканчиваться строго на словах из предоставленного списка.\n\n"
        "Входные данные — список слов с их порядковыми номерами и таймкодами.\n"
        "Ответ верни СТРОГО в формате JSON:\n"
        "{\n"
        "  \"hook\": \"точный текст фразы на русском языке\",\n"
        "  \"start_index\": индекс первого слова в списке,\n"
        "  \"end_index\": индекс последнего слова в списке\n"
        "}\n"
        "Никакого другого текста, рассуждений или разметки markdown быть не должно! Только чистый JSON."
    )
    
    user_message = f"Проанализируй первые 15 секунд транскрипта:\n\n{transcript_context}"

    try:
        logger.info("Calling LLM to detect hook phrase from first 15 seconds...")
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_message)
        ])
        content = response.content if hasattr(response, 'content') else str(response)
        
        parsed_blocks = parse_json_blocks_from_text(content)
        if parsed_blocks:
            parsed = parsed_blocks[0]
            start_idx = int(parsed.get("start_index", 0))
            end_idx = int(parsed.get("end_index", 0))
            
            # Корректируем индексы во избежание выхода за границы
            start_idx = max(0, min(start_idx, len(filtered_words) - 1))
            end_idx = max(start_idx, min(end_idx, len(filtered_words) - 1))
            
            hook_words = filtered_words[start_idx : end_idx + 1]
            hook_text = " ".join(w.get("word", "").strip() for w in hook_words)
            hook_start = hook_words[0].get("start", 0.0)
            hook_end = hook_words[-1].get("end", 0.0)
            
            logger.info(f"Hook detected successfully: '{hook_text}' ({hook_start}s - {hook_end}s)")
            return {
                "hook": hook_text,
                "hook_start": round(hook_start, 2),
                "hook_end": round(hook_end, 2)
            }
    except Exception as e:
        logger.error(f"Error detecting hook via LLM: {e}")

    # Надежный программный fallback: берем первые 6 слов
    logger.info("Using fallback mechanism for hook detection...")
    fallback_words = filtered_words[:6]
    if fallback_words:
        hook_text = " ".join(w.get("word", "").strip() for w in fallback_words)
        hook_start = fallback_words[0].get("start", 0.0)
        hook_end = fallback_words[-1].get("end", 0.0)
        return {
            "hook": hook_text,
            "hook_start": round(hook_start, 2),
            "hook_end": round(hook_end, 2)
        }

    return {"hook": "", "hook_start": 0.0, "hook_end": 0.0}
