# Единая шапка раздела Office

## Проблема

Сейчас каждая вкладка Office рисует свою шапку: свой заголовок с иконкой, поясняющий текст, свой селектор казино и свой набор контролов периода. В итоге:

- JP и Other Incomes — кнопки Day / Week / Month / Year / Custom + стрелки;
- Day Closings — поле `type=month` со стрелками;
- Wallets — карусель месяцев;
- Monthly Report / Planned vs Actual — отдельные Select месяца и года;
- Rates / Money Change / Budget — вообще без периода.

Шапка «прыгает» при переключении вкладок, занимает две-три строки, а понять, где ты находишься, тяжело.

## Что делаем

### 1. Одна общая панель Office

Вверху раздела остаётся одна закреплённая строка:

```text
[ Balance banner ]
[ Wallets  Day Closings  JP  Other Incomes  … ]        [ ‹  August 2026  › ]  [действия вкладки]
```

- Активная вкладка выделяется явно (заливка + акцентная подчёркивающая полоса), чтобы сразу было видно, где находишься.
- Правый край — слот для кнопок конкретной вкладки (Add, Export, Close Month и т.п.).

### 1a. Убираем селектор казино полностью

Кнопка выбора казино убирается везде, у всех ролей. Данные всегда берутся по домену, на котором открыто приложение. Для домена premier позже будет отдельный интерфейс — сейчас он просто не показывает переключатель.


### 1b. Budget — отдельный раздел в сайдбаре

Вкладки **Actual**, **Budget**, **Difference** уходят из Office и становятся собственным разделом:

- в левом меню, в группе **FINANCE**, появляется пункт **Budget** (рядом с Office);
- внутри страницы — три вкладки: Actual · Budget · Difference, с той же общей панелью и выбором периода;
- из панели Office эти три вкладки убираются, там остаются Day Closings, JP, Money Change, Monthly Report, Other Incomes, Rates, Wallets.

Доступ к разделу — те же роли, что сейчас видят эти вкладки в Office (super_admin, manager, finance_manager, shift_manager).


### 2. Единый выбор периода: месяц по умолчанию

Вместо пяти кнопок — компактный выбор периода:

- стрелки «‹ ›» переключают месяц назад/вперёд;
- по клику на название месяца открывается дропдаун: список месяцев, год и пункт **Custom** (две даты From / To);
- по умолчанию всегда текущий месяц; выбор запоминается при переключении вкладок в рамках сессии.

Вкладки без периода (Rates, Money Change, Budget) просто не показывают этот контрол.

### 3. Убираем пояснительные тексты

Подзаголовки-описания («Jackpot ledger · contributions (IN)…», «Manual entry per business day…» и т.п.) убираются со всех вкладок Office. Название вкладки в панели — единственный заголовок. Внутренние заголовки-иконки страниц в разделе Office убираются, чтобы не было двух заголовков подряд.

## Технические детали

- Новый контекст `OfficePeriodContext` в `src/pages/office/OfficePage.tsx`: хранит `{ mode: "month" | "custom", year, month, from, to }`, синхронизирован с query-параметрами URL и `useSessionState`.
- Новый компонент `src/components/office/PeriodPicker.tsx`: стрелки + кнопка-дропдаун (Popover со списком месяцев, `YearSelect` и режимом Custom с `Calendar`). Существующий `DateRangePresets` остаётся для других разделов приложения и не трогается.
- Новый компонент `src/components/office/OfficeToolbar.tsx`: табы (`Tabs`/`TabsList` с усиленным активным состоянием), `PeriodPicker`, слот действий (через небольшой портал-слот, чтобы вкладка могла отрендерить свои кнопки в общую панель).
- `FinanceCasinoSwitcher` перестаёт рендериться: компонент возвращает `null` (заглушка на будущий premier-интерфейс), а его использования удаляются из `RatesTab`, `DayClosingsTab`, `OtherIncomesTab`, `JpTab`, `FinancesWalletsPage`, `FinancesOfficeSafePage`, `FinancesMoneyChangePage`, `FinancesInterCasinoPage`, `FinancesExpensesPage`, `FinancesDayClosingPage`, `FinancesDashboardPage`, `FinancesBudgetVsActualPage`, `FinancesBudgetPage`, `FinancesBudgetDifferencePage`, `FinancesAuditLogPage`. Данные скоупятся по казино текущего домена, как и раньше.

- Вкладки правятся точечно: удаляется `PageHeader` (или остаётся без `subtitle` и без контролов), локальные состояния периода заменяются на `useOfficePeriod()`; кнопки действий переезжают в общий слот. Затрагиваются: `DayClosingsTab`, `JpTab`, `OtherIncomesTab`, `RatesTab`, `FinancesWalletsPage`, `FinancesMonthlyReportPage`, `FinancesBudgetVsActualPage`, `FinancesBudgetPage`, `FinancesBudgetDifferencePage`, `FinancesMoneyChangePage`.
- Страницы Finances, которые открываются и вне Office, продолжают работать автономно: при отсутствии контекста используют собственное состояние периода (fallback).
- Панель делается `sticky` под баннером баланса, с горизонтальным скроллом табов на узких экранах.
- Новый роут `/budget` (`src/pages/budget/BudgetPage.tsx`) с табами `actual | budget | difference`, использующий тот же toolbar и контекст периода; в `src/App.tsx` добавляется `Route path="/budget"` под `RoleGuard`, в `src/components/layout/AppSidebar.tsx` — пункт `{ to: "/budget", label: "Budget", section: "FINANCE" }`. Из `OFFICE_TABS` в `OfficePage.tsx` удаляются `actual`, `budget`, `difference`; при заходе на `/office?tab=budget` — редирект на `/budget`.
- Версия приложения поднимается в `package.json`.
