# Finance Hub Export API (read-only)

Endpoint: `POST|GET /functions/v1/finance-hub-export`
Service version: `1.1.0`

Read-only mirror of CMS finance + operational result data for the external
Amaell Finance Hub. The endpoint performs **no writes to financial tables** —
it only updates `last_used_at` on the API client and appends an audit row.

## Auth

`Authorization: Bearer <token>`

The token is never stored in plaintext. `finance_hub_api_clients.token_sha256`
holds the SHA-256 hex digest. Rows are readable only by the server
(service role); normal authenticated users have no access, and no token or hash
is committed to the repository.

Provisioning (run once, outside the repo):

```sql
insert into finance_hub_api_clients (name, token_sha256, scopes)
values ('amaell-finance-hub', '<sha256-hex-of-token>',
        array['wallets:read','transactions:read','performance:read','expenses:read','closings:read']);
```

Errors: `401 missing_token` / `401 invalid_token` / `403 forbidden` (scope) /
`400 unknown_mode | invalid_from | invalid_to | invalid_since | invalid_casino_id`.

## Response contract (all modes)

Every response includes:

```jsonc
{ "generated_at": "...", "mode": "...", "service_version": "1.1.0", "source_generated_at": "..." }
```

Every paginated mode additionally includes:

```jsonc
{ "limit": 1000, "row_count": 37, "has_more": true, "next_cursor": "<opaque>|<uuid>" }
```

Pagination rules (stable contract — do not change without updating consumers):

- Page size is hard-capped at **1000**. Higher `limit` values are clamped, never truncated silently.
- Ordering is deterministic ASC on `(sort_key, id)`; identical timestamps never skip or duplicate rows.
- `next_cursor` is `null` when `has_more` is `false`. Pass it back as `cursor` for the next page.
- Cursors are opaque strings of the form `<sort_key>|<uuid>`:
  - transactions / expenses: `<created_at ISO UTC>|<row uuid>`
  - performance / closings: `<business_date>|<casino_id>`
- Requesting the same cursor twice returns the same page (idempotent); consumers de-duplicate on the row UUID.
- Missing source data is returned as `null`. Values are never fabricated.

`mode` is taken from the JSON body or the query string; all params work both ways.

## Modes

### `health`
No auth, no data. `{ ok, service, version, read_only, max_page, modes, generated_at }`.

### `snapshot` (scope `wallets:read`)
Active canonical wallets across all branches (Arusha / Mwanza / Dodoma / Mbeya).
Unpaginated by design (bounded set, currently 80 wallets); returns
`row_count`, `has_more: false`, `next_cursor: null`. Optional `casino_id`.

```json
{
  "as_of_business_date": "2026-08-21",
  "wallets": [{
    "casino_id": "uuid", "casino_name": "Arusha",
    "wallet_id": "uuid", "canonical_code": "MM_MAIN_PHONE_TZS",
    "name": "Main Phone", "wallet_group": "mobile_money", "kind": "mobile_money",
    "currency": "TZS", "provider": null, "provider_account_ref": null,
    "finance_hub_account_id": "uuid|null", "is_active": true, "is_legacy": false,
    "ledger_native": 0, "ledger_tzs": 0,
    "actual_native": null, "actual_tzs": null,
    "physical_asof": null, "physical_source": null,
    "fx_usd_tzs": 2600
  }]
}
```

Balance rules come from SQL (`finance_hub_wallet_snapshot`) and mirror
`fin_balance_snapshot` exactly. Sync by `wallet_id` + `canonical_code`, never by name.

### `transactions` (scope `transactions:read`)
Params: `cursor` (preferred), `since` (legacy timestamp-only cursor, still
accepted), `limit` (1..1000, default 1000).

```json
{
  "transactions": [{
    "source_tx_id": "uuid", "wallet_id": "uuid", "wallet_canonical_code": "CASH_TZS",
    "casino_id": "uuid", "business_date": "2026-08-20",
    "created_at": "...", "posted_at": "...",
    "kind": "transfer", "direction": "in", "sign": 1,
    "amount_native": 100000, "signed_amount_native": 100000,
    "currency": "TZS", "fx_rate": 1, "amount_tzs": 100000, "signed_amount_tzs": 100000,
    "note": "...", "ref_table": "expenses", "ref_id": "uuid", "reversal_of": null,
    "transfer_group_ref": "cage_transfers:uuid", "counterpart_tx_id": "uuid|null",
    "legacy_unpaired": false,
    "cursor": "2026-08-20T10:00:00.000000Z|uuid"
  }]
}
```

Transfer model (Goal 5): historical movements are **not** rewritten.
`transfer_group_ref` = `<ref_table>:<ref_id>` when the CMS row already carries a
source reference; `counterpart_tx_id` is the paired leg when one exists;
`legacy_unpaired: true` marks old manual transfer legs with no pair, which
Finance Hub should ingest as one-sided legacy movements. Future linked
transfers are created on the Finance Hub side.

No player/user PII is exposed (`created_by` omitted).

### `performance` (scope `performance:read`)
Daily operational aggregates behind Dashboard TV — real CMS sources only
(`fin_day_closing`, `business_day_closures`, `expenses`, `fin_other_incomes`,
`player_day_drop_cache`). Business dates follow CMS business-day logic
(07:00 EAT rollover, Africa/Dar_es_Salaam).

Params: `from` (YYYY-MM-DD, default today EAT), `to` (default `from`),
`casino_id`, `limit`, `cursor`. Rows are one per casino × business_date.

```json
{
  "performance": [{
    "casino_id": "uuid", "casino_name": "Mwanza", "casino_code": "MWZ", "city": null,
    "business_date": "2026-08-01",
    "tables_result_tzs": 16065000, "slots_result_tzs": 28897403,
    "total_gaming_result_tzs": 44962403,
    "expenses_tzs": 410000, "other_income_tzs": 783167, "net_result_tzs": 45335570,
    "tables_drop_tzs": 47205000, "tables_payout_tzs": null,
    "slots_drop_tzs": 0, "slots_payout_tzs": null,
    "slots_net_win_tzs": 30286500, "slots_cashdesk_win_tzs": null,
    "players_card_balance_tzs": 0,
    "is_day_closed": true, "day_closed_at": "...", "day_closed_method": "auto_11am",
    "source_updated_at": "...", "cursor": "2026-08-01|uuid"
  }]
}
```

Limitations (intentional, no invented data):
- `tables_payout_tzs` / `slots_payout_tzs` have no source table in CMS → always `null`.
- `city` is not stored on `casinos` → always `null`; use `casino_code`.
- `net_result_tzs = tables + slots − expenses + other_income`; `null` when the day
  has no `fin_day_closing` row at all.
- `tables_drop_tzs` comes from `player_day_drop_cache` (the CMS Total Drop source of truth).
- MTD/YTD aggregation is done on the Finance Hub side from these daily rows.

### `expenses` (scope `expenses:read`)
Mirror of the CMS `expenses` table (the real source; there is no `fin_expense`).
Params: `from`, `to` (business_date), `casino_id`, `limit`, `cursor`.

Fields: `source_expense_id`, `casino_id`, `casino_name`, `business_date`,
`category_id`, `category_name`, `category_group`, `legacy_category`,
`wallet_id`, `wallet_canonical_code`, `currency`, `amount_native`, `fx_rate`,
`amount_tzs`, `description`, `attachment_present`, `attachment_ref`
(md5 metadata token only — no storage URL or signed secret is exposed),
`source`, `approved`, `approved_at`, `is_voided`, `voided_at`, `reversal_of`,
`reversed_by`, `created_at`, `updated_at`, `created_by`, `cursor`.

`updated_at` mirrors `created_at` — the table has no update timestamp column.

### `closings` (scope `closings:read`)
Real closing sources only: `business_day_closures` (operational day closure) +
`fin_day_closing` (finance figures) + variance from `cash_count_snapshots`.
Params: `from`, `to`, `casino_id`, `limit`, `cursor`.

Day rows: `casino_id`, `casino_name`, `business_date`, `status`
(`closed` | `locked` | `open`), `closed_at`, `closed_by`, `closed_method`,
`day_closing_locked_at`, `tables_result_tzs`, `slots_result_tzs`,
`players_card_balance_tzs`, `cash_count_discrepancy_tzs`, `cash_count_rows`,
`variance_note`, `notes`, `source_updated_at`, `cursor`.

`month_closings` (unpaginated, small) mirrors `fin_month_closures`:
`casino_id`, `year`, `month`, `closed_at`, `closed_by`, `collection_total_tzs`,
`collection_total_usd`, `note`.

Limitation: there is no separate "finance period lock" table beyond
`fin_day_closing.locked_at` and `fin_month_closures`; nothing is invented.
