"""Read-only ACE player statistics collector.

Sources (verified on Arusha):
  * ``/api/bonusreport/get_game_periods_dates/``  -> start_dates / end_dates
  * ``/api/bonusreport/get_opt_trips_tree/`` {start_date, end_date} -> rows

Rules: Drop = IN; Handle stays NULL unless a verified ACE handle field exists;
missing stays NULL; every source row is preserved in ``raw_data``; anonymous
rows (no ACE player id) are skipped — no fake players are ever generated.
"""
from __future__ import annotations

import logging

from ace_collector.analytics_parser import local_to_utc_iso, normalize_player_row

logger = logging.getLogger("ace-collector")


def _rows(results) -> list[dict]:
    """Flatten wrappers/lists into player rows.

    A dict carrying an ACE player id IS a player row: it is emitted once and
    its nested child trip rows (``data``) are NOT traversed, otherwise the same
    player would produce duplicate daily rows.
    """
    out: list[dict] = []

    def walk(node):
        if isinstance(node, dict):
            if any(k in node for k in ("ptr_id", "client_id", "player_id", "clientid")):
                out.append(node)
                return
            for value in node.values():
                if isinstance(value, (dict, list)):
                    walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(results)
    return out



def all_game_periods(client) -> list[tuple[str, str]]:
    """Return every safely paired ACE game period in source order.

    ACE sends parallel ``start_dates`` / ``end_dates`` arrays.  An unequal
    response is never inferred or padded: only indexes present in both arrays
    are paired, and blank bounds are skipped explicitly.
    """
    results = client.api_json("bonusreport", "get_game_periods_dates")
    starts: list = []
    ends: list = []
    if isinstance(results, dict):
        starts = list(results.get("start_dates") or [])
        ends = list(results.get("end_dates") or [])
    if len(starts) != len(ends):
        logger.warning(
            "ANALYTICS-HISTORY period arrays mismatch start_dates=%d end_dates=%d; "
            "pairing only %d safe indexes",
            len(starts), len(ends), min(len(starts), len(ends)),
        )
    periods: list[tuple[str, str]] = []
    for index in range(min(len(starts), len(ends))):
        start = str(starts[index] or "").strip()
        end = str(ends[index] or "").strip()
        if not start or not end:
            logger.warning(
                "ANALYTICS-HISTORY incomplete game period index=%d start=%r end=%r; skipped",
                index, start, end,
            )
            continue
        periods.append((start, end))
    return periods


def game_period(client) -> tuple[str | None, str | None]:
    """Latest ACE game period (business dates come from ACE, never guessed)."""
    results = client.api_json("bonusreport", "get_game_periods_dates")
    starts, ends = [], []
    if isinstance(results, dict):
        starts = list(results.get("start_dates") or [])
        ends = list(results.get("end_dates") or [])
    start = str(starts[-1]) if starts else None
    end = str(ends[-1]) if ends else None
    return start, end


def business_date_of(start: str | None, end: str | None) -> str | None:
    """CMS business date for the ACE period (date part of its start)."""
    for candidate in (start, end):
        if candidate and len(str(candidate)) >= 10:
            return str(candidate)[:10]
    return None


def collect(client, start: str | None = None, end: str | None = None) -> dict:
    """Return ``{"players": [...], "daily": [...], "period": (start, end)}``."""
    if not start or not end:
        start, end = game_period(client)
    if not start or not end:
        logger.warning("ACE returned no game period dates — player statistics skipped")
        return {"players": [], "daily": [], "period": (start, end)}

    results = client.api_json(
        "bonusreport", "get_opt_trips_tree", {"start_date": start, "end_date": end}
    )
    business_date = business_date_of(start, end)

    players: list[dict] = []
    daily: list[dict] = []
    seen: set[str] = set()
    for row in _rows(results):
        record = normalize_player_row(row, business_date)
        if not record:
            continue
        ace_id = record["ace_player_id"]
        if ace_id not in seen:
            seen.add(ace_id)
            player = {"ace_player_id": ace_id, "ace_name": record["ace_name"]}
            # Historical first_seen_at is safe: the ingest endpoint applies it
            # only when creating an identity and keeps existing values immutable.
            # Do not send historical last_seen_at because the current ingest
            # contract updates it unconditionally and an old period could regress
            # a newer live observation.
            if start:
                player["first_seen_at"] = local_to_utc_iso(start)
            players.append(player)
        if business_date:
            daily.append(
                {
                    "ace_player_id": ace_id,
                    "business_date": business_date,
                    "in_amount": record["in_amount"],
                    "out_amount": record["out_amount"],
                    "handle_amount": record["handle_amount"],
                    "games": record["games"],
                    "raw_data": record["raw_data"],
                }
            )
    logger.info(
        "ACE players period=%s..%s players=%d daily_rows=%d", start, end, len(players), len(daily)
    )
    return {"players": players, "daily": daily, "period": (start, end)}


def run(client, api, dry_run: bool = True) -> dict:
    data = collect(client)
    if data["players"]:
        api.send("players", data["players"], dry_run=dry_run)
    if data["daily"]:
        api.send("daily", data["daily"], dry_run=dry_run)
    return data
