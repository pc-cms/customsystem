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

#: Mode flag sent for historical backfills: the API then applies the SAFE
#: Statistics rules (existing day => drop only, absent day => create row).
HISTORY_MODE = "history_missing_only"

#: Hard guard rails — this historical operation may NEVER touch August 2026+.
HISTORY_WINDOW_MIN = "2026-01-01"
HISTORY_WINDOW_MAX = "2026-07-31"

MEANINGFUL_FIELDS = (
    "total_drop",
    "net_win",
    "win_cashdesk",
    "cashless_money_difference",
    "jackpot_slip_out",
)

#: Explicit, manually verified historical overrides. Keyed by location_code and
#: business date. "pick" = use exactly this ACE period; "sum" = component-wise
#: sum of the listed periods (JP is NEVER imported for summed days).
#: This is deliberately NOT a generic "sum all duplicates" rule.
HISTORY_OVERRIDES: dict[str, dict[str, dict]] = {
    "mwanza": {
        "2026-02-14": {"mode": "pick", "periods": [6577]},
        "2026-02-15": {"mode": "sum", "periods": [6585, 6593]},
        "2026-06-16": {"mode": "pick", "periods": [7587]},
        "2026-06-24": {"mode": "pick", "periods": [7667]},
    },
    "dodoma": {
        "2026-06-20": {"mode": "pick", "periods": [3921]},
    },
}


def overrides_for(location_code: str) -> dict[str, dict]:
    return HISTORY_OVERRIDES.get((location_code or "").strip().lower(), {})


def all_closed_periods(client: AceClient) -> list[tuple[int, str]]:
    """Every closed period (period_id != 0) currently offered by ACE."""
    periods = parse_periods(client.report_page_html())
    return [(pid, label) for pid, label in periods if pid != 0]


def is_meaningful(report) -> bool:
    """True when at least one finance figure of the report is non-zero."""
    return any(float(getattr(report, f, 0) or 0) != 0 for f in MEANINGFUL_FIELDS)


def choose_candidate(candidates: list[tuple[int, str, object]]):
    """Pick the report to post for one business date.

    candidates = [(period_id, label, report_or_None)]
    Returns (chosen | None, reason) where reason is one of
    "single", "meaningful", "ambiguous", "zero_only", "unreadable".
    """
    readable = [c for c in candidates if c[2] is not None]
    if not readable:
        return None, "unreadable"
    if len(readable) == 1:
        return readable[0], "single"
    meaningful = [c for c in readable if is_meaningful(c[2])]
    if len(meaningful) == 1:
        return meaningful[0], "meaningful"
    if len(meaningful) > 1:
        return None, "ambiguous"
    return None, "zero_only"


def sum_reports(reports: list, period_id: int, label: str):
    """Component-wise sum of several ACE reports. JP is intentionally zeroed."""
    from ace_collector.parser import FinanceReport

    def s(field: str) -> float:
        return float(sum(float(getattr(r, field, 0) or 0) for r in reports))

    return FinanceReport(
        period_id=period_id,
        period_label=label,
        total_drop=s("total_drop"),
        net_win=s("net_win"),
        win_cashdesk=s("win_cashdesk"),
        cashless_money_difference=s("cashless_money_difference"),
        jackpot_slip_out=0.0,
        active_credits=s("active_credits"),
    )


def resolve_history(client: AceClient, from_date: str, to_date: str, logger,
                    location_code: str = ""):
    """Map closed periods to business dates inside [from_date, to_date].

    Returns (selected, unparsed, dup_stats, available_count) where
      selected  = [(business_date, period_id, label, report)] oldest first.

    Duplicate business dates are NEVER auto-resolved by period_id: every
    candidate report is parsed and only a single "meaningful" (non-zero)
    candidate is chosen. Two non-zero candidates => AMBIGUOUS => skipped,
    unless an explicit manual override exists for that location/date.
    """
    available = all_closed_periods(client)
    labels = {pid: label for pid, label in available}
    overrides = {d: o for d, o in overrides_for(location_code).items()
                 if from_date <= d <= to_date}
    override_pids = {pid for o in overrides.values() for pid in o["periods"]}

    unparsed: list[tuple[int, str]] = []
    by_date: dict[str, list[tuple[int, str]]] = {}

    for pid, label in available:
        if pid in override_pids:
            continue
        bdate = business_date_from_label(label)
        if not bdate:
            unparsed.append((pid, label))
            continue
        if bdate < from_date or bdate > to_date:
            continue
        by_date.setdefault(bdate, []).append((pid, label))

    selected: list[tuple[str, int, str, object]] = []
    dup_details: list[tuple[str, str, int | None, list[int]]] = []
    override_details: list[tuple[str, str, list[int]]] = []
    counts = {"selected": 0, "ambiguous": 0, "zero_only": 0, "unreadable": 0,
              "duplicate_dates": 0, "overrides": 0}

    def read(pid: int, label: str, bdate: str):
        try:
            return parse_consolidation(client.consolidation_html(pid), pid, label)
        except Exception as exc:  # noqa: BLE001 — a bad report must not stop the scan
            logger.error("HISTORY parse failed date=%s period_id=%s: %s", bdate, pid, exc)
            return None

    # explicit manual overrides first
    for bdate, spec in overrides.items():
        pids = list(spec["periods"])
        reports = [read(pid, labels.get(pid, ""), bdate) for pid in pids]
        if any(r is None for r in reports):
            counts["unreadable"] += 1
            logger.warning("HISTORY OVERRIDE UNREADABLE date=%s periods=%s", bdate, pids)
            continue
        if spec["mode"] == "sum":
            report = sum_reports(reports, pids[0], f"OVERRIDE SUM {pids}")
        else:
            report = reports[0]
        counts["overrides"] += 1
        counts["selected"] += 1
        override_details.append((bdate, spec["mode"], pids))
        selected.append((bdate, report.period_id, report.period_label, report))
        logger.info("HISTORY OVERRIDE date=%s mode=%s periods=%s drop=%s net_win=%s cashdesk=%s cashless=%s",
                    bdate, spec["mode"], pids, report.total_drop, report.net_win,
                    report.win_cashdesk, report.cashless_money_difference)

    for bdate in sorted(by_date):
        entries = by_date[bdate]
        candidates: list[tuple[int, str, object]] = [
            (pid, label, read(pid, label, bdate)) for pid, label in entries
        ]

        chosen, reason = choose_candidate(candidates)
        pids = [pid for pid, _, _ in candidates]
        if len(entries) > 1:
            counts["duplicate_dates"] += 1
            dup_details.append((bdate, reason, chosen[0] if chosen else None, pids))

        if chosen:
            counts["selected"] += 1
            selected.append((bdate, chosen[0], chosen[1], chosen[2]))
        else:
            counts[reason] = counts.get(reason, 0) + 1
            logger.warning(
                "HISTORY %s date=%s periods=%s — skipped for manual review",
                reason.upper(), bdate, pids,
            )

    selected.sort(key=lambda x: x[0])
    dup_stats = {"counts": counts, "details": dup_details, "overrides": override_details}
    return selected, unparsed, dup_stats, len(available)


def probe_day(api, cfg, bdate: str, report) -> str:
    """Ask the API what WOULD/DID happen for a day (dry-run aware caller)."""
    payload = report.as_payload(cfg.location_code)
    payload["business_date"] = bdate
    payload["closed_at_local"] = report.period_label
    payload["mode"] = HISTORY_MODE
    body = api.send(payload) or {}
    return body.get("status", "unknown")


def run_history_scan(client, cfg, logger, from_date: str, to_date: str) -> int:
    """Read-only inventory of the closed periods available for a backfill."""
    selected, unparsed, dup_stats, available = resolve_history(
        client, from_date, to_date, logger, cfg.location_code
    )
    counts = dup_stats["counts"]
    logger.info("HISTORY-SCAN location=%s", cfg.location_code)
    logger.info("HISTORY-SCAN window=%s..%s", from_date, to_date)
    logger.info("HISTORY-SCAN closed_periods_available=%d", available)
    logger.info("HISTORY-SCAN days_selected=%d", counts["selected"])
    logger.info("HISTORY-SCAN earliest_business_date=%s", selected[0][0] if selected else "none")
    logger.info("HISTORY-SCAN latest_business_date=%s", selected[-1][0] if selected else "none")
    logger.info("HISTORY-SCAN duplicate_business_dates=%d", counts["duplicate_dates"])
    logger.info("HISTORY-SCAN duplicates_ambiguous=%d", counts["ambiguous"])
    logger.info("HISTORY-SCAN duplicates_zero_only=%d", counts["zero_only"])
    logger.info("HISTORY-SCAN unreadable_dates=%d", counts["unreadable"])
    logger.info("HISTORY-SCAN special_overrides=%d", counts["overrides"])
    for bdate, mode, pids in dup_stats["overrides"]:
        logger.info("HISTORY-SCAN override date=%s mode=%s periods=%s", bdate, mode, pids)
    for bdate, reason, kept, pids in dup_stats["details"]:
        logger.info(
            "HISTORY-SCAN duplicate date=%s resolution=%s keep_period=%s candidates=%s",
            bdate, reason, kept if kept is not None else "NONE", pids,
        )
    logger.info("HISTORY-SCAN unparsable_labels=%d", len(unparsed))
    for pid, label in unparsed:
        logger.info("HISTORY-SCAN unparsable period_id=%s label=%r", pid, label)
    for bdate, pid, label, _report in selected:
        logger.info("HISTORY-SCAN period date=%s period_id=%s label=%r", bdate, pid, label)
    logger.info(
        "HISTORY-SCAN totals selected_days=%d skipped_days=%d (nothing was sent)",
        counts["selected"], counts["ambiguous"] + counts["zero_only"] + counts["unreadable"],
    )
    return 0


def run_backfill(client, api, cfg, logger, from_date: str, to_date: str, dry_run: bool) -> int:
    """Post every selected closed period in history_missing_only mode."""
    selected, unparsed, dup_stats, available = resolve_history(
        client, from_date, to_date, logger, cfg.location_code
    )
    dcounts = dup_stats["counts"]
    logger.info(
        "BACKFILL location=%s window=%s..%s available=%d selected=%d duplicate_dates=%d "
        "ambiguous=%d zero_only=%d overrides=%d unparsable=%d mode=%s",
        cfg.location_code, from_date, to_date, available, len(selected),
        dcounts["duplicate_dates"], dcounts["ambiguous"], dcounts["zero_only"],
        dcounts["overrides"], len(unparsed), HISTORY_MODE,
    )
    if not selected:
        logger.warning("BACKFILL nothing to send for %s in %s..%s", cfg.location_code, from_date, to_date)
        return 0

    counts = {
        "sent": 0, "failed": 0, "fields": 0,
        "new_statistics_day_created": 0,
        "existing_day_drop_filled": 0,
        "existing_day_unchanged": 0,
    }
    for idx, (bdate, pid, label, report) in enumerate(selected):
        if not (HISTORY_WINDOW_MIN <= bdate <= HISTORY_WINDOW_MAX):
            logger.error("BACKFILL refusing out-of-window date=%s", bdate)
            continue
        try:
            payload = report.as_payload(cfg.location_code)
            payload["business_date"] = bdate
            payload["closed_at_local"] = report.period_label
            payload["mode"] = HISTORY_MODE
            logger.info(
                "BACKFILL [%d/%d] date=%s period_id=%s drop=%s net_win=%s cashdesk=%s",
                idx + 1, len(selected), bdate, pid, report.total_drop,
                report.net_win, report.win_cashdesk,
            )
            body = api.send(payload, dry_run=dry_run) or {}
            counts["sent"] += 1
            status = body.get("status", "")
            if status in counts:
                counts[status] += 1
            fields = body.get("fields_filled") or []
            counts["fields"] += len(fields)
            logger.info("BACKFILL date=%s status=%s filled=%s created=%s",
                        bdate, status or "?", fields, body.get("row_created"))
        except Exception as exc:  # noqa: BLE001 — one bad period must not stop the rest
            counts["failed"] += 1
            logger.error("BACKFILL failed date=%s period_id=%s: %s", bdate, pid, exc)
        if idx + 1 < len(selected) and not dry_run:
            time.sleep(HISTORY_POST_DELAY_S)

    logger.info(
        "BACKFILL done location=%s sent=%d new_days=%d drop_filled=%d unchanged=%d "
        "fields_filled=%d failed=%d",
        cfg.location_code, counts["sent"], counts["new_statistics_day_created"],
        counts["existing_day_drop_filled"], counts["existing_day_unchanged"],
        counts["fields"], counts["failed"],
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
                    help="post closed periods with business_date >= this date")
    ap.add_argument("--from", dest="from_date", metavar="YYYY-MM-DD",
                    help="start business date for --history-scan")
    ap.add_argument("--to", dest="to_date", metavar="YYYY-MM-DD",
                    help="end business date (inclusive) for history modes — REQUIRED")

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

    # ── historical modes: never touch the LIVE period ──────────────────────
    if args.history_scan or args.backfill_from:
        raw = args.backfill_from or args.from_date
        from_date = valid_date(raw)
        if not from_date:
            logger.error("A valid --from / --backfill-from date (YYYY-MM-DD) is required, got %r", raw)
            return 2
        try:
            client.login()
            if args.history_scan and not args.backfill_from:
                return run_history_scan(client, cfg, logger, from_date)
            return run_backfill(client, api, cfg, logger, from_date, args.dry_run)
        except (AceError, ApiError, Exception) as exc:  # noqa: BLE001
            logger.error("History run failed: %s", exc)
            return 1


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
