# August 2026 — balance check and what fixing it changes

## Current August numbers (01–31 August, Grand TZS)

| Branch | Expected | Actual (physical counts) | Variance now |
|---|---:|---:|---:|
| Arusha | 43 312 992 | 32 992 111 | −10 320 881 |
| Dodoma | 49 847 361 | 46 931 973 | −2 915 388 |
| Mbeya | 24 948 863 | 25 000 553 | +51 690 |
| Mwanza | 26 950 137 | 154 123 891 | +127 173 754 |

## What the checks already show

1. Mwanza — the big one. The counted cash on 31 August is 117 636 000 in the main cash wallet (a consistent series: 140–177 million through the last week of August). But the September opening record for the same wallet says 1 512 526, and September closes with variance 0. The two records contradict each other; one of them is wrong. This single wallet explains almost the whole +127 million.
2. Arusha and Dodoma — the gaps are smaller and look like month-end entries: money moved on 31 August with an offsetting record entered on a different date, plus back-dated statement imports. Which exact records are at fault is not yet confirmed.
3. Mbeya — the +51 690 is exactly the card balance figure for the month; needs a one-line confirmation before touching anything.

## Plan

Step 1 — Mwanza (biggest impact)
- Compare the 31 August count series, the September opening record, and the collections entered at month end for the main cash wallet.
- Decide with you which figure is the true closing cash for 31 August, then correct only the wrong side (either the opening record or the missing month-end collection).
- Expected result: Mwanza August variance goes from +127 173 754 to close to 0, and September stays at 0.

Step 2 — Arusha
- List every 31 August money movement whose matching income/expense record sits on another date, and the back-dated statement rows.
- Correct the dating of the mismatched records.
- Expected result: −10 320 881 shrinks to the genuine cash shortage; the target is 0 unless real money is missing.

Step 3 — Dodoma
- Same review for the −2 915 388, focused on the bank and cash wallets at month end.
- Expected result: variance to 0 or to a small confirmed real difference.

Step 4 — Mbeya
- Confirm the 51 690 card-balance line, correct it if it is a leftover, otherwise leave as is.

Step 5 — Re-run all four branches for August and September and report the before/after table.

## Projected variances after the fixes

| Branch | Now | After |
|---|---:|---:|
| Arusha | −10 320 881 | 0 (or a confirmed real shortage) |
| Dodoma | −2 915 388 | 0 (or a confirmed real shortage) |
| Mbeya | +51 690 | 0 |
| Mwanza | +127 173 754 | 0 |

September must stay unchanged: Arusha +476 761, Dodoma ~0, Mbeya +6 995 200, Mwanza 0. The Mbeya September gap is a separate item, not part of this work.

## Technical notes

- No change to the Expected/Actual rules or to `fin_balance_snapshot`. Arrow movements keep their meaning: a signed entry that moves Actual only, counted after the last physical recount.
- All corrections are data corrections through `run_sql` (new records / corrected dates), no deletions of history beyond what you approve item by item.
- Each step is confirmed with you before any write, because each one changes reported month figures.
