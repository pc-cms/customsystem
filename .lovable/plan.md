# Unified drill-down format across reports

Every drill-down panel (side sheet that opens on a cell click) will use one and the same table with a header row:

```text
NAME            UNITS      CUR    RATE     TZS
Safe EUR            5      EUR   3 100   15 500
Safe TZS    9 000 000      TZS       1  9 000 000
------------------------------------------------
TOTAL                                    9 015 500
```

## What is wrong today

- Cage Manager drill shows one line per wallet as `Safe EUR (EUR) → 15 500` — only the TZS value, no units, no rate, no header.
- Cage Casino drill uses a different table (Cur | Amount | Rate | TZS) plus separate blocks.
- Transfers / chips / Office report drills use yet another plain label-value list with no header.

## Changes

1. **Data**: `WalletBalance` in `src/hooks/use-daily-balance-report.ts` gains `units` (amount in the wallet's own currency) and `rate` (the rate used for that day), alongside the existing TZS `balance`. The per-wallet running balance loop already applies the rate — it will keep a second native-currency running total so units and rate are exact instead of derived.

2. **Shared component** `src/components/reports/DrillTable.tsx`: columns Name, Units, Cur, Rate, TZS, with a sticky-styled header and a bold Total row. Rows without a foreign currency (transfers, expenses, chip lines, office movements) render Cur = TZS, Rate = 1, Units = the TZS value, so the layout never shifts between panels.

3. **Casino Monthly Balance** (`src/pages/reports/DailyBalanceReport.tsx`): Cage Manager, Cage Casino (cash by currency, cashless, slots cage), Bank, Transfers and Chip Diff drills all switch to `DrillTable`. `DrillList` is removed; `CurrencyCashTable` is refactored to render through `DrillTable` so the currency block keeps the same header and column widths.

4. **Office Monthly Balance** (`src/pages/reports/OfficeBalanceReport.tsx`) and **Expenses matrix** drill sheets switch to the same `DrillTable`, keeping their existing `DrillHeader` on top.

5. Numbers keep the space thousand separator; negatives keep the red/green sign styling.

## Technical notes

- Rate column shows `—` only when no rate applies (pure TZS rows show `1`).
- `demo-report-data.ts` fixtures get the new `units`/`rate` fields so the demo panels match.
- No database change is required: wallet currency and daily rates are already loaded by the report hook.
