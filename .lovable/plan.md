## Что меняем

В печатном отчёте **Live Game Cash Desk Report** (`src/components/cage/ShiftClosingReport.tsx`) в блоке нижней сводки «Cash Desk / Cash Flow» сейчас три строки-суммы:

- `+ Cashless IN` — общая сумма всех провайдеров
- `− Cashless OUT` — общая сумма всех провайдеров
- `NET Cashless` — разница

Пользователь хочет вместо этого разбивку по провайдерам (MPesa / TPesa / HPesa / Airtel) с их IN, OUT и NET.

## План

### 1. Заменить строки Cashless в левой колонке нижней таблицы (`ShiftClosingReport.tsx`, ~стр. 696–737)

Раскрыть три строки-суммы в **набор строк по провайдерам**, сохраняя структуру таблицы (два столбца слева: подпись + значение; правые столбцы Miss Chips / Cash Desk Chips / Tips не трогаем — они рендерятся в тех же tr справа).

Формат (в порядке `PROV` из блока «Cash Less Shift Transactions»):

```
+ Cashless IN · M Pesa       5 840 000
+ Cashless IN · T Pesa       1 250 000
+ Cashless IN · H Pesa               —
+ Cashless IN · Airtel Money   820 000
− Cashless OUT · M Pesa              —
− Cashless OUT · T Pesa              —
− Cashless OUT · H Pesa              —
− Cashless OUT · Airtel Money        —
NET Cashless                +7 910 000   (жирным, итог)
```

Пустые (нулевые) строки провайдеров можно скрывать, чтобы не раздувать чек: показываем только те, где IN > 0 (для блока IN) и где OUT > 0 (для блока OUT). Итоговый `NET Cashless` остаётся всегда.

### 2. Сохранить парность с правой колонкой

Правая половина нижней таблицы (Tips / Miss Chips / Cash Desk Chips FILL/CREDIT / Shift Balance) не должна разъехаться: балансируем количество `<tr>` слева и справа. Если строк слева стало больше — правые ячейки в лишних `<tr>` рендерим пустыми (`<td></td><td></td>`).

### 3. Не трогать
- Отдельную таблицу «Cash Less Shift Transactions» выше (там уже есть разбивка + End Day).
- Формулу CDR/Balance — суммы не меняются, только визуализация.
- `ChipMovementReport`, экраны Slots, POS, RPC.

### 4. Проверка
- Открыть `/reports?tab=live` → Reprint для смены `bc90bf53-96bb-4e85-8873-928007267341` (Arusha, вчера) → печать → убедиться, что в нижней сводке видно строки по провайдерам, `NET` совпадает с суммой из блока «Cash Less Shift Transactions», а Shift Balance не изменился.
