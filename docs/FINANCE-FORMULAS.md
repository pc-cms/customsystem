# Finance Formulas Matrix

Single reference for how every financial page computes its numbers.
All money is TZS unless stated. Business day rolls over at **07:00 EAT**.

---

## 0. Shared dictionary (source of truth)

Defined in `src/hooks/use-other-incomes.ts` and mirrored in the RPC
`fin_balance_snapshot`. Every page must use these sets — no local variants.

| Bucket | `fin_other_incomes.source` values | Is it income? |
|---|---|---|
| **Commissions** | `other`, `refund`, `fee` | YES — real earned income |
| **Tips & Bonuses** | `tips`, `bonus`, legacy `tips_bonus` | NO — signed wallet movement (IN/OUT) |
| **JP** | `jp` | NO — reported on its own line |
| **Movements** | `investment`, `owner_topup` | NO — owner/wallet movement |
| **Inter-casino** | `inter_casino_transfer` | NO — handled by the transfer registry only |

Common exclusion rules applied everywhere:

- skip rows with `reverses_id IS NOT NULL` (the reversal) **and**
  `reversed_by_id IS NOT NULL` (the reversed original) — storno nets to zero;
- skip `voided_at IS NOT NULL`;
- FX: use the row's own `fx_rate` when `> 0`, otherwise the period USD rate
  from `fin_daily_rates.rate_to_tzs` (currency = USD), otherwise 0.

Expense inclusion rule (identical in Wallets and Monthly Report):

```text
approved = true
AND voided_at IS NULL
AND reversal_of IS NULL
AND (source = 'office' OR business day is CLOSED)
```

---

## 1. Day Closings (`fin_day_closing`)

| Field | Formula |
|---|---|
| Table Result | Σ per-table `win` of the day (closing recount driven) |
| **Net Win** (`net_win` = `slots_result`) | slots gaming SYSTEM result — ACE Collector or manual. Feeds Statistics / P&L / Monthly Report ONLY. Never in Wallet Expected. Never taken from a cashier shift. |
| **CashDesk Win** (`cashdesk_win`) | physical slots cash desk win. The ONLY slots figure that flows into Wallets / Expected. |
| Drop (per table) | Σ IN transactions of that table (`type in ('in','buy')`, `cancelled_at IS NULL`) |
| Drop (total) | Σ peak from `player_day_drop_cache` (see `src/lib/drop-source.ts`) |
| JP | ACE `jackpot_slip_out` mapped into the JP figure |
| Miss Chips / Miss Cards | cage delta, reported separately — never folded into Result |
| Card Balance | manual entry, may be negative; added to Wallet Expected exactly once, never subtracted from Net Win |
| Cashless / Bank | manual entry, decimals allowed |

| Cashless / Bank | manual entry, decimals allowed |

Open days show a placeholder only; nothing propagates to reports until closed.

---

## 2. Monthly Report (`use-fin-monthly-report.ts`)

```text
Table Result = Σ fin_day_closing.tables_result  (closed days in period)
Slots        = Σ fin_day_closing.slots_result   (closed days in period)



Commissions  = Σ COMMISSION_SOURCES  → TZS
Total Income = Table Result + Slot Result + Bar Income + Commissions

Reference rows (NOT in Total):
  Tips & Bonuses (±) = Σ TIPS_BONUS_SOURCES
  JP                 = Σ source 'jp'
  Movements          = Σ MOVEMENT_SOURCES

Actual (per category) = Σ expenses.amount_tzs under the expense inclusion rule
Plan Month            = Σ fin_budget for the selected month(s)
Remain                = Plan Month − Actual
Profit                = Total Income − Grand Actual
```

### 2b. Company Report / Dashboard TV Monthly — CANON (one formula, both screens)

`boss_monthly_report` (Company Report) and `deriveDisplayedMonthly` (Dashboard
TV → Monthly) use the SAME monthly formula. Only CLOSED business days count;
the open business day never contributes to any monthly figure.

```text
Table Result = Σ fin_day_closing.tables_result                  (closed days)
Slot Result  = Σ per day (cashdesk_win − players_card_balance)  (closed days, signed)
Result       = Table Result + Slot Result
Tables Drop  = Σ player_day_drop_cache.peak, restricted to those closed days        (TV only)
Slots Drop   = fin_day_closing.drop_slots, else cage_slots_shifts.manual_drop_slots (TV only)
```

Card Balance is subtracted EVERY day with its own sign (a negative balance
increases the result) — never once per month.

---

## 3. Wallets / Balance (`fin_balance_snapshot` + `use-fin-balance.ts`)

```text
Expected = Starting Float + Table Result + CashDesk Win + Commissions
         + Tips & Bonuses (±) + Movements + Add Float
         + JP + Card Balance + Miss Chips + Miss Cards
         − Expenses − Collections − Transfers

Actual   = Σ last recorded physical wallet state (latest count per wallet)
Variance = Actual − Expected        (the gap; a real discrepancy, not a bug)
```

- **Slots cash in Expected = `fin_day_closing.cashdesk_win` (CashDesk Win)**,
  never `slots_result` / Net Win. Slots Result / Net Win is the gaming SYSTEM
  result and is used for P&L and statistics only. Allowed sources of CashDesk
  Win: ACE Collector or manual Day Closing input — never a cashier slot shift.
- **Card Balance is added to Expected exactly once.** It is client money
  physically held in the cage and is not contained in CashDesk Win.

- **JP** is counted once, from `fin_other_incomes.source = 'jp'` (contributions
  positive, payouts negative, storno excluded). JP cash is physically held in a
  wallet and is not part of `slots_result`; JP payouts are never also booked as
  expenses.
- **Transfers** come from the inter-casino transfer registry: `−` at the
  sender, `+` at the receiver (paired rows).
- Chips: a negative chip delta means **more cash** on hand (inverted sign).
- Manual In/Out are **Adjustments**: they move wallet cash but are neither
  income nor expense.

- Cash Deficit banner lives inside Wallets, right above Stale counts.

---

## 4. Dashboard TV (`use-boss-dashboard.ts`)

```text
Live Drop        = per-table Drop rule (§1)
Table Result     = Σ tables_result; open days fall back to Chips Check
Slots Drop       = ACE slots drop
Slots Active Credits, Slots Net Win (real-time ACE), Cashdesk Win, Slot Result = ACE feed
MTD Avg          = Σ Net Win of closed days / closed-day count
Expected Profit  = (MTD Avg × days in month) − Budget − Extras + Incomes
Manager bonus    = 5% of the qualifying result
Extras           = boss_report_extras (inline editable)
```

"New" player = 1–3 recorded visits. ACE panel polls every 10 s.

---

## 5. Statistics · Live

```text
Drop            = per-table Drop rule (§1)
Result / Net Win= Σ table closing win (chip-recount driven)
Chips Check     = Initial Baseline = Inventory + Floor; Miss tracked separately
Charts          = 20-minute buckets sourced from Chips Check
```

---

## 6. Statistics · Slots

```text
Drop            = coin in / bill in per machine
Net Win         = slots system result, from Day Closings (`net_win`) — Statistics / P&L
CashDesk Win    = physical slots cash desk win, from Day Closings (`cashdesk_win`) — Wallets / Expected
Client Balance  = manual card balance of the day (separate figure)
Cashless Balance= manual entry only; derived NET is ignored in CDR
```

Only these two slots figures exist. There is no third derived "Slot Result"
column anywhere in the UI: Net Win goes to reports, CashDesk Win goes to
wallets.



---

## 7. Invariants

1. Tips, Bonuses, JP and Transfers never appear inside Commissions or income totals.
2. Legacy storno pairs (original + reversal) net to zero on every page. New storno rows are no longer created.
3. Cage expenses count only after the business day is closed; Office expenses count immediately.
4. Per-table Drop and Total Drop are computed independently and may differ — by design.
5. Wallets `Expected` must be fully decomposable into the rows shown in its breakdown.

## Retired categories

`refund` is retired (2026). Historical rows stay readable for audit but are
excluded from Commissions, Fee, Total Income, Expected Profit, Cash Position,
Wallet Expected, daily breakdown and dashboards. It cannot be selected for new
entries and `fin_other_income_replace` rejects it.

## Corrections (STORNO retired, 2026)

Editing / moving a `fin_other_incomes` row (Commissions ↔ Movements ↔ Tips &
Gaming Bonus) is a DIRECT update via `fin_other_income_update`; removing one is
a hard delete via `fin_other_income_delete` (JP: `fin_jp_delete_entry`). Extra
Expenses are deleted via `fin_unplanned_delete`, which refunds the wallet when
the row was already paid.

Both RPCs are restricted to `super_admin` / `can_finance()`, respect casino
scope and refuse closed months. Every insert, update and delete on
`fin_other_incomes` and `boss_report_extras` is recorded in `fin_audit_log`
(trigger `tg_fin_audit`) with actor and before/after JSON. Wallet mirrors stay
consistent through the existing mirror triggers. Deleting either side of a
legacy storno pair removes the whole pair.

## Bar Income

POS does **not** post to wallets today (no `pos_deposit` wallet transactions),
so Bar Income is exposed by `fin_balance_snapshot` and counted exactly ONCE in
Total Income and Cash Position. It is NOT included in Wallet Expected.

## Unplanned Expenses, Liabilities, Signed Float (2026 delta)

Server-side single source of truth: RPC `fin_month_finance`.

```text
OPEN month:
  Expected Profit = Total Income − Budget − Unplanned (all)
                    − Liabilities outstanding − Collections
  Manager Bonus   = max(0, 5% × (Total Income − Budget))

CLOSED month:
  Final Profit    = Total Income − Total Actual Expenses
                    − Unplanned not in Actual − Liabilities outstanding   (frozen)
  Manager Bonus   = max(0, 5% × (Total Income − Budget))                  (frozen, same base)

Deposits = Tips&Bonuses + JP + Card Balance + Miss Chips + Miss Cards
  (reported figure only — ZERO effect on Cash Position: neither added nor subtracted)

Cash Position = Current Basic Float + Total Income
              + Investment + Office + Intercompany cash
              − Actual Expenses
              − Paid Unplanned with expense_id IS NULL   (wallet cash moved, no expense row)
              − Collections − Manual Liability Repayments

Paid Unplanned linked to an Actual Expense is already inside Actual Expenses and is
never subtracted twice. Intercompany liability repayments are excluded from the
liability cash term because transfer cash already captures them.

Available for Collection = max(0, Profit − Collections)
Liabilities: Closing = Opening + New − Repayments (repayment is the only cash effect)
Basic Float: Current = Opening + Σ signed adjustments (never negative)
```


Unplanned Expenses live in `boss_report_extras` (entered on Dashboard TV, `Paid`
flag posts the cash effect). Rows are immutable — reversal only, no delete.

## Bank Statement Import (Office → Import Statement)

Staging only — no parallel ledger. Tables `fin_bank_statement_batches` /
`fin_bank_statement_rows`; every write goes through
`fin_bank_import_*` RPCs (DB authoritative, idempotent).

```
Batch:  in_review → partially_confirmed → confirmed        (or abandoned)
Row:    pending | matched | duplicate → confirmed | ignored | error
```

Confirm semantics (`Confirm import` ≠ `Approve expense`):
- MATCHED row  → reconciled only. No new expense, no new `fin_wallet_tx`.
- Unmatched DEBIT → normal Office `expenses` row with
  `bank_statement_row_id` set, `approved = false`, **no wallet posting**.
  It shows up in the standard Expenses Approvals queue; the usual approval
  posts `fin_wallet_tx` (trigger `trg_expenses_office_after_approve`).
- Unmatched CREDIT → never becomes an expense; match or classify manually.

Legacy behaviour is untouched: office expenses created anywhere else still
auto-approve and post immediately (`bank_statement_row_id IS NULL`).

Duplicate fingerprint = md5(wallet + tx_date + reference + description +
signed amount + currency + occurrence index). A partial unique index enforces
one *confirmed* row per (wallet, fingerprint).

Wallet Expected formula is unchanged (CashDesk Win from Day Closings).

## Accounting month window & Open Month ritual

The Office header month is a **fixed working window**: it changes only via the
picker, never automatically. Every record (expense, wallet count, movement)
keeps its **own** business date and belongs to that date's calendar month —
viewing a month never rewrites dates.

Month statuses (precedence: closed > open > not_opened):

- **not_opened** — no `fin_month_opening` record. Server rejects wallet counts
  (`fin_save_wallet_count`) and office expenses (`create_office_expense`) with
  "is not opened yet". UI: "Not opened" badge, amber banner, disabled
  Save/Money In/Money Out.
- **open** — `fin_month_opening` exists; normal posting.
- **closed** — `fin_month_closures` row; posting rejected ("is closed").

**Open Month** (`fin_open_month` RPC, roles manager/finance_manager/
general_manager/super_admin) is a separate, explicit ritual — it does NOT
require the previous month to be closed and is never triggered by Close Month.
It atomically:
1. inserts `fin_month_opening` (float per wallet + opening balances JSONB),
2. sets `fin_wallets.starting_float_amount/_date` per wallet,
3. writes opening `cash_count_snapshots` (first day of the month, 07:00 EAT).

Nothing carries over between months without this confirmation.
