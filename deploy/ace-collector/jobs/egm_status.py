"""EGM live status collector.

Two sources:

* PRIMARY (verified from the live ``/reports/ace.js`` bundle):
  ``ace.Api("egms.getegmlist", filterData)`` -> POST ``/aceapi/`` JSON-RPC.
  The result carries ``egms`` plus optional ``egmsparams``, ``players``,
  ``meters``, ``currentmeters``, ``sessions`` and ``lastbets`` maps keyed by the
  EGM ``leg_id``.
* FALLBACK (used whenever the modern call fails): the server-rendered Manager
  page ``/users/manager/egms.php``.

Nothing is invented here: display translations ACE does client-side (state
labels, link labels) are NOT reproduced — raw values are preserved instead.
"""
from __future__ import annotations

import logging

from ace_collector.analytics_parser import parse_egm_list, to_number

logger = logging.getLogger("ace-collector")

EGM_PAGE = "/users/manager/egms.php"
MODERN_METHOD = "egms.getegmlist"

#: Verified wire shape -> modern source is the primary one.
MODERN_EGM_API_ENABLED = True

#: Visible floor position candidates (verified ACE naming, no invention).
POSITION_FIELDS = ("leg_num_in_floor", "leg_num", "position", "egm_position")


def _map_get(container, leg_id):
    """``results.<map>[leg_id]`` tolerating dict-with-string-keys or lists."""
    if isinstance(container, dict):
        for key in (leg_id, str(leg_id)):
            if key in container:
                return container[key]
        return None
    if isinstance(container, list):
        for entry in container:
            if isinstance(entry, dict) and str(entry.get("leg_id")) == str(leg_id):
                return entry
    return None


def _position(row: dict):
    for field in POSITION_FIELDS:
        value = row.get(field)
        if value not in (None, ""):
            return str(value).strip()
    return None


def _state(row: dict):
    for field in ("state", "lgs_name", "egm_state"):
        value = row.get(field)
        if value not in (None, ""):
            return str(value).strip()
    value = row.get("lgs_id")
    # Only the numeric ACE state id is available server-side -> keep it raw.
    return None if value in (None, "") else str(value).strip()


def _player_id(player_obj):
    """Only a verified id-like ACE player identifier — never a display name."""
    if not isinstance(player_obj, dict):
        return None
    for field in ("ptr_id", "client_id", "player_id", "clientid"):
        value = player_obj.get(field)
        if value not in (None, "", 0, "0"):
            return str(value).strip()
    return None


def normalize_modern(result: dict) -> list[dict]:
    """Modern ``egms.getegmlist`` result -> ingest ``egm_status`` items."""
    if not isinstance(result, dict):
        return []
    egms = result.get("egms")
    if isinstance(egms, dict):
        egms = list(egms.values())
    if not isinstance(egms, list):
        return []

    items: list[dict] = []
    for row in egms:
        if not isinstance(row, dict):
            continue
        leg_id = row.get("leg_id")
        params = _map_get(result.get("egmsparams"), leg_id) or {}
        player = _map_get(result.get("players"), leg_id)
        meters = _map_get(result.get("meters"), leg_id) or {}
        current = _map_get(result.get("currentmeters"), leg_id) or {}
        session = _map_get(result.get("sessions"), leg_id) or {}
        lastbets = _map_get(result.get("lastbets"), leg_id) or {}

        position = _position(row)
        egm_code = position if position else (str(leg_id) if leg_id not in (None, "") else None)
        if not egm_code:
            continue

        # CMS canonical: fresh ETL meter (etl_current_credits * etl_denom) / 100.
        # The ACE UI/JS value (currentmeters.currentcredits) can be years stale,
        # so it is kept as a raw diagnostic only.
        denom = to_number(meters.get("etl_denom"))
        etl_credits = to_number(meters.get("etl_current_credits"))
        active_credit = (
            None if etl_credits is None or denom is None else etl_credits * denom / 100
        )
        ui_credits = to_number(current.get("currentcredits"))
        ace_ui_credit = (
            None if ui_credits is None or denom is None else ui_credits * denom / 100
        )


        games_played = to_number(session.get("games_played"))
        total_in_result = to_number(session.get("total_in_result"))
        average_bet = None
        if total_in_result is not None and games_played is not None:
            average_bet = 0.0 if games_played == 0 else total_in_result / games_played

        player_display = None
        if isinstance(player, dict):
            value = player.get("player")
            player_display = None if value in (None, "") else str(value)
        elif player not in (None, ""):
            player_display = str(player)

        last_bet = to_number(lastbets.get("total_in")) if player_display else None

        raw = dict(row)
        raw.update(
            {
                "leg_id": leg_id,
                "player_display": player_display,
                "current_game": current.get("gamename"),
                "ace_ui_credit": ace_ui_credit,
                "currentmeters_credit": ace_ui_credit,
                "meter_date": meters.get("etl_date"),
                "currentmeters_updated": current.get("updated"),
                "session_games_played": games_played,
                "session_total_in_result": total_in_result,
                "average_bet": average_bet,
                "last_bet": last_bet,
                "games_count": (params or {}).get("gamescnt"),
                "islinked": row.get("islinked"),

            }
        )
        for key, value in (
            ("player", player),
            ("meters", meters or None),
            ("currentmeters", current or None),
            ("session", session or None),
            ("lastbets", lastbets or None),
            ("egmparams", params or None),
        ):
            if value:
                raw[key] = value

        items.append(
            {
                "egm_code": egm_code,
                "position": position,
                "state": _state(row),
                "ace_player_id": _player_id(player),
                "active_credit": active_credit,
                "raw_data": raw,
            }
        )
    return items


def collect_modern(client, filter_data: dict | None = None) -> list[dict]:
    result = client.api_rpc(MODERN_METHOD, filter_data or {})
    return normalize_modern(result)


def collect(client, filter_data: dict | None = None) -> list[dict]:
    if MODERN_EGM_API_ENABLED:
        try:
            items = collect_modern(client, filter_data)
            if items:
                logger.info(
                    "ACE EGM status rows=%d (source=%s)", len(items), MODERN_METHOD
                )
                return items
            logger.warning("Modern EGM API returned no rows — falling back to egms.php")
        except Exception as exc:  # noqa: BLE001 - fallback must never break the cycle
            logger.warning("Modern EGM API failed (%s) — falling back to egms.php", exc)
    html = client.manager_page_html(EGM_PAGE)
    items = parse_egm_list(html)
    logger.info("ACE EGM status rows=%d (source=%s)", len(items), EGM_PAGE)
    return items


def run(client, api, dry_run: bool = True) -> list[dict]:
    items = collect(client)
    if items:
        api.send("egm_status", items, dry_run=dry_run)
    return items
