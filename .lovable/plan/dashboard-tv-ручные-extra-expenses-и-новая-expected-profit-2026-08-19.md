# Dashboard TV — ручные Extra Expenses и новая Expected Profit

## Что меняем

1. **Extra Expenses становятся ручными.** Сейчас блок собирается автоматически из расходов (`expenses` по группам fixed/tax/salary/…). Эти строки убираем полностью. Вместо них — редактируемая таблица: строка = статья, колонки = казино.
2. **Инлайн-редактор.** Finance manager и super admin правят суммы прямо в ячейке (клик → ввод → сохранение по Enter/blur), могут добавлять и удалять статьи. Boss и остальные видят только цифры, без возможности правки. Введённые суммы участвуют в формулах.
3. **SAFE убираем.** Строка SAFE и строка «Total (SAFE + Balance)» уходят. Внизу остаются Expected Profit и Balance.
4. **Цифры отчёта — из Day Closings.** Table Result = `tables_result`, Slot Result = `slots_result` (он же Cash Desk Win). Live-fallback на текущий незакрытый день сохраняем.
5. **Новая формула Expected Profit** (прогноз на весь месяц):

```text
Средний дневной результат = Result MTD / кол-во прошедших дней месяца
Прогноз результата        = Средний дневной результат × кол-во дней в месяце
Expected Profit           = Прогноз результата
                            − Estimated Expenses (бюджет)
                            − Extra Expenses (ручные)
                            + Other Incomes
```

Строка Balance остаётся на фактических (не прогнозных) цифрах.

## Технические детали

- **Новая таблица** `boss_report_extras`: `id`, `casino_id`, `year`, `month`, `label`, `amount` (numeric), `sort_order`, `created_at/updated_at`, уникальность по (casino_id, year, month, label). GRANT для `authenticated`/`service_role`, RLS: чтение — super_admin / finance-роли / boss / GM; запись — только super_admin и `can_finance`.
- **`src/hooks/use-boss-monthly-report.ts`**: убрать сбор extras из `expenses` (Collection по группе `collections` остаётся), убрать выборку `fin_wallet_tx` и поле `safe`; читать extras из новой таблицы; пересчитать `expectedProfit` по формуле выше; отдать в totals `daysElapsed`, `daysInMonth`, `forecastResult`.
- **Синтетическая строка «Approx Bonus for Managers (5%)»** остаётся расчётной: `5% от max(0, Result − Estimated Expenses)`, отображается отдельной строкой внутри блока Extra Expenses, не редактируется.
- **Новый хук** `use-boss-report-extras.ts`: список + upsert/delete с инвалидацией отчёта.
- **`src/components/boss/monthly-report-panel.tsx`**: блок Extra Expenses рендерит редактируемые ячейки (права через `useAuth`/роли), кнопка «+ Add row» и удаление строки для разрешённых ролей; удалить строки SAFE и Total; подпись у Expected Profit с пояснением прогноза.
- Существующие записи не мигрируем — блок стартует пустым, суммы вносятся вручную.
