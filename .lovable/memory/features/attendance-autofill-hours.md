---
name: Attendance auto-fill hours
description: Shift-aware default hours used when business-day closure auto-fills empty attendance cells (Pit dealers, Pit Bosses, Floor Staff)
type: feature
---

When a business day is closed (`business_day_closures` row exists) and the
client-side auto-fill loop encounters an empty attendance cell whose rota slot
is a working shift, it writes a shift-aware default:

| Module          | Shift | Hours |
| --------------- | ----- | ----- |
| Pit (Live Game) | M     | 11    |
| Pit (Live Game) | EM    | 11    |
| Pit (Live Game) | N     | 8     |
| Pit (Live Game) | EN    | 8     |
| Floor Staff     | D     | 9     |
| Floor Staff     | N     | 8     |

Applies to Pit dealers AND Pit Bosses uniformly (no PB-specific branch).

Rules:
- Empty cells only — any existing value (number, `A`, `S`, `SP`, `{n}S`) is never overwritten.
- Open current business day and future days are never auto-filled (hard guards stay in place).
- Manual typing of `M` / `N` / `EM` / `EN` in a Pit attendance cell is translated to the same hour value on save.
- Fallback for unrecognized shift codes remains `9`.

Implementation: `src/pages/Pit.tsx` (auto-fill `useEffect` and `handleSave`) and `src/pages/Staff.tsx` (auto-fill `useEffect`). No DB triggers or RPC involved.
