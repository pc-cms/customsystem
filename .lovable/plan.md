## Goal
1. Embed Head Count entry inside the Chip Count grid (one extra cell per row, after denom 500), visually highlighted, excluded from the chip-money total, and written to `table_head_count` for the current hour slot.
2. Make rows in the Snapshot History panel clickable to drill down into that save's chip details (per-denomination actual / expected / delta per table).

Both changes live in `src/components/tables/ChipCountPanel.tsx`. No backend / schema changes — `table_head_count` and its hooks already exist.

---

## 1. Head Count column inside Chip Count

**Placement & styling**
- New column inserted **after the 500-chip column** (i.e. after the largest denom in `visibleDenoms`, since 500 is the top denom).
- Column header: chip-style "HC" badge with a distinct accent fill (`bg-primary/15` cell background + `ring-1 ring-primary/40`) so it visually stands out from the chip columns.
- Body cells reuse the same `bg-primary/10` fill, same input sizing as chip cells (respects `tabletMode` / `fullscreen`).
- Input: numeric text, 0–99, 2-char max, no spinners (same `clamp99` pattern already used in `HeadCountPanel`).

**Data flow**
- Read existing values via `useTableHeadCount(date)`.
- Slot resolution: reuse `slotForChipCount(nowEAT())` so the head-count cell writes to the same hourly slot a Chip Count save targets (Final 05:00 in the closing window, on-time write otherwise, fallback only-if-empty in the :11–:49 window). Per-row placeholder shows the existing saved value for that slot if any.
- Local state: extend existing `counts` flow with a parallel `hcDraft: Record<tableId, string>` map; reset alongside `counts` when the table set changes.
- Save: `handleSave` additionally builds a `head_count` batch (skipping untouched cells and skipping cells whose value already matches the stored slot value) and dispatches `useBatchSetTableHeadCount`. Runs in parallel with the existing chip snapshot + tracker batch — no ordering dependency.

**Totals**
- Chip math (`rowResults`, `grandTotal`) is untouched — HC never enters the chip sum.
- Footer row gets a new HC total cell (sum of slot HC values across rows) rendered in the same column, in the same accent style. The existing "Total" footer span is shortened by 1 (`colSpan={visibleDenoms.length}` stays, HC column gets its own footer cell, then Result).
- Read-only behaviour mirrors `HeadCountPanel` (managers can edit past dates; others can't).

---

## 2. Clickable Snapshot History rows → detail view

- Snapshot history rows in the bottom panel become buttons (cursor-pointer + hover state). Clicking opens a `Dialog` showing that single save (`ts`).
- Detail dialog content:
  - Header: time + raw total for that save.
  - Table: rows = each table present in that save, columns = the denominations used (chip-token header like the main grid), plus an `Actual / Expected / Δ×denom` triplet per cell (compact stacked layout), and a per-row Result column matching `chipSnapshotResult`.
  - Footer row: column totals + grand total.
- Data: already in `snapshotsFull` grouped by `created_at` inside the `history` memo — extend the memo to also keep the raw `perTableDenoms` map (it's already computed there, just stop discarding it) and pass the selected group's slice into the dialog.
- No new queries, no schema work.

---

## Technical notes
- Files touched: `src/components/tables/ChipCountPanel.tsx` (only).
- Hooks already imported elsewhere: `useTableHeadCount`, `useBatchSetTableHeadCount` from `@/hooks/use-casino-data` — add to the existing import line.
- `HeadCountPanel.tsx` stays as-is (still reachable from the Head Count button above the grid); the new inline cell is an additional, faster entry path for Pit during the chip count.
- Conservation-law / chip-visibility memories unaffected: HC is outside chip math by construction.
- Audit: writes go through existing hooks → DB triggers handle `tg_activity_log` (no client-side `logAction`).
