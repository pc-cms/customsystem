Formula for Live cage Shift Balance (Mwanza and all casinos):

```text
OpeningCash = opening total - opening chips - opening manual mobile balance
ClosingCash = closing total - closing chips - closing manual mobile balance
ΔCash = ClosingCash - OpeningCash

Cash Desk Result = ΔCash + Expenses + Collection - Add Float + Slots Out - Slots In
Shift Balance = Cash Desk Result - Tables Result - Miss Chips
```

Rules:
- `Cashless IN` and `Cashless OUT` are tracked/displayed only.
- `NET (IN - OUT)` is display only.
- printed `Cashless Balance` is only the cashier’s manual provider balance.
- `Cashless Balance` must not affect `Cash Desk Result` or `Shift Balance`.

What I found:
- Frontend close-screen formula already excludes Cashless IN/OUT.
- Print display already shows Cashless Balance from manual closer entry.
- Backend formula currently tries to subtract `totals.mobile_tzs`, but Live close/open saves mobile as `totals.mobile` object, not `mobile_tzs`. So the backend can fail to exclude the manual mobile balance and persist a wrong `shifts.balance`, especially visible in Mwanza.

Plan:
1. Update the Live backend formula `compute_shift_balance_from_row` to calculate manual mobile total from both supported shapes:
   - `totals.mobile_tzs` if present
   - otherwise sum `totals.mobile` / `opening_float.mobile` / `closing_count.mobile`
2. Keep Cashless IN/OUT excluded from CDR and Shift Balance.
3. Recompute existing Live shifts so stored `cash_desk_result` and `balance` are corrected.
4. Update `src/lib/cage-balance.ts` comments only if needed so they match the actual formula.
5. Bump `package.json` patch version because this is a backend formula change.