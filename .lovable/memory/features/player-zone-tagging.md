---
name: Player Zone Tagging
description: Per-day Zone column (S/LG/CP) on Player Statistics — one zone per player per business day, colors Zone and Bet cells
type: feature
---

# Player Zone Tagging

- Column **Zone** added to `/statistics` after **Left**. Values: `S` Slots, `LG` Live Game, `CP` Club Poker.
- Persisted in `player_daily_zones (casino_id, player_id, business_date, zone)` — UNIQUE per `(casino_id, player_id, business_date)`. One zone per player per day.
- Default = empty (unassigned). No auto-mapping from position. Cleared via `·` button.
- Editable when single-day && today by roles: `pit`, `manager`, `shift_manager`, `reception`, `super_admin`. Historical / multi-day = read-only.
- Header has sort (S → LG → CP → none) + filter popover with checkboxes (S/LG/CP/Unassigned).
- Both the Zone `<td>` AND the Bet `<td>` get the full-square zone fill from `ZONE_CELL_CLASSES` (`src/lib/zone-colors.ts`). Palette:
  - S → amber, LG → sky, CP → purple.
- Files: `src/lib/zone-colors.ts`, `src/hooks/use-player-daily-zones.ts`, integrated in `src/pages/PlayerStatistics.tsx` (`ZonePicker` at bottom).
- Multi-day view aggregates rows per player; zone shown = whatever's set for that single-day query (no per-day breakdown when in range mode).
- NEP / Drop / Result formulas unaffected.
