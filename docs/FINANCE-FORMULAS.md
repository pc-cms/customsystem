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
| Tables Result (Live Net Win) | Σ per-table `win` of the day (closing recount driven) |
| Slots Result | `cash desk win − Δ client balances` |
| Drop (per table) | Σ IN transactions of that table (`type in ('in','buy')`, `cancelled_at IS NULL`) |
| Drop (total) | Σ peak from `player_day_drop_cache` (see `src/lib/drop-source.ts`) |
| JP (IN) | ACE `jackpot_slip_out` mapped into JP IN |
| Miss Chips / Miss Cards | cage delta, reported separately — never folded into Result |
| Card Balance | manual entry, may be negative |
| Cashless / Bank | manual entry, decimals allowed |

Open days show a placeholder only; nothing propagates to reports until closed.

---

## 2. Monthly Report (`use-fin-monthly-report.ts`)

```text
Live Game    = Σ fin_day_closing.tables_result  (closed days in period)
Slots        = Σ fin_day_closing.slots_result   (closed days in period)
Commissions  = Σ COMMISSION_SOURCES  → TZS
Total Income = Live Game + Slots + Commissions

Reference rows (NOT in Total):
  Tips & Bonuses (±) = Σ TIPS_BONUS_SOURCES
  JP (IN)            = Σ source 'jp'
  Movements          = Σ MOVEMENT_SOURCES

Actual (per category) = Σ expenses.amount_tzs under the expense inclusion rule
Plan Month            = Σ fin_budget for the selected month(s)
Remain                = Plan Month − Actual
Profit                = Total Income − Grand Actual
```

---

## 3. Wallets / Balance (`fin_balance_snapshot` + `use-fin-balance.ts`)

```text
Expected = Live Game + Slots + Commissions
         + Tips & Bonuses (±) + Movements
         + JP (IN) + Card Balance + Miss Chips + Miss Cards
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
Live Net Win     = Σ tables_result; open days fall back to Chips Check
Slots Drop       = ACE slots drop
Slots Active Credits, Slots Net Win, Cashdesk Win, Slots Result = ACE feed
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
