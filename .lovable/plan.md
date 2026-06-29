## Reprint with edits — Live Game

Add the ability to re-print a shift's Consolidating Cash Desk Report и Chips Movement Report с возможностью править цифры локально (без сохранения в БД).

### UI

- В `src/pages/Reports.tsx` (вкладка Live Game) в каждой строке смены добавить кнопку **"Reprint (edit)"** рядом с существующей "Reprint" (`ReprintShiftDialog`).
- При клике — открывается новый диалог `EditReprintShiftDialog` с префилом всех данных смены.

### Editable preview dialog

Создать `src/components/cage/EditReprintShiftDialog.tsx`:

- Загружает ту же выборку, что и `ReprintShiftDialog` (shift, tables, expenses) + `cashless_transactions`, `tips`, `table_daily_results` для смены.
- Слева — форма редактирования, сгруппированная по блокам:
  - **Cash open/close** по валютам (TZS/USD/EUR/GBP/KES) — купюры по номиналам.
  - **Chips open/close** по номиналам + автопересчёт Miss (тот же `computeMissByDenom`).
  - **Table results** — Drop / Result по столам (override строк).
  - **Cashless In/Out**, **Expenses** (итог по категориям), **Tips**.
  - **Exchange rates** на смену.
- Справа — live-preview из `ShiftClosingReport` + `ChipMovementReport`, который перерисовывается по edited-state.
- Все правки хранятся **только в локальном `useState`**. Никаких мутаций в БД, никаких audit-записей.
- Кнопки: **Reset to original** (возвращает префил), **Print**, **Close**.

### Print pipeline

- Переиспользовать `PrintPortal` + `printLiveGameReport` из `ReprintShiftDialog.tsx` (вынести функцию в `src/components/cage/printLiveGameReport.ts`, чтобы не дублировать).
- В `<PrintPortal>` рендерим те же два отчёта, но с пропсами из edited-state (а не из исходного `shift`).

### Технические детали

- Edited-state — глубокая копия данных смены при открытии диалога; при `Reset` — пересборка из исходных props.
- `missTotal`, `resultTable`, `balance` пересчитываются на лету из изменённых значений (формулы уже есть в `ShiftClosingReport` / `computeShiftCashFlow`).
- `ChipMovementReport` уже принимает `openingChips`/`closingChips`/`missPerDenom` пропсами — изменения подхватятся автоматически.
- Никаких изменений БД, схемы, RLS, миграций.

### Файлы

- new: `src/components/cage/EditReprintShiftDialog.tsx`
- new: `src/components/cage/printLiveGameReport.ts` (вынос existing функции)
- edit: `src/components/cage/ReprintShiftDialog.tsx` — импорт вынесенной функции
- edit: `src/pages/Reports.tsx` — добавить вторую кнопку в Live Game-таблице и состояние для нового диалога

### Out of scope

- Сохранение правок в БД (отдельный аудит-flow на будущее, по флагу из вопроса).
- Сводный отчёт за весь бизнес-день — пока только конкретная смена.
