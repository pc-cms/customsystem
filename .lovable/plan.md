# Per-table result chart: only Chips Check data

## What changes

The 20-minute per-table graph (18:00 → 06:00) currently draws points from two sources at once:

1. Chips Check snapshots (chip count per table, actual vs expected)
2. Numbers / Table Tracker manual entries

When both exist in the same 20-minute slot, the later one wins, so the line can jump between two different meanings.

After the change the chart is built **only** from Chips Check snapshots. Numbers entries are ignored — they stay untouched in their own screen, they just no longer feed this graph.

## Behaviour details

- Each point = result of the chip count for that table at that time slot (same value logic as today for snapshots).
- Slots with no chip check stay empty (no line point), so the line reflects only real counts.
- Time slots, colours, tooltip and Y axis stay as they are now.

## Technical

- `src/components/tables/TableAnalyticsChart.tsx`: drop the `useTableTracker` data feed from `dataBySlot` (and the now unused import/hook call). Keep the `useChipSnapshotsFull` grouping and `chipSnapshotResult` computation.
- No database or backend changes.
- Version bump.
