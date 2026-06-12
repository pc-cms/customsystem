## Goal

Make the per-provider **Cashless IN / Cashless OUT** fields on the cage shift the **single source of truth** for the CDR / Balance formula in both cages. The `/cashless` page transactions remain the audit log and act only as a **grey placeholder hint** that the cashier may accept or override.

## How it should work end-to-end

```
/cashless page  ─────►  sum per provider  ─────►  grey placeholder in shift
(transactions)         (useCashlessSuggestions)    Cashless IN / OUT inputs
                                                          │
                                            cashier types value (same or different)
                                                          ▼
                                       shifts.cashless_in_providers / _out_providers (JSONB)
                                                          │
                                                          ▼
                                CDR / Shift Balance formula uses ONLY this manual value
```

If the cashier leaves a row empty, that provider contributes **0** to the formula (the placeholder is a hint, not a value). The "Apply hint" button already lets them copy the suggestion into the inputs in one click.

## Changes

### 1. Database — Live Game (`compute_shift_balance_from_row`)
Replace the `SELECT … FROM cashless_transactions` block with reading the JSONB on the shift row:
```
v_cashless_in  := SUM of values in s.cashless_in_providers
v_cashless_out := SUM of values in s.cashless_out_providers
```
Formula stays:
```
CDR = ΔCash + Expenses + Collection − AddFloat + SlotsOut − SlotsIn
      + Cashless IN − Cashless OUT
Balance = CDR − Tables − Miss
```

### 2. Database — Slots (`compute_slots_shift_balance_from_row`)
Same swap: `v_cashless_in/out` come from `s.cashless_in_providers / _out_providers`, not from `cashless_transactions`. (Slots CDR currently doesn't add cashless at all — same as before; only the displayed `cashless_in/out` values change to reflect the manual entry.)

Also trigger that recomputes shift on `cashless_transactions` change becomes irrelevant for the formula but keep it so the suggestions list stays fresh.

### 3. Frontend — Live Game close shift (`CloseShiftDialog.tsx` + `cage-balance.ts`)
- Stop fetching cashless totals from `cashless_transactions` (`cashlessTotals` state + `useEffect` that queries the table).
- Pass `cashlessIn = mobileTotal(cashlessInProviders)` and `cashlessOut = mobileTotal(cashlessOutProviders)` into `computeShiftBalance`.
- `FormulaRow + Cashless IN / − Cashless OUT` reads the manual totals.

### 4. Frontend — Active live shift view (`ActiveShiftView.tsx`)
Already saves `cashless_in_providers` / `cashless_out_providers` on the shift and shows suggestions — no behavior change needed beyond confirming the DB now consumes those fields.

### 5. Frontend — Active slots shift view (`ActiveSlotsShiftView.tsx`)
Already uses `cashlessInManualTzs` / `cashlessOutManualTzs` from the manual providers everywhere (`computeSlotsShiftBalance`, report rows, persisted snapshot). No code change needed; DB swap (item 2) aligns server-side totals with what the UI already shows.

### 6. Placeholder UX (no code changes — already in place)
- `CashCountGrid → ProviderBlock` renders the suggestion as `placeholder` per row (grey).
- "Apply hint" button copies suggestions into empty rows.
- An empty input means 0 — confirmed by the formula change above.

### 7. Version bump
`package.json` patch bump (backend migration triggers the rule).

## Files affected

- `supabase/migrations/<new>.sql` — replace both compute functions
- `src/lib/cage-balance.ts` — unchanged inputs, just sourced from manual fields by callers
- `src/components/cage/CloseShiftDialog.tsx` — drop `cashlessTotals` query, use manual totals
- `package.json` — version bump

No schema changes; only function bodies and one frontend file are touched. UI remains exactly as the user described: grey hint, free manual entry, formula reads the manual values.
