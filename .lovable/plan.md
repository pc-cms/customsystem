
## Цель
В разделе **Finances → Budget → Actual** (`FinancesBudgetVsActualPage.tsx`) перестроить таблицу так, чтобы по каждой категории расходов было видно отклонение **раздельно по TZS и USD** + сводный **Grand TZS** (TZS + USD×rate). Период — **выбранный месяц** и **YTD**. Variance подсвечивается цветом + процент.

## Структура страницы

**Шапка** (без изменений + добавить):
- `FinanceCasinoSwitcher`, `YearSelect`, **`MonthSelect` (Jan…Dec)**, кнопка XLSX.
- Бейдж «N overruns» — по выбранному месяцу, считается по Grand TZS.

**Таблица** (sticky thead, sticky left col, horizontal scroll):

```text
| Category | ──── MONTH (Sep 2026) ────────────── | ──── YTD (Jan–Sep) ─────────────── |
|          | Plan TZS | Act TZS | Var TZS | %    | Plan TZS | Act TZS | Var TZS | %  |
|          | Plan USD | Act USD | Var USD | %    | Plan USD | Act USD | Var USD | %  |
|          | Grand TZS Plan | Grand TZS Act | Var | %                                 |
```

Реализация: 2 группы колонок (Month / YTD), каждая с под-блоками:
1. **TZS**: Plan · Actual · Variance · %
2. **USD**: Plan · Actual · Variance · %
3. **Grand TZS**: Plan · Actual · Variance · %

Итого 24 числовые колонки + Category. Sticky левая колонка, monospaced, ширина числовой ячейки ~95 px (под `999 000 000`).

**Строки**:
- Группировка по `fin_categories.group_name` (Fixed / Tax / Variable / …) — sticky group header + subtotal по группе.
- Subtotal-строка повторяет ту же раскладку (Plan/Actual/Var/% × TZS/USD/Grand).
- Финальная sticky-строка **Grand Total** внизу.

**Подсветка Variance**:
- `Actual > Plan` → класс `cms-amount-negative` (перерасход, красный)
- `Actual < Plan` → класс `cms-amount-positive` (экономия, зелёный)
- `Plan == 0 && Actual > 0` → красный без процента (показываем `—`)
- `Plan > 0 && Actual == 0` → зелёный, `−100%`
- Колонка `%` = `(Actual − Plan) / Plan × 100`, формат `+12%` / `−8%`, monospaced.

## Источники данных

- **Plan**: `useFinBudget(year)` — уже возвращает `{ category_id, month, currency: 'TZS'|'USD', planned_amount }`. Агрегируем `planned[catId][month][ccy]`.
- **Actual**: `useFinExpenses({ from: year-01-01, to: year-12-31 })` — у каждой строки `currency`, `amount` (native), `amount_tzs`. Агрегируем:
  - `actual[catId][month].TZS` — сумма `amount` где `currency='TZS'`
  - `actual[catId][month].USD` — сумма `amount` где `currency='USD'`
- **Rate** для Grand TZS — `useFinDailyRatesForDate(today)` (как в Monthly Report). USD-суммы переводятся в TZS через текущий rate.
- **Grand TZS** = `TZS + USD * rate` (и для Plan, и для Actual, и для Variance).

## Маршрут

- Оставить вкладку `Actual` внутри `FinancesBudgetHubPage`.
- Добавить алиас `/finances/variance` → `Navigate` на `/finances/budget?tab=actual` (чтобы соответствовать ответу пользователя «Отдельная страница /finances/variance»).

## Drill-down

Сохранить существующий: клик по ячейке Actual открывает Dialog со списком транзакций за месяц/категорию. Добавить фильтр по валюте, если клик был по TZS- или USD-ячейке.

## XLSX-экспорт

Расширить структуру столбцов до новой раскладки (Month TZS/USD/Grand + YTD TZS/USD/Grand, каждая по Plan/Actual/Var/%). Имя файла `budget-vs-actual-${year}-${month}.xlsx`.

## Файлы

- `src/pages/finances/FinancesBudgetVsActualPage.tsx` — полная переработка таблицы и экспорта.
- `src/App.tsx` — добавить редирект `/finances/variance` → `/finances/budget?tab=actual`.

## Не трогаем

- Схему БД (`fin_budget`, `expenses`) — все нужные поля уже есть.
- `useFinBudget`, `useFinExpenses`, `useUpsertFinBudget`.
- `FinancesBudgetPage` (spreadsheet) и `FinancesMonthlyReportPage`.
- Bump версии не требуется (frontend-only).
