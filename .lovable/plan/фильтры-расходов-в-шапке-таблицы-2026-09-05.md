# Фильтры расходов в шапке таблицы

## Цель
Убрать отдельный блок «Filters» на экране Expenses и встроить фильтры прямо в шапку таблицы History — каждый фильтр заменяет заголовок своей колонки.

## Текущее состояние
- `src/pages/Expenses.tsx` рисует блок фильтров отдельным `cms-panel` (строки ~437–531), а ниже — ручную `<table>` History (~строки 690–862).
- Фильтры: Source, Category, Target, Status, Search + DateRangePresets + Reset.
- Сортировка по заголовкам Date / Source / Category / Target / Amount / Status реализована вручную.

## Что меняем

### 1. Убрать отдельный блок Filters
- Удалить `cms-panel` со строкой «Filters», DateRangePresets и Reset.
- DateRangePresets и Reset перенести в строку заголовка секции History (рядом с «History · N records» и Print).
- В `officeEmbedded`-режиме DateRangePresets остаётся скрыт, Reset — доступен.

### 2. Перевести History на `SmartTable`
- Заменить ручную `<table>` History на `SmartTable` с `ColumnDef`.
- Строка New entries остаётся без изменений (она не относится к History).
- Итоговая строка (Total) реализуется через `footerRows` SmartTable.
- Действия (Approve / Edit / Cancel) переносятся в ячейку Actions колонки `actions`.

### 3. Фильтры в заголовках колонок
Каждый фильтр становится содержимым `header` своей колонки:

| Колонка | Заголовок-фильтр |
|---|---|
| Date | Текст «Date» + сортировка (фильтра по дате нет — он вынесен в строку секции) |
| Source | `Select` с источниками (скрыт/заблокирован для cashier) |
| Category | `CategoryCombobox size="sm"` |
| Target / Player | `Select`: All / Casino / Player |
| Amount | Текст «Amount» + сортировка |
| Description | `Input` placeholder «Search…» |
| Status | `Select`: All / Approved / Pending |
| Actions | Пустой заголовок или «Action» |

- Сортировка по Amount, Date, Status сохраняется через `sortValue` SmartTable.
- Для колонок с активным фильтром добавляется визуальный признак (например, обводка или цветной бейдж), чтобы было видно, что фильтр применён.

### 4. Сохранить поведение
- Все существующие состояния фильтров (`useSessionState`) остаются — сброс работает как раньше.
- `useExpenseAnalytics` продолжает получать тот же объект `filters`.
- Print view и `ExpensesDayReport` остаются без изменений.
- Bar-charges details и KPI-плитки над таблицей не трогаем.

## Технические детали
- Импорт `SmartTable` из `@/components/ui/smart-table`.
- Для `CategoryCombobox` в шапке используется `size="sm"` и `className` с ограничением высоты, чтобы не раздувать sticky-заголовок.
- `SelectTrigger` в шапке — `h-7 text-xs`, без фиксированной ширины (растягивается по колонке).
- Sticky-заголовок SmartTable остаётся работать; фильтры не должны перекрывать друг друга при горизонтальном скролле.
- Форматирование сумм, валют, статусов и ссылок на игроков переносится в `accessor`/`cell` колонок.

## Проверка
- Сборка (`tsgo` / build errors log).
- Визуальный прогон: вкладка Expenses (standalone и в Office), проверка фильтров по категории/источнику/статусу, сортировка, сброс, печать.
