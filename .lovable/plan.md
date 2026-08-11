# Fix: Cage Casino drill-down (duplicates + sum mismatch)

## What is wrong

Verified in `src/hooks/use-daily-balance-report.ts`:

- The **number** in the cell (`cage_casino` = 10 000 000) is built from **wallet physical counts** — the last physical count of every cage wallet (`cage_table` / `cage_slot`) on or before the selected date.
- The **breakdown panel** (`cage_detail`) is built from a **completely different source**: shift closing counts (`closing_count.cash`, `closing_count.mobile`, `cashless_in/out_providers`) plus the slots closing inventory.

Two different sources = the blocks do not add up to the cell: 8 944 000 + 0 + 5 110 000 + 0 = 14 054 000, not 10 000 000.

The duplicated providers come from the same split: the "Mobile Money" block reads `closing_count.mobile` (AirTell, Tigo, Halo, Mpesa) and the "Cashless" block reads the shift cashless providers (Tigo, Mpesa, AirTel) — the same channels shown twice, with inconsistent spelling (AirTell / AirTel).

## What will change

1. Rebuild the Cage Casino breakdown from the **same source as the number**: the last physical count of each cage wallet as of the selected day. The panel total will then always equal the cell value.
2. Panel structure (uniform `DrillTable` format Name / Units / Rate / TZS):
   - **Cash by currency** — one row per counted cash wallet/currency (units in own currency, rate, TZS).
   - **Mobile money / Cashless** — one single merged block, one row per provider, names normalized (AirTel, Tigo, Halotel, M-Pesa) so nothing appears twice.
   - **Slots cage** — the slots cage wallet count.
   - Grand total row = the cell value, exact.
3. Optional denomination detail per cash row (the counts store `denominations`), shown as a nested expandable line — keeping the existing look.
4. Zero-value rows keep showing `0` (not a dot), per the current CMB rule.

## Technical notes

- `cage_detail` in `use-daily-balance-report.ts` is rebuilt inside the loop that already computes `cageCasinoRunning`, using `countAt(wallet, date)` — the same helper — instead of shift `closing_count` data.
- Currency conversion reuses `walletCurrency` + the day's rate, so units × rate = TZS on every row.
- Provider name normalization reuses the mapping already present in `src/components/reports/CurrencyCashTable.tsx` / `use-cashless.ts`.
- Rendering in `src/pages/reports/DailyBalanceReport.tsx` (block `drill.col === "cage_casino"`) is reduced to `DrillTable` sections over the new structure; `CurrencyCashTable` stays used only where the old shape is still needed.
- Version bump.
