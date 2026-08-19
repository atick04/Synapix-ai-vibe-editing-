from __future__ import annotations

import json
import logging
import os
import smtplib
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path
from urllib import error as urlerror
from urllib import request as urlrequest

from app.auth.config import is_production

logger = logging.getLogger(__name__)

_LOGO_PATH = Path(__file__).resolve().parent / "assets" / "synapix-logo.png"
_LOGO_CID = "synapix-logo"
PROD_FROM = "Synapix <noreply@synapix.ai>"
PROD_LOGO_URL = "https://synapix.ai/logo.png"
PROD_FROM_DOMAIN = "synapix.ai"


def _sender_address(value: str) -> str:
    raw = (value or "").strip()
    if "<" in raw and ">" in raw:
        return raw[raw.rfind("<") + 1:raw.rfind(">")].strip().lower()
    return raw.lower()


def _is_brand_sender(value: str) -> bool:
    address = _sender_address(value)
    return address.endswith(f"@{PROD_FROM_DOMAIN}")


def mail_from() -> str:
    explicit = (os.getenv("SMTP_FROM") or os.getenv("MAIL_FROM") or "").strip()
    if is_production():
        sender = explicit or PROD_FROM
        if not _is_brand_sender(sender):
            raise RuntimeError(
                "Production SMTP_FROM must be @synapix.ai, e.g. Synapix <noreply@synapix.ai>"
            )
        return sender
    if explicit:
        return explicit
    user = (os.getenv("SMTP_USER") or "").strip()
    if user and "@" in user:
        return f"Synapix <{user}>"
    return PROD_FROM


def mail_reply_to() -> str:
    return (os.getenv("MAIL_REPLY_TO") or mail_from()).strip()


def mail_logo_src(*, embed_cid: bool = False) -> str | None:
    url = (os.getenv("MAIL_LOGO_URL") or "").strip()
    if url:
        return url
    if is_production():
        return PROD_LOGO_URL
    if embed_cid and _logo_bytes():
        return f"cid:{_LOGO_CID}"
    return None


def assert_production_mail() -> None:
    if not is_production():
        return
    if not mail_configured():
        raise RuntimeError("RESEND_API_KEY is required in production")
    mail_from()


def smtp_credentials() -> tuple[str, str, str]:
    host = (os.getenv("SMTP_HOST") or "").strip()
    user = (os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS") or "").strip()
    return host, user, password


def mail_configured() -> bool:
    if (os.getenv("RESEND_API_KEY") or "").strip():
        return True
    host, user, password = smtp_credentials()
    return bool(host and user and password)


def _logo_bytes() -> bytes | None:
    if _LOGO_PATH.exists():
        return _LOGO_PATH.read_bytes()
    fallback = Path(__file__).resolve().parents[3] / "frontend" / "public" / "logo.png"
    if fallback.exists():
        return fallback.read_bytes()
    return None


def _html_code_email(code: str, logo_src: str | None = None) -> str:
    logo = ""
    if logo_src:
        logo = f"""
                      <tr>
                        <td align="center" style="padding:0 0 20px;">
                          <img src="{logo_src}" width="56" height="56" alt="Synapix" style="display:block;width:56px;height:56px;border-radius:16px;border:0;outline:none;"/>
                        </td>
                      </tr>"""
    digits = " ".join(code)
    return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Код подтверждения Synapix</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F7;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Ваш код Synapix: {code}. Действует 10 минут.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3F4F7" style="background:#F3F4F7;width:100%;">
    <tr>
      <td align="center" style="padding:40px 16px 48px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;">
          <tr>
            <td align="center" style="padding:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8B8F98;">
              Synapix
            </td>
          </tr>
          <tr>
            <td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid #E4E6EC;border-radius:20px;padding:36px 32px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                {logo}
                <tr>
                  <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:700;color:#111318;padding:0 0 10px;">
                    Подтвердите email
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#6B7280;padding:0 8px 24px;">
                    Введите этот код, чтобы открыть студию. Никому его не сообщайте.
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 0 8px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#F6F7FA" style="background:#F6F7FA;border:1px solid #E7E9EF;border-radius:14px;">
                      <tr>
                        <td align="center" style="padding:16px 22px;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:36px;font-weight:700;letter-spacing:8px;color:#111318;">
                          {digits}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9CA3AF;padding:20px 8px 0;">
                    Код действует 10 минут. Если это были не вы — просто проигнорируйте письмо.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9CA3AF;">
              Synapix · <a href="https://synapix.ai" style="color:#9CA3AF;text-decoration:none;">synapix.ai</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _plain_code_email(code: str) -> str:
    return (
        f"Synapix\n\n"
        f"Ваш код подтверждения: {code}\n\n"
        f"Введите его, чтобы открыть студию. Код действует 10 минут.\n"
        f"Если это были не вы — просто проигнорируйте письмо.\n"
    )


def build_code_message(to_email: str, subject: str, code: str) -> EmailMessage:
    logo = _logo_bytes()
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = mail_from()
    message["To"] = to_email
    message["Reply-To"] = mail_reply_to()
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid(domain=PROD_FROM_DOMAIN)
    message.set_content(_plain_code_email(code))
    message.add_alternative(
        _html_code_email(code, mail_logo_src(embed_cid=bool(logo))),
        subtype="html",
    )
    if logo:
        message.get_payload()[-1].add_related(
            logo,
            maintype="image",
            subtype="png",
            cid=_LOGO_CID,
        )
    return message


def send_verification_code(email: str, code: str) -> None:
    subject = "Код подтверждения Synapix"
    resend_key = (os.getenv("RESEND_API_KEY") or "").strip()
    smtp_host, smtp_user, smtp_password = smtp_credentials()
    html = _html_code_email(code, mail_logo_src(embed_cid=not bool(resend_key)))

    if is_production():
        assert_production_mail()

    if resend_key:
        _send_resend(resend_key, email, subject, html, code)
        logger.info("Verification email sent via Resend to %s", email)
        return
    if smtp_host and smtp_user and smtp_password:
        if is_production() and "gmail.com" in smtp_host.lower():
            raise RuntimeError("Gmail SMTP is not allowed in production — use Resend")
        _send_smtp(smtp_host, email, subject, code)
        logger.info("Verification email sent via SMTP to %s", email)
        return
    if is_production():
        raise RuntimeError("Mail is not configured: set RESEND_API_KEY")
    logger.warning("Mail not configured — verification code for %s is %s", email, code)


def _send_resend(api_key: str, to_email: str, subject: str, html: str, code: str) -> None:
    payload = json.dumps({
        "from": mail_from(),
        "to": [to_email],
        "reply_to": mail_reply_to(),
        "subject": subject,
        "html": html,
        "text": _plain_code_email(code),
        "tags": [{"name": "category", "value": "email_verification"}],
    }).encode("utf-8")
    req = urlrequest.Request(
        "https://api.resend.com/emails",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "synapix/1.0",
        },
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            if resp.status >= 300:
                raise RuntimeError(f"Resend failed: {resp.status}")
    except urlerror.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Resend failed: {exc.code} {body}") from exc


def _send_smtp(host: str, to_email: str, subject: str, code: str) -> None:
    port = int(os.getenv("SMTP_PORT", "587"))
    user = (os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS") or "").strip()
    message = build_code_message(to_email, subject, code)
    if port == 465:
        client = smtplib.SMTP_SSL(host, port, timeout=20)
    else:
        client = smtplib.SMTP(host, port, timeout=20)
    with client as smtp:
        if port != 465:
            smtp.starttls()
        if user:
            smtp.login(user, password)
        smtp.send_message(message)
