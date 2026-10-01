# Miss Chips: перенос сентябрьских записей в Start Month

## Что делаем
1. Удаляем две записи в Office (другие доходы):
   - Dodoma, 02/09 — «Miss Chips August 2026», +24 052 000
   - Mbeya, 01/09 — «Miss Chips August 2026», +1 130 000
   Mbeya −1 130 000 от 31/08 (август) не трогаем. Arusha и Mwanza не трогаем, у них START сентября = 0.
2. Эти суммы становятся **Start Month сентября** в Miss Chips (только итог в TZS, по номиналам пусто).
3. Строка START на экране Miss Chips уже есть (появляется при выборе целого месяца). Сентябрь у Dodoma и Mbeya покажет START, END = START + сентябрь. Октябрьский START тоже включит эту сумму (END сентября переходит дальше).
4. Финансы сентября не меняются: вместо дохода «Miss Chips August» та же сумма войдёт через строку Miss Chips. Знак как сейчас в финансах (в Miss Chips на экране START будет −24 052 000 и −1 130 000, а в финансах +).

## Техническая часть
- Новая таблица `miss_chips_opening` (casino_id, month_start, total_tzs, note) с GRANT + RLS (чтение — у кого доступ к казино, запись — super_admin/finance).
- `miss_chips_carry`: прибавляет к сумме смен все записи `miss_chips_opening` с `month_start <= p_month_start` (пустой by_denom для них).
- Данные: вставить Dodoma −24 052 000 и Mbeya −1 130 000 на 2026-09-01; удалить две записи `fin_other_incomes` (с записью в fin_audit_log через существующий RPC удаления, если доступен).
- `MissChips.tsx`: START показывать и когда итог есть, а номиналов нет (`·` в ячейках номиналов).
- Проверка: в финансах сентября Dodoma/Mbeya Expected до и после совпадает; START сентября и октября на экране.
