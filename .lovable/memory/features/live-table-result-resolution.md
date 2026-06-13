---
name: Live Table Result Resolution
description: Live Result = gaming_tables.closing_result + Fill/Credit adjustment ONLY. Chip Count snapshots never affect Result.
type: feature
---

# Live Table Result

## Rule (June 2026)

```
Result = (gaming_tables.closing_result ?? 0) + (Σcredit − Σfill from cage_transfers)
```

- Open table (`closing_result IS NULL`) → Result = 0 + transfers adjustment.
- Closed table → Result = stored `closing_result` + transfers adjustment.
- Chip Count snapshots are NOT used. They feed Tracker / Analytics only.
- Table Tracker is NOT used for Result.

## Why

Snapshot-driven live result was unreliable: cashiers occasionally entered counts for denominations not actually present on a table (baseline = 0, actual = N) which inflated Result by `N × denom`. Closing values entered by Pit at Close Tables are the single authoritative source.

## Implementation

- `src/lib/table-live-result.ts` — `liveTableResult({ closingResult, adjustmentMap })`. Drops snapshotIndex/baselineMap (kept as deprecated optional fields for callsite compatibility).
- `compute_shift_table_results` RPC mirrors the same formula server-side.
