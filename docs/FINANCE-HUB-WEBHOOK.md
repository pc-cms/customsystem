# Finance Hub — near-realtime notifications (CMS → Hub)

Outbound counterpart of the read-only [Finance Hub Export API](./FINANCE-HUB-API.md).
The CMS never pushes financial values: it only sends a lightweight **wake-up**
signal so Finance Hub can immediately re-pull authoritative data from the
export API.

## Contract

`POST <FINANCE_HUB_WEBHOOK_URL>` (production: `https://amaell-finance-hub.lovable.app/api/integrations/cms/webhook`)

```
Authorization: Bearer <shared finance-export token>
Content-Type: application/json
```

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
DB write  ──trigger──▶  finance_hub_notify_outbox  ──cron 1 min──▶  finance-hub-notify  ──POST──▶  Finance Hub
 (user tx)   fail-open      (coalesced, no money)      edge fn        3 s timeout
```

- `tg_finance_hub_notify(event, feed)` — generic AFTER trigger. Wrapped in an
  exception block: if enqueueing fails the casino operation still commits.
- Coalescing: a partial unique index on `(event, feed) WHERE status='pending'`
  means a burst of 500 writes collapses into a single pending row.
- Recursion guard: the trigger ignores its own table and honours
  `SET LOCAL app.finance_hub_notify_off = '1'` for bulk/import jobs.
- Delivery happens entirely outside the user transaction (cron → edge function),
  with a 3 s timeout and no in-transaction retries. Failed rows are retried by
  later cron runs (max 5 attempts, 24 h window).
- `finance_hub_notify_gc()` prunes sent rows after 7 days.
- On-prem/offline sites simply queue nothing extra; the normal sync/export path
  reconciles once connectivity returns.

## Configuration (server-only secrets, no values in the repo)

| Secret | Purpose |
| --- | --- |
| `FINANCE_HUB_WEBHOOK_URL` | Destination endpoint. |
| `FINANCE_HUB_EXPORT_TOKEN` | Plaintext of the **same** shared finance-export token whose SHA-256 lives in `finance_hub_api_clients`. Required because the DB only stores the hash. |

If either secret is missing the notifier logs a warning and no-ops — CMS
operations are unaffected.

## Manual run

```bash
curl -X POST https://<project>.supabase.co/functions/v1/finance-hub-notify
```
