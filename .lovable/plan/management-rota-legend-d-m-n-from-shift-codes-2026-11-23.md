# Management Rota: legend D/M/N from Shift Codes

## Problem
- Rota header shows fixed text: M 13:00–21:00, N 18:00–06:00 (hardcoded in `MGMT_SHIFT_LABELS`).
- Shift Codes (Arusha · Management) say: D 10:00–18:00 (8h), M 18:00–06:00 (12h), N 22:00–06:00 (8h).
- Fallback hours in code are also old: `MGMT_SHIFT_HOURS` = D 8, M 8, N 12.

## How Total is calculated now (example Taras)
N 6 × 8h + M 6 × 12h + D 4 × 8h = 48 + 72 + 32 = 152h, 16 days — i.e. totals already use Shift Codes hours; only the legend is wrong. The fallback (D8/M8/N12) is used only if a code has no hours set.

## Fix (presentation only)
1. Header legend D/M/N shows Start–End and hours from Shift Codes of the selected casino (Management department), e.g. `M 18:00–06:00 · 12h`.
2. Fallback constants aligned: D 10–18 / 8h, M 18–06 / 12h, N 22–06 / 8h.
3. Total cell tooltip: `N 6×8h + M 6×12h + D 4×8h = 152h`, so the calculation is clear.
4. Version bump.

No data, rota entries or attendance values are changed.
