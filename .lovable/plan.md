# Payroll: Rebuild from scratch

Сейчас удалить месяц зарплаты нельзя. Есть Unlock, Revert to draft и Refresh, но Refresh только досчитывает/обновляет строки — если в месяце накопились ручные правки или мусорные строки, они остаются. Добавляем полный пересбор месяца.

## Что получит пользователь

На странице месяца зарплаты рядом с «Refresh» появится кнопка «Rebuild from scratch»:

- Доступна только супер-админу и только когда месяц в статусе draft (для закрытого месяца сначала Unlock / Revert to draft).
- Перед выполнением — окно подтверждения с текстом, что все строки месяца будут удалены и собраны заново из данных сотрудников, ставок и посещаемости, и что ручные правки в строках будут потеряны.
- Сам месяц (период, его номер, описание платежа, история аудита) сохраняется.
- После выполнения — сообщение вида «Rebuilt: N entries» и обновлённая таблица.
- Действие записывается в историю месяца (Audit) как «Rebuilt from scratch».

## Техническая часть

База (миграция):
- Новая функция `payroll_rebuild_period(_period_id uuid)`, SECURITY DEFINER, `search_path = public`.
- Проверки: период существует, `status = 'draft'`, вызывающий — `has_role(auth.uid(), 'super_admin')`; иначе исключение.
- Тело: `DELETE FROM payroll_entries WHERE period_id = _period_id`, затем вызов существующей `payroll_refresh_period(_period_id)` (она пересоздаёт строки по неудалённым сотрудникам, ставкам, посещаемости, ночным часам и авансам), затем запись в `payroll_audit_log` с действием `rebuilt`.
- Возвращает json с количеством созданных строк.
- `REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;`

Фронтенд:
- `src/hooks/use-payroll.ts`: хук `useRebuildPeriod` (вызов RPC, инвалидация `payroll_entries` / `payroll_period` / `payroll_audit`).
- `src/pages/payroll/PayrollPeriodPage.tsx`: кнопка + диалог подтверждения рядом с Refresh, показывается при `isSuperAdmin && isDraft`.
- Подпись `rebuilt: "Rebuilt from scratch"` в словаре действий аудита (там же, где `reverted_to_draft`, `unlocked`).

Ничего другого не трогаем: расчёт зарплаты, налоги, авансы, утверждения и экспорт остаются как есть.
