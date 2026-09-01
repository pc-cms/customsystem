#!/usr/bin/env python3
"""ACE Collector entry point.

Every run:
  * always sends LIVE (period_id=0) finance metrics
  * additionally, inside the closing window (default 07:00 <= t < 12:00,
    Africa/Dar_es_Salaam), sends the latest closed period (period_id != 0)

Commands:
  --health --verbose
  --live-only
  --closing-only --force-closing
  --dry-run --force-closing
  --history-scan --from YYYY-MM-DD      (read-only, posts nothing)
  --backfill-from YYYY-MM-DD            (posts every closed period >= date)
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from ace_collector.ace_client import AceClient, AceError
from ace_collector.api import ApiError, IngestApi
from ace_collector.config import Config
from ace_collector.logging_setup import setup_logging
from ace_collector.parser import (
    business_date_from_label,
    parse_consolidation,
    parse_periods,
)

#: Pause between historical POSTs so a long backfill never hammers the edge fn.
HISTORY_POST_DELAY_S = 0.2



def in_closing_window(cfg: Config) -> bool:
    now = datetime.now(ZoneInfo(cfg.timezone))
    return cfg.closing_window_start <= now.hour < cfg.closing_window_end


def current_period_label(client: AceClient) -> str:
    """Exact label of the live period (period_id == 0) from the ACE selector."""
    periods = parse_periods(client.report_page_html())
    for pid, label in periods:
        if pid == 0 and (label or "").strip():
            return label.strip()
    raise AceError(
        "ACE live period (period_id=0) not found in the report period selector — "
        "cannot determine current period label"
    )


def collect_live(client: AceClient):
    label = current_period_label(client)
    html = client.consolidation_html(0)
    return parse_consolidation(html, 0, label)


def latest_closed_periods(client: AceClient, count: int = 1) -> list[tuple[int, str]]:
    """The most recent closed ACE periods (newest first).

    More than one is sent so a day missed because of a collector/network outage
    is healed on the next successful run: the API skips identical resends and
    re-applies anything whose figures changed (late JP slip, corrected drop).
    """
    periods = parse_periods(client.report_page_html())
    closed = [(pid, label) for pid, label in periods if pid != 0]
    return closed[: max(1, count)]


def run_live(client, api, cfg, logger, dry_run: bool) -> bool:
    report = collect_live(client)
    payload = report.as_payload(cfg.location_code)
    logger.info(
        "[%s] LIVE period=%r drop=%s net_win=%s cashdesk=%s cashless=%s jp_out=%s active_credits=%s",
        cfg.location_code, report.period_label, report.total_drop, report.net_win,
        report.win_cashdesk, report.cashless_money_difference, report.jackpot_slip_out,
        report.active_credits,
    )
    api.send(payload, dry_run=dry_run)
    return True


def run_closing(client, api, cfg, logger, dry_run: bool) -> bool:
    found = latest_closed_periods(client, cfg.backfill_periods)
    if not found:
        logger.warning("No closed ACE period available — skipping closing send")
        return False

    sent = 0
    errors: list[str] = []
    for period_id, label in found:
        try:
            html = client.consolidation_html(period_id)
            report = parse_consolidation(html, period_id, label)
            business_date = business_date_from_label(report.period_label)
            if not business_date:
                logger.error(
                    "Cannot parse business_date from ACE period label %r — skipping", report.period_label
                )
                continue
            payload = report.as_payload(cfg.location_code)
            payload["business_date"] = business_date
            payload["closed_at_local"] = report.period_label
            logger.info(
                "[%s] CLOSED period_id=%s business_date=%s jp_out=%s drop=%s active_credits=%s label=%r",
                cfg.location_code, period_id, business_date, report.jackpot_slip_out,
                report.total_drop, report.active_credits, report.period_label,
            )
            api.send(payload, dry_run=dry_run)
            sent += 1
        except Exception as exc:  # noqa: BLE001 — one bad period must not block the others
            errors.append(f"period {period_id}: {exc}")
            logger.error("CLOSED send failed for period_id=%s: %s", period_id, exc)

    if errors and sent == 0:
        raise ApiError("; ".join(errors))
    return sent > 0


# ───────────────────────── historical periods ──────────────────────────────

def all_closed_periods(client: AceClient) -> list[tuple[int, str]]:
    """Every closed period (period_id != 0) currently offered by ACE."""
    periods = parse_periods(client.report_page_html())
    return [(pid, label) for pid, label in periods if pid != 0]


def resolve_history(
    client: AceClient, from_date: str, logger
) -> tuple[list[tuple[str, int, str]], list[tuple[int, str]], list[tuple[str, int, int]], int]:
    """Map closed periods to business dates and de-duplicate them.

    Returns (selected, unparsed, duplicates, available_count) where
      selected   = [(business_date, period_id, label)] oldest first,
      unparsed   = periods whose label carries no parsable date,
      duplicates = [(business_date, kept_period_id, skipped_period_id)].

    `ace_finance_snapshots` is unique on (casino, business_date), so when two
    ACE periods land on the same business date only the newest (highest
    period_id) is kept — posting both would fight over the same row.
    """
    available = all_closed_periods(client)
    unparsed: list[tuple[int, str]] = []
    by_date: dict[str, tuple[int, str]] = {}
    duplicates: list[tuple[str, int, int]] = []

    for pid, label in available:
        bdate = business_date_from_label(label)
        if not bdate:
            unparsed.append((pid, label))
            continue
        if bdate < from_date:
            continue
        prev = by_date.get(bdate)
        if prev is None:
            by_date[bdate] = (pid, label)
        elif pid > prev[0]:
            duplicates.append((bdate, pid, prev[0]))
            by_date[bdate] = (pid, label)
        else:
            duplicates.append((bdate, prev[0], pid))

    selected = sorted((d, pid, label) for d, (pid, label) in by_date.items())
    return selected, unparsed, duplicates, len(available)


def run_history_scan(client, cfg, logger, from_date: str) -> int:
    """Read-only inventory of the closed periods available for a backfill."""
    selected, unparsed, duplicates, available = resolve_history(client, from_date, logger)
    logger.info("HISTORY-SCAN location=%s", cfg.location_code)
    logger.info("HISTORY-SCAN from_date=%s", from_date)
    logger.info("HISTORY-SCAN closed_periods_available=%d", available)
    logger.info("HISTORY-SCAN periods_selected=%d", len(selected))
    logger.info("HISTORY-SCAN earliest_business_date=%s", selected[0][0] if selected else "none")
    logger.info("HISTORY-SCAN latest_business_date=%s", selected[-1][0] if selected else "none")
    logger.info("HISTORY-SCAN duplicate_business_dates=%d", len(duplicates))
    for bdate, kept, skipped in duplicates:
        logger.info("HISTORY-SCAN duplicate date=%s keep_period=%s skip_period=%s", bdate, kept, skipped)
    logger.info("HISTORY-SCAN unparsable_labels=%d", len(unparsed))
    for pid, label in unparsed:
        logger.info("HISTORY-SCAN unparsable period_id=%s label=%r", pid, label)
    for bdate, pid, label in selected:
        logger.info("HISTORY-SCAN period date=%s period_id=%s label=%r", bdate, pid, label)
    logger.info("HISTORY-SCAN done (nothing was sent)")
    return 0


def run_backfill(client, api, cfg, logger, from_date: str, dry_run: bool) -> int:
    """Post every selected closed period, oldest business_date first."""
    selected, unparsed, duplicates, available = resolve_history(client, from_date, logger)
    logger.info(
        "BACKFILL location=%s from=%s available=%d selected=%d duplicates_skipped=%d unparsable=%d",
        cfg.location_code, from_date, available, len(selected), len(duplicates), len(unparsed),
    )
    if not selected:
        logger.warning("BACKFILL nothing to send for %s from %s", cfg.location_code, from_date)
        return 0

    counts = {"sent": 0, "already_recorded": 0, "applied": 0, "failed": 0}
    for idx, (bdate, pid, label) in enumerate(selected):
        try:
            html = client.consolidation_html(pid)
            report = parse_consolidation(html, pid, label)
            payload = report.as_payload(cfg.location_code)
            payload["business_date"] = bdate
            payload["closed_at_local"] = report.period_label
            logger.info(
                "BACKFILL [%d/%d] date=%s period_id=%s drop=%s net_win=%s cashdesk=%s",
                idx + 1, len(selected), bdate, pid, report.total_drop,
                report.net_win, report.win_cashdesk,
            )
            body = api.send(payload, dry_run=dry_run)
            counts["sent"] += 1
            status = (body or {}).get("status", "")
            if status == "already_recorded":
                counts["already_recorded"] += 1
            elif status in ("closing_recorded", "live_updated"):
                counts["applied"] += 1
        except Exception as exc:  # noqa: BLE001 — one bad period must not stop the rest
            counts["failed"] += 1
            logger.error("BACKFILL failed date=%s period_id=%s: %s", bdate, pid, exc)
        if idx + 1 < len(selected) and not dry_run:
            time.sleep(HISTORY_POST_DELAY_S)

    logger.info(
        "BACKFILL done location=%s sent=%d already_recorded=%d applied=%d failed=%d",
        cfg.location_code, counts["sent"], counts["already_recorded"],
        counts["applied"], counts["failed"],
    )
    return 1 if counts["failed"] and counts["sent"] == 0 else 0



def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="ACE Collector")
    ap.add_argument("--health", action="store_true", help="check config + ACE login + API reachability")
    ap.add_argument("--live-only", action="store_true", help="send only the LIVE period")
    ap.add_argument("--closing-only", action="store_true", help="send only the closed period")
    ap.add_argument("--force-closing", action="store_true", help="ignore the closing time window")
    ap.add_argument("--dry-run", action="store_true", help="collect and log, do not POST")
    ap.add_argument("--history-scan", action="store_true",
                    help="read-only inventory of closed ACE periods (posts nothing)")
    ap.add_argument("--backfill-from", metavar="YYYY-MM-DD",
                    help="post every closed period with business_date >= this date")
    ap.add_argument("--from", dest="from_date", metavar="YYYY-MM-DD",
                    help="start business date for --history-scan")
    ap.add_argument("--verbose", "-v", action="store_true")
    args = ap.parse_args(argv)

    def valid_date(value: str | None) -> str | None:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d").strftime("%Y-%m-%d")
        except ValueError:
            return None


    logger = setup_logging(args.verbose)
    cfg = Config.load()

    problems = cfg.validate()
    if problems:
        for p in problems:
            logger.error("Config problem: %s", p)
        return 2

    client = AceClient(cfg)
    api = IngestApi(cfg)

    if args.health:
        logger.info("ACE base URL : %s (verify_tls=%s)", cfg.ace_base_url, cfg.ace_verify_tls)
        logger.info("API URL      : %s", cfg.api_url)
        logger.info("Casino       : %s", cfg.location_code)
        logger.info("Timezone     : %s (closing %02d:00-%02d:00)",
                    cfg.timezone, cfg.closing_window_start, cfg.closing_window_end)
        try:
            client.login()
            logger.info("ACE login    : OK")
            report = collect_live(client)
            logger.info("LIVE period  : %r", report.period_label)
            logger.info("LIVE sample  : drop=%s net_win=%s cashdesk=%s cashless=%s jp_out=%s active_credits=%s",
                        report.total_drop, report.net_win, report.win_cashdesk,
                        report.cashless_money_difference, report.jackpot_slip_out,
                        report.active_credits)
            periods = parse_periods(client.report_page_html())
            logger.info("Periods seen : %s", periods[:5] or "none")
        except (AceError, Exception) as exc:  # noqa: BLE001
            logger.error("Health check failed: %s", exc)
            return 1
        logger.info("Health check : OK")
        return 0

    do_live = not args.closing_only
    do_closing = not args.live_only and (args.force_closing or in_closing_window(cfg))

    failures = 0

    if do_live:
        try:
            run_live(client, api, cfg, logger, args.dry_run)
        except (AceError, ApiError, Exception) as exc:  # noqa: BLE001
            failures += 1
            logger.error("LIVE send failed (will retry next run): %s", exc)

    if do_closing:
        try:
            run_closing(client, api, cfg, logger, args.dry_run)
        except (AceError, ApiError, Exception) as exc:  # noqa: BLE001
            failures += 1
            logger.error("CLOSING send failed (will retry next run): %s", exc)
    elif not args.live_only:
        logger.debug("Outside closing window — closed period not sent")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
