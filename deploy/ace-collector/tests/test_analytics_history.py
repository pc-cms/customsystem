"""Regression tests for analytics-only historical scan/backfill."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import collector  # noqa: E402
from jobs.player_statistics import all_game_periods  # noqa: E402


class Logger:
    def info(self, *args, **kwargs): pass
    def warning(self, *args, **kwargs): pass
    def error(self, *args, **kwargs): pass


class PeriodClient:
    def __init__(self, starts, ends):
        self.starts = starts
        self.ends = ends

    def api_json(self, module, method, payload=None):
        assert (module, method) == ("bonusreport", "get_game_periods_dates")
        return {"start_dates": self.starts, "end_dates": self.ends}


def test_all_game_periods_pairs_only_safe_matching_indexes():
    client = PeriodClient(
        ["2026-09-01 07:00", "2026-09-02 07:00", "2026-09-03 07:00"],
        ["2026-09-02 06:59", "2026-09-03 06:59"],
    )
    assert all_game_periods(client) == [
        ("2026-09-01 07:00", "2026-09-02 06:59"),
        ("2026-09-02 07:00", "2026-09-03 06:59"),
    ]


def test_inventory_skips_latest_current_player_period(monkeypatch):
    client = PeriodClient(
        ["2026-09-15 07:00", "2026-09-16 07:00"],
        ["2026-09-16 06:59", "2026-09-17 06:59"],
    )
    monkeypatch.setattr(collector, "all_closed_periods", lambda _client: [])
    inv = collector.analytics_history_inventory(
        client, Logger(), "2026-09-15", "2026-09-17"
    )
    assert inv["current_player_period"] == ("2026-09-16 07:00", "2026-09-17 06:59")
    assert inv["player_periods"] == [
        ("2026-09-15", "2026-09-15 07:00", "2026-09-16 06:59")
    ]


class Api:
    instances = []

    def __init__(self, cfg):
        self.sent = []
        self.__class__.instances.append(self)

    def send(self, kind, items=None, dry_run=False, **extra):
        self.sent.append((kind, items, extra))
        return {"ok": True}


class Cfg:
    location_code = "arusha"


def test_backfill_marks_daily_final_and_uses_analytics_api_only(monkeypatch):
    from ace_collector import analytics_api
    from jobs import accounting_reports, jackpot_wins, player_statistics

    Api.instances.clear()
    monkeypatch.setattr(analytics_api, "AnalyticsApi", Api)
    monkeypatch.setattr(
        collector, "analytics_history_inventory", lambda *args: {
            "all_player_periods": [], "current_player_period": None,
            "player_periods": [("2026-09-01", "2026-09-01 07:00", "2026-09-02 06:59")],
            "report_periods": [("2026-09-01", 77, "01 Sep 2026")],
            "player_duplicates": {}, "report_duplicates": {},
            "missing_player_dates": [], "missing_report_dates": [],
        },
    )
    monkeypatch.setattr(
        player_statistics, "collect", lambda *args: {
            "players": [{"ace_player_id": "9"}],
            "daily": [{"ace_player_id": "9", "business_date": "2026-09-01"}],
            "period": args[1:],
        },
    )
    monkeypatch.setattr(jackpot_wins, "collect", lambda *args: [{"source_key": "jp-1"}])
    monkeypatch.setattr(
        accounting_reports, "run", lambda *args, **kwargs: {
            "egm_rows": [{"Position": "1"}], "jp_rows": [], "jackpots": []
        },
    )

    rc = collector.run_analytics_history(
        object(), Cfg(), Logger(), "2026-09-01", "2026-09-17", scan_only=False
    )
    assert rc == 0
    sent = Api.instances[0].sent
    assert [kind for kind, _items, _extra in sent] == ["players", "daily", "jackpots"]
    assert sent[1][1][0]["is_final"] is True
    assert all(kind != "egm_status" and kind != "transactions" for kind, *_ in sent)


def test_scan_posts_nothing(monkeypatch):
    monkeypatch.setattr(
        collector, "analytics_history_inventory", lambda *args: {
            "all_player_periods": [], "current_player_period": None,
            "player_periods": [], "report_periods": [],
            "player_duplicates": {}, "report_duplicates": {},
            "missing_player_dates": [], "missing_report_dates": [],
        },
    )
    assert collector.run_analytics_history(
        object(), Cfg(), Logger(), "2026-09-01", "2026-09-17", scan_only=True
    ) == 0


def test_analytics_history_cli_accepts_september_before_config(monkeypatch):
    class StopConfig:
        @classmethod
        def load(cls):
            raise RuntimeError("validated")

    monkeypatch.setattr(collector, "Config", StopConfig)
    try:
        collector.main([
            "--analytics-history-scan", "--from", "2026-09-01", "--to", "2026-09-17"
        ])
    except RuntimeError as exc:
        assert str(exc) == "validated"
    else:
        raise AssertionError("September analytics range was rejected by finance guardrails")