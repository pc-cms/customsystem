"""EGM Accounting (`report_game_automat`) and Jackpot Accounting (`report_jp`).

Both are fetched with the same verified Manager report POST used by the finance
job and normalized into arrays of dictionaries keyed by the ORIGINAL ACE header
text. Nothing is reinterpreted: missing cells stay missing, never 0.
"""
from __future__ import annotations

import logging

from ace_collector.analytics_parser import (
    combine_date_time,
    local_to_utc_iso,
    parse_html_tables,
    source_key,
    to_number,
)

logger = logging.getLogger("ace-collector")

EGM_REPORT = "report_game_automat"
JP_REPORT = "report_jp"


def _flatten(tables: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for index, table in enumerate(tables):
        for row in table["rows"]:
            rows.append({"_table": index, "_headers": table["headers"], **row})
    return rows


def collect_report(client, type_report: str, period_id: int) -> list[dict]:
    html = client.report_html(type_report, period_id)
    rows = _flatten(parse_html_tables(html))
    logger.info("ACE report %s period_id=%s rows=%d", type_report, period_id, len(rows))
    return rows


def _pick(row: dict, *names: str):
    for name in names:
        for key, value in row.items():
            if key.strip().lower() == name.strip().lower():
                return value
    return None


def jackpot_rows_from_report(rows: list[dict], business_date: str | None) -> list[dict]:
    """`report_jp` rows -> `kind=jackpots` items (only with a stable key).

    Player linkage stays NULL here: the JP accounting report has no player.
    """
    items: list[dict] = []
    for row in rows:
        name = _pick(row, "JackPot", "Jackpot")
        egm = _pick(row, "EGM Position", "Position")
        # VERIFIED report_jp layout: separate `Winning Date` + `Winning Time`.
        won_at = combine_date_time(
            _pick(row, "Winning Date"), _pick(row, "Winning Time")
        )
        if not won_at:
            # Fallback only when the Winning columns are absent.
            won_at = combine_date_time(
                _pick(row, "Jackpot Date"), _pick(row, "Jackpot Time")
            )
        if not won_at:
            won_at = _pick(row, "Winning Date/Time", "Win Date/Time")
        amount = to_number(_pick(row, "Sum of Winning", "Winning Sum"))
        if not (name and egm and won_at):
            continue  # no stable source key -> never emitted
        bdate = business_date or (str(won_at)[:10] if len(str(won_at)) >= 10 else None)
        if not bdate or not bdate[:4].isdigit():
            continue
        items.append(
            {
                "business_date": bdate,
                "occurred_at": local_to_utc_iso(won_at) or str(won_at),
                "jackpot_name": str(name),
                "amount": amount,
                "egm_code": str(egm),
                "ace_player_id": None,
                "source_key": source_key("jpreport", egm, won_at, name, amount),
                "raw_data": row,
            }
        )
    return items


def run(
    client,
    api,
    period_id: int,
    period_label: str | None = None,
    business_date: str | None = None,
    dry_run: bool = True,
) -> dict:
    egm_rows = collect_report(client, EGM_REPORT, period_id)
    api.send(
        "report",
        egm_rows,
        dry_run=dry_run,
        report_type="egm",
        source_key=source_key("egmreport", period_id, period_label, business_date),
        period_label=period_label,
        business_date=business_date,
    )

    jp_rows = collect_report(client, JP_REPORT, period_id)
    api.send(
        "report",
        jp_rows,
        dry_run=dry_run,
        report_type="jackpot",
        source_key=source_key("jpreport", period_id, period_label, business_date),
        period_label=period_label,
        business_date=business_date,
    )

    jackpots = jackpot_rows_from_report(jp_rows, business_date)
    if jackpots:
        api.send("jackpots", jackpots, dry_run=dry_run)
    return {"egm_rows": egm_rows, "jp_rows": jp_rows, "jackpots": jackpots}
