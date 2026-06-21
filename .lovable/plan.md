## Active filter on Player Tracker (PlayerStatistics)

Add a toggle button **ACTIVE** next to the existing **ZONE** filter in the Player Tracker toolbar. When enabled, the list shows only players who had at least one financial operation in the current period; the button always displays the count of such players.

### Definition of "Active"

A player is Active when any of these is non-zero for the selected period:
- `dropR` (Drop External)
- `inDrop` (In + Drop, recycled)
- `out` (Cash Out)
- `chipIn` (Chips In)
- `chipOut` (Chips Out)

These fields already exist on each row in the `displayRows` memo (lines 395–405) — no new query needed.

### UI placement

In `src/pages/PlayerStatistics.tsx` toolbar (around line 891, immediately before the ZONE Popover):

```
[ ACTIVE 23 ]  [ ZONE ▾ ]  [ Categories ]  [ Search ]
```

Visual:
- Same height (`h-8`), same border + rounded style as ZONE button
- Inactive state: muted text + neutral background
- Active state: `bg-primary/15 text-primary` (matches ZONE active style)
- Count badge inline: `ACTIVE · 23`
- Click toggles `activeOnly` boolean

### State + filter wiring

- Add `const [activeOnly, setActiveOnly] = useState(false);`
- Helper inside the rows memo or `filtered` memo:
  ```
  const isActive = (r) =>
    (r.dropR ?? 0) > 0 || (r.inDrop ?? 0) > 0 ||
    (r.out ?? 0) > 0   || (r.chipIn ?? 0) > 0 || (r.chipOut ?? 0) > 0;
  ```
- Extend the `filtered` memo (line 440) with:
  ```
  if (activeOnly) list = list.filter(isActive);
  ```
- Add `activeOnly` to the memo dependency array.
- Compute count for the badge from `displayRows` (ignores Present/Left tab and zone filter so the number reflects "real active players today" regardless of other filters):
  ```
  const activeCount = useMemo(
    () => displayRows.filter(isActive).length,
    [displayRows]
  );
  ```

### Out of scope

- No DB / hook / RLS changes.
- No change to Zone filter, Category filter, sorting, totals row, or row rendering.
- No change in other pages (Reception, Cage, Dashboard).
