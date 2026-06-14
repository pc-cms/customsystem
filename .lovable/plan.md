## Two fixes

### 1. Expenses — фильтр Category переключаем на `fin_categories`
**Проблема**: На `/expenses` дропдаун Category до сих пор показывает старый хардкод `Food / Alcohol / Taxi / Hotel / Flight / Other / POS Comp / Bar charge` и фильтрует по `category_code`. Но все новые расходы пишутся с `category_code='other'` (категория теперь в `fin_category_id`), поэтому выбор любой категории = «0 строк», и UI выглядит как до рефакторинга.

**Правки**:
- `src/hooks/use-expenses-analytics.ts` — добавить в `ExpenseFilters` поле `finCategoryIds?: string[]` и фильтр `e.fin_category_id ∈ set`. Включить ключ в `useMemo` deps.
- `src/pages/Expenses.tsx`:
  - State: заменить `category: string("all")` на `finCategoryFilter: string("")` (sessionStorage ключ `finCategoryFilter`).
  - Дропдаун `<Select>` Category (строки 440-453) → `CategoryCombobox` с кнопкой `×` справа для сброса в `""` (=All).
  - `filters` memo: убрать `categories`, передавать `finCategoryIds: finCategoryFilter ? [finCategoryFilter] : undefined`.
  - `resetFilters` и KPI «Total» click handler: `setFinCategoryFilter("")` вместо `setCategory("all")`.
  - Удалить неиспользуемый `FALLBACK_CATS`.

### 2. Player Statistics — ZONE + BET: заменить заливку на тонкую рамку
**Файл**: `src/lib/zone-colors.ts` — `ZONE_CELL_CLASSES` сейчас даёт сплошной фон (`bg-amber-500/25` и т.д.). Меняем на `ring-1 ring-inset ring-<color>/60` + цветной текст. Заливка исчезает, цветовая связка Zone↔Bet сохраняется тонким бордером.

## Не трогаем
- `ZONE_CHIP_CLASSES` (это маленькие чипы в пикере — остаются с заливкой, иначе нечитаемо).
- `category_code='other'` остаётся для legacy NOT NULL.
- `expense_categories` таблица, Admin `ExpenseCategoriesSettings`, EditExpenseDialog, MonthlyReport — без изменений.
- БД, миграции, RPC, edge functions, package.json version (чисто UI).

## Файлы
- `src/lib/zone-colors.ts`
- `src/hooks/use-expenses-analytics.ts`
- `src/pages/Expenses.tsx`
