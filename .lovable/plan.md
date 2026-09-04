# Office → JP: понятные источники + отказ от кнопки Close Day

## Часть 1. Откуда «PAYOUT» −876 206 (проверено по данным)

Строка Dodoma 03/09/2026 на −876 206 — это НЕ выплата джекпота:

1. 02:55 Close Day записал JP = 1 030 831 (ручной ввод менеджера)
2. 04:00 ACE Collector сообщил фактический JP за тот же день = 154 625
3. Сверка автоматически дописала разницу −876 206 с пометкой `JP · ACE correction`, чтобы итог дня стал ровно 154 625

То есть отрицательная строка — техническая корректировка, а таблица показывает её как PAYOUT и суммирует в плитку «Payouts (OUT)». Отсюда путаница.

Колонка «Entered in» даёт четыре разные надписи (`JP TAB`, `CLOSE DAY`, `DAY CLOSINGS`, при этом ACE-строки попадают в `JP TAB`), хотя реальных источников всего два: ACE и ручной ввод.

### Что меняем (только отображение)

1. **Entered in** — два понятных источника:
   - `JP · ACE`, `JP · ACE correction`, `JP · Close Day`, `JP · Day Closings` → **ACE / Day Closing**
   - остальное → **Manual**
2. **Type** — отрицательная строка с пометкой ACE correction получает нейтральный тип **CORRECTION** вместо PAYOUT; ручная отрицательная остаётся **PAYOUT**.
3. **Плитки** — «Payouts (OUT)» считает только реальные выплаты; добавляется третья плитка **Corrections**. NET не меняется.
4. **Подсказка** на строке-корректировке: «Automatic ACE reconciliation: brings the day's JP total to the figure reported by the collector.»

## Часть 2. Убираем кнопку Close Day

ACE Collector — источник правды: он сам пишет `drop_slots`, `net_win`, `cashdesk_win`, card balance и JP в Day Closings, а сам бизнес-день закрывается автоматически (ночной авто-закрыватель + авто-закрытие по приходу отчёта). Ручной Close Day дублирует эти цифры и порождает корректировки вроде −876 206.

Убираем кнопку из всех четырёх мест, где она сейчас есть:
- Pit → Tables
- Cage → Open Shift
- Cage → Active Shift
- баннер незакрытого дня

Что остаётся без изменений:
- автоматическое закрытие дня и запись цифр из ACE;
- Office → Day Closings как место ручного исправления/дозаполнения цифр, если ACE чего-то не прислал;
- баннер незакрытого дня остаётся как информационный (без кнопки закрытия).

## Технические детали

- Часть 1: только `src/pages/office/JpTab.tsx` — маппинг источника, тип строки, расчёт плиток, tooltip.
- Часть 2: удаление рендера `CloseBusinessDayButton` в `src/pages/Tables.tsx`, `src/components/cage/OpenShiftScreen.tsx`, `src/components/cage/ActiveShiftView.tsx`, `src/components/pit/UnclosedDayBanner.tsx`. Сам компонент и RPC `close_business_day_with_figures` не удаляем — остаются на случай возврата.
- Никаких изменений в БД, в логике ACE-сверки, суммах, Wallets и Monthly Report.
- Версия поднимается после успешного typecheck/build.
