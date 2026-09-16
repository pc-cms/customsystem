"""Static-fixture tests for the ACE analytics parsers/normalizers (no network)."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ace_collector.analytics_parser import (
    combine_date_time,  # noqa: E402
    local_to_utc_iso,
    normalize_jackpot_win,
    normalize_player_row,
    parse_egm_list,
    parse_html_tables,
    source_key,
    to_number,
)
from jobs.accounting_reports import jackpot_rows_from_report  # noqa: E402
from jobs.player_statistics import _rows  # noqa: E402

EGMS_HTML = """
<table>
  <tr><th>#EGM</th><th>MAC Address</th><th>Model</th><th>I/N</th><th>S/N</th>
      <th>Denom</th><th>State</th><th>SMIB</th><th>Link</th><th>Game/Mix</th>
      <th>Games Count</th></tr>
  <tr egm="1187"><td>A01</td><td>00:11:22:33</td><td>P24</td><td>101</td><td>S1</td>
      <td>1.00</td><td>In Game</td><td>ok</td><td>Linked</td><td>Mix A</td><td>15</td></tr>
  <tr egm="1188"><td>A02</td><td>00:11:22:34</td><td>P24</td><td>102</td><td>S2</td>
      <td>1.00</td><td>Idle</td><td>ok</td><td>Linked</td><td>Mix B</td><td></td></tr>
</table>
"""

EGM_REPORT_HTML = """
<table>
  <tr><th>Position</th><th>Platform</th><th>Game</th><th>&#916;In</th><th>&#916;Out</th>
      <th>&#916; Games</th><th>&#916; Total Drop</th></tr>
  <tr><td>A01</td><td>EGT</td><td>Mix A</td><td>1 000.00</td><td>800.00</td><td>12</td><td>1 000.00</td></tr>
</table>
"""

JP_REPORT_HTML = """
<table>
  <tr><th>JackPot</th><th>Sum of Winning</th><th>EGM Position</th><th>Platform</th>
      <th>Jackpot Date</th><th>Jackpot Time</th>
      <th>Winning Date</th><th>Winning Time</th><th>%</th></tr>
  <tr><td>Mini</td><td>21 195.00</td><td>A01</td><td>EGT</td>
      <td>15/SEP/2026</td><td>10:00:00</td>
      <td>15/SEP/2026</td><td>17:51:56</td><td>1.5</td></tr>
  <tr><td>Mini</td><td>21 195.00</td><td>A01</td><td>EGT</td>
      <td>15/SEP/2026</td><td>10:00:00</td>
      <td>15/SEP/2026</td><td>21:04:11</td><td>1.5</td></tr>
  <tr><td>Grand</td><td></td><td></td><td>EGT</td><td></td><td></td>
      <td></td><td></td><td>2.0</td></tr>
</table>
"""


class NumberTest(unittest.TestCase):
    def test_zero_stays_zero_missing_stays_none(self):
        self.assertEqual(to_number("0"), 0.0)
        self.assertEqual(to_number("0.00"), 0.0)
        self.assertIsNone(to_number(""))
        self.assertIsNone(to_number(None))
        self.assertIsNone(to_number("n/a"))
        self.assertEqual(to_number("37 970 817.00"), 37970817.0)
        self.assertEqual(to_number("-585,801.00"), -585801.0)


class PlayerNormalizationTest(unittest.TestCase):
    def test_in_out_drop_and_handle(self):
        row = {
            "client_id": 4321,
            "client_name": "John Smith",
            "egm_cashless_in": "1000.00",
            "egm_key_in": "0",
            "egm_bill_in": "500.00",
            "egm_cashless_out": "300.00",
            "egm_slip_out": "0",
            "egm_key_out": "200.00",
            "games": "17",
            "total_in_result": "999999.00",
        }
        rec = normalize_player_row(row, "2026-09-15")
        self.assertEqual(rec["ace_player_id"], "4321")
        self.assertEqual(rec["ace_name"], "John Smith")
        self.assertEqual(rec["in_amount"], 1500.0)
        self.assertEqual(rec["out_amount"], 500.0)
        self.assertEqual(rec["drop_amount"], rec["in_amount"])  # Drop = IN
        self.assertIsNone(rec["handle_amount"])  # never derived, never total_in_result
        self.assertEqual(rec["games"], 17)
        self.assertEqual(rec["raw_data"], row)

    def test_missing_components_stay_null(self):
        rec = normalize_player_row({"ptr_id": 7}, "2026-09-15")
        self.assertIsNone(rec["in_amount"])
        self.assertIsNone(rec["out_amount"])
        self.assertIsNone(rec["drop_amount"])
        self.assertIsNone(rec["handle_amount"])
        self.assertIsNone(rec["games"])

    def test_guessed_handle_fields_are_not_handle(self):
        row = {
            "client_id": 1,
            "egm_handle": "250.00",
            "handle": "250.00",
            "turnover": "250.00",
            "total_bet": "250.00",
            "total_in_result": "250.00",
        }
        rec = normalize_player_row(row, None)
        self.assertIsNone(rec["handle_amount"])  # only verified total_in maps
        self.assertEqual(rec["raw_data"]["egm_handle"], "250.00")

    def test_verified_total_in_is_handle_and_games_played_is_games(self):
        row = {
            "ptr_id": 88132,
            "forename": "Nurdin Mafie",
            "egm_cashless_in": 20500,
            "egm_cashless_out": 250,
            "total_in": 113000,
            "total_out": 92750,
            "games_played": 107,
            "casino_result_balance": 20250,
        }
        rec = normalize_player_row(row, "2026-09-15")
        self.assertEqual(rec["handle_amount"], 113000.0)
        self.assertEqual(rec["games"], 107)
        self.assertEqual(rec["in_amount"], 20500.0)  # EGM movement, not total_in
        self.assertEqual(rec["drop_amount"], 20500.0)
        self.assertEqual(rec["out_amount"], 250.0)

    def test_ptr_id_wins_over_trip_id_and_forename_is_name(self):
        rec = normalize_player_row(
            {"ptr_id": 123, "id": 999, "forename": "John Smith"}, "2026-09-15"
        )
        self.assertEqual(rec["ace_player_id"], "123")
        self.assertNotEqual(rec["ace_player_id"], "999")
        self.assertEqual(rec["ace_name"], "John Smith")

    def test_trip_id_alone_is_not_an_ace_player_id(self):
        self.assertIsNone(normalize_player_row({"id": 999, "client": "X"}, None))

    def test_child_row_client_is_used_as_name(self):
        rec = normalize_player_row({"ptr_id": 5, "client": "Jane Doe"}, None)
        self.assertEqual(rec["ace_name"], "Jane Doe")

    def test_row_without_ace_id_is_skipped(self):
        self.assertIsNone(normalize_player_row({"client_name": "Anon"}, "2026-09-15"))


class PlayerTreeTest(unittest.TestCase):
    def test_parent_with_nested_child_rows_yields_one_row(self):
        tree = {
            "results": [
                {
                    "ptr_id": 88132,
                    "forename": "Nurdin Mafie",
                    "total_in": 113000,
                    "games_played": 107,
                    "data": [
                        {"ptr_id": 88132, "id": 5551, "client": "Nurdin Mafie"},
                        {"ptr_id": 88132, "id": 5552, "client": "Nurdin Mafie"},
                    ],
                },
                {"ptr_id": 88133, "forename": "Other", "data": [{"ptr_id": 88133, "id": 1}]},
            ]
        }
        rows = _rows(tree)
        self.assertEqual(len(rows), 2)
        self.assertEqual([r["ptr_id"] for r in rows], [88132, 88133])


class EgmHtmlTest(unittest.TestCase):
    def test_parse_egm_list(self):
        items = parse_egm_list(EGMS_HTML)
        self.assertEqual(len(items), 2)
        first = items[0]
        self.assertEqual(first["egm_code"], "A01")
        self.assertEqual(first["position"], "A01")
        self.assertEqual(first["state"], "In Game")  # verbatim ACE state
        self.assertEqual(first["raw_data"]["leg_id"], "1187")
        self.assertEqual(first["raw_data"]["MAC Address"], "00:11:22:33")


class ReportTableTest(unittest.TestCase):
    def test_egm_report_keeps_original_headers(self):
        tables = parse_html_tables(EGM_REPORT_HTML)
        row = tables[0]["rows"][0]
        self.assertEqual(row["Position"], "A01")
        self.assertEqual(row["ΔIn"], "1 000.00")
        self.assertEqual(row["Δ Total Drop"], "1 000.00")

    def test_jp_report_rows_and_jackpot_extraction(self):
        rows = [r for t in parse_html_tables(JP_REPORT_HTML) for r in t["rows"]]
        items = jackpot_rows_from_report(rows, "2026-09-15")
        self.assertEqual(len(items), 2)  # incomplete row cannot get a stable key
        item = items[0]
        self.assertEqual(item["jackpot_name"], "Mini")
        self.assertEqual(item["amount"], 21195.0)
        self.assertEqual(item["egm_code"], "A01")
        self.assertIsNone(item["ace_player_id"])
        # Winning Date + Winning Time combined and normalized to ISO
        self.assertEqual(item["occurred_at"], "2026-09-15T14:51:56Z")
        self.assertEqual(items[1]["occurred_at"], "2026-09-15T18:04:11Z")
        # same day, same EGM, same name/amount -> only the time differs
        self.assertNotEqual(item["source_key"], items[1]["source_key"])
        self.assertEqual(
            item["source_key"],
            jackpot_rows_from_report(rows, "2026-09-15")[0]["source_key"],
        )

    def test_combine_date_time_variants(self):
        self.assertEqual(
            combine_date_time("15/SEP/2026", "17:51:56"), "2026-09-15T17:51:56"
        )
        self.assertEqual(
            combine_date_time("2026-09-15", "17:51:56"), "2026-09-15T17:51:56"
        )
        self.assertEqual(
            combine_date_time("15/09/2026", "17:51:56"), "2026-09-15T17:51:56"
        )
        self.assertIsNone(combine_date_time("", ""))
        self.assertIsNone(combine_date_time(None, None))


class TimezoneTest(unittest.TestCase):
    def test_ace_local_is_converted_to_utc(self):
        self.assertEqual(
            local_to_utc_iso("2026-09-15T17:51:56"), "2026-09-15T14:51:56Z"
        )
        self.assertEqual(
            local_to_utc_iso("2026-09-15 17:51:56"), "2026-09-15T14:51:56Z"
        )
        self.assertEqual(
            local_to_utc_iso("2026-09-15T17:51:56+03:00"), "2026-09-15T14:51:56Z"
        )
        self.assertIsNone(local_to_utc_iso(""))
        self.assertEqual(local_to_utc_iso("not a date"), "not a date")

    def test_report_jackpots_store_utc_and_keep_business_date(self):
        rows = [r for t in parse_html_tables(JP_REPORT_HTML) for r in t["rows"]]
        items = jackpot_rows_from_report(rows, "2026-09-15")
        self.assertEqual(items[0]["occurred_at"], "2026-09-15T14:51:56Z")
        self.assertEqual(items[0]["business_date"], "2026-09-15")

    def test_after_midnight_local_keeps_prior_business_date(self):
        html = JP_REPORT_HTML.replace("17:51:56", "02:11:28").replace(
            "15/SEP/2026</td>\n      <td>02:11:28", "16/SEP/2026</td>\n      <td>02:11:28"
        )
        rows = [r for t in parse_html_tables(html) for r in t["rows"]]
        items = jackpot_rows_from_report(rows, "2026-09-15")
        self.assertEqual(items[0]["business_date"], "2026-09-15")
        self.assertTrue(items[0]["occurred_at"].endswith("Z"))


class JackpotWinTest(unittest.TestCase):
    def test_normalize_and_deterministic_key(self):
        row = {
            "jp_name": "Mini",
            "jp_win_sum": "21 195.00",
            "egm": "A01",
            "jp_win_date": "2026-09-15 22:10:00",
            "client_id": 4321,
            "client_name": "John Smith",
        }
        a = normalize_jackpot_win(row, "2026-09-15")
        self.assertEqual(a["occurred_at"], "2026-09-15T19:10:00Z")
        b = normalize_jackpot_win(dict(row), "2026-09-15")
        self.assertEqual(a["source_key"], b["source_key"])
        self.assertEqual(a["amount"], 21195.0)
        self.assertEqual(a["ace_player_id"], "4321")
        self.assertEqual(a["raw_data"], row)

    def test_source_key_is_stable_and_distinct(self):
        self.assertEqual(source_key("a", 1, None), source_key("a", 1, None))
        self.assertNotEqual(source_key("a", 1), source_key("a", 2))


if __name__ == "__main__":
    unittest.main()
