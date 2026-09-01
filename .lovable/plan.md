# Новые банковские счета I&M TZS и I&M USD (Arusha)

Добавляем два офисных банковских кошелька в филиал Arusha, по образцу существующих CRDB / NBC, с нулевым стартовым остатком.

## Что появится

- **I&M TZS** и **I&M USD** в группе Banks (Arusha), сразу после NBC USD.
- Оба счёта видны в Office → Wallets, в Wallet Day Grid, в Monthly Report и в балансовом снапшоте — во всех месяцах, включая уже открытый август и сентябрь, так как список кошельков не привязан к месяцу.
- Стартовый флот = 0. Фактические остатки вносятся вручную через Physical Count в нужном месяце.
- Касса (Live / Slots закрытие смены, Shift Closing Report) не меняется: I&M не становится каналом IN/OUT для кассира, как об этом договорились.

## Технические детали

Одна миграция (данные + структура не меняются, только новые строки в `fin_wallets`):

- `INSERT INTO public.fin_wallets` для casino Arusha (`48f4404f-…`):
  - `I&M TZS` — `kind='bank'`, `currency='TZS'`, `wallet_group='banks'`, `canonical_code='BANK_IM_TZS'`, `sort_order=4`, `is_office=false`, `starting_float_amount=0`.
  - `I&M USD` — то же, `currency='USD'`, `canonical_code='BANK_IM_USD'`, `sort_order=5`.
- Вставка идемпотентная (`ON CONFLICT (casino_id, name) DO NOTHING`), чтобы повтор не создавал дубли.
- Записи в `fin_wallet_float_history` не создаются: стартовый остаток нулевой, и resolver корректно трактует отсутствие строки как 0 для любого месяца.
- Изменений в коде фронтенда не требуется — списки кошельков строятся из `fin_wallets` динамически. Хардкод есть только в кассовых каналах (`src/components/cage/CageHelpers.ts`), а их мы намеренно не трогаем.

## Проверка

Открыть Office → Wallets в Arusha, переключиться на август и сентябрь: I&M TZS и I&M USD видны с нулевыми Expected/Actual, Variance не меняется. В остальных филиалах новых счетов нет.
