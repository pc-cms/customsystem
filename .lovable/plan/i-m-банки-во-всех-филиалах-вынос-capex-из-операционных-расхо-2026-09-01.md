# I&M банки во всех филиалах + вынос CAPEX из операционных расходов

Две задачи в одном заходе: новые банковские счета I&M и корректная трактовка CAPEX в Monthly Report.

## Часть 1. I&M TZS и I&M USD

- Во **всех филиалах** (Arusha, Mwanza, Dodoma, Mbeya) добавляются два банковских кошелька: **I&M TZS** и **I&M USD**, сразу после NBC USD.
- Стартовый остаток = 0. Фактические суммы вносятся вручную через Physical Count в нужном месяце.
- Счета видны в Office → Wallets, Wallet Day Grid, Monthly Report и балансовом снапшоте — во всех месяцах, включая уже открытые: список кошельков не привязан к месяцу.
- Касса (Live / Slots закрытие смены, Shift Closing Report) не меняется: I&M не становится каналом IN/OUT для кассира.

## Часть 2. CAPEX

- CAPEX перестаёт входить в **Paid Expenses**, **Estimated Expenses** и **Budget** — он больше не операционный расход.
- CAPEX показывается **отдельной строкой внутри секции Collections / Non-Operating**, ниже операционных расходов.
- CAPEX по-прежнему уменьшает **Profit** и **Cash Position** как non-operating движение денег.
- Правило применяется ко всем месяцам, включая прошлые. Уже закрытые месяцы сохраняют свой замороженный Final Profit — их цифры не переписываются.

## Технические детали

Миграция (данные):

- `INSERT INTO public.fin_wallets` по каждому казино: `kind='bank'`, `wallet_group='banks'`, `is_active=true`, `starting_float_amount=0`, `canonical_code` = `BANK_IM_TZS` / `BANK_IM_USD`, `sort_order` 4 и 5.
- Идемпотентно через `ON CONFLICT (casino_id, name) DO NOTHING`.
- Строки в `fin_wallet_float_history` не создаются: отсутствие строки резолвер трактует как 0 для любого месяца.

CAPEX:

- Категория CAPEX помечается как non-operating (группа Collections / отдельный признак `main_code='capex'`), чтобы отчётные запросы могли её отделить.
- `use-fin-monthly-report.ts`: CAPEX исключается из Paid/Estimated Expenses и из Budget-сравнения; добавляется отдельная строка в блок Collections.
- `FinancesMonthlyReportPage.tsx`: рендер новой строки CAPEX в секции Collections с корректной подписью.
- Profit и Cash Position: CAPEX продолжает вычитаться (как Collection), формулы кэша не меняются.
- Закрытые месяцы читают frozen-снапшот, поэтому их Final Profit остаётся прежним.
- Изменений в кассовых каналах (`src/components/cage/CageHelpers.ts`) нет.

## Проверка

- Office → Wallets в каждом филиале, август и сентябрь: I&M TZS/USD видны с нулевыми Expected/Actual, Variance не меняется.
- Monthly Report: сумма Paid Expenses уменьшилась ровно на CAPEX месяца, строка CAPEX видна в Collections, Profit и Cash Position не изменились относительно текущих значений.
- Закрытые месяцы: Final Profit идентичен значению до изменений.
