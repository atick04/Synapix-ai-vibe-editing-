import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv(override=True)

groq_api_key = os.getenv("GROQ_API_KEY") or "DUMMY_KEY_FOR_IMPORT"
# Используем OpenAI SDK, но направляем запросы на сверхбыстрые серверы Groq
client = AsyncOpenAI(
    api_key=groq_api_key,
    base_url="https://api.groq.com/openai/v1"
)

async def transcribe_audio(audio_path: str):
    """Transcribes an audio file and returns text with timestamps using Groq Whisper."""
    if not os.path.exists(audio_path):
        print(f"Audio file not found for transcription: {audio_path}")
        return None
        
    try:
        print(f"Starting Whisper transcription for {audio_path} via Groq...")
        with open(audio_path, "rb") as audio_file:
            try:
                transcript = await client.audio.transcriptions.create(
                    model="whisper-large-v3",
                    file=audio_file,
                    prompt="Дословная расшифровка со всеми заиканиями, повторами и неречевыми звуками. Обозначай фоновые голоса и звуки: [пауза], [вздох], [шум], [смех], [за кадром], [шепот], [кашель], эээ, ааа, ну, типа, как бы.",
                    response_format="verbose_json",
                    timestamp_granularities=["word", "segment"]
                )
            except Exception as e:
                print(f"Word-level timestamps failed natively, retrying without: {e}")
                audio_file.seek(0)
                transcript = await client.audio.transcriptions.create(
                    model="whisper-large-v3",
                    file=audio_file,
                    prompt="Дословная расшифровка со всеми заиканиями, повторами и неречевыми звуками. Обозначай фоновые голоса и звуки: [пауза], [вздох], [шум], [смех], [за кадром], [шепот], [кашель], эээ, ааа, ну, типа, как бы.",
                    response_format="verbose_json"
                )
        print("Transcription complete!")
        result = transcript.model_dump()
        
        # Estimate Whisper token usage
        # Base cost of 1500 tokens, plus 10 tokens per transcribed word (approx. audio length)
        try:
            words_count = len(result.get("text", "").split())
            estimated_tokens = 1500 + (words_count * 10)
            from app.agents.base_agent import record_raw_tokens
            record_raw_tokens(estimated_tokens)
        except Exception as e:
            print(f"Failed to record Whisper tokens: {e}")

        return result
    except Exception as e:
        print(f"OpenAI Transcription error: {str(e)}")
        return None
