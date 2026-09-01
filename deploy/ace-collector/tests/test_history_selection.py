"""Regression tests for the SAFE historical backfill logic.

Covers:
  * duplicate business dates: single meaningful candidate wins,
  * two non-zero candidates => AMBIGUOUS => never auto-chosen,
  * zero-only duplicates are reported and skipped,
  * --backfill-from always sends mode=history_missing_only,
  * bounded [from, to] window, refusal of August 2026,
  * explicit Mwanza overrides (2026-02-14 pick, 2026-02-15 sum).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from collector import (  # noqa: E402
    HISTORY_MODE,
    HISTORY_WINDOW_MAX,
    HISTORY_WINDOW_MIN,
    choose_candidate,
    is_meaningful,
    main,
    overrides_for,
    resolve_history,
    run_backfill,
    sum_reports,
)
from ace_collector.parser import FinanceReport  # noqa: E402


def report(pid, label="p", **kw):
    base = dict(
        total_drop=0.0, net_win=0.0, win_cashdesk=0.0,
        cashless_money_difference=0.0, jackpot_slip_out=0.0, active_credits=0.0,
    )
    base.update(kw)
    return FinanceReport(period_id=pid, period_label=label, **base)


def test_is_meaningful():
    assert not is_meaningful(report(1))
    assert is_meaningful(report(1, total_drop=100.0))
    assert is_meaningful(report(1, jackpot_slip_out=-5.0))


def test_single_candidate():
    chosen, reason = choose_candidate([(7, "l", report(7))])
    assert reason == "single" and chosen[0] == 7


def test_one_meaningful_wins():
    cands = [(7, "a", report(7)), (8, "b", report(8, net_win=1234.0))]
    chosen, reason = choose_candidate(cands)
    assert reason == "meaningful" and chosen[0] == 8


def test_two_meaningful_are_ambiguous():
    cands = [(7, "a", report(7, total_drop=10.0)), (8, "b", report(8, net_win=20.0))]
    chosen, reason = choose_candidate(cands)
    assert chosen is None and reason == "ambiguous"


def test_all_zero_duplicates_skipped():
    chosen, reason = choose_candidate([(7, "a", report(7)), (8, "b", report(8))])
    assert chosen is None and reason == "zero_only"


def test_unreadable_only():
    chosen, reason = choose_candidate([(7, "a", None)])
    assert chosen is None and reason == "unreadable"


def test_window_constants():
    assert HISTORY_WINDOW_MIN == "2026-01-01"
    assert HISTORY_WINDOW_MAX == "2026-07-31"


def test_sum_reports_drops_jackpot():
    a = report(6585, total_drop=10.0, net_win=-2.0, win_cashdesk=-3.0,
               cashless_money_difference=-1.0, jackpot_slip_out=500.0)
    b = report(6593, total_drop=5.0, net_win=-1.0, win_cashdesk=-2.0,
               cashless_money_difference=-0.5, jackpot_slip_out=700.0)
    s = sum_reports([a, b], 6585, "OVERRIDE")
    assert s.total_drop == 15.0 and s.net_win == -3.0
    assert s.win_cashdesk == -5.0 and s.cashless_money_difference == -1.5
    assert s.jackpot_slip_out == 0.0


class _Api:
    def __init__(self):
        self.payloads = []

    def send(self, payload, dry_run=False):
        self.payloads.append(payload)
        return {"ok": True, "status": "new_statistics_day_created",
                "fields_filled": ["drop_slots"], "row_created": True}


class _Cfg:
    location_code = "test"


class _Logger:
    def info(self, *a, **k): pass
    def warning(self, *a, **k): pass
    def error(self, *a, **k): pass
    def debug(self, *a, **k): pass


def test_backfill_sends_history_mode(monkeypatch):
    import collector

    selected = [("2026-02-01", 5, "label", report(5, total_drop=100.0))]
    monkeypatch.setattr(
        collector, "resolve_history",
        lambda client, from_date, to_date, logger, location_code="": (
            selected, [], {"counts": {"selected": 1, "ambiguous": 0, "zero_only": 0,
                                      "unreadable": 0, "duplicate_dates": 0, "overrides": 0},
                           "details": [], "overrides": []}, 1,
        ),
    )
    api = _Api()
    rc = run_backfill(None, api, _Cfg(), _Logger(), "2026-01-01", "2026-07-31", dry_run=False)
    assert rc == 0
    assert len(api.payloads) == 1
    assert api.payloads[0]["mode"] == HISTORY_MODE == "history_missing_only"
    assert api.payloads[0]["business_date"] == "2026-02-01"


def test_backfill_refuses_out_of_window_day(monkeypatch):
    import collector

    selected = [("2026-08-11", 9, "label", report(9, total_drop=100.0))]
    monkeypatch.setattr(
        collector, "resolve_history",
        lambda client, from_date, to_date, logger, location_code="": (
            selected, [], {"counts": {"selected": 1, "ambiguous": 0, "zero_only": 0,
                                      "unreadable": 0, "duplicate_dates": 0, "overrides": 0},
                           "details": [], "overrides": []}, 1,
        ),
    )
    api = _Api()
    run_backfill(None, api, _Cfg(), _Logger(), "2026-01-01", "2026-07-31", dry_run=False)
    assert api.payloads == []


# ── resolve_history with a fake ACE client ────────────────────────────────

class _Client:
    """Minimal ACE stub: period_id -> (label, FinanceReport)."""

    def __init__(self, periods):
        self.periods = periods  # {pid: (label, report)}

    def report_page_html(self):
        return "html"

    def consolidation_html(self, pid):
        return f"html:{pid}"


def _patch_parsers(monkeypatch, client):
    import collector

    monkeypatch.setattr(collector, "parse_periods",
                        lambda html: [(pid, v[0]) for pid, v in client.periods.items()])
    monkeypatch.setattr(collector, "parse_consolidation",
                        lambda html, pid, label: client.periods[int(html.split(":")[1])][1])


def test_range_upper_bound_excludes_august(monkeypatch):
    import collector

    client = _Client({
        100: ("01.07.2026 07:00", report(100, total_drop=1.0)),
        200: ("11.08.2026 07:00", report(200, total_drop=2.0)),
    })
    _patch_parsers(monkeypatch, client)
    monkeypatch.setattr(collector, "business_date_from_label",
                        lambda label: {"01.07.2026 07:00": "2026-07-01",
                                       "11.08.2026 07:00": "2026-08-11"}[label])

    selected, _unparsed, stats, _n = resolve_history(
        client, "2026-01-01", "2026-07-31", _Logger(), "arusha")
    assert [d for d, *_ in selected] == ["2026-07-01"]
    assert stats["counts"]["overrides"] == 0


def test_mwanza_overrides(monkeypatch):
    import collector

    client = _Client({
        6577: ("15.02.2026 06:15", report(6577, total_drop=50.0, net_win=-1.0)),
        6585: ("15.02.2026 21:08", report(6585, total_drop=40_000_000.0, net_win=-6_000_000.0,
                                          win_cashdesk=-6_836_779.0, cashless_money_difference=-1_000.0)),
        6593: ("16.02.2026 12:56", report(6593, total_drop=39_533_010.0, net_win=-6_967_630.0,
                                          win_cashdesk=-7_000_000.0, cashless_money_difference=-500.0)),
    })
    _patch_parsers(monkeypatch, client)
    monkeypatch.setattr(collector, "business_date_from_label", lambda label: "2026-02-15")

    selected, _u, stats, _n = resolve_history(
        client, "2026-01-01", "2026-07-31", _Logger(), "mwanza")
    by_date = {d: r for d, _pid, _l, r in selected}
    assert stats["counts"]["overrides"] == 2
    assert by_date["2026-02-14"].total_drop == 50.0
    day = by_date["2026-02-15"]
    assert day.total_drop == 79_533_010.0
    assert day.net_win == -12_967_630.0
    assert day.win_cashdesk == -13_836_779.0
    assert day.cashless_money_difference == -1_500.0
    assert day.jackpot_slip_out == 0.0


def test_override_table_known_selections():
    mw = overrides_for("MWANZA")
    assert mw["2026-06-16"]["periods"] == [7587]
    assert mw["2026-06-24"]["periods"] == [7667]
    assert overrides_for("dodoma")["2026-06-20"]["periods"] == [3921]
    assert overrides_for("mbeya") == {}


def test_cli_requires_to_and_refuses_august(monkeypatch):
    assert main(["--history-scan", "--from", "2026-01-01"]) == 2
    assert main(["--history-scan", "--from", "2026-01-01", "--to", "2026-08-05"]) == 2
    assert main(["--backfill-from", "2025-12-01", "--to", "2026-07-31"]) == 2
