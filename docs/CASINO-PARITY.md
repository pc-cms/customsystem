# Casino Parity Checklist

**Rule:** every casino (Arusha, Mwanza, Dodoma, Mbeya, future ones) MUST behave
identically in the client. The only allowed differences are cosmetic:
display name, short name, manifest description, and optionally an icon.

When adding a new casino (e.g. Dodoma, Mbeya, or anything new), copy from an
existing one and verify the checklist below.

## What must be identical

| Area | Source of truth | Notes |
|---|---|---|
| Network timeout for mutations | `src/lib/offline-mutation.ts` (`onlineTimeoutMs = 15000`) | Never override per casino. |
| Auth refresh throttle | `src/lib/auth-throttle.ts` (`RATE_LIMIT_COOLDOWN_MS = 30000`) | Global. |
| Sync engine backoff | `src/lib/sync-engine.ts` (1s → 16s exponential) | Global. |
| Pit prefetch warming | `src/lib/pit-prefetch.ts` | Same order, same staleTimes. |
| Realtime subscriptions | `src/hooks/use-realtime.ts` | Same channels filtered by `casino_id`. |
| `node_modes.mode` in DB | `cloud_primary` for every cloud-hosted casino | Only on-prem nodes flip to `local_primary`. |
| PWA `start_url`, `scope`, `display`, `theme_color`, `background_color`, icons | All cloud manifests | Identical. |
| Offline cache budget (IndexedDB / React Query persistence) | `src/lib/query-persister.ts` | Global. |

## What may differ

- Manifest `name`, `short_name`, `description` — display only.
- Optional per-casino icon (currently all share `/icon-*.png`).
- `casinos.name` / `casinos.slug` in the DB.
- Branding strings shown in `src/lib/branding.tsx`.

## What must NOT differ

- No per-casino timeout, retry count, or backoff multiplier.
- No per-casino prefetch toggle.
- No per-casino RLS shortcut.
- No per-casino feature flag that changes data flow (only UI/visibility flags
  via `chip_color_settings.is_visible` and similar are allowed).

## Adding a new casino — manifest steps

1. Copy `public/manifest-arusha.json` → `public/manifest-<slug>.json`.
2. Change only `name`, `short_name`, `description`. Leave everything else.
3. If on-prem too: copy `public/manifest-aru.json` → `public/manifest-<code>.json`
   and change `name`, `short_name`, `description`, and `id` (`/<code>/`).
4. Confirm DB row: `INSERT INTO casinos (slug, name) ...` and an accompanying
   `INSERT INTO node_modes (casino_id, mode) VALUES (..., 'cloud_primary')`.
5. Add the `<slug>.casinosystem.app` subdomain to `CLOUD_HOSTS` in
   `src/hooks/use-replication-mode.ts` and (if it has a short code) the alias
   map in `src/lib/casino-context.tsx`.

## Why timeouts are 15s, not 8s

The Lovable Cloud Supabase region sits in Europe. Round-trip from East
African ISPs (Arusha, Mwanza, Dodoma) is normally 250–400 ms with
occasional jitter spikes to 2–4 s. An 8-second hard timeout was triggering
"Connection slow" toasts on requests that would have completed in 9–10 s,
even though the data was being saved to the offline queue and syncing
correctly afterwards.

15 s is long enough to absorb normal jitter, short enough that genuinely
stuck requests still fall through to the IndexedDB queue and don't freeze
the UI. Real offline (Wi-Fi off) still shows the "Saved offline" toast and
the red `OfflineBanner` immediately.
