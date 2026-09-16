"""EGM live status collector.

Two sources:

* VERIFIED fallback (used now): the server-rendered Manager page
  ``/users/manager/egms.php`` — columns ``#EGM, MAC Address, Model, I/N, S/N,
  Denom, State, SMIB, Link, Game/Mix, Games Count`` with the internal leg id in
  the row ``egm`` attribute.
* Modern ``ace.Api("egms.getegmlist", ...)`` — the exact ``/aceapi/`` wire shape
  was NOT captured during probing, so it is intentionally DISABLED and must not
  be guessed. It is isolated in :func:`collect_modern` below.
"""
from __future__ import annotations

import logging

from ace_collector.analytics_parser import parse_egm_list

logger = logging.getLogger("ace-collector")

EGM_PAGE = "/users/manager/egms.php"

#: Flipped on only after the real /aceapi/ request shape has been captured.
MODERN_EGM_API_ENABLED = False


def collect_modern(_client, _filter_data: dict | None = None) -> list[dict]:
    """Modern egms.getegmlist source — disabled until the wire shape is known."""
    raise NotImplementedError(
        "modern ace.Api('egms.getegmlist') request shape is not verified yet"
    )


def collect(client) -> list[dict]:
    if MODERN_EGM_API_ENABLED:  # pragma: no cover - disabled by design
        try:
            return collect_modern(client)
        except NotImplementedError:
            logger.warning("Modern EGM API disabled — falling back to egms.php")
    html = client.manager_page_html(EGM_PAGE)
    items = parse_egm_list(html)
    logger.info("ACE EGM status rows=%d (source=%s)", len(items), EGM_PAGE)
    return items


def run(client, api, dry_run: bool = True) -> list[dict]:
    items = collect(client)
    if items:
        api.send("egm_status", items, dry_run=dry_run)
    return items
