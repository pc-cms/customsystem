## Why favicon didn't change

The branding logic in `public/branding.js` already swaps favicon per hostname, but:
- `mwanza/dodoma/mbeya` have NO `favicon` field → fall back to the default `/favicon.png` (current dark Lovable-style icon you see in the tab).
- `arusha` uses `/arusha-logo.png` only.
- `casinosystem.app` (landing) strips icons entirely → browser shows whatever it cached (the colorful Lovable default).
- The new Amaell favicons you uploaded haven't been added to `/public` yet.

## Plan

### 1. Add new icon files to `/public`
- Copy `arusha-logo.png` → `favicon-premier.png` and `apple-touch-icon-premier.png` (reuse the existing Premier "AG" mark).
- Copy uploaded Amaell Orbit icons for the landing domain:
  - `user-uploads://favicon.ico` → `public/favicon.ico`
  - `user-uploads://favicon-16x16.png` → `public/favicon-16x16.png`
  - `user-uploads://favicon-32x32.png` → `public/favicon-32x32.png`
  - `user-uploads://apple-touch-icon.png` → `public/apple-touch-icon-amaell.png`

### 2. Update `public/branding.js`
- Add `favicon`/`appleTouchIcon` to `mwanza`, `dodoma`, `mbeya`, `premier` → `/favicon-premier.png` + `/apple-touch-icon-premier.png`.
- Change `arusha` to use the same Premier icons (was `arusha-logo.png` — keep that file untouched for in-app logo use).
- For `landing` kind: instead of stripping `<link rel="icon">`, swap it to the Amaell `favicon.ico` + 16/32 PNGs + apple-touch-icon. Keep stripping the PWA manifest/theme tags (landing is not installable).
- `club` already correct (`favicon-club.png` / `apple-touch-icon-club.png`) — no change.

### 3. Update `index.html`
- Default `<link rel="icon">` stays as `/favicon.png` (used only when no branch matches and not landing). No structural change needed.

### Mapping summary

| Host | favicon |
|---|---|
| `casinosystem.app`, `www.` | Amaell `favicon.ico` + 16/32 + apple-touch-icon |
| `arusha.`, `mwanza.`, `dodoma.`, `mbeya.`, `premier.`, `aru.`, `mwz.`, `dod.`, `mbi.` | `favicon-premier.png` |
| `club.` | `favicon-club.png` (unchanged) |
| other / preview | default `/favicon.png` |

### Notes
- Browsers aggressively cache favicons — a hard refresh (Ctrl+Shift+R) or new tab may be needed to see the change.
- No backend / migration changes → no version bump needed.