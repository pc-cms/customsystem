# Bank rows on the printed closing reports

## What is wrong today (verified)

- The shift opening form has no place to enter bank balances at all: the opening record
  for the last three Arusha shifts contains only zeros for every bank channel
  (CRDB / NBC / Selcom, in = 0, out = 0). So the printed "Opening" bank column is
  always 0 — it is not the money the cashier actually had.
- The reports list bank accounts using the names from Office > Wallets (so I&M TZS,
  I&M USD appear), but the cash desk can only record six fixed accounts
  (CRDB TZS/USD, NBC TZS/USD, Selcom TZS/USD). Any other account can only print 0.
- The unclear single line "Bank" inside Cash Flow Opening / Closing is a legacy total
  (a generic TZS + USD figure) that does not match the per-account table below it.
- The Bank Accounts table on the Slots and Live sheets shows only Opening and Closing —
  no In, Out or Net.

## What will change

1. **Opening balances come from the cash desk, never from Office.**
   - Live Game: the shift opening screen gets a bank block where the cashier enters the
     opening balance per account, saved with the shift opening.
   - Slots: the opening count keeps the same per-account opening balances.
   - Both screens show last shift's closing balance as a grey hint only; the cashier
     must type the counted figure (same rule as chips).

2. **Accounts follow the wallet registry.**
   Both cash desks list exactly the bank/Selcom accounts of that casino from Wallets
   (including I&M TZS and I&M USD), in the same names and order as the Wallets screen,
   instead of the six hardcoded ones.

3. **Bank Accounts table gets In / Out / Net.**
   New columns on all sheets: Account | Currency | Opening | In | Out | Net | Closing |
   Rate | Closing TZS, with a Total row. Net = In − Out. Closing = Opening + Net.
   The Total Closing sheet already has In/Out — it gains Opening and Net so all four
   sheets read identically.

4. **The confusing "Bank" line is replaced.**
   Inside Cash Flow Opening / Closing the single "Bank" line becomes "Total Bank" and is
   computed as the sum of the per-account table right below it, so the two always agree.

5. **Old shifts.** Shifts closed before this change have no per-account opening figure;
   their reports print "—" in the Opening column rather than a fake 0. Already frozen
   report copies stay untouched.

## Verification

- Reprint Arusha, Mwanza and Dodoma closing packs for a recent date and check on all
  four sheets: opening bank per account equals what the cash desk entered, In − Out = Net,
  Opening + Net = Closing, and the Total Bank line equals the table total.
- Confirm every account of the casino (including I&M) prints, even at 0, and that the
  pack is still exactly 4 pages (3 portrait + Chips Movement landscape).

## Technical notes

- Cash desk bank structure: `shifts.opening_float.bank` / `closing_count.bank`
  (`{tzs, usd, channels: {KEY: {in, out, final}}}`) and, for slots,
  `cage_slots_cash_counts.denominations.bank`. The opening entry will store `final`
  (the counted opening balance) alongside `in`/`out`.
- `BANK_CHANNELS` in `src/components/cage/CageHelpers.ts` stops being the source of
  accounts; the channel list is derived from `fin_wallets` (`wallet_group = 'banks'`,
  `kind in ('bank','selcom')`) via the existing `wallet-rows` helper, keeping
  `BANK_CHANNELS` only as a fallback for casinos with no wallet registry.
- Touched: `OpenShiftScreen.tsx`, `CashCountGrid.tsx`, `CloseShiftDialog.tsx`,
  `OpenSlotsShiftScreen.tsx` / slots opening check, `LiveClosingReportV2.tsx`,
  `SlotsClosingReportV2.tsx`, `TotalClosingReportV2.tsx`, `PrintSlotsShiftDialog.tsx`,
  `report-v2/wallet-rows.ts`. No database schema change is required.
