"""Parsers and normalizers for the ACE *analytics* sources.

Strictly read-only helpers. Rules enforced here:

* explicit zero stays ``0.0`` — an absent value stays ``None`` (never 0)
* canonical CMS Slot Drop = IN (Drop is never taken from ACE)
* Handle is NEVER derived from Drop/IN — it stays ``None`` unless a verified
  ACE handle field is present
* every source row is preserved verbatim in ``raw_data``
"""
from __future__ import annotations

import hashlib
import re
from typing import Any

from bs4 import BeautifulSoup

__all__ = [
    "to_number",
    "parse_html_tables",
    "parse_egm_list",
    "normalize_player_row",
    "normalize_jackpot_win",
    "source_key",
]

_NUM_CLEAN = re.compile(r"[\s\u00a0,']")


def to_number(value: Any) -> float | None:
    """Parse an ACE numeric cell. Absent/unparsable -> None, "0" -> 0.0."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    text = _NUM_CLEAN.sub("", text)
    neg = text.startswith("(") and text.endswith(")")
    if neg:
        text = text[1:-1]
    text = text.replace("−", "-")
    if not re.fullmatch(r"-?\d*\.?\d+", text):
        return None
    result = float(text)
    return -result if neg else result


def _text(node) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def parse_html_tables(html: str) -> list[dict]:
    """Every HTML table as ``{"headers": [...], "rows": [ {header: text} ]}``.

    Header keys keep their ORIGINAL ACE text. Row attributes (e.g. the ``egm``
    attribute carrying the internal leg id) are preserved under ``_attrs``.
    Unnamed columns fall back to ``col_<index>``.
    """
    soup = BeautifulSoup(html or "", "html.parser")
    tables: list[dict] = []
    for table in soup.find_all("table"):
        trs = table.find_all("tr")
        if not trs:
            continue
        headers: list[str] = []
        body_start = 0
        for idx, tr in enumerate(trs):
            ths = tr.find_all("th")
            if ths:
                headers = [_text(th) for th in ths]
                body_start = idx + 1
                break
        if not headers:
            headers = [_text(td) for td in trs[0].find_all("td")]
            body_start = 1
        rows: list[dict] = []
        for tr in trs[body_start:]:
            cells = tr.find_all(["td", "th"])
            if not cells:
                continue
            row: dict[str, Any] = {}
            for i, cell in enumerate(cells):
                key = headers[i] if i < len(headers) and headers[i] else f"col_{i}"
                if key in row:
                    key = f"{key}_{i}"
                row[key] = _text(cell)
            attrs = {k: v for k, v in (tr.attrs or {}).items() if isinstance(v, str)}
            if attrs:
                row["_attrs"] = attrs
            rows.append(row)
        tables.append({"headers": headers, "rows": rows})
    return tables


def _pick(row: dict, *names: str) -> Any:
    for name in names:
        for key, value in row.items():
            if key.strip().lower() == name.strip().lower():
                return value
    return None


def parse_egm_list(html: str) -> list[dict]:
    """Parse the verified server-rendered ``/users/manager/egms.php`` page.

    Columns: ``#EGM, MAC Address, Model, I/N, S/N, Denom, State, SMIB, Link,
    Game/Mix, Games Count``. The row ``egm`` attribute is the internal leg id
    and is kept in ``raw_data`` only. ``#EGM`` (the floor position) is used as
    both ``egm_code`` and ``position``. ACE state text is sent verbatim.
    """
    for table in parse_html_tables(html):
        lowered = [h.lower() for h in table["headers"]]
        if not any("mac" in h for h in lowered):
            continue
        out: list[dict] = []
        for row in table["rows"]:
            position = _pick(row, "#EGM", "EGM", "Position")
            if not position:
                continue
            attrs = row.get("_attrs") or {}
            out.append(
                {
                    "egm_code": str(position).strip(),
                    "position": str(position).strip(),
                    "state": (_pick(row, "State") or None) or None,
                    "raw_data": {**row, "leg_id": attrs.get("egm")},
                }
            )
        return out
    return []


# ───────────────────────────── player statistics ──────────────────────────

IN_COMPONENTS = ("egm_cashless_in", "egm_key_in", "egm_bill_in")
OUT_COMPONENTS = ("egm_cashless_out", "egm_slip_out", "egm_key_out")

#: Only a field that ACE explicitly documents as betting turnover may become
#: Handle. `total_in_result` is NOT such a field and is deliberately absent.
HANDLE_FIELDS = ("egm_handle", "handle", "turnover", "total_bet")

ID_FIELDS = ("client_id", "ptr_id", "player_id", "clientid", "id")
NAME_FIELDS = ("client_name", "player_name", "name", "full_name")


def _sum_components(row: dict, aggregate: str, components: tuple[str, ...]) -> float | None:
    """Aggregate if ACE sends it, else sum the present components (else None)."""
    direct = to_number(row.get(aggregate))
    if direct is not None:
        return direct
    values = [to_number(row.get(c)) for c in components]
    present = [v for v in values if v is not None]
    if not present:
        return None
    return float(sum(present))


def normalize_player_row(row: dict, business_date: str | None) -> dict | None:
    """One ACE trips-tree row -> CMS player/daily record (or None if no ACE id)."""
    ace_player_id = None
    for field in ID_FIELDS:
        value = row.get(field)
        if value not in (None, "", 0, "0"):
            ace_player_id = str(value).strip()
            break
    if not ace_player_id:
        return None

    ace_name = None
    for field in NAME_FIELDS:
        value = row.get(field)
        if isinstance(value, str) and value.strip():
            ace_name = value.strip()
            break
    if not ace_name:
        first = (row.get("first_name") or "").strip() if isinstance(row.get("first_name"), str) else ""
        last = (row.get("last_name") or "").strip() if isinstance(row.get("last_name"), str) else ""
        ace_name = (f"{first} {last}").strip() or None

    in_amount = _sum_components(row, "all_egm_in", IN_COMPONENTS)
    out_amount = _sum_components(row, "all_egm_out", OUT_COMPONENTS)

    handle = None
    for field in HANDLE_FIELDS:
        handle = to_number(row.get(field))
        if handle is not None:
            break

    games = to_number(row.get("games"))

    return {
        "ace_player_id": ace_player_id,
        "ace_name": ace_name,
        "business_date": business_date,
        "in_amount": in_amount,
        "out_amount": out_amount,
        # Drop = IN, always (the ingest re-applies the same rule server-side).
        "drop_amount": in_amount,
        "handle_amount": handle,  # never derived from drop/IN
        "games": int(games) if games is not None else None,
        "raw_data": row,
    }


# ─────────────────────────────── jackpot wins ─────────────────────────────

def normalize_jackpot_win(row: dict, business_date: str | None) -> dict | None:
    """One ``bonusreport/get_jackpot_wins`` row -> ``kind=jackpots`` item."""
    amount = to_number(row.get("jp_win_sum"))
    name = row.get("jp_name") or row.get("jackpot_name") or row.get("name")
    egm = row.get("egm") or row.get("egm_position") or row.get("leg_num_in_floor")
    occurred = (
        row.get("jp_win_date")
        or row.get("win_date")
        or row.get("date_win")
        or row.get("jp_date")
    )
    if business_date is None:
        return None
    ace_player_id = None
    for field in ID_FIELDS:
        value = row.get(field)
        if value not in (None, "", 0, "0"):
            ace_player_id = str(value).strip()
            break
    return {
        "business_date": business_date,
        "occurred_at": str(occurred) if occurred else None,
        "jackpot_name": str(name) if name else None,
        "amount": amount,
        "egm_code": str(egm) if egm else None,
        "ace_player_id": ace_player_id,
        "source_key": source_key(
            "jpwin", business_date, egm, occurred, name, amount
        ),
        "raw_data": row,
    }


def source_key(*parts: Any) -> str:
    """Deterministic, idempotent source key (stable across retries/runs)."""
    joined = "|".join("" if p is None else str(p).strip() for p in parts)
    digest = hashlib.sha1(joined.encode("utf-8")).hexdigest()[:16]
    return f"{joined[:160]}#{digest}"
