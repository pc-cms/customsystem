---
name: Attendance auto-fill hours
description: Shift-aware default hours used when business-day closure auto-fills empty attendance cells (Pit dealers, Pit Bosses, Floor Staff, Office)
type: feature
---

When a business day is closed (`business_day_closures` row exists) and the
client-side auto-fill loop encounters an empty attendance cell whose rota slot
is a working shift, it writes a shift-aware default.

## Canonical hour table

| Module             | Code | Hours |
| ------------------ | ---- | ----- |
| Pit (Live Game)    | M    | 11    |
| Pit (Live Game)    | N    | 8     |
| Floor / Office     | D    | 8     |
| Floor / Office     | N    | 8     |
| Floor / Office     | G    | 8     |
| Extra (any module) | EM   | 11    |
| Extra (any module) | EN   | 8     |
| Extra (any module) | ED   | 8     |

Applies to Pit dealers AND Pit Bosses uniformly (no PB-specific branch).
Floor Staff includes Office departments (cashier, hostess, waiter, cleaner,
reception, security, it, hr, driver, bartender) — all default to 8h.

## Rules

- Empty cells only — any existing value (number, `A`, `S`, `SP`, `{n}S`) is never overwritten.
- Open current business day and future days are never auto-filled (hard guards stay in place).
- Manual typing of shift codes in an attendance cell is translated to the same hour value on save (Pit: M/N/EM/EN/ED; Floor: EM/EN/ED).
- Pit `E` rota slot is treated as Extra and triggers auto-fill (EM=11 / EN=8 selected by saved value).
- Fallback for unrecognized shift codes remains `9` (legacy safety).

## Implementation

- `src/pages/Pit.tsx` — auto-fill `useEffect` + `handleSave`.
- `src/pages/Staff.tsx` — auto-fill `useEffect` (constant 8) + `handleSave` (EM/EN/ED shortcuts).

No DB triggers or RPC involved.
