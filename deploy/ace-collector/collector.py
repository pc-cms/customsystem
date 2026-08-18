#!/usr/bin/env python3
"""ACE Collector entry point.

Every run:
  * always sends LIVE (period_id=0) finance metrics
  * additionally, inside the closing window (default 08:00 <= t < 12:00,
    Africa/Dar_es_Salaam), sends the latest closed period (period_id != 0)

Commands:
  --health --verbose
  --live-only
  --closing-only --force-closing
  --dry-run --force-closing
"""
from __future__ import annotations

import argparse
import sys
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


def latest_closed_period(client: AceClient) -> tuple[int, str] | None:
    periods = parse_periods(client.report_page_html())
    closed = [(pid, label) for pid, label in periods if pid != 0]
    return closed[0] if closed else None


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
    found = latest_closed_period(client)
    if not found:
        logger.warning("No closed ACE period available — skipping closing send")
        return False
    period_id, label = found
    html = client.consolidation_html(period_id)
    report = parse_consolidation(html, period_id, label)
    business_date = business_date_from_label(report.period_label)
    if not business_date:
        logger.error("Cannot parse business_date from ACE period label %r — skipping", report.period_label)
        return False
    payload = report.as_payload(cfg.location_code)
    payload["business_date"] = business_date
    payload["closed_at_local"] = report.period_label
    logger.info(
        "[%s] CLOSED period_id=%s business_date=%s active_credits=%s label=%r",
        cfg.location_code, period_id, business_date, report.active_credits, report.period_label,
    )
    api.send(payload, dry_run=dry_run)
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="ACE Collector")
    ap.add_argument("--health", action="store_true", help="check config + ACE login + API reachability")
    ap.add_argument("--live-only", action="store_true", help="send only the LIVE period")
    ap.add_argument("--closing-only", action="store_true", help="send only the closed period")
    ap.add_argument("--force-closing", action="store_true", help="ignore the closing time window")
    ap.add_argument("--dry-run", action="store_true", help="collect and log, do not POST")
    ap.add_argument("--verbose", "-v", action="store_true")
    args = ap.parse_args(argv)

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
