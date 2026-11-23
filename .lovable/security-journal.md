# Журнал замечаний безопасности

Правило: все замечания записываются сюда; исправления только после решения Ивана.

## Глубокая проверка 19/11/2026

| № | Уровень | Замечание | Где | Решение / статус |
|---|---|---|---|---|
| 2 | error | Anyone can alter player position records | `public._close_open_position(uuid,uuid,timestamptz)` | принято владельцем · отмечено в проверке 23/11 |
| — | warn | Anyone with a peer credential can store oversized chunks | `supabase/functions/cloud-clone-upload/index.ts` | на рассмотрении |
| — | warn | Anyone can check whether a player is at a casino | `public._pos_player_active(uuid,uuid)` | на рассмотрении |
| 6 | error | Anyone can forge club session tokens | `Club token HMAC fallback signing secret` | исправлено · из проверки ушло |
| — | warn | Anyone can change a casino's chip baselines | `public.apply_cage_shift_closing(uuid)` | на рассмотрении |
| 7 | error | Any signed-in user can alter protected records | `public.sync_apply_remote(uuid, bigint, text, text, jsonb, jsonb)` | отложено (синхронизация не работает) · отмечено в проверке 23/11 |
| 7 | error | Any signed-in user can redirect data synchronization | `function public.sync_apply_remote(uuid, bigint, text, text, jsonb, jsonb)` | отложено (синхронизация не работает) · отмечено в проверке 23/11 |
| 8 | error | Any signed-in user can issue lottery tickets | `function public.cashier_issue_lottery_ticket(uuid,uuid,int4,uuid)` | принято владельцем · отмечено в проверке 23/11 |
| — | warn | Any signed-in user can redeem player promo credits | `supabase/functions/cashier-redeem-by-qr/index.ts` | на рассмотрении |
| 4 | error | Anyone can trigger private clone checks | `supabase/functions/cloud-clone-smoketest/index.ts` | принято владельцем · отмечено в проверке 23/11 |
| — | warn | Anyone can view account managers' player activity | `public.am_performance_summary(uuid,uuid,date,date)` | на рассмотрении |
| 5 | error | Anyone can guess a club sign-in code | `Premier Club SMS sign-in code` | принято владельцем · отмечено в проверке 23/11 |
| — | warn | Any signed-in user can put formulas in payroll exports | `Payroll bank export page CSV` | на рассмотрении |
| — | warn | Any casino user can approve that casino's expenses | `public.approve_expense_as_manager(uuid,uuid)` | на рассмотрении |
| 10 | error | Manager can assign any privileged role to a new account | `supabase/functions/create-user/index.ts` | исправлено · из проверки ушло |
| — | warn | Anyone can expose manager email addresses in logs | `supabase/functions/verify-manager/index.ts display-name fallback failure log` | на рассмотрении |
| — | warn | Anyone can expose manager email addresses in logs | `supabase/functions/verify-manager/index.ts candidate-failure log` | на рассмотрении |
| — | warn | Anyone can expose manager email addresses in logs | `supabase/functions/verify-manager/index.ts all-candidates-failed log` | на рассмотрении |
| — | warn | Anyone can expose manager email addresses in logs | `supabase/functions/verify-manager/index.ts diagnostics` | на рассмотрении |
| — | warn | Non-managers can expose email addresses in logs | `supabase/functions/verify-manager/index.ts role-rejected log` | на рассмотрении |
| — | warn | Any signed-in user can put formulas in payroll exports | `Payroll-period bank CSV (exportBankCsv)` | на рассмотрении |
| 9 | error | Any signed-in user can erase activity logs | `public.activity_logs_purge(int4)` | исправлено · из проверки ушло |
| — | warn | Account managers can verify players across casinos | `public.am_trust_player(uuid,text)` | на рассмотрении |
| 11 | error | Any workspace member can inject code into salary slips | `salary slip print in src/lib/payroll-exports.ts` | исправлено · из проверки ушло |
| — | warn | Anyone can check for historical casino records | `public.ace_history_probe_day(uuid,date,numeric,numeric,numeric,numeric)` | на рассмотрении |
| — | warn | Account managers can issue grants to other casinos' players | `public.am_issue_grant(uuid,uuid,int8,promo_grant_source,promo_funding_source,promo_grant_l` | на рассмотрении |
| 1 | error | Anyone can rewrite casino closing figures | `function public.ace_backfill_history_day(uuid,date,numeric,numeric,numeric,numeric)` | принято владельцем · отмечено в проверке 23/11 |
| 1 | error | Anyone can change historical casino totals | `public.ace_backfill_history_day(uuid,date,numeric,numeric,numeric,numeric)` | принято владельцем · отмечено в проверке 23/11 |
| 3 | error | Anyone can retrieve another casino's installer snapshot | `supabase/functions/installer-snapshot-url/index.ts` | принято владельцем · отмечено в проверке 23/11 |
| — | warn | Verified club members can store oversized KYC photos | `supabase/functions/club-submit-kyc/index.ts` | на рассмотрении |
| — | warn | Verified club members can store oversized KYC photos | `supabase/functions/club-submit-kyc/index.ts — Deno.serve handler` | на рассмотрении |
| — | warn | Anyone can trigger finance notifications | `supabase/functions/finance-hub-notify` | на рассмотрении |
| — | warn | Account managers can revoke verification across casinos | `public.am_revoke_verification(uuid,text)` | на рассмотрении |

## 23/11/2026
Принятые/отложенные критичные (1,2,3,4,5,7,8) отмечены в системе проверки как принятые. Исправленные (6,9,10,11) в текущем списке отсутствуют. Активны 20 предупреждений — ждут решения Ивана.
