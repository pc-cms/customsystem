# Finance Hub Export API (read-only)

Endpoint: `POST|GET /functions/v1/finance-hub-export`

Read-only mirror of the canonicalized CMS wallet model for the external Amaell
Finance Hub. The endpoint performs **no writes to financial tables** — it only
updates `last_used_at` on the API client and appends an audit row.

## Auth

`Authorization: Bearer <token>`

The token is never stored in plaintext. `finance_hub_api_clients.token_sha256`
holds the SHA-256 hex digest. Rows are readable only by the server
(service role); normal authenticated users have no access, and no token or hash
is committed to the repository.

Provisioning (run once, outside the repo):

```sql
insert into finance_hub_api_clients (name, token_sha256)
values ('amaell-finance-hub', '<sha256-hex-of-token>');
```

Errors: `401 missing_token` / `401 invalid_token` / `403 forbidden` (scope).

## Modes

`mode` is taken from the JSON body or the `?mode=` query string.

### `health`
No auth required, no data. `{ ok, service, version, read_only, modes }`.

### `snapshot` (scope `wallets:read`)
Active canonical wallets across all branches (Arusha / Mwanza / Dodoma / Mbeya).

```json
{
  "generated_at": "...",
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
`fin_balance_snapshot` exactly — no financial formula is duplicated in
TypeScript. `actual_*` is `null` when no physical/latest state exists; it is
never invented.

Sync by `wallet_id` (stable CMS UUID) + `canonical_code`. Never by display name.

### `transactions` (scope `transactions:read`)
Params: `since` (ISO timestamp, exclusive, compared to `created_at`),
`limit` (1..5000, default 1000).

```json
{
  "generated_at": "...", "since": "...", "limit": 1000, "count": 42,
  "next_cursor": "2026-08-21T10:00:00+00:00",
  "transactions": [{
    "source_tx_id": "uuid", "wallet_id": "uuid", "wallet_canonical_code": "CASH_TZS",
    "casino_id": "uuid", "business_date": "2026-08-20",
    "created_at": "...", "posted_at": "...",
    "kind": "transfer", "direction": "in", "sign": 1,
    "amount_native": 100000, "signed_amount_native": 100000,
    "currency": "TZS", "fx_rate": 1, "amount_tzs": 100000, "signed_amount_tzs": 100000,
    "note": "...", "ref_table": "expenses", "ref_id": "uuid", "reversal_of": null
  }]
}
```

Cursor semantics: pass the returned `next_cursor` back as `since` on the next
pull. Rows are ordered by `created_at ASC, id ASC`; `source_tx_id` is the stable
idempotency key. No player/customer/user PII is exposed (`created_by` omitted).
