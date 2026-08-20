"""
Cloudflare R2 (S3-compatible) for user media.

Local disk stays the FFmpeg scratch pad. Large media is copied to R2 so
Railway volume does not fill up. Playback hits local first, then R2.
"""

from __future__ import annotations

import logging
import mimetypes
import os
from pathlib import Path
from typing import BinaryIO, Iterator, Optional, Tuple

logger = logging.getLogger(__name__)

MEDIA_EXT = {
    ".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v",
    ".mp3", ".wav", ".m4a", ".aac", ".ogg",
    ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".ttf", ".otf", ".woff", ".woff2", ".cube",
}

_SKIP_NAME_PARTS = (
    "_transcript", "_visual", "_look", ".log", ".rendering",
    ".ass", "_worksrc", "_restore", "_corrupted", "_diag", ".exporting.",
)


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def enabled() -> bool:
    return bool(
        _env("R2_ACCOUNT_ID")
        and _env("R2_ACCESS_KEY_ID")
        and _env("R2_SECRET_ACCESS_KEY")
        and _env("R2_BUCKET_NAME")
    )


def bucket_name() -> str:
    return _env("R2_BUCKET_NAME")


def endpoint_url() -> str:
    custom = _env("R2_ENDPOINT")
    if custom:
        return custom.rstrip("/")
    account = _env("R2_ACCOUNT_ID")
    return f"https://{account}.r2.cloudflarestorage.com"


def should_persist(path: str) -> bool:
    ext = Path(path).suffix.lower()
    name = Path(path).name
    if ext not in MEDIA_EXT:
        return False
    if any(part in name for part in _SKIP_NAME_PARTS):
        return False
    return True


def should_evict() -> bool:
    flag = _env("R2_EVICT_LOCAL").lower()
    if flag in ("0", "false", "no", "off"):
        return False
    if flag in ("1", "true", "yes", "on"):
        return True
    return _env("APP_ENV").lower() == "production"


def _upload_root() -> Path:
    from app.core.paths import UPLOAD_DIR
    return Path(UPLOAD_DIR).resolve()


def rel_key(path: str) -> Optional[str]:
    """Object key relative to the uploads root (posix)."""
    if not path:
        return None
    raw = str(path).replace("\\", "/").lstrip("/")
    root = _upload_root()
    p = Path(path)
    try:
        resolved = p.resolve()
        rel = resolved.relative_to(root)
        return rel.as_posix()
    except (OSError, ValueError):
        pass
    if raw.startswith("uploads/"):
        raw = raw[len("uploads/") :]
    if "/" not in raw and raw:
        return raw
    try:
        rel = Path(raw).as_posix()
        if ".." in Path(rel).parts:
            return None
        return rel.lstrip("/")
    except Exception:
        return None


def local_path_for_key(key: str) -> Path:
    return _upload_root() / key.replace("\\", "/")


_client = None


def _s3():
    global _client
    if _client is not None:
        return _client
    if not enabled():
        return None
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        logger.warning("boto3 is not installed — R2 disabled")
        return None
    _client = boto3.client(
        "s3",
        endpoint_url=endpoint_url(),
        aws_access_key_id=_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=_env("R2_SECRET_ACCESS_KEY"),
        region_name=_env("R2_REGION") or "auto",
        config=Config(signature_version="s3v4"),
    )
    return _client


def ping() -> bool:
    client = _s3()
    if not client:
        return False
    try:
        client.head_bucket(Bucket=bucket_name())
        return True
    except Exception as e:
        logger.warning("R2 ping failed: %s", e)
        return False


def exists_remote(key: str) -> bool:
    client = _s3()
    if not client or not key:
        return False
    try:
        client.head_object(Bucket=bucket_name(), Key=key)
        return True
    except Exception:
        return False


def available(path: str) -> bool:
    if path and os.path.isfile(path) and os.path.getsize(path) > 0:
        return True
    key = rel_key(path) if path else None
    return bool(key and enabled() and exists_remote(key))


def persist(path: str) -> bool:
    """Upload a local media file to R2. Optionally delete the local copy."""
    if not enabled() or not path or not os.path.isfile(path):
        return False
    if not should_persist(path):
        return False
    key = rel_key(path)
    if not key:
        return False
    client = _s3()
    if not client:
        return False
    ctype, _ = mimetypes.guess_type(path)
    extra = {}
    if ctype:
        extra["ContentType"] = ctype
    try:
        if extra:
            client.upload_file(path, bucket_name(), key, ExtraArgs=extra)
        else:
            client.upload_file(path, bucket_name(), key)
        logger.info("R2 put %s (%s bytes)", key, os.path.getsize(path))
    except Exception as e:
        logger.warning("R2 upload failed %s: %s", key, e)
        return False
    if should_evict() and os.path.getsize(path) >= 2 * 1024 * 1024:
        try:
            os.remove(path)
            logger.info("R2 evicted local %s", key)
        except OSError:
            pass
    return True


def ensure_local(path: str) -> str:
    """Make sure `path` exists on disk, downloading from R2 if needed."""
    if path and os.path.isfile(path) and os.path.getsize(path) > 0:
        return path
    key = rel_key(path)
    if not key or not enabled():
        return path
    dest = Path(path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    client = _s3()
    if not client:
        return path
    try:
        client.download_file(bucket_name(), key, str(dest))
        logger.info("R2 get %s -> %s", key, dest)
    except Exception as e:
        logger.warning("R2 download failed %s: %s", key, e)
    return path


def find_source_video(file_id: str) -> Optional[str]:
    """Locate the original talking-head file locally or on R2."""
    root = _upload_root()
    video_ext = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
    skip = (
        "_rendered", "_transcript", "_visual", ".log", ".mp3", ".rendering",
        ".ass", "_worksrc", "_proxy", "_rvm", "_restore", "_corrupted", "_diag",
        ".exporting.",
    )
    if root.exists():
        for name in os.listdir(root):
            if not name.startswith(file_id):
                continue
            if any(x in name for x in skip):
                continue
            if Path(name).suffix.lower() not in video_ext:
                continue
            return str(root / name)

    client = _s3()
    if not client:
        return None
    try:
        resp = client.list_objects_v2(Bucket=bucket_name(), Prefix=file_id, MaxKeys=50)
    except Exception as e:
        logger.warning("R2 list failed: %s", e)
        return None
    for item in resp.get("Contents") or []:
        key = item.get("Key") or ""
        name = Path(key).name
        if any(x in name for x in skip):
            continue
        if Path(name).suffix.lower() not in video_ext:
            continue
        dest = str(local_path_for_key(key))
        return ensure_local(dest)
    return None


def head_object(key: str) -> Optional[dict]:
    client = _s3()
    if not client or not key:
        return None
    try:
        return client.head_object(Bucket=bucket_name(), Key=key)
    except Exception:
        return None


def iter_object(key: str, start: int = 0, end: Optional[int] = None) -> Tuple[Iterator[bytes], int, str]:
    """Yield body chunks. Returns (iterator, content_length_of_this_slice, content_type)."""
    client = _s3()
    if not client:
        raise FileNotFoundError(key)
    kwargs = {"Bucket": bucket_name(), "Key": key}
    if end is not None:
        kwargs["Range"] = f"bytes={start}-{end}"
    elif start > 0:
        kwargs["Range"] = f"bytes={start}-"
    resp = client.get_object(**kwargs)
    length = int(resp.get("ContentLength") or 0)
    ctype = resp.get("ContentType") or "application/octet-stream"
    body: BinaryIO = resp["Body"]

    def chunks() -> Iterator[bytes]:
        try:
            while True:
                data = body.read(1024 * 1024)
                if not data:
                    break
                yield data
        finally:
            try:
                body.close()
            except Exception:
                pass

    return chunks(), length, ctype
