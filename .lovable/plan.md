
## Goal

Track a per-hour "Head Count" (0–99) for each open table on the Table Check page, entered through a dedicated panel (like Chip Count) and surfaced inline inside each hour column of the Numbers grid.

## UI changes (`src/pages/TableTracker.tsx`)

1. Top mode toggle: add a third button **Head Count** (Users icon) next to **Numbers / Chips**. Behaves the same way (sets `mode`).
2. New `HeadCountPanel` rendered when `mode === "headcount"` — same shell as `ChipCountPanel`.
3. Numbers grid hour cells (unchanged width / column count):
   - Below the existing money input, render a small read-only line showing the saved head count as 2 digits (`07`, `12`, `·` if empty), muted/monospace, centered.
   - Active slot still highlighted; cell still resolves to one visual column.
4. Totals row (last row of Numbers grid): under the existing currency total, show the per-hour Head Count sum (small, muted) on the same cell — "next to the result" as requested.

No changes to keyboard navigation of the money inputs; head count is not edited from the grid.

## Head Count panel (`src/components/tables/HeadCountPanel.tsx`, new)

- Slot picker = current hour by default (19:00 → 05:00), navigable left/right like Chip Count.
- One row per open table (same filter as Numbers grid: `status === "open"` OR has existing head count for the date).
- One numeric input per table: plain `<input type="text" inputMode="numeric" maxlength=2>`, no spinners, accepts 0–99 only (regex strip + clamp).
- "Save" button writes a batch upsert for the active slot; auto-save on blur per cell, mirroring Chip Count UX.
- Read-only when not today and user is not manager (same rule as Numbers).

## Data layer

New table `public.table_head_count`:

```
id uuid pk default gen_random_uuid()
casino_id uuid not null references casinos(id) on delete cascade
table_id  uuid not null references gaming_tables(id) on delete cascade
date      date not null
time_slot text not null            -- '19:00' … '05:00'
value     smallint not null check (value between 0 and 99)
created_at timestamptz default now()
updated_at timestamptz default now()
unique (casino_id, table_id, date, time_slot)
```

- GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated`; GRANT ALL to `service_role`.
- RLS: SELECT for users in same casino; INSERT/UPDATE for `pit` or `manager`; super_admin sees all (mirrors `table_tracker` policies).
- Add to `supabase_realtime` publication.
- New hooks in `src/hooks/use-tables.ts`: `useTableHeadCount(date)`, `useSetTableHeadCount()`, `useBatchSetTableHeadCount()` — copy-paste from the matching `table_tracker` hooks.
- Re-export from `use-casino-data.ts`.
- Add `table_head_count` to realtime + prefetch invalidation lists in `use-realtime.ts` / `use-prefetch.ts`.

## Out of scope

- No business-day snapshotting (closure history) in this pass — can be added later if needed.
- No edit of head count from the Numbers grid; entry stays in the Head Count panel.
- No change to existing money tracker behavior, totals, or analytics.

## Acceptance

- Numbers grid columns visually unchanged; each hour cell shows saved Head Count as a 2-digit number under the money input.
- Totals row shows per-hour Head Count sum beside the money result.
- Head Count button opens a Chip-Count-style panel that saves 0–99 per table per hour.
- Read-only enforcement and date scoping match the existing Numbers/Chips views.
