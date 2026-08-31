# Одна кнопка вместо трёх в Office → Transactions

## Что делаем
Во вкладке **Office → Transactions** (`src/pages/office/OtherIncomesTab.tsx`) сейчас три кнопки — `Adjust Float`, `Fee`, `Add Commission`. Все три открывают один и тот же диалог, отличаясь только предустановленным значением поля **Source**.

Заменяем их на одну кнопку:

- **Add Transaction** (primary, с иконкой `+`) — открывает тот же диалог.
- В диалоге поле **Source** остаётся полностью редактируемым (Adjust Float / Fee / Commission и т.д.), по умолчанию — `Commission`, как сейчас у главной кнопки.
- Заголовок диалога при создании меняем на нейтральный **"Add Transaction"** (сейчас всегда "Add Commission"), при редактировании — **"Edit Transaction"**.

## Технические детали
- Файл: `src/pages/office/OtherIncomesTab.tsx`.
- Блок `OfficeActions` (строки ~259–271): три `<Button>` заменяются на один `<Button onClick={() => openAdd()}>+ Add Transaction</Button>`.
- `openAdd()` уже принимает source по умолчанию `"commission"` — логика не меняется.
- Заголовок `ResponsiveDialog`: `editId ? "Edit Transaction" : "Add Transaction"`.
- Никаких изменений в данных, RPC, RLS или формулах — чисто UI.

## Проверка
- Сборка без ошибок, визуально: одна кнопка, диалог открывается с выбором Source.
