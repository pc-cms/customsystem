"""Jackpot wins from ``/api/bonusreport/get_jackpot_wins/``.

Player linkage is kept when ACE provides it. Amounts already counted in OUT are
never re-added to Slot Result — this job only records the jackpot event.
"""
from __future__ import annotations

import logging

from ace_collector.analytics_parser import normalize_jackpot_win

logger = logging.getLogger("ace-collector")


def _rows(results) -> list[dict]:
    if isinstance(results, list):
        return [r for r in results if isinstance(r, dict)]
    if isinstance(results, dict):
        for value in results.values():
            if isinstance(value, list):
                return [r for r in value if isinstance(r, dict)]
    return []


def collect(client, start: str | None = None, end: str | None = None) -> list[dict]:
    payload: dict = {}
    if start and end:
        payload = {"start_date": start, "end_date": end}
    results = client.api_json("bonusreport", "get_jackpot_wins", payload)
    items: list[dict] = []
    for row in _rows(results):
        occurred = (
            row.get("jp_win_date")
            or row.get("win_date")
            or row.get("date_win")
            or row.get("jp_date")
        )
        business_date = str(occurred)[:10] if occurred and len(str(occurred)) >= 10 else None
        if business_date and not business_date[:4].isdigit():
            business_date = None
        item = normalize_jackpot_win(row, business_date)
        if item:
            items.append(item)
    logger.info("ACE jackpot wins rows=%d", len(items))
    return items


def run(client, api, dry_run: bool = True) -> list[dict]:
    items = collect(client)
    if items:
        api.send("jackpots", items, dry_run=dry_run)
    return items
