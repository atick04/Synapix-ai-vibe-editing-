import os
import re
import shutil
import subprocess
import tempfile
from typing import Any, Dict, List, Optional, Tuple

from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv(override=True)

groq_api_key = os.getenv("GROQ_API_KEY") or "DUMMY_KEY_FOR_IMPORT"
client = AsyncOpenAI(
    api_key=groq_api_key,
    base_url="https://api.groq.com/openai/v1",
)

# Whisper's internal window is ~30s. Groq often drops or hallucinates after the first window
# (watermarks, "субтитры сделал …") unless we chunk ourselves.
_CHUNK_SEC = 28.0
_OVERLAP_SEC = 4.0
_WHISPER_PROMPT = (
    "Разговор на камеру. Расшифруй речь дословно, со словами-паразитами. "
    "Не описывай музыку, интро и водяные знаки."
)
_WORD_RE = re.compile(r"\w+", re.U)


def probe_audio_duration(path: str) -> float:
    try:
        res = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True, text=True, timeout=20,
        )
        return float((res.stdout or "0").strip() or 0)
    except Exception:
        return 0.0


def _norm_word(text: str) -> str:
    found = _WORD_RE.findall((text or "").lower())
    return found[0] if found else (text or "").strip().lower()


def _strip_caption_watermark(words: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if len(words) < 3:
        return words
    start_scan = max(0, len(words) - 10)
    for i in range(start_scan, len(words)):
        a = _norm_word(words[i]["word"])
        b = _norm_word(words[i + 1]["word"]) if i + 1 < len(words) else ""
        if a == "dimatorzok" or "dimator" in a:
            return words[:i]
        if a.startswith("субтит") and b in ("сделал", "создавал"):
            return words[:i]
    return words


def merge_chunk_transcripts(
    parts: List[Tuple[float, float, Dict[str, Any]]],
    duration: float,
) -> Dict[str, Any]:
    """Stitch chunk transcripts. `parts` is (chunk_start, chunk_end, verbose_json)."""
    words: List[Dict[str, Any]] = []
    language = "ru"
    for i, (offset, _end, data) in enumerate(parts):
        if data.get("language"):
            language = data["language"]
        overlap_cut = offset + (_OVERLAP_SEC * 0.55 if i else 0.0)
        for raw in data.get("words") or []:
            token = str(raw.get("word") or raw.get("text") or "").strip()
            if not token:
                continue
            start = round(float(raw.get("start") or 0) + offset, 2)
            end = round(float(raw.get("end") or start) + offset, 2)
            if start < overlap_cut - 0.04:
                continue
            words.append({"word": token, "start": start, "end": max(end, start)})
        if not data.get("words"):
            for seg in data.get("segments") or []:
                text = str(seg.get("text") or "").strip()
                if not text:
                    continue
                start = round(float(seg.get("start") or 0) + offset, 2)
                end = round(float(seg.get("end") or start) + offset, 2)
                if start < overlap_cut - 0.04:
                    continue
                pieces = text.split()
                span = max(0.05, end - start)
                for j, piece in enumerate(pieces):
                    ws = start + span * (j / max(1, len(pieces)))
                    we = start + span * ((j + 1) / max(1, len(pieces)))
                    words.append({"word": piece, "start": round(ws, 2), "end": round(we, 2)})

    words.sort(key=lambda w: (w["start"], w["end"]))
    kept: List[Dict[str, Any]] = []
    for w in words:
        if kept:
            prev = kept[-1]
            same = _norm_word(w["word"]) == _norm_word(prev["word"])
            if same and (abs(w["start"] - prev["start"]) < 0.22 or w["start"] < prev["end"] - 0.04):
                prev["end"] = max(prev["end"], w["end"])
                continue
        kept.append(dict(w))

    # YouTube ripped audio often ends with "Субтитры создавал DimaTorzok"
    kept = _strip_caption_watermark(kept)

    segments: List[Dict[str, Any]] = []
    buf: List[Dict[str, Any]] = []
    for w in kept:
        if not buf:
            buf = [w]
            continue
        gap = w["start"] - buf[-1]["end"]
        dur = w["end"] - buf[0]["start"]
        if gap > 0.85 or dur > 8.0 or len(buf) >= 18:
            segments.append({
                "start": buf[0]["start"],
                "end": buf[-1]["end"],
                "text": " ".join(x["word"] for x in buf),
            })
            buf = [w]
        else:
            buf.append(w)
    if buf:
        segments.append({
            "start": buf[0]["start"],
            "end": buf[-1]["end"],
            "text": " ".join(x["word"] for x in buf),
        })

    text = " ".join(w["word"] for w in kept).strip()
    last = kept[-1]["end"] if kept else duration
    return {
        "duration": round(max(duration, last), 3),
        "language": language,
        "text": text,
        "words": kept,
        "segments": segments,
        "task": "transcribe",
    }


def _to_wav(src: str, dest: str) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", src,
            "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
            dest,
        ],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        timeout=180,
    )


def _export_chunk(src: str, dest: str, start: float, end: float) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", src,
            "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
            "-c", "copy",
            dest,
        ],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        timeout=60,
    )


async def _transcribe_file(
    audio_path: str,
    language: Optional[str] = None,
    prompt: Optional[str] = None,
) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {
        "model": "whisper-large-v3",
        "prompt": (prompt or _WHISPER_PROMPT)[:800],
        "response_format": "verbose_json",
        "timestamp_granularities": ["word", "segment"],
    }
    if language:
        kwargs["language"] = language
    with open(audio_path, "rb") as audio_file:
        try:
            transcript = await client.audio.transcriptions.create(file=audio_file, **kwargs)
        except Exception as e:
            print(f"Word-level timestamps failed natively, retrying without: {e}")
            audio_file.seek(0)
            kwargs.pop("timestamp_granularities", None)
            transcript = await client.audio.transcriptions.create(file=audio_file, **kwargs)
    return transcript.model_dump()


async def transcribe_audio(audio_path: str):
    """Transcribe via Groq Whisper, chunking past ~30s so the tail of the clip is not dropped."""
    if not os.path.exists(audio_path):
        print(f"Audio file not found for transcription: {audio_path}")
        return None

    duration = probe_audio_duration(audio_path)
    print(f"Starting Whisper transcription for {audio_path} via Groq ({duration:.1f}s)...")

    try:
        if duration <= 28.0:
            result = await _transcribe_file(audio_path)
        else:
            tmp = tempfile.mkdtemp(prefix="whisper_chunks_")
            parts: List[Tuple[float, float, Dict[str, Any]]] = []
            language = None
            try:
                wav_path = os.path.join(tmp, "full.wav")
                _to_wav(audio_path, wav_path)
                start = 0.0
                idx = 0
                prev_tail = ""
                while start < duration - 0.25:
                    end = min(start + _CHUNK_SEC, duration)
                    chunk_path = os.path.join(tmp, f"chunk_{idx:03d}.wav")
                    _export_chunk(wav_path, chunk_path, start, end)
                    prompt = _WHISPER_PROMPT
                    if prev_tail:
                        prompt = f"{_WHISPER_PROMPT} Контекст речи: {prev_tail}"
                    data = await _transcribe_file(chunk_path, language=language, prompt=prompt)
                    n_words = len(data.get("words") or [])
                    if n_words < 3 and (end - start) > 8:
                        data = await _transcribe_file(chunk_path, language=language, prompt="")
                    if not language:
                        lang = str(data.get("language") or "").lower()
                        if lang.startswith("ru"):
                            language = "ru"
                        elif lang.startswith("en"):
                            language = "en"
                    parts.append((start, end, data))
                    chunk_words = data.get("words") or []
                    prev_tail = " ".join(str(w.get("word") or "") for w in chunk_words[-16:]).strip()
                    print(
                        f"  chunk {idx}: {start:.1f}–{end:.1f}s  "
                        f"words={len(chunk_words)}  text={(data.get('text') or '')[:80]!r}"
                    )
                    if end >= duration - 0.05:
                        break
                    start = max(0.0, end - _OVERLAP_SEC)
                    idx += 1
                result = merge_chunk_transcripts(parts, duration)
            finally:
                shutil.rmtree(tmp, ignore_errors=True)

        print(
            f"Transcription complete: {len(result.get('words') or [])} words, "
            f"until {(result.get('words') or [{}])[-1].get('end', 0)}s"
        )
        try:
            words_count = len(result.get("text", "").split())
            from app.agents.base_agent import record_raw_tokens
            record_raw_tokens(1500 + (words_count * 10))
        except Exception as e:
            print(f"Failed to record Whisper tokens: {e}")
        return result
    except Exception as e:
        print(f"OpenAI Transcription error: {str(e)}")
        return None
