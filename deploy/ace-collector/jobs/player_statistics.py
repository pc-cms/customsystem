"""PLACEHOLDER — future job: push ACE player statistics into Casino System.

Not implemented yet. It intentionally reuses the same building blocks as the
finance job:

    from ace_collector.config import Config
    from ace_collector.ace_client import AceClient
    from ace_collector.api import IngestApi

Planned flow:
    1. cfg = Config.load()
    2. client = AceClient(cfg); client.enter_manager_finance()
    3. fetch the player statistics report HTML
    4. parse rows into per-player records
    5. POST them to a dedicated ingest endpoint

Do not enable in cron until implemented.
"""
from __future__ import annotations


def run(*_args, **_kwargs):  # pragma: no cover - placeholder
    raise NotImplementedError("player_statistics job is not implemented yet")
