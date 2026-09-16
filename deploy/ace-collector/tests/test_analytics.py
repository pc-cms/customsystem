"""Static-fixture tests for the ACE analytics parsers/normalizers (no network)."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ace_collector.analytics_parser import (  # noqa: E402
    normalize_jackpot_win,
    normalize_player_row,
    parse_egm_list,
    parse_html_tables,
    source_key,
    to_number,
)
from jobs.accounting_reports import jackpot_rows_from_report  # noqa: E402

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
      <th>Jackpot Date/Time</th><th>Winning Date/Time</th><th>%</th></tr>
  <tr><td>Mini</td><td>21 195.00</td><td>A01</td><td>EGT</td>
      <td>2026-09-15 10:00</td><td>2026-09-15 22:10</td><td>1.5</td></tr>
  <tr><td>Grand</td><td></td><td></td><td>EGT</td><td></td><td></td><td>2.0</td></tr>
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

    def test_verified_handle_field_is_kept(self):
        rec = normalize_player_row({"client_id": 1, "egm_handle": "250.00"}, None)
        self.assertEqual(rec["handle_amount"], 250.0)

    def test_row_without_ace_id_is_skipped(self):
        self.assertIsNone(normalize_player_row({"client_name": "Anon"}, "2026-09-15"))


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
        self.assertEqual(len(items), 1)  # incomplete row cannot get a stable key
        item = items[0]
        self.assertEqual(item["jackpot_name"], "Mini")
        self.assertEqual(item["amount"], 21195.0)
        self.assertEqual(item["egm_code"], "A01")
        self.assertIsNone(item["ace_player_id"])
        self.assertEqual(
            item["source_key"],
            jackpot_rows_from_report(rows, "2026-09-15")[0]["source_key"],
        )


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
