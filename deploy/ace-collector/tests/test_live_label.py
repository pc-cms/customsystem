"""Regression: LIVE collection must carry the exact ACE period label."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ace_collector.ace_client import AceError  # noqa: E402
from collector import collect_live, current_period_label  # noqa: E402

REPORT_PAGE = """
<select id="select_period_id">
  <option value="0">18 Aug 2026 22:59</option>
  <option value="41">17 Aug 2026 07:00</option>
</select>
"""

REPORT_PAGE_NO_LIVE = """
<select id="select_period_id">
  <option value="41">17 Aug 2026 07:00</option>
</select>
"""

# Consolidation page without any period selector (real ACE live behaviour).
CONSOLIDATION = """
<table>
  <tr><td>&#916;Total Drop</td><td>64 446 486</td></tr>
  <tr><td>Active credits</td><td>2 176 150</td></tr>
  <tr><td>NET WIN</td><td>11 993 660</td><td>WIN, CashDesk</td><td>11 993 368</td></tr>
  <tr><td>Cashless Money</td><td>1</td><td>2</td><td>3</td><td>-1 292</td></tr>
  <tr><td>Jackpot Slip</td><td>1</td><td>2</td><td>0</td></tr>
</table>
"""


class FakeClient:
    def __init__(self, report_page):
        self._report_page = report_page

    def report_page_html(self):
        return self._report_page

    def consolidation_html(self, period_id):
        return CONSOLIDATION


class LiveLabelTest(unittest.TestCase):
    def test_live_uses_period_selector_label(self):
        report = collect_live(FakeClient(REPORT_PAGE))
        self.assertEqual(report.period_label, "18 Aug 2026 22:59")
        self.assertEqual(report.period_id, 0)
        self.assertEqual(report.active_credits, 2176150.0)

    def test_current_period_label(self):
        self.assertEqual(current_period_label(FakeClient(REPORT_PAGE)), "18 Aug 2026 22:59")

    def test_missing_live_period_raises(self):
        with self.assertRaises(AceError):
            collect_live(FakeClient(REPORT_PAGE_NO_LIVE))


if __name__ == "__main__":
    unittest.main()
