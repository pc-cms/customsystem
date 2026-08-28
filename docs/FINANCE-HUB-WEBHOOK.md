# Finance Hub — near-realtime notifications (CMS → Hub)

Outbound counterpart of the read-only [Finance Hub Export API](./FINANCE-HUB-API.md).
The CMS never pushes financial values: it only sends a lightweight **wake-up**
signal so Finance Hub can immediately re-pull authoritative data from the
export API.

## Contract

`POST <FINANCE_HUB_WEBHOOK_URL>` (production: `https://amaell-finance-hub.lovable.app/api/public/cms/webhook`)

```
Content-Type: application/json
X-Finance-Timestamp: <unix seconds>
X-Finance-Signature: <hex hmac-sha256 of `${timestamp}.${raw_body}`>
```

The HMAC key is the UTF-8 bytes of the lowercase hex SHA-256 of the shared
export token — i.e. exactly the `token_sha256` string already stored in
`finance_hub_api_clients`. The CMS therefore needs **no plaintext token and no
second secret**, and sends no `Authorization` header.

Body (unknown fields are omitted, never `null`-padded):

```jsonc
{
  "event": "wallet_transaction",
  "feed": "transactions",
  "source_table": "fin_wallet_tx",
  "source_id": "6f1c…",
  "occurred_at": "2026-08-28T18:22:11.301Z"
}
```

### Events

| Event | Feed (export mode) | Source tables |
| --- | --- | --- |
| `wallet_changed` | `snapshot` | `fin_wallets` |
| `wallet_transaction` | `transactions` | `fin_wallet_tx` (Add money / Take money / transfers / adjustments) |
| `expense_changed` | `expenses` | `expenses` |
| `closing_changed` | `closings` | `fin_day_closing`, `business_day_closures` |
| `performance_changed` | `performance` | `cash_count_snapshots` |
| `fx_rate_changed` | `fx_rates` | `fin_daily_rates`, `cage_slots_exchange_rates` |

## Architecture

```text
DB write ──trigger──▶ finance_hub_notify_outbox ──┬─ pg_net kick (async, ≤1 per 3 s) ─┬─▶ finance-hub-notify ──POST──▶ Finance Hub
 (user tx)  fail-open     (coalesced, no money)     └─ cron every 1 min (safety net) ──┘      edge fn, 8 s timeout
```

- `tg_finance_hub_notify(event, feed)` — generic AFTER trigger. Wrapped in an
  exception block: if enqueueing fails the casino operation still commits.
- Coalescing: a partial unique index on `(event, feed) WHERE status='pending'`
  means a burst of 500 writes collapses into a single pending row.
- Recursion guard: the trigger ignores its own table and honours
  `SET LOCAL app.finance_hub_notify_off = '1'` for bulk/import jobs.
- After enqueueing, the trigger calls `finance_hub_notify_kick()`, which uses
  `pg_net` to fire-and-forget an invocation of the dispatcher. `pg_net` only
  queues the HTTP call, so the casino transaction never waits on Finance Hub.
  A single-row throttle table plus `pg_try_advisory_xact_lock` caps kicks at one
  per 3 seconds, so write bursts cannot storm the edge function.
- Delivery happens entirely outside the user transaction (pg_net / cron → edge
  function), with an 8 s timeout and no in-transaction retries. Failed rows are retried by
  later cron runs (max 5 attempts, 24 h window).
- `finance_hub_notify_gc()` prunes sent rows after 7 days.
- On-prem/offline sites simply queue nothing extra; the normal sync/export path
  reconciles once connectivity returns.

## Configuration (server-only secrets, no values in the repo)

| Secret | Purpose |
| --- | --- |
| `FINANCE_HUB_WEBHOOK_URL` | Destination endpoint. Optional — defaults to the production `/api/public/cms/webhook` route. |

No outbound token secret is needed: the signing key is read server-side (service
role) from the active `finance_hub_api_clients.token_sha256` row and is never
logged or returned. If no active client exists the notifier logs a warning and
no-ops — CMS operations are unaffected.

**Latency:** typically **1–5 seconds** end-to-end (pg_net kick, throttled to one
every 3 s), with the 1-minute cron as the worst-case fallback and retry path.

## Manual run

```bash
curl -X POST https://<project>.supabase.co/functions/v1/finance-hub-notify
```
