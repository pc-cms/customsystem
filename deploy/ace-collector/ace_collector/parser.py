"""HTML parsing of the ACE Finance consolidation report."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, asdict

from bs4 import BeautifulSoup

logger = logging.getLogger("ace-collector")

CASHLESS_TITLE = "change of card accounts balance"
JACKPOT_TITLE = "all paid and reversal slips for the period"

NUM_RE = re.compile(r"-?[\d\u00a0\u202f ,.]+")


def to_number(text: str | None) -> float:
    """Parse an ACE numeric cell into a float. Returns 0.0 when empty."""
    if not text:
        return 0.0
    raw = text.replace("\u00a0", " ").replace("\u202f", " ").strip()
    raw = raw.replace("(", "-").replace(")", "")
    raw = re.sub(r"[^0-9,.\-+]", "", raw)
    if not raw or raw in ("-", "+", ".", ","):
        return 0.0
    # Decide decimal separator: last of , or .
    last_comma = raw.rfind(",")
    last_dot = raw.rfind(".")
    if last_comma > last_dot:
        raw = raw.replace(".", "").replace(",", ".")
    else:
        raw = raw.replace(",", "")
    try:
        return float(raw)
    except ValueError:
        return 0.0


@dataclass
class FinanceReport:
    period_id: int
    period_label: str
    total_drop: float
    net_win: float
    win_cashdesk: float
    cashless_money_difference: float
    jackpot_slip_out: float

    def as_payload(self, location_code: str) -> dict:
        data = asdict(self)
        data["location_code"] = location_code
        return data


def _cells(row) -> list:
    return row.find_all(["td", "th"])


def _row_label(row) -> str:
    cells = _cells(row)
    if not cells:
        return ""
    return cells[0].get_text(" ", strip=True)


def _first_number_after_label(row) -> float:
    for cell in _cells(row)[1:]:
        txt = cell.get_text(" ", strip=True)
        if NUM_RE.fullmatch(txt.strip() or "x") or re.search(r"\d", txt):
            return to_number(txt)
    return 0.0


def _find_row(soup: BeautifulSoup, needle: str):
    needle_low = needle.lower()
    for row in soup.find_all("tr"):
        label = _row_label(row).lower()
        if needle_low in label:
            return row
    return None


def _find_td_by_title(soup: BeautifulSoup, title_needle: str, row_needle: str | None = None):
    title_low = title_needle.lower()
    for row in soup.find_all("tr"):
        if row_needle and row_needle.lower() not in _row_label(row).lower():
            continue
        for cell in _cells(row):
            title = (cell.get("title") or "").lower()
            if title_low in title:
                return cell
    return None


def parse_period_label(soup: BeautifulSoup) -> str:
    """Best-effort extraction of the ACE period label shown on the report."""
    for sel in ("#select_period_id", "select[name=select_period_id]", "#period_id", "select[name=period_id]"):
        select = soup.select_one(sel)
        if select:
            opt = select.find("option", selected=True) or select.find("option")
            if opt:
                return opt.get_text(" ", strip=True)
    text = soup.get_text(" ", strip=True)
    m = re.search(r"\d{2}[./-]\d{2}[./-]\d{4}[^|]{0,40}", text)
    return m.group(0).strip() if m else ""


def parse_periods(html: str) -> list[tuple[int, str]]:
    """All (period_id, label) options from the report page, in document order."""
    soup = BeautifulSoup(html, "html.parser")
    out: list[tuple[int, str]] = []
    select = (
        soup.select_one("#select_period_id")
        or soup.select_one("select[name=select_period_id]")
        or soup.select_one("select[name=period_id]")
        or soup.select_one("#period_id")
    )
    if not select:
        return out
    for opt in select.find_all("option"):
        val = (opt.get("value") or "").strip()
        if not re.fullmatch(r"\d+", val):
            continue
        out.append((int(val), opt.get_text(" ", strip=True)))
    return out


def parse_consolidation(html: str, period_id: int, period_label: str = "") -> FinanceReport:
    soup = BeautifulSoup(html, "html.parser")

    drop_row = _find_row(soup, "total drop")
    net_row = _find_row(soup, "net win")
    cash_row = _find_row(soup, "win, cashdesk") or _find_row(soup, "win, cash desk")

    cashless_td = _find_td_by_title(soup, CASHLESS_TITLE)
    jackpot_td = _find_td_by_title(soup, JACKPOT_TITLE, row_needle="jackpot slip")

    report = FinanceReport(
        period_id=period_id,
        period_label=period_label or parse_period_label(soup),
        total_drop=_first_number_after_label(drop_row) if drop_row else 0.0,
        net_win=_first_number_after_label(net_row) if net_row else 0.0,
        win_cashdesk=_first_number_after_label(cash_row) if cash_row else 0.0,
        cashless_money_difference=to_number(cashless_td.get_text(" ", strip=True)) if cashless_td else 0.0,
        jackpot_slip_out=to_number(jackpot_td.get_text(" ", strip=True)) if jackpot_td else 0.0,
    )

    missing = [
        name
        for name, found in (
            ("Total Drop", drop_row),
            ("NET WIN", net_row),
            ("WIN, CashDesk", cash_row),
            ("Cashless Money Difference", cashless_td),
            ("Jackpot Slip OUT", jackpot_td),
        )
        if found is None
    ]
    if missing:
        logger.warning("Metrics not found in ACE report: %s", ", ".join(missing))

    return report


DATE_PATTERNS = (
    (re.compile(r"(\d{4})[./-](\d{2})[./-](\d{2})"), ("y", "m", "d")),
    (re.compile(r"(\d{2})[./-](\d{2})[./-](\d{4})"), ("d", "m", "y")),
)


def business_date_from_label(label: str) -> str | None:
    """Extract YYYY-MM-DD directly from the ACE period label."""
    if not label:
        return None
    for pattern, order in DATE_PATTERNS:
        m = pattern.search(label)
        if not m:
            continue
        parts = dict(zip(order, m.groups()))
        return f"{parts['y']}-{parts['m']}-{parts['d']}"
    return None
