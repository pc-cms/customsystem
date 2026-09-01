"""Regression tests for the ACE consolidation report parser."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ace_collector.parser import (  # noqa: E402
    AceParseError,
    business_date_from_label,
    parse_consolidation,
)


def _row(*cells: str) -> str:
    return "<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>"


def build_html(
    total_drop="37 970 817.00",
    net_win="-585 801.00",
    cashdesk="-658 386.00",
    cashless="-51 390.00",
    jackpot="21 195.00",
    active_credits="123 456.00",
    include=("drop", "net", "cashdesk", "cashless", "jackpot", "active"),
) -> str:
    rows = []
    if "drop" in include:
        rows.append(_row("&#916;Total Drop", total_drop, "", ""))
    net_cells = ["NET WIN", net_win, "", "Some Other", "123.00"]
    if "cashdesk" in include:
        net_cells += ["WIN, CashDesk", cashdesk]
    if "net" in include:
        rows.append(_row(*net_cells))
    if "cashless" in include:
        rows.append(
            _row("&#916;Cashless", "1.00", "Cashless Money", "a", "b", "c", cashless)
        )
    if "jackpot" in include:
        rows.append(_row("&#916;Ticket", "2.00", "Jackpot Slip", "x", "y", jackpot))
    if "active" in include:
        rows.append(_row("Active credits", active_credits, "", ""))
    return "<html><table>" + "".join(rows) + "</table></html>"


class ParseConsolidationTest(unittest.TestCase):
    def test_sample_values(self):
        r = parse_consolidation(build_html(), 0)
        self.assertEqual(r.total_drop, 37970817.00)
        self.assertEqual(r.net_win, -585801.00)
        self.assertEqual(r.win_cashdesk, -658386.00)
        self.assertEqual(r.cashless_money_difference, -51390.00)
        self.assertEqual(r.jackpot_slip_out, 21195.00)
        self.assertEqual(r.active_credits, 123456.00)

    def test_present_zero_values_are_valid(self):
        r = parse_consolidation(
            build_html(
                total_drop="0.00",
                net_win="0.00",
                cashdesk="0.00",
                cashless="0.00",
                jackpot="0.00",
                active_credits="0.00",
            ),
            0,
        )
        self.assertEqual(
            (
                r.total_drop,
                r.net_win,
                r.win_cashdesk,
                r.cashless_money_difference,
                r.jackpot_slip_out,
                r.active_credits,
            ),
            (0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
        )

    def test_missing_field_raises(self):
        all_keys = ("drop", "net", "cashdesk", "cashless", "jackpot", "active")
        for missing in all_keys:
            include = tuple(k for k in all_keys if k != missing)
            with self.subTest(missing=missing):
                with self.assertRaises(AceParseError):
                    parse_consolidation(build_html(include=include), 0)


class BusinessDateTest(unittest.TestCase):
    def test_short_month(self):
        self.assertEqual(business_date_from_label("18 Aug 2026 10:25"), "2026-08-17")  # closed report dated D covers business day D-1

    def test_full_month(self):
        self.assertEqual(business_date_from_label("18 August 2026 10:25"), "2026-08-17")  # closed report dated D covers business day D-1

    def test_month_first(self):
        self.assertEqual(business_date_from_label("August 18, 2026 10:25"), "2026-08-17")  # closed report dated D covers business day D-1

    def test_numeric_formats(self):
        self.assertEqual(business_date_from_label("2026-08-18 10:25"), "2026-08-17")  # closed report dated D covers business day D-1
        self.assertEqual(business_date_from_label("18.08.2026 10:25"), "2026-08-17")  # closed report dated D covers business day D-1

    def test_empty(self):
        self.assertIsNone(business_date_from_label(""))
        self.assertIsNone(business_date_from_label("no date here"))


if __name__ == "__main__":
    unittest.main()
