# Office: strict month window + manual Open Month

Office accounting works inside one explicit window: the month chosen in the toolbar. Nothing rolls forward on its own — a new month starts only when someone enters the starting float / wallet balances and confirms the opening. Every record still lands in the month its own business date belongs to; the header only decides which window you are looking at and working in.

Cashier shifts, Day Closings and Cage stay untouched — they are day-based and independent of Office accounting.

## 1. The header month becomes the window (no auto-rollover)

Today Office silently re-picks the month for the user: it defaults to the "accounting month" and then jumps forward automatically as soon as the previous month is closed. That auto-jump is removed.

- The selected month is stored per session and changes ONLY when the user clicks the picker.
- First-time default: the accounting month (on 01/09 that is August, because we are still closing 31/08).
- The picker shows the month status next to the label: `Open`, `Not opened`, `Closed`.
- Everything on the Office screens — Wallets, Bank, Cashless, Transactions, JP, Tips & Bonuses, Day Closings list, Monthly Report — reads the same window. No screen may compute its own "current month".

## 2. Records always land in their real month

The window does not rewrite dates — it protects them.

- A wallet physical count still belongs to the business day being closed (on 01/09 that is 31/08 → August).
- If that date falls outside the month shown in the header, the page shows a clear line above the wallets:
  `Counting business day 31/08/2026 (August)` plus a one-click `Switch to August` button, so the user immediately sees the money he just entered.
- Saving is allowed as long as the target month is open: the count is written into August even while the header shows September, and August variance / Monthly Report update at once.
- Saving is blocked only when the target month is already **closed** (locked) or **not yet opened**.
- Office expenses keep the existing posting-date behaviour: default = today's business date, managers can backdate to any open past month. In September, new spending naturally posts to September.

## 3. Open Month — a separate, explicit step

A month is not usable until it is opened.

- New `Open Month` action in the Office toolbar, visible when the selected month has no opening record.
- Wizard steps:
  1. **Starting Float** — the float the month starts with (pre-filled from the previous month's closing float when it exists, fully editable).
  2. **Opening wallet balances** — every active wallet, pre-filled with the last known physical count, editable, entered manually.
  3. **Confirm** — writes the opening record, opening float and an opening count for each wallet dated the first day of the month, and marks the month `open`.
- Until confirmed, the month shows a banner `September 2026 is not opened yet` with the `Open Month` button; wallet counts, wallet money moves and office expenses dated into that month are blocked with that same message. Read-only viewing is allowed.
- Opening a month does not require the previous month to be closed — the two operations are independent (you can enter September's float while August is still being finished).

## 4. Variance and balances do not leak between months

- The month's opening balance is the confirmed opening record, not "whatever the wallet held last".
- Variance inside a month is measured against that opening plus the movements of that month only; a September count can never change August variance, and August money never silently becomes September's opening.
- Monthly Report and the Wallets summary of the selected month use the same opening record as their starting point.

## Technical notes

- `src/components/office/office-shell.tsx`: drop the `closures`-driven auto-select effect and the `touched` flag; keep a plain session-persisted `OfficePeriod` defaulting to `accountingMonthPeriod()`. Keep `PeriodPicker` as the only way to change it.
- New table `public.fin_month_opening` (`casino_id`, `year`, `month`, `opening_float_tzs`, `opened_by`, `opened_at`, `note`) with grants for `authenticated`/`service_role`, RLS scoped to the user's casino access, plus a child table `fin_month_opening_wallets` (`wallet_id`, `amount_native`, `amount_tzs`) — or a JSONB column if the per-wallet rows stay display-only. New RPC `fin_open_month(...)` writes the opening, calls the existing float mechanism and `fin_save_wallet_count` per wallet dated `YYYY-MM-01`, all inside one transaction; it is idempotent and refuses a month that is already open or closed.
- New hook `use-fin-month-opening.ts` (query + mutation), used by the toolbar badge, the banner and the wizard.
- New component `src/pages/office/OpenMonthWizard.tsx`, mirroring the structure and styling of `CloseMonthWizard.tsx`.
- `FinancesWalletsPage.tsx`: replace the current out-of-period warning with the "counting business day X" line + switch button; block saving when the target month is closed or not opened (server-side check in `fin_save_wallet_count` as well, so the rule cannot be bypassed).
- `create_office_expense` gains the same guard: reject a posting date in a month that is not opened (it already rejects closed months).
- Legacy `fin_month_start` stays as-is (historical data); it is not reused for the new opening state.
- No changes to canonical finance formulas, Day Closing, cage/cashier flows or `docs/FINANCE-FORMULAS.md` beyond documenting the opening rule.
