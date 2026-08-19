"""HTML parsing of the ACE Finance consolidation report.

Row/cell algorithm (matches the real ACE layout):
  * For every <tr>, collect normalized text of every <td>/<th>.
  * "ΔTotal Drop"  -> cells[0] == label, value = cells[1]
  * "NET WIN"      -> cells[0] == label, value = cells[1]
  * "WIN, CashDesk"-> anywhere in the NET WIN row, value = next cell
  * "Cashless Money" -> anywhere in any row, Difference = cell + 4
  * "Jackpot Slip"   -> anywhere in any row, OUT/Paid = cell + 3

Presence is tracked separately from the numeric value: a real 0 is valid,
a structurally missing field raises AceParseError so cron never submits
false zeros.
"""
from __future__ import annotations

import datetime as _dt
import logging
import re
import unicodedata
from dataclasses import dataclass, asdict

from bs4 import BeautifulSoup

logger = logging.getLogger("ace-collector")


class AceParseError(RuntimeError):
    """Raised when the ACE report structure does not contain a required field."""


TOTAL_DROP_LABEL = "total drop"
NET_WIN_LABEL = "net win"
CASHDESK_LABEL = "win, cashdesk"
CASHLESS_LABEL = "cashless money"
JACKPOT_LABEL = "jackpot slip"
ACTIVE_CREDITS_LABEL = "active credits"


def _norm(text: str | None) -> str:
    """Normalize a cell text for comparison (strip Δ, NBSP, punctuation noise)."""
    if not text:
        return ""
    s = unicodedata.normalize("NFKC", text)
    s = s.replace("\u00a0", " ").replace("\u202f", " ")
    s = s.replace("\u0394", "").replace("Δ", "").replace("∆", "")
    s = re.sub(r"\s+", " ", s).strip()
    s = s.strip(" :.\u2013-")
    return s.lower()


def to_number(text: str | None) -> float:
    """Parse an ACE numeric cell into a float. Returns 0.0 when empty."""
    if not text:
        return 0.0
    raw = text.replace("\u00a0", " ").replace("\u202f", " ").strip()
    raw = raw.replace("(", "-").replace(")", "")
    raw = re.sub(r"[^0-9,.\-+]", "", raw)
    if not raw or raw in ("-", "+", ".", ","):
        return 0.0
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


def _is_numeric_cell(text: str) -> bool:
    return bool(re.search(r"\d", text or ""))


@dataclass
class FinanceReport:
    period_id: int
    period_label: str
    total_drop: float
    net_win: float
    win_cashdesk: float
    cashless_money_difference: float
    jackpot_slip_out: float
    active_credits: float

    def as_payload(self, location_code: str) -> dict:
        data = asdict(self)
        data["location_code"] = location_code
        return data


def _rows(soup: BeautifulSoup) -> list[list[str]]:
    out: list[list[str]] = []
    for row in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
        out.append(cells)
    return out


def parse_period_label(soup: BeautifulSoup) -> str:
    """Best-effort extraction of the ACE period label shown on the report."""
    for sel in (
        "#select_period_id",
        "select[name=select_period_id]",
        "#period_id",
        "select[name=period_id]",
    ):
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
    rows = _rows(soup)

    found: dict[str, float] = {}

    def take(key: str, cells: list[str], idx: int) -> None:
        if key in found or idx >= len(cells):
            return
        raw = cells[idx]
        if not _is_numeric_cell(raw):
            return
        found[key] = to_number(raw)

    for cells in rows:
        if not cells:
            continue
        head = _norm(cells[0])

        if head == TOTAL_DROP_LABEL:
            take("total_drop", cells, 1)

        if head == ACTIVE_CREDITS_LABEL:
            take("active_credits", cells, 1)

        if head == NET_WIN_LABEL:
            take("net_win", cells, 1)
            for i, cell in enumerate(cells):
                if _norm(cell) == CASHDESK_LABEL:
                    take("win_cashdesk", cells, i + 1)

        for i, cell in enumerate(cells):
            n = _norm(cell)
            if n == CASHLESS_LABEL:
                take("cashless_money_difference", cells, i + 4)
            elif n == JACKPOT_LABEL:
                take("jackpot_slip_out", cells, i + 3)

    required = (
        ("total_drop", "ΔTotal Drop"),
        ("net_win", "NET WIN"),
        ("win_cashdesk", "WIN, CashDesk"),
        ("cashless_money_difference", "Cashless Money Difference"),
        ("jackpot_slip_out", "Jackpot Slip OUT"),
        ("active_credits", "Active credits"),
    )
    missing = [human for key, human in required if key not in found]
    if missing:
        raise AceParseError(
            "ACE report structure changed — missing fields: " + ", ".join(missing)
        )

    return FinanceReport(
        period_id=period_id,
        period_label=period_label or parse_period_label(soup),
        total_drop=found["total_drop"],
        net_win=found["net_win"],
        win_cashdesk=found["win_cashdesk"],
        cashless_money_difference=found["cashless_money_difference"],
        jackpot_slip_out=found["jackpot_slip_out"],
        active_credits=found["active_credits"],
    )


MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

NUMERIC_DATE_PATTERNS = (
    (re.compile(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})"), ("y", "m", "d")),
    (re.compile(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})"), ("d", "m", "y")),
)

TEXT_DATE_RE = re.compile(r"\b(\d{1,2})[\s./-]+([A-Za-z]{3,})[\s./-]+(\d{4})\b")
TEXT_DATE_RE_2 = re.compile(r"\b([A-Za-z]{3,})[\s./-]+(\d{1,2}),?[\s./-]+(\d{4})\b")
TIME_RE = re.compile(r"\b(\d{1,2}):(\d{2})\b")

# Casino business day rolls over at 07:00 local time (Africa/Dar_es_Salaam).
BUSINESS_DAY_ROLLOVER_HOUR = 7


def _apply_rollover(iso_date: str, label: str) -> str:
    """A report closed before 07:00 belongs to the previous business day."""
    m = TIME_RE.search(label)
    if not m:
        return iso_date
    hour = int(m.group(1))
    if hour >= BUSINESS_DAY_ROLLOVER_HOUR or hour > 23:
        return iso_date
    try:
        d = _dt.date.fromisoformat(iso_date)
    except ValueError:
        return iso_date
    return (d - _dt.timedelta(days=1)).isoformat()


def business_date_from_label(label: str) -> str | None:
    """Extract YYYY-MM-DD from an ACE period label (numeric or textual month)."""
    if not label:
        return None

    m = TEXT_DATE_RE.search(label)
    if m:
        day, month_name, year = m.group(1), m.group(2), m.group(3)
    else:
        m = TEXT_DATE_RE_2.search(label)
        if m:
            month_name, day, year = m.group(1), m.group(2), m.group(3)
        else:
            month_name = None
    if month_name:
        month = MONTHS.get(month_name[:4].lower()) or MONTHS.get(month_name[:3].lower())
        if month:
            return _apply_rollover(f"{int(year):04d}-{month:02d}-{int(day):02d}", label)

    for pattern, order in NUMERIC_DATE_PATTERNS:
        m = pattern.search(label)
        if not m:
            continue
        parts = dict(zip(order, m.groups()))
        return _apply_rollover(
            f"{int(parts['y']):04d}-{int(parts['m']):02d}-{int(parts['d']):02d}", label
        )
    return None
