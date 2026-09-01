# Вернуть ввод «Чаевые IN/OUT» — леджер Tips & Bonuses

## Проблема
При Stage 2A вкладка Office «Tips & Bonuses» была убрана из финансовой полосы: `?tab=tips-bonuses` редиректит на `/tips-and-bonuses`. Но на Management-странице Tips & Bonuses есть только отчётные вкладки (Weekly Bonus, Monthly Tips, Live Game Tips, Floor Tips, Club Poker Tips, Lottery) — самого леджера, куда вносятся чаевые IN (collected) и OUT (paid out), там нет. Компонент `TipsBonusTab.tsx` существует в коде, но ни один роут его не рендерит — мёртвый код. Внести чаевые сейчас невозможно.

## Решение
Добавить на страницу `/tips-and-bonuses` новую вкладку **«Tips Ledger»** (первой в списке), которая рендерит существующий `TipsBonusTab` — леджер с кнопками Add Tips / Bonus (IN) и Payout (OUT), карточками итогов и таблицей записей.

## Шаги
1. **`src/pages/TipsAndBonuses.tsx`**
   - Добавить таб `ledger` (значение по умолчанию) с иконкой, label «Tips Ledger».
   - Рендерить адаптированный компонент леджера.
   - Диплинки `?tab=ledger` работают через существующий механизм TAB_VALUES.
2. **`src/pages/office/TipsBonusTab.tsx`** — адаптация для работы вне Office-контекста:
   - Заменить `useOfficePeriod()` на собственный month-picker (тот же shadcn Select-паттерн, что в Office после Stage 2B) — текущий месяц по умолчанию, окно business dates.
   - `OfficeActions` → обычный flex-ряд кнопок (IN/OUT) в шапке вкладки, стили h-8 как везде.
   - Сам леджер (хуки `useOtherIncomes`, таблица, диалоги, права) не трогаем.
3. **`src/pages/office/OfficePage.tsx`** — редирект `?tab=tips-bonuses` меняем на `/tips-and-bonuses?tab=ledger`, чтобы старые ссылки попадали сразу в леджер.
4. **Тест доступа**: добавить/проверить вкладку в `access-matrix.test.ts` не требуется (роут тот же), но прогнать существующие тесты.

## Что НЕ меняем
- Базу данных, RPC, RLS — записи идут в `fin_other_incomes` (source = tips/bonus) как раньше.
- Отчётные вкладки (Weekly Bonus, Monthly Tips, Live/Floor/Poker Tips, Lottery) — без изменений.
- Monthly Report и Wallets — механика учёта tips не трогается.

## Проверка
- `bunx tsgo --noEmit` и `npm run build` — зелёные.
- Визуально: `/tips-and-bonuses` открывается на Tips Ledger; кнопка Add Tips / Bonus создаёт запись IN; старый URL `/finances?tab=tips-bonuses` ведёт в новую вкладку.
- Deploy не выполняем.
