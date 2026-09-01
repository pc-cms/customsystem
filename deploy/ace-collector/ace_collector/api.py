"""Client for the Casino System ace-finance-ingest edge function.

Stateless by design: no local queue, no database, no buffer. A failed send is
logged; the next cron run retries with fresh values.
"""
from __future__ import annotations

import logging

import requests

from .config import Config

logger = logging.getLogger("ace-collector")

SUCCESS_STATUSES = (
    "live_updated",
    "closing_recorded",
    "already_recorded",
    "history_filled",
    "new_statistics_day_created",
    "existing_day_fields_filled",
    "shift_day_statistics_created",
    "existing_day_unchanged",
)



class ApiError(RuntimeError):
    pass


class IngestApi:
    def __init__(self, cfg: Config):
        self.cfg = cfg

    def send(self, payload: dict, dry_run: bool = False) -> dict:
        if dry_run:
            logger.info("DRY-RUN payload: %s", payload)
            return {"ok": True, "status": "dry_run"}

        headers = {
            "Content-Type": "application/json",
            "x-ace-key": self.cfg.api_key,
        }
        try:
            resp = requests.post(
                self.cfg.api_url, json=payload, headers=headers, timeout=self.cfg.http_timeout
            )
        except requests.RequestException as exc:
            raise ApiError(f"network error: {exc}") from exc

        try:
            body = resp.json()
        except ValueError:
            body = {"raw": resp.text[:300]}

        if resp.status_code != 200 or not body.get("ok"):
            raise ApiError(f"HTTP {resp.status_code}: {body}")

        status = body.get("status", "ok")
        if status not in SUCCESS_STATUSES:
            logger.warning("Unexpected success status from API: %s", status)
        logger.info("API accepted payload (period_id=%s): %s", payload.get("period_id"), status)
        return body
