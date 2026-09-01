# Physical Count strictly inside the active month window

## Problem (confirmed by reading the code)

1. The count date is hard-coded to "yesterday's business day" (`dayToRecord()` in `FinancesWalletsPage.tsx`), regardless of the month selected in the Office header. Today that is 31/08 — so a count entered while September is selected is written into August.
2. `fin_balance_snapshot` picks, for each wallet, the last count with `count_date <= period_end` and has no lower bound. The same count therefore also appears as Actual in every later month — that is why one count moved both August and September.
3. Because of (1) and (2), a count can be saved successfully while the Actual/Variance of the month you are looking at does not move — the count landed in a different month, and the month you view still shows a carried-over older value.

The report "denominations are recorded but the sum does not change" is treated as a symptom of the above; the first implementation step is to reproduce it once the window rules are correct, and fix separately if it persists.

## Target behaviour

- A physical count belongs to one business day, and that day must fall inside the accounting month selected in the Office header. No writes outside the selected window.
- Actual and Variance of a month use ONLY counts whose business date falls inside that month. No carry-over from previous months.
- A wallet with no count inside the window shows "not counted" (contributes 0 to Actual) instead of silently reusing an older count or the starting float. The Open Month wizard already writes an opening count dated the 1st, so a properly opened month starts with a full set.

## Changes

### Wallets page (`src/pages/finances/FinancesWalletsPage.tsx`)
- Replace the fixed `dayToRecord()` with a count date derived from the selected header month:
  - current month selected: default to `dayToRecord()` (yesterday's business day);
  - a past month selected: default to the last day of that month.
- Add a small date control above the wallets table so the count date can be picked explicitly, limited to the selected window; the chosen date is shown next to each Save button so it is never ambiguous.
- Keep the existing month guard (blocked when the month is closed or not opened).
- Freshness / "stale" is measured against the chosen count date inside the window.

### Balance snapshot (`fin_balance_snapshot`)
- Bound the physical-count selection to the window: only counts with `business_date` between `period_start` and `period_end`, taking the latest one per wallet inside that range.
- Wallets without a count in the window return `physical = null` and `actual_tzs = null`, so Actual sums only real counts of that month and Variance = Actual − Expected reflects that month alone.
- Return `physical_date` (already added) so the UI shows the business day of the count, not the typing date.

### Consumers to keep consistent
- `BalanceBanner.tsx`, `WalletsLab.tsx` and `use-fin-balance.ts` (`computeBalanceTotals`) already treat `actual_tzs == null` as "not counted"; verify the uncounted case renders as `·` rather than 0 in the wallets table.

## QA

- Select September with a count dated 31/08: August Actual/Variance change, September does not.
- Enter a count with September selected: it is dated inside September and only moves September.
- Re-check Mwanza / Arusha / Mbeya / Dodoma August totals against the previously reported figures.
