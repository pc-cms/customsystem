# Reports: перестройка вкладок

## Что меняется

### 1. Вкладки
- Удаляются: **Live Game**, **Shifts**, **Players**, **Expenses**.
- **Cashless** убирается из Reports (страница уже есть в левом меню — пункт Cashless).
- **Daily Balance** переименовывается в **Live Game** и становится первой вкладкой.
- Остаются: Live Game (бывш. Daily Balance), Total, Slots, Tables, Groups, Miss Chips.

### 2. Live Game (бывший Daily Balance)
- В колонку **Closed** выводится только время закрытия смены (HH:mm) по этому бизнес-дню.
- Переносятся кнопки **Print** и **Edit&Print** (как были в старой вкладке Live Game) в колонку действий по каждой строке; строка привязывается к закрытой смене дня.
- Плитки: Days · **AVG Drop** (новая, сразу после Days) · Drop · Table Result · Hold %.
- Таблица и тоталы внизу — без изменений.

### 3. Slots
- Колонка Status убирается. Итоговый набор колонок:
  `Business Day / Closed / Drop / Net Win / Cashdesk / Client Balance / Card Miss / Balance / Print`
- Источники: Drop = ручное поле смены слотов, Net Win = ручное поле, Client Balance = ручное поле (депозиты клиентов), Cashdesk = cash_desk_result, Card Miss = cards_miss, Balance = balance.
- Drop / Net Win / Client Balance — редактируемые прямо в ячейке (как сейчас Drop Slots во вкладке Total), права как у Drop Slots (super_admin / manager / shift_manager / finance_manager).
- Дизайн — как в Live Game: те же стили таблицы + строка **TOTAL** внизу.
- Плитки: `Shifts / AVG Drop / DROP / Net Win / HOLD` (Hold = Net Win / Drop).

### 4. Total
- Колонки: `Drop Table / Result Table / Hold / Drop Slots / Result Slots / Hold / Total Result` (колонка Expenses убирается).
- Плитки за период: Drop Table / Result Table / Hold / Drop Slots / Result Slots / Hold / Total Result / Total Hold.
- Строка TOTAL внизу таблицы в том же стиле.

### 5. Tables Report
- Из таблицы убираются все Drop-значения и Hold% (остаются только результаты столов).
- Добавляются колонки **Club Poker** — результат стола Club Poker из закрытия смены, выделенные отдельным цветом (акцентная группа).
- Экспорт в Excel приводится в соответствие с новым набором колонок.

### 6. Miss Chips
- Липкая шапка таблицы и липкая строка тоталов (MONTH SUM) при прокрутке.
- Данные до 01/05/2026 очищаются: в 2 найденных сменах (апрель 2026, суммарно −5 220 930 000) обнуляются `chip_miss_by_denom` и `chip_miss_total`; остальные данные смен не трогаются.

## Технические детали
- Файлы: `src/pages/Reports.tsx` (вкладки, Live Game, Total), `src/components/reports/SlotsHistoryReport.tsx`, `src/pages/TableResults.tsx`, `src/pages/MissChips.tsx`.
- Миграция: в `cage_slots_shifts` добавляются `manual_slots_result` и `manual_slots_deposits` (numeric, default 0) — под ручные Net Win и Client Balance; правки через существующие политики записи слотовых смен.
- Отдельная правка данных: обнуление miss chips в апрельских сменах.
- Удаляемые вкладки: неиспользуемые компоненты `ShiftReport`, `PlayerReport`, а также импорты Expenses/CashlessReport удаляются из Reports.tsx.
- Версия приложения повышается.
