
## Цель
- Никаких вложенных подвкладок в Office.
- Все подвкладки Budget выносим на верхний уровень Office.
- Все верхние вкладки Office упорядочены **по алфавиту**.
- Раздел **Finances** удаляем полностью (роуты + меню + все внутренние ссылки).
- **Company Report** — только в Boss TV.

## Office (`src/pages/office/OfficePage.tsx`)

Плоский список вкладок, строго по алфавиту:

`Actual · Balance · Budget · Day Closings · Difference · Money Change · Monthly Report · Other Incomes · Rates · Wallets`

Никакого `OfficeBudgetHub`, никаких `sub`-параметров. Один `?tab=…`.

Маппинг вкладка → содержимое (переиспользуем существующие страницы `src/pages/finances/*`, ничего не копируем):

| tab | компонент |
|---|---|
| `actual` | `FinancesBudgetVsActualPage` |
| `balance` | `BalanceTab` |
| `budget` | `FinancesBudgetPage` |
| `day-closings` | `DayClosingsTab` |
| `difference` | `FinancesBudgetDifferencePage` |
| `money-change` | `FinancesMoneyChangePage` |
| `monthly-report` | `FinancesMonthlyReportPage` |
| `other-incomes` | `OtherIncomesTab` |
| `rates` | `RatesTab` |
| `wallets` | `FinancesWalletsPage` |

`DEFAULT_TAB = "balance"`. Всё lazy через `Suspense`, как сейчас. `TabsList` — `flex-wrap`.

Файл `FinancesBudgetHubPage.tsx` больше не используется (удалять не обязательно, но и не монтируем).

## Boss TV
- В `src/pages/BossDashboard.tsx` режим/бейдж переименовать: `Monthly Report` → **Company Report**.
- В `src/components/boss/monthly-report-panel.tsx` — заголовки/лейблы: **Company Report**. Файл и экспорт можно не переименовывать, только тексты.
- Панель нигде вне Boss TV не монтируется.

## Жёсткое удаление Finances
- `src/App.tsx` — удалить все `<Route path="/finances/*">` и связанные lazy-импорты.
- Сайдбар — удалить группу Finances целиком.
- `src/lib/route-module-map.ts` — удалить ветки `/finances/*`.
- Файлы `src/pages/finances/*` остаются на диске — их монтирует Office.

## Все внутренние ссылки на `/finances/*` — удалить
Прогон `rg "/finances/"` по `src/`. В каждом найденном месте (кнопки, `Link`, пункты меню, быстрые действия, `navigate("/finances/...")` в обработчиках, включая дашборды/баннеры/мобильные Drawer) — **удалить сам элемент навигации целиком**, не заменять на `/office?...`. Причина: у менеджеров не должно оставаться ссылок, ведущих в удалённый раздел, чтобы избежать 404 и путаницы.

Единственная точка входа во всё бюджетно-финансовое — вкладки Office.

## Доступ
Как договаривались: Boss / Super Admin / Admin / Manager / Accountant видят Office и все его вкладки. Меняем только фильтр модулей в сайдбаре; миграций нет.

## Файлы
- `src/pages/office/OfficePage.tsx` — новый плоский `TABS` (алфавит) + маппинг.
- `src/pages/BossDashboard.tsx` — переименование UI (Company Report).
- `src/components/boss/monthly-report-panel.tsx` — заголовки Company Report.
- `src/App.tsx` — снять роуты `/finances/*`.
- `src/lib/route-module-map.ts` — снять маппинги `/finances/*`.
- Сайдбар — снять группу Finances.
- Точечные правки по результатам `rg "/finances/"` — удаляем элементы навигации.

БД не трогаем.

## Приёмка
- В Office ровно эти вкладки, в этом порядке: **Actual, Balance, Budget, Day Closings, Difference, Money Change, Monthly Report, Other Incomes, Rates, Wallets**. Ни одной вложенной вкладки внутри.
- Boss TV: режим/подпись — **Company Report**. Панель больше нигде не появляется.
- В сайдбаре нет группы Finances.
- Ни у одной роли (включая менеджеров) нет кнопок/линков, ведущих на `/finances/*`.
- Любой URL `/finances/*` → 404.
- `rg "/finances/"` по `src/` — только строки/комментарии, никаких активных `to=`/`href=`/`navigate(...)`.
