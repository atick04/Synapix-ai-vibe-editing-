import os
import time
import httpx
import logging

logger = logging.getLogger(__name__)

def generate_audio_via_replicate(prompt: str, duration: int = 10) -> str:
    """
    Генерирует аудио с помощью модели stability-ai/stable-audio-2.5 на Replicate.
    Использует прямые HTTP-запросы для максимальной надежности и независимости от SDK.
    """
    api_token = os.getenv("REPLICATE_API_TOKEN")
    if not api_token:
        # Попробуем загрузить принудительно из dotenv на случай, если env еще не обновился
        from dotenv import load_dotenv
        load_dotenv()
        api_token = os.getenv("REPLICATE_API_TOKEN")
        
    if not api_token:
        raise ValueError("REPLICATE_API_TOKEN не настроен в файле .env или переменных окружения")

    logger.info(f"Stable Audio 2.5: Launching prediction for prompt='{prompt}', duration={duration}s")

    headers = {
        "Authorization": f"Token {api_token}",
        "Content-Type": "application/json"
    }

    # URL создания предсказания на Replicate для модели stability-ai/stable-audio-2.5
    url = "https://api.replicate.com/v1/models/stability-ai/stable-audio-2.5/predictions"
    payload = {
        "input": {
            "prompt": prompt,
            "seconds_total": int(duration),
            "steps": 8
        }
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, json=payload, headers=headers)
            if response.status_code != 201:
                logger.error(f"Replicate prediction creation failed: {response.text}")
                raise RuntimeError(f"Replicate API error: {response.text}")
            
            prediction = response.json()
            prediction_id = prediction.get("id")
            status_url = prediction.get("urls", {}).get("get")
            
            if not prediction_id or not status_url:
                raise RuntimeError("Не удалось получить ID предсказания или URL проверки статуса от Replicate")

            logger.info(f"Replicate prediction created: {prediction_id}. Starting status polling...")

            # Polling: опрашиваем статус каждые 3-4 секунды (до 60 раз, т.е. 3-4 минуты)
            for attempt in range(60):
                time.sleep(3.5)
                status_resp = client.get(status_url, headers=headers)
                if status_resp.status_code != 200:
                    logger.warning(f"Replicate polling warning (HTTP {status_resp.status_code}): {status_resp.text}")
                    continue
                
                status_data = status_resp.json()
                status = status_data.get("status")
                logger.info(f"Replicate prediction status: {status} (attempt {attempt+1}/60)")

                if status == "succeeded":
                    output_url = status_data.get("output")
                    if not output_url:
                        raise RuntimeError("Генерация завершена успешно, но выходной URL отсутствует.")
                    logger.info(f"Replicate audio generation succeeded: {output_url}")
                    return output_url
                elif status in ["failed", "canceled"]:
                    error_msg = status_data.get("error") or "Неизвестная ошибка модели"
                    logger.error(f"Replicate generation failed: {error_msg}")
                    raise RuntimeError(f"Генерация аудио прервана со статусом: {status}. Ошибка: {error_msg}")

            raise TimeoutError("Превышено время ожидания генерации аудиоклипа на Replicate (3+ минуты)")
            
    except Exception as e:
        logger.error(f"Error generating audio via Replicate API: {str(e)}")
        raise e
