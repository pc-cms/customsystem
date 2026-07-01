## Goal
Extend the "tips auto-check-in at 13:00 EAT" logic from Arusha to Mwanza, Dodoma, and Mbeya. Rename Arusha tips players with a city prefix. Introduce a new player category **Casino** with a reddish badge for these special players.

## 1. New player category: `casino`

- Add `'casino'` to the `player_category` Postgres enum.
- Update `PlayerCategory` type in `src/components/player/CategoryBadge.tsx`:
  - Add `casino: { letter: "C", label: "Casino", classes: <reddish tokens> }`.
  - Highest priority (`CATEGORY_PRIORITY.casino = -1`) so it sorts on top of Diamond.
  - Include in `ALL_CATEGORIES`.
- Reddish styling using tailwind rose/red tokens consistent with existing style:
  `bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/40`.
- Verify usages in `PlayerStatusTagsEditor`, `CategoryFilter`, `SeatedPlayerChip`, `ActivePlayers`, `use-player-profile`, `Guests`, `PlayerStatistics`, `Tables`, `ClubWallet` still compile with the new value; extend any local `Record<PlayerCategory,…>` maps that don't fall through to a default.

## 2. Rename Arusha players and create new ones

Data migration/insert:

- Update the 3 existing Arusha players:
  - `TIPS LIVE GAME`  → first_name `ARK`, last_name `LIVE GAME`, category `casino`
  - `TIPS CLUB POKER` → `ARK` / `CLUB POKER`, category `casino`
  - `TIPS FLOOR`      → `ARK` / `FLOOR`, category `casino`
- Insert new active players with `player_type='table'`, `category='casino'`, `status='active'`:
  - Mwanza (`MWZ`): `MWZ LIVE GAME`, `MWZ FLOOR`
  - Dodoma (`DOD`): `DOD LIVE GAME`, `DOD FLOOR`
  - Mbeya  (`MBI`): `MBI LIVE GAME`, `MBI FLOOR` (note: user requested prefix `MBI` even though casino code is `MBY`)
- Idempotent: use `ON CONFLICT` on `(casino_id, first_name, last_name)` where possible, or a `WHERE NOT EXISTS` guard.

## 3. Auto check-in edge function

Rewrite `supabase/functions/auto-checkin-tips/index.ts` to iterate over ALL four casinos instead of hard-coded Arusha:

- Query: `players` where `category = 'casino'` AND `status='active'` (drops the fragile name pattern).
- For each such player, upsert today's `casino_visits` row exactly like today:
  - insert with `position: 'hall'` if none,
  - clear `checked_out_at` if closed,
  - skip if already open.
- Return per-casino counters in the response.
- Keep the daily cron at 13:00 EAT (10:00 UTC). Cron entry already exists — no change needed since we're not renaming the function.

## 4. Verification

- Run edge function manually once after deploy; check `casino_visits` for the 4 casinos on today's date.
- Load `Guests` page for Mwanza / Dodoma / Mbeya and confirm the new C-badged players show up in the Active list.
- Reddish badge visible in `SeatedPlayerChip`, `CategoryFilter`, `PlayerPreviewHeader`.

## Files touched

- `supabase/migrations/<new>.sql` — enum add, player upserts.
- `src/components/player/CategoryBadge.tsx` — new tier + color.
- Any strict `Record<PlayerCategory, …>` map that would fail typecheck (spot-fix on typecheck output).
- `supabase/functions/auto-checkin-tips/index.ts` — multi-casino loop.
