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
| Slot Result | `cash desk win − Δ client balances` |
| Drop (per table) | Σ IN transactions of that table (`type in ('in','buy')`, `cancelled_at IS NULL`) |
| Drop (total) | Σ peak from `player_day_drop_cache` (see `src/lib/drop-source.ts`) |
| JP | ACE `jackpot_slip_out` mapped into the JP figure |
| Miss Chips / Miss Cards | cage delta, reported separately — never folded into Result |
| Card Balance | manual entry, may be negative |
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

---

## 3. Wallets / Balance (`fin_balance_snapshot` + `use-fin-balance.ts`)

```text
Expected = Table Result + Slot Result + Bar Income + Commissions
         + Tips & Bonuses (±) + Movements
         + JP + Card Balance + Miss Chips + Miss Cards
         − Expenses − Collections + Transfers

Actual   = Σ last recorded physical wallet state (latest count per wallet)
Variance = Actual − Expected        (the gap; a real discrepancy, not a bug)
```

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
Net Win         = Drop − payouts − JP contribution
Cashdesk Win    = cage-side slots win
Slot Result     = Cashdesk Win − client balances
Cashless Balance= manual entry only; derived NET is ignored in CDR
```

---

## 7. Invariants

1. Tips, Bonuses, JP and Transfers never appear inside Commissions or income totals.
2. Storno pairs (original + reversal) net to zero on every page.
3. Cage expenses count only after the business day is closed; Office expenses count immediately.
4. Per-table Drop and Total Drop are computed independently and may differ — by design.
5. Wallets `Expected` must be fully decomposable into the rows shown in its breakdown.

## Retired categories

`refund` is retired (2026). Historical rows stay readable for audit but are
excluded from Commissions, Fee, Total Income, Expected Profit, Cash Position,
Wallet Expected, daily breakdown and dashboards. It cannot be selected for new
entries and `fin_other_income_replace` rejects it.

## Immutable corrections

Editing / moving a `fin_other_incomes` row (Commissions ↔ Movements ↔ Tips &
Gaming Bonus) goes through `fin_other_income_replace`: storno of the original
plus a replacement row in ONE transaction. Wallet mirrors stay consistent
because the trigger negates storno rows. Amount 0 = storno only. Hard delete is
no longer available in the UI.

## Bar Income

POS does **not** post to wallets today (no `pos_deposit` wallet transactions),
so Bar Income is exposed by `fin_balance_snapshot` and counted exactly ONCE in
Total Income and once in Cash Position / Wallet Expected.

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
