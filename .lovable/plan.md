# Новые печатные отчёты касс (Style A — Clear Cards)

Заменяем печатные формы в обеих кассах на макет из PDF: 4 страницы — Slots, Live Game, Chips Movement, Total Closing. Старые макеты остаются доступными через переключатель на время обкатки.

## Что уже есть в системе (маппится напрямую)

**Slots Cash Desk (стр. 1)**
- Cards Opening / Fill / Credit / Closing / Card Difference — есть в смене слотов.
- Cash Flow Opening и Closing по валютам (TZS, USD, EUR, GBP, KES) с курсом, количеством и суммой в TZS, Total Cash, Bank, Total — есть.
- System Result, Cash Flow Fill, Cash Flow Credit, Expenses, Tips, Total Money — есть.
- Cashless по провайдерам (M-Pesa, T-Pesa, H-Pesa, Airtel): IN / OUT / NET / End Day — есть.
- Shift Balance — есть.

**Live Game (стр. 2)**
- Таблица столов: Opening / Fill / Credit / Closing / Drop / Result и строка Total — есть.
- TURNOVER = наш Drop по столу (сумма кэш-ин/кэш-аут транзакций с выбранным столом) — берём из существующего источника, ручной ввод не нужен.
- Cash Flow Opening и Closing рядом двумя блоками, Cashless, Tables Result, Fill, Credit, Expenses, Tips, Chip Difference, Total Money, Shift Balance — есть.

**Chips Movement (стр. 3)**
- Шесть блоков по номиналам (Opening, Closing, Float Fill, Float Credit, Opening Chips Difference, Chip Difference) — есть.

## Чего в данных нет — добавляем ввод и расчёт

| Поле | Где | Как реализуем |
|---|---|---|
| TAXABLE WINNINGS PAID | Slots, Closing Record | Ручной ввод суммы при закрытии смены слотов |
| JACKPOT COUNT | Slots, Closing Record | Ручной ввод количества |
| WINNINGS TAX 15% | Slots, Closing Record | Считается автоматически = 15% от Taxable Winnings Paid, ставка хранится в настройках филиала |
| ADJUSTMENT / INCIDENT REFERENCE | Обе кассы | Текстовое поле при закрытии; пусто → печатается «-» |
| REPORT ID | Все страницы | Генерируется: префикс (SCD / LCD / CHM / TCD) + дата + номер смены |
| INTERNAL CONTROLS | Все страницы | Строка-штамп статуса отчёта (Draft / Approved) по статусу смены |

## Итоговая страница (стр. 4)

Кнопка печати живёт в кассе и доступна менеджеру. Сводит обе кассы за бизнес-день:
- Блоки Slots и Live: Opening Cash, Closing Cash, Closing Bank, Cashless Net, System/Tables Result, Expenses, Tips, Total Money, Shift Balance.
- Closing Cash by Currency and Denomination: по каждой купюре количество отдельно Slots и Live и общая сумма TZS, с подытогом по валюте.
- Bank Accounts: счёт, валюта, Opening, In, Out, Closing, курс, Closing TZS + строка Total.
- Total Closing Control: Closing Cash, Closing Bank, Cashless Net, Total Money, Closing Balance.

## Технические детали

- Новые компоненты: `src/components/cage-slots/SlotsClosingReportV2.tsx`, `src/components/cage/LiveClosingReportV2.tsx`, `src/components/cage/ChipsMovementReportV2.tsx`, `src/components/cage/TotalClosingReportV2.tsx` — чистая презентация, A4 portrait 194×281 мм, печать через существующий `PrintPortal`.
- Общие примитивы карточек/таблиц выносим в `src/components/cage/report-v2/` (шапка отчёта, карточка-таблица, строка итога, блок подписей), чтобы 4 страницы были единообразны.
- Переключатель макета: настройка филиала `report_layout` (`legacy` | `v2`) в `casino_settings`; кнопки печати в `CloseShiftDialog`, `PrintSlotsShiftDialog`, `ReprintShiftDialog`, `EditReprintShiftPage` выбирают компонент по ней.
- Миграции БД: колонки `taxable_winnings`, `jackpot_count`, `adjustment_ref` в `cage_slots_shifts`; `adjustment_ref` в `shifts`; ставка налога в настройках филиала (по умолчанию 15%). Turnover/Drop по столу — без миграций, существующий источник.
- Формат чисел — пробел как разделитель разрядов, даты `DD/MM/YYYY`, весь текст отчётов на английском.
- Существующие расчёты Shift Balance, Result, Drop не трогаем — только новое отображение и новые вводимые поля.
- Поднять версию в `package.json`.
