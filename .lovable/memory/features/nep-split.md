---
name: NEP Drop Split (per-day peak)
description: Drop R / Drop V model — per-business-day reset, peak NEP within day = External, remainder of total IN = Recycled, period totals sum daily values
type: feature
---

# Drop R / Drop V — per-business-day peak NEP

## Formula (June 2026)

For each `(player, business_day)` pair, walk transactions chronologically (cancelled ignored):

```
NEP_day starts at 0,  peak_day = 0,  total_in_day = 0
on `in`/`buy`     :  NEP_day += amount;  peak_day = max(peak_day, NEP_day);  total_in_day += amount
on `out`/`cashout`:  NEP_day -= amount
```

Then:

- **Drop R (External)** = `peak_day` — peak amount of real cash the player was down at any point that day.
- **Drop V (Recycled)** = `total_in_day − peak_day` — buy-ins above the peak (played on returned winnings).

**Period / lifetime** = SUM of daily `Drop R` / `Drop V` across days inside the window. Lifetime history outside the window does NOT influence the split (per-day reset).

**Per-table split** — one peak per `(player, day)`, distributed proportionally to per-table IN that day:

```
dropR_table[t]  = peak_day * in_by_table[t] / total_in_day
dropV_table[t]  = (total_in_day - peak_day) * in_by_table[t] / total_in_day
```

## Authoritative source

DB RPCs (rewritten 2026-06-13):
- `compute_player_drop_split(player_id, from, to)`
- `compute_players_drop_split(casino_id, from, to)` → per-player
- `compute_tables_drop_split(casino_id, from, to)`  → per-table proportional

Defaults: `from = -infinity`, `to = infinity` (lifetime). Uses `transactions.business_date` for the day partition.

Client helpers in `src/lib/nep-split.ts` mirror the same logic (used for previews/tests only).

## Why peak-NEP per day (not lifetime walk)

The old lifetime-NEP model under-counted Drop R when a player came in net-winner from prior days (recycled would absorb new buy-ins even though it was fresh cash that day). Operators count Drop per day per player based on what physically came in before the first cashout drained the position.

## Sanity-checks

| Scenario | Drop R | Drop V |
|---|---|---|
| in 100k, no out | 100 000 | 0 |
| in 100k → out 50k → in 30k | 100 000 | 30 000 |
| in 50+50+250+200+100+200+25 → out 750 → in 50+20+50+100+150 | 875 000 | 370 000 |
| 3 days × in 100k (no out) | 300 000 | 0 |
