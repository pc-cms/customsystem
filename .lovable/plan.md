# Единое форматирование чисел + починка Cage Casino

## 1. Cage Casino = 0 при 10 млн в кошельках

Причина подтверждена: в Аруше деньги лежат в кошельках **Safe Live (9 000 000)** и **Safe Slots (1 000 000)** с типом `safe`, а Casino Monthly Balance складывает в Cage Casino только типы `cage_table` / `cage_slot`, которых в базе нет ни в одном казино. Отсюда 0.

Что делаем:
- Тип `safe` добавляется в состав Cage Casino (наравне с `cage_table` / `cage_slot`). Двойного счёта не будет: `safe` уже исключён из офисной группы.
- Cage Casino начинает показывать 10 000 000 для Аруши и 6 000 000 для Мванзы (Safe Live + Safe Slots), Мбея — по своим кошелькам.
- Drill-down по ячейке Cage Casino покажет список этих кошельков с суммами.

**Cage Manager** (для ясности, состав не меняется) — это офисные кошельки:
- `cash`: Safe TZS, Safe USD, Safe EUR, Safe GBP, Safe KES (валютные пересчитаны в TZS);
- `mobile_money`: M PESA, Tigo, Airtel, Halo, Main Phone;
- любые кошельки-резервы (`*_reserve`).
Банковские кошельки (`bank`) идут отдельными колонками Bank TZS / Bank USD.

## 2. Разделение по пробелу: ВСЕ поля ввода и вывода

Правило: `1 000 000` — пробел как разделитель тысяч, везде, включая ввод.

### Ввод
- Создаётся общий компонент `NumberInput` (`src/components/ui/number-input.tsx`): визуально `text` + `inputMode="numeric"`, форматирует по мере ввода (`1 000 000`), парсит обратно в число, поддерживает отрицательные значения, дробную часть (копейки) там, где она уже есть, стрелки вверх/вниз, Enter/Escape, вставку из буфера с любыми разделителями.
- Все числовые поля проекта (~105 `input type="number"`) переводятся на этот компонент — включая количества и счётчики купюр, как выбрано: Finance (Wallets, Expenses, Day Closing, Money Change, Other Incomes, JP), Office/Company отчёты, Cage и Cage Slots (в т.ч. `CashDenomInput`), Reports/Statistics (inline-редактирование), Tips, Payroll, Incidents, POS, Admin/Promo/Shop/Lottery, StaffMaster.
- Серые подсказки прошлых значений (placeholders) тоже форматируются с пробелами.

### Вывод
- Единый форматтер `formatNumberSpaces` / `formatMoneyFull` становится обязательным. Убираются локальные варианты:
  - `toLocaleString("fr-FR")` (даёт узкий неразрывный пробел, не обычный) — ~15 файлов Admin/Promo/Reports;
  - `toLocaleString()` без локали (запятые!) — Player Profile, Player Visits Breakdown, Floor Table Card, Sync Mirror Panel, Chip Color Settings, Server Identity;
  - локальные `fmt`-хелперы в отчётах заменяются импортом общего.
- Отдельно проверяются печатные формы и PDF-бланки (`src/lib/blanks/*`) и Excel-экспорт — там формат тоже приводится к пробелу.

## Технические детали
- `src/hooks/use-daily-balance-report.ts`: `CASINO_CAGE_KINDS` дополняется `"safe"`; описание в `src/lib/monthly-balance-formulas.ts` обновляется.
- Новый `NumberInput` инкапсулирует parse/format, чтобы правило больше не расползалось по компонентам.
- Проход по файлам делается пакетно, с проверкой типов после каждого блока правок.
- Версия приложения повышается.
