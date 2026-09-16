# Payroll: Rebuild from scratch

Удаления месяца зарплаты нет, и по вашему выбору добавляем вместо него «Rebuild from scratch»: строки месяца стираются и собираются заново, сам период сохраняется.

## Ночная надбавка — уже соответствует формуле

Проверил расчёт в базе: ночная надбавка считается как Basic Salary / Hours per month × Night hours × Night rate, а в настройках всех четырёх казино стоит Hours per month = 195 и Night rate = 5% — то есть формула уже ровно Basic Salary / 195 × 0.05 × Night hours. Менять ничего не нужно; при желании значения правятся на странице Payroll · Settings для каждого филиала.

## Что получит пользователь

На странице месяца зарплаты рядом с «Refresh» появится кнопка «Rebuild from scratch»:

- Доступна только супер-админу и только когда месяц в статусе draft (для закрытого месяца сначала Unlock / Revert to draft).
- Перед выполнением — окно подтверждения: все строки месяца будут удалены и собраны заново из данных сотрудников, ставок, посещаемости и авансов; ручные правки в строках будут потеряны.
- Сам месяц (период, описание платежа, история аудита) сохраняется.
- После выполнения — сообщение «Rebuilt: N entries» и обновлённая таблица.
- Действие записывается в историю месяца (Audit) как «Rebuilt from scratch».

## Техническая часть

База (миграция):
- Новая функция `payroll_rebuild_period(_period_id uuid)`, SECURITY DEFINER, `search_path = public`.
- Проверки: период существует, `status = 'draft'`, вызывающий — `has_role(auth.uid(), 'super_admin')`; иначе исключение.
- Тело: `DELETE FROM payroll_entries WHERE period_id = _period_id`, затем вызов существующей `payroll_refresh_period(_period_id)` (пересоздаёт строки по неудалённым сотрудникам, ставкам, посещаемости, ночным часам и авансам), затем запись в `payroll_audit_log` с действием `rebuilt`.
- Возвращает json с количеством созданных строк; `REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO authenticated`.

Фронтенд:
- `src/hooks/use-payroll.ts`: хук `useRebuildPeriod` (вызов RPC, инвалидация `payroll_entries` / `payroll_period` / `payroll_audit`).
- `src/pages/payroll/PayrollPeriodPage.tsx`: кнопка + диалог подтверждения рядом с Refresh, показывается при `isSuperAdmin && isDraft`.
- Подпись `rebuilt: "Rebuilt from scratch"` в словаре действий аудита.

Ничего другого не трогаем: расчёт зарплаты, налоги, авансы, утверждения и экспорт остаются как есть.
