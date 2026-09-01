"""Regression tests for the SAFE historical backfill logic.

Covers:
  * duplicate business dates: single meaningful candidate wins,
  * two non-zero candidates => AMBIGUOUS => never auto-chosen,
  * zero-only duplicates are reported and skipped,
  * --backfill-from always sends mode=history_missing_only.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from collector import HISTORY_MODE, choose_candidate, is_meaningful, run_backfill  # noqa: E402
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


class _Api:
    def __init__(self):
        self.payloads = []

    def send(self, payload, dry_run=False):
        self.payloads.append(payload)
        return {"ok": True, "status": "history_filled", "fields_filled": ["drop_slots"], "row_created": False}


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
        lambda client, from_date, logger: (
            selected, [], {"counts": {"selected": 1, "ambiguous": 0, "zero_only": 0,
                                      "unreadable": 0, "duplicate_dates": 0}, "details": []}, 1,
        ),
    )
    api = _Api()
    rc = run_backfill(None, api, _Cfg(), _Logger(), "2026-01-01", dry_run=False)
    assert rc == 0
    assert len(api.payloads) == 1
    assert api.payloads[0]["mode"] == HISTORY_MODE == "history_missing_only"
    assert api.payloads[0]["business_date"] == "2026-02-01"
