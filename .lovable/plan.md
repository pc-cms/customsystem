# Проводки в прошлый месяц + починка Open Month

## Что проверено (факты из базы)

**1. Аджастменты за сегодня — все в августе. ОК.**
Все записи `adjustment`, созданные 01.09, — это Closing Inbox по Arusha (20 строк, 31 276 000 TZS), business date **31/08/2026**. В других филиалах аджастментов сегодня не было.

**2. Две записи Mwanza ушли в сентябрь ошибочно:**
- «Tips for dealears 15.08-31.08» — 1 204 500 TZS, дата 01/09/2026
- «Bar sales» — 16 000 TZS, дата 01/09/2026

(Mbeya tips 2 000 на 01/09 — это текущий доход, оставляю.)

**3. Открытие месяца сломано.**
`fin_open_month` вызывает `fin_assert_month_started` для того же месяца, который открывает — проверка всегда падает «Month is not opened yet». То есть сентябрь нельзя открыть ни в одном филиале. Зависимости от закрытия предыдущего месяца в функции нет — это правильно и так и останется.

Сейчас открыты: Arusha 05–08/2026, Mwanza 06–08, Dodoma 08, Mbeya 08. Сентябрь — нигде. Закрыт только июль в Arusha.

**4. Даты в формах.** В Incomes/Commissions и Tips & Bonuses поле даты есть, но по умолчанию ставится сегодня, поэтому записи легко улетают в новый месяц. В Wallets движения (Money In/Out) дата жёстко зажата в выбранный период через `minDate/maxDate`.

## Что делаю

1. **Чиню `fin_open_month`**: вместо ошибочного `fin_assert_month_started` — проверка статуса: `closed` → «месяц уже закрыт», `open` → «месяц уже открыт», иначе открываем. Никакого требования закрывать предыдущий месяц.
2. **Открытие сентября** становится доступным во всех филиалах (проверю после правки).
3. **Ввод в прошлый месяц во всех финансовых формах**, не только в Expenses:
   - Incomes/Commissions и Tips & Bonuses: дата по умолчанию берётся из выбранного в шапке Office месяца (последний день месяца, если месяц не текущий), выбор прошлой даты разрешён ролям manager / finance_manager / general_manager / super_admin, backdated дата подсвечивается жёлтым — как уже сделано в Expenses.
   - Wallet Money In / Money Out: снимаю жёсткий clamp по периоду для тех же ролей, оставляю предупреждение, если дата вне выбранного окна.
   - Везде остаётся серверный запрет: закрытый месяц и неоткрытый месяц — ошибка.
4. **Переношу две записи Mwanza** (Tips 1 204 500 и Bar sales 16 000) с 01/09 на 31/08 вместе со связанными строками кошелька, с записью в аудит-лог.

## Техническая часть

- Миграция: `CREATE OR REPLACE FUNCTION public.fin_open_month(...)` — заменить `PERFORM public.fin_assert_month_started(...)` на ветвление по `fin_month_opening_status(...)`.
- `src/pages/office/OtherIncomesTab.tsx`, `src/pages/office/TipsBonusTab.tsx`: default date из `useOfficePeriod()`, гейт по роли (как в `Expenses.tsx`), жёлтая подсветка backdated.
- `src/components/finances/WalletMovementDialog.tsx` / `FinancesWalletsPage.tsx`: `minDate/maxDate` применяются только без права backdate; иначе предупреждение о выходе за окно.
- Data-fix через SQL: `fin_other_incomes.business_date` и связанные `fin_wallet_tx.business_date` → `2026-08-31`.
- Канонические формулы, Day Closing и кассовые смены не трогаю.
