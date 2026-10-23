"""
Shopify Admin token via Client Credentials Grant (CLI side)
-----------------------------------------------------------
Same grant the Express service uses, so the Python tools never need a shpat_ token:
    POST https://{shop}/admin/oauth/access_token
    grant_type=client_credentials&client_id=…&client_secret=…

Cached in memory for expires_in seconds, refreshed 5 minutes early.
Falls back to SHOPIFY_ACCESS_TOKEN (deprecated) only if client credentials are absent.
"""
import os
import time
import json
from typing import Optional

import requests


class TokenError(RuntimeError):
    pass


class ShopifyToken:
    def __init__(self, shop: str, client_id: str = "", client_secret: str = "", static_token: str = ""):
        self.shop = (shop or "").replace("https://", "").replace("http://", "").rstrip("/")
        if self.shop and "." not in self.shop:
            self.shop = f"{self.shop}.myshopify.com"
        self.client_id = (client_id or "").strip()
        self.client_secret = (client_secret or "").strip()
        self.static_token = (static_token or "").strip()
        self._token: Optional[str] = None
        self._expires_at = 0.0
        self.scope: Optional[str] = None
        self.source: Optional[str] = None

    @property
    def configured(self) -> bool:
        return bool(self.shop and ((self.client_id and self.client_secret) or self.static_token))

    def get(self, force: bool = False) -> str:
        if not force and self._token and time.time() < self._expires_at - 300:
            return self._token
        return self._fetch()

    def _fetch(self) -> str:
        if not self.shop:
            raise TokenError("SHOPIFY_SHOP_DOMAIN 未配置")
        if not (self.client_id and self.client_secret):
            if self.static_token:
                self._token, self.source, self._expires_at = self.static_token, "static_env", time.time() + 3600
                return self._token
            raise TokenError("缺少 SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET")

        res = requests.post(
            f"https://{self.shop}/admin/oauth/access_token",
            data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            },
            headers={"Accept": "application/json"},
            timeout=25,
        )
        if res.status_code != 200:
            raise TokenError(f"token request {res.status_code}: {res.text[:300]}")
        try:
            payload = res.json()
        except json.JSONDecodeError:
            raise TokenError(f"token response not JSON: {res.text[:200]}")
        token = payload.get("access_token")
        if not token:
            raise TokenError(f"token response missing access_token: {payload}")
        self._token = token
        self.scope = payload.get("scope")
        self._expires_at = time.time() + int(payload.get("expires_in") or 86399)
        self.source = "client_credentials"
        return token

    def status(self) -> dict:
        return {
            "shop": self.shop,
            "configured": self.configured,
            "cached": bool(self._token) and time.time() < self._expires_at,
            "scope": self.scope,
            "expires_in": int(self._expires_at - time.time()) if self._expires_at else None,
            "source": self.source,
        }
