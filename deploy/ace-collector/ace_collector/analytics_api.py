"""Client for the Casino System `ace-player-ingest` edge function.

Completely separate from the finance `IngestApi` (which must keep behaving
exactly as before) but reuses the same ACE_INGEST_KEY and LOCATION_CODE.
"""
from __future__ import annotations

import logging

import requests

from .api import ApiError
from .config import Config

logger = logging.getLogger("ace-collector")

KINDS = ("heartbeat", "players", "transactions", "daily", "egm_status", "report", "jackpots")


class AnalyticsApi:
    def __init__(self, cfg: Config):
        self.cfg = cfg

    def send(self, kind: str, items: list[dict] | None = None, dry_run: bool = False, **extra) -> dict:
        if kind not in KINDS:
            raise ApiError(f"unknown analytics kind {kind!r}")
        payload = {"location_code": self.cfg.location_code, "kind": kind}
        if items is not None:
            payload["items"] = items
        payload.update(extra)

        if dry_run:
            logger.info(
                "ANALYTICS DRY-RUN kind=%s items=%d extra=%s",
                kind, len(items or []), {k: v for k, v in extra.items() if k != "raw_data"},
            )
            for sample in (items or [])[:3]:
                logger.info("ANALYTICS DRY-RUN sample: %s", sample)
            return {"ok": True, "status": "dry_run", "kind": kind, "items": len(items or [])}

        try:
            resp = requests.post(
                self.cfg.player_api_url,
                json=payload,
                headers={"Content-Type": "application/json", "x-ace-key": self.cfg.api_key},
                timeout=self.cfg.http_timeout,
            )
        except requests.RequestException as exc:
            raise ApiError(f"network error: {exc}") from exc

        try:
            body = resp.json()
        except ValueError:
            body = {"raw": resp.text[:300]}
        if resp.status_code != 200 or not body.get("ok"):
            raise ApiError(f"HTTP {resp.status_code}: {body}")
        logger.info("ANALYTICS accepted kind=%s -> %s", kind, body)
        return body
