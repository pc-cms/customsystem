# Card Balance в Expected: эффект отключения + разбор формулы

## 1. Что будет, если убрать Card Balance из Expected

Проверено по данным (read-only, ничего не менялось). Expected считается сейчас с Card Balance; ниже — Variance (Actual − Expected) сейчас и без Card Balance.

### Август 2026

| Филиал | Card Balance | Variance сейчас | Variance без CB |
|---|---:|---:|---:|
| Arusha | +166 986 | −8 787 866 | −8 620 880 |
| Dodoma | −4 173 380 | +1 257 992 | −2 915 388 |
| Mbeya | +51 690 | 0 | +51 690 |
| Mwanza | −100 246 | +127 274 000* | +127 173 754* |

*Мванза за август: Actual 154 123 891 против Expected 26 849 891 — расхождение не связано с Card Balance (похоже на незакрытый/несведённый месяц, отдельная тема).

Итого по августу (без Мванзы): Card Balance = −3 954 704; Variance суммарно сейчас −7 529 874, без CB −11 484 578.

### Сентябрь 2026 (на 02/09)

| Филиал | Card Balance | Variance сейчас | Variance без CB |
|---|---:|---:|---:|
| Arusha | 0 | −23 170 000 | −23 170 000 |
| Dodoma | +100 370 | +145 389 | +245 759 |
| Mbeya | +100 | 0 | +100 |
| Mwanza | −1 340 | +85 347 | +84 007 |

Вывод: там, где месяц сведён «в ноль» (Mbeya август и сентябрь), удаление Card Balance ломает сходимость — появляется расхождение ровно на величину CB. Значит Card Balance сейчас стоит правильно: клиентские деньги физически лежат в кассе и попадают в пересчёт, поэтому Expected обязан их содержать. Убирать его не рекомендуется.

## 2. Полная формула Expected (что и откуда)

Источник: RPC `fin_balance_snapshot(casino, from, to)` + сборка в `src/hooks/use-fin-balance.ts:117-145`.

```text
Expected =
  + Starting Float        (basic float на начало периода: fin_month_opening / fin_wallets.starting_float_amount)
  + Live Game             (Σ fin_day_closing.tables_result — результат столов за закрытые дни)
  + Slots                 (Σ fin_day_closing.cashdesk_win — физический кэш слот-кассы, НЕ net_win)
  + Other                 (fin_other_incomes: source='other' — прочие поступления/списания)
  + Tips & Bonuses        (fin_other_incomes: source in ('tips','bonus') — не доход, но двигают кассу)
  + Other movements       (fin_wallet_tx: external_income / manual движения вне прочих категорий)
  + Add Float             (одобренные пополнения флота, считаются один раз)
  + JP                    (fin_other_incomes: source='jp' — джекпоты, ин/аут)
  + Card Balance          (Σ fin_day_closing.players_card_balance — деньги игроков в кассе, ровно один раз)
  + Miss Chips            (недостача/излишек фишек)
  + Miss Cards            (недостача/излишек карт)
  − Expenses              (одобренные расходы с привязкой к кошельку)
  − Collections           (изъятия владельца / CAPEX-выводы)
  − Transfers             (inter-casino переводы и money change — деньги ушли из филиала)

Actual   = Σ физических пересчётов кошельков (wallets[].actual_tzs); непосчитанный кошелёк = 0
Variance = Actual − Expected
```

Важно: `commission` (напр. Додома −4 266 000) приходит внутрь `other`/`movements` в зависимости от источника записи; ADJ-транзакции меняют только Actual и в Expected не входят.

## 3. Что предлагается сделать

Вариант по умолчанию — ничего не менять в расчёте (данные подтверждают корректность Card Balance), а вместо этого:

1. Добавить в Wallets тултип у строки Card Balance: «Σ players_card_balance из Day Closings, входит в Expected один раз».
2. Разобрать отдельно аномалию Мванзы за август (Actual 154 млн против Expected 26,8 млн) — вероятно, кошельки посчитаны, но месяц не сведён.

Если всё же нужно убрать Card Balance из Expected — это правка одной строки в `src/hooks/use-fin-balance.ts` (и симметрично в RPC/Monthly Report для согласованности), но тогда Mbeya и другие сведённые месяцы перестанут сходиться в ноль.

Скажи, какой из вариантов делаем.
