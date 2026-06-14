Four targeted changes, all UI/presentation (no business-logic changes to balance formulas).

## 1. Manager backfill of per-provider cashless balance for closed shifts

For already-closed Live Game and Slots shifts where the cashier typed only the total and left the per-provider grid empty, give the manager an inline "Edit cashless balance" action that opens a small dialog with one row per provider (M-Pesa, Tigo Pesa, Airtel Money, Halopesa, Azampesa, CRDB Sim Banking). Manager confirms with their existing manager-password override. On save:

- Live: update `shifts.closing_count.totals.mobile` and `shifts.cashless_final_providers` (whichever your schema uses for live; mirror existing key).
- Slots: update `cage_slots_shifts.cashless_final_providers` (the column already exists).

Sum is recomputed and written into the matching `*_final` total so the printed Balance column in the consolidated report stops showing dashes. An audit row is added to `audit_logs` (manager_id, shift_id, before, after).

Access: visible only to roles allowed manager override (manager, super_admin, finance_manager).

## 2. All print previews render at 50% thumbnail

Currently `ReprintShiftDialog` and `PrintSlotsShiftDialog` show on-screen previews at `scale-[0.85] w-[117%]`, which still fills the dialog so the Print button gets pushed below the fold. Change the preview wrapper to `scale-[0.5] w-[200%]` and cap the wrapper height (`max-h-[55vh] overflow-auto`) so the dialog stays compact and the **Print** button is always visible without scrolling. The printed output is unaffected because it runs through `PrintPortal` (separate copy).

Applies to:
- `src/components/cage/ReprintShiftDialog.tsx`
- `src/components/cage-slots/PrintSlotsShiftDialog.tsx`

## 3. Expenses page: stop showing the printable report on screen

In `src/pages/Expenses.tsx` the `<PrintPortal>` child is rendered without a `hidden print:block` wrapper, so `ExpensesDayReport` appears at the bottom of the page in normal view. Wrap its content in `<div className="hidden print:block">…</div>` to match how every other PrintPortal consumer does it. No layout change otherwise.

## 4. Simplify Close Shift "Manager Review" screen

In `src/components/cage/CloseShiftDialog.tsx` (step `review`), keep only what the user asked for:

Kept:
- **Chips per denomination** — change grid to fixed `grid-cols-2` (two columns, all densities).
- **Cash per currency & denomination** — unchanged.
- **Cashless (Mobile Money)** per provider — unchanged.
- **Banks** — unchanged.
- **Total block**: Chips · Cash · Mobile · Bank tiles + Cash Desk Total — unchanged.
- **New compact summary card** replacing everything below it:
  - Opening (carried over)
  - Closing (cash desk total counted)
  - Balance = signed difference (uses existing `balance` value, unchanged formula). Green when 0, red when not.

Removed from the screen (logic untouched — values still computed and written to `closingCash` on confirm):
- The 9-line "Cash Desk Result vs Tables Result" formula block.
- The "Shift Results" KPI tile trio (Tables Result / Shift Balance / Cash Desk Result).
- The "IN/OUT Audit" strip.

Cashier notes block and Back / Print / Cancel / Confirm-password footer stay as-is.

## Files touched

- `src/components/cage/CloseShiftDialog.tsx` — manager-review section simplified, chips grid → 2 cols.
- `src/components/cage/ReprintShiftDialog.tsx` — preview thumbnail to 50% + bounded height.
- `src/components/cage-slots/PrintSlotsShiftDialog.tsx` — preview thumbnail to 50% + bounded height.
- `src/pages/Expenses.tsx` — wrap PrintPortal child in `hidden print:block`.
- `src/components/cage-slots/CageSlotsHistoryView.tsx` (or sibling row component) — add manager "Edit cashless balance" action for closed slots shifts.
- `src/components/cage/CageHistoryView.tsx` — same action for closed live shifts.
- New small dialog `src/components/cage/EditClosedCashlessDialog.tsx` reused by both surfaces.
- New mutation hook `src/hooks/use-edit-closed-cashless.ts` performing the update + audit log entry.

No DB migration required (columns already exist). No edge function changes. No change to balance math or report formulas.
