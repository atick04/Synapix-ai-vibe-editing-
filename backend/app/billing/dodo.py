from __future__ import annotations

import json
import logging
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

from fastapi import HTTPException

from app.billing.config import dodo_api_key, dodo_base_url, dodo_configured

logger = logging.getLogger(__name__)


def dodo_request(method: str, path: str, payload: dict | None = None, query: dict | None = None) -> dict:
    if not dodo_configured():
        raise HTTPException(status_code=503, detail="billing_not_configured")
    url = f"{dodo_base_url()}{path}"
    if query:
        url = f"{url}?{urlparse.urlencode({k: v for k, v in query.items() if v is not None})}"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {dodo_api_key()}",
            "Content-Type": "application/json",
            "User-Agent": "synapix/1.0",
        },
    )
    try:
        with urlrequest.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except urlerror.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.warning("Dodo %s %s failed: %s %s", method, path, exc.code, body)
        if exc.code in (401, 403):
            raise HTTPException(status_code=502, detail="billing_auth_failed") from exc
        raise HTTPException(status_code=502, detail="billing_request_failed") from exc
    except urlerror.URLError as exc:
        logger.warning("Dodo unreachable: %s", exc)
        raise HTTPException(status_code=502, detail="billing_unreachable") from exc


def create_checkout_session(payload: dict) -> dict:
    return dodo_request("POST", "/checkouts", payload)


def list_products() -> list[dict]:
    data = dodo_request("GET", "/products")
    if isinstance(data, list):
        return data
    items = data.get("items") or data.get("data") or []
    return items if isinstance(items, list) else []


def create_customer_portal(customer_id: str, return_url: str) -> dict:
    return dodo_request(
        "POST",
        f"/customers/{customer_id}/customer-portal/session",
        query={"return_url": return_url},
    )


def public_product(item: dict) -> dict:
    price = item.get("price") if isinstance(item.get("price"), dict) else {}
    return {
        "id": item.get("product_id") or item.get("id") or "",
        "name": item.get("name") or "Synapix",
        "description": item.get("description") or "",
        "currency": (price.get("currency") or item.get("currency") or "USD").upper(),
        "amount": price.get("price") if price.get("price") is not None else item.get("price"),
        "payment_frequency": price.get("payment_frequency_interval") or price.get("type") or item.get("tax_category") or "",
        "recurring": bool(
            item.get("is_recurring")
            or (isinstance(price, dict) and price.get("type") in ("recurring_price", "recurring"))
        ),
    }
