"""DISABLED adapter — ACE account transactions.

Probing confirmed the UI page ``/users/manager/report_account_transactions.php``
(loading ``/reports/clients/cashdesk.js``) and operation-level read APIs such as
``balances/get_trip_details`` and ``balances/get_agg_details``. It did NOT
capture a single safe global transaction-list API with a verified response
shape.

Therefore this adapter intentionally emits NOTHING. No transaction may ever be
inferred from balance deltas. The CMS ``kind=transactions`` ingest contract
stays intact and untouched until a real source shape is verified; only then is
``ENABLED`` flipped and :func:`collect` implemented against that source.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("ace-collector")

ENABLED = False


def collect(_client, **_kwargs) -> list[dict]:
    raise NotImplementedError(
        "ACE transaction source shape is not verified yet — nothing is emitted"
    )


def run(_client, _api, dry_run: bool = True) -> list[dict]:
    logger.info("ACE transactions adapter is DISABLED (no verified source) — skipped")
    return []
