# Chip colors for Dodoma — match the real chips

The photo shows the actual Premier Casino chip set used in Dodoma. Current Dodoma settings in the database do not match it (e.g. 1000 is stored as black, 2000 as bright blue, 100000 as yellow-green, 500000 as black, 500 as magenta).

## What will change

Update `chip_color_settings` for Dodoma only — body, edge inserts and label color per denomination. Visibility stays as-is (5M and 10M remain hidden).

| Denom | Body | Edge inserts | Label |
|---|---|---|---|
| 500 | salmon pink `#F0A0A0` | white `#F5F0E6` | black |
| 1 000 | off-white / lavender `#E9E8EE` | dark grey `#3A3F44` | black |
| 2 000 | light blue `#7CC5E0` | dark grey `#33383D` | black |
| 5 000 | red `#E03A2C` | dark grey `#33383D` | black |
| 10 000 | orange `#F0802A` | cream `#F5EEDD` | black |
| 25 000 | teal green `#35A88B` | white `#F5F0E6` | black |
| 50 000 | blue `#2E86D0` | white `#F5F0E6` | black |
| 100 000 | charcoal `#3C4247` | white `#F5F0E6` | black |
| 500 000 | pink `#EE6FA8` | cream `#F5EEDD` | black |
| 1 000 000 | ivory / cream `#EDE6D6` | red `#D62828` | black |

Label color is black everywhere, matching the yellow center with black digits on the real chips.

## Technical notes

- A single data update (UPDATE/upsert) on `chip_color_settings` scoped to the Dodoma casino id; no schema or code changes.
- The `ChipToken` component and all cage/float/report surfaces pick the new colors up automatically through the existing realtime invalidation of `chip_color_settings`.
- Other casinos (Mbeya, Arusha, Mwanza, Premier) are untouched.
