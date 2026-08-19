from __future__ import annotations

import hashlib
import hmac
import re
import secrets

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ITERATIONS = 390_000


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def valid_email(value: str) -> bool:
    return bool(_EMAIL_RE.match(normalize_email(value)))


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        _ITERATIONS,
    ).hex()
    return f"pbkdf2$sha256${_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, algo, iterations, salt, digest = (stored or "").split("$")
        if scheme != "pbkdf2" or algo != "sha256":
            return False
        check = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt),
            int(iterations),
        ).hex()
        return hmac.compare_digest(check, digest)
    except (ValueError, TypeError):
        return False
