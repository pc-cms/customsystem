# Вернуть ввод «Чаевые IN/OUT» — вкладка Tips на странице Tips & Bonuses

## Проблема
При Stage 2A вкладка Office «Tips & Bonuses» была убрана из финансовой полосы: `?tab=tips-bonuses` редиректит на `/tips-and-bonuses`. Но там нет леджера, куда вносятся чаевые IN (collected) и OUT (paid out) — компонент `TipsBonusTab.tsx` существует, но ни один роут его не рендерит. Внести чаевые сейчас невозможно.

## Решение
На странице `/tips-and-bonuses` оставить ровно 4 вкладки:
1. **Weekly Bonus**
2. **Monthly Tips**
3. **Tips** — леджер IN/OUT (бывший `TipsBonusTab`): кнопки Add Tips / Bonus (IN) и Payout (OUT), карточки итогов, таблица, редактирование/удаление.
4. **Lottery**

Вкладки Live Game Tips, Floor Tips и Club Poker Tips из меню страницы убираются.

## Шаги
1. **`src/pages/TipsAndBonuses.tsx`**
   - TAB_VALUES → `["weekly", "monthly", "tips", "lottery"]`, таб по умолчанию — `weekly`.
   - Удалить TabsTrigger/TabsContent для `live`, `floor`, `poker` и их импорты; добавить `tips` → адаптированный леджер.
   - Проверить legacy-редиректы в `App.tsx`: `/reports/poker-tips` → `?tab=poker` и `/reports/floor-tips` → `?tab=floor` больше не имеют целевой вкладки — перенаправить на `?tab=tips` (или удалить, если такие отчёты больше не нужны — уточнение ниже).
2. **`src/pages/office/TipsBonusTab.tsx`** — адаптация вне Office-контекста:
   - `useOfficePeriod()` → собственный month-picker (shadcn Select, как в Office после Stage 2B), текущий месяц по умолчанию.
   - `OfficeActions` → обычный flex-ряд кнопок IN/OUT в шапке вкладки (h-8, единый стиль).
   - Логика (хуки `useOtherIncomes`, таблица, диалоги, права) без изменений.
3. **`src/pages/office/OfficePage.tsx`** — редирект `?tab=tips-bonuses` → `/tips-and-bonuses?tab=tips`, чтобы старые ссылки попадали сразу в леджер.
4. Прогнать `src/test/access-matrix.test.ts` и остальные тесты.

## Открытый вопрос
- Убираемые вкладки (Live Game Tips, Floor Tips, Club Poker Tips) — это отчёты из кассовых данных; их самих в приложении больше не будет. Если они нужны где-то ещё — скажите, оставлю роуты.

## Что НЕ меняем
- Базу данных, RPC, RLS — записи идут в `fin_other_incomes` (source = tips/bonus) как раньше.
- Monthly Report и Wallets — механика учёта tips не трогается.
- Deploy не выполняем.

## Проверка
- `bunx tsgo --noEmit` и `npm run build` — зелёные.
- Визуально: `/tips-and-bonuses` показывает 4 вкладки; в Tips кнопка Add Tips / Bonus создаёт запись IN; старый URL `/finances?tab=tips-bonuses` ведёт на `?tab=tips`.
