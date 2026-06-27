Refine Pit Book message layout in `src/components/`/`src/pages/PitBook.tsx` (MessageRow):

1. **Swap Role and Name order**: render `[Time] [ROLE chip] [Name] [body]` instead of `[Time] [Name] [ROLE] [body]`.
2. **Remove bubble fill**: drop `bg-card`/`bg-primary` backgrounds and padding-block. Both own and foreign messages render as plain text on the page background (no card fill). Keep `text-foreground`; for own messages, right-align the line but no colored bubble. Remove `rounded-md px-3 py-2`.
3. **Wider lines**: increase `max-w` from `min(76%,780px)` to `min(96%,1100px)` (or simply `max-w-full`) so Taras' message doesn't wrap prematurely when there's plenty of horizontal room.
4. **Time styling**: make time `font-bold` and use a contrast color — `text-foreground` (not `text-muted-foreground`); keep mono/tabular-nums. Slight size bump optional.
5. Keep the colored ROLE chip palette (it stays as the only filled element, since user said "role should be colored").

Bump `package.json` to `1.3.431`.
