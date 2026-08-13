# Close Day: компактный диалог + починка доступов

## Что не так сейчас (проверено по коду и БД)

**Диалог слишком длинный.** `CloseBusinessDayButton.tsx` рендерит в одну колонку шириной 560px: чек-лист из 5 условий, 5 полей ввода, строку Table Result, поле Notes, 4 пункта пояснений, предупреждение про пароль и строку "Last closure". Кнопки Cancel/Continue лежат внутри прокручиваемой области, поэтому на ноутбуке до них нужно доскроллить.

**Права не сходятся между тремя слоями:**

| Слой | Кто пропущен/лишний |
|---|---|
| Кнопка в UI (`canSee`) | видна ролям cashier, cashier_slots, finance_manager |
| Пароль менеджера (edge `verify-manager`) | manager, shift_manager, general_manager, super_admin, finance_manager |
| Функция БД `close_business_day_with_figures` | требует `manage.ops` (manager, shift_manager, general_manager, super_admin) **или** роль pit |

Итог: кассир, cashier_slots и finance_manager видят кнопку, заполняют форму, вводят пароль менеджера — и получают ошибку «Insufficient privileges to close business day» от базы, потому что проверка идёт по роли **вошедшего пользователя**, а не по роли подтвердившего менеджера. Роль pit при этом закрывать день может.

**RFID-подтверждение работает не для всех.** В `ManagerOverrideDialog` RFID-ветка принимает только `manager` и `shift_manager` — general_manager и super_admin по карте получают отказ, хотя паролем проходят.

**Текст в диалоге устарел:** написано «автозакрытие в 11:00», по факту cron-задания идут в 08:00 и 08:05 по Дар-эс-Саламу.

## Что сделаю

### 1. Компактный диалог
- Ширина `table` (880px) вместо `md`, две колонки на десктопе: слева условия + Table Result + Last closure, справа поля цифр.
- Чек-лист сворачивается в одну строку-статус «Conditions 5/5 OK» с раскрытием при провале (при ошибке автоматически раскрыт).
- Поля Drop Slots / Net Win / CashDesk Win / Client Balance / JP — в сетку 2 колонки, подписи-подсказки («→ Statistics · Slots») переезжают в tooltip вместо отдельных строк.
- Notes и пояснительный список — в компактный сворачиваемый блок; вместо 4 пунктов оставлю одну строку и раскрывающееся «Details».
- Футер закрепляю снизу (sticky), прокручивается только контент. На мобильном остаётся drawer.
- Поля цифр перевожу на общий `NumberInput` (разделение пробелами — правило проекта).

### 2. Единые правила доступа
- Показывать кнопку ровно тем, кто реально может закрыть день: manager, shift_manager, general_manager, super_admin, pit. Убираю cashier, cashier_slots, finance_manager.
- В edge-функции `verify-manager` для действия закрытия дня оставляю тот же набор ролей — уберу finance_manager из подтверждающих именно для этого сценария (передам тип действия), чтобы подтверждение не приводило к отказу базы.
- RFID-ветку в `ManagerOverrideDialog` расширяю до manager, shift_manager, general_manager, super_admin — как в парольной.
- Ошибку из БД показываю в toast явным текстом (сейчас теряется в общем catch).

### 3. Тексты и проверка флоу
- Заменяю «automatic close runs at 11:00 AM» на фактические 08:00 EAT.
- Проверю сквозной сценарий Playwright'ом на превью: открытие диалога, состояние условий, блокировка Continue, подтверждение и запись в Day Closings.

## Технические детали
- Правки: `src/components/pit/CloseBusinessDayButton.tsx`, `src/components/ManagerOverrideDialog.tsx`, `supabase/functions/verify-manager/index.ts`.
- Изменения схемы БД не требуются: `close_business_day_with_figures` уже проверяет `manage.ops` или pit — UI подгоняю под неё, а не наоборот.
- Точки размещения кнопки (Tables, Cage OpenShift/ActiveShift) не меняются.
