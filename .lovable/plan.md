# Импорт роты Pit (лист August) для Arusha

Загруженный файл `ROTA - Copy 2.xlsx`, лист **August** — это рота Live Game (дилеры, инспекторы, трейни) на 01–31.08.2026.

## Что найдено в файле

- 26 строк персонала: 23 совпали с сотрудниками Pit в Arusha, 3 строки помечены «new».
- В ячейках стоят часы (11 или 10), а смена определяется цветом заливки:
  - зелёный, 11ч → **M** (Middle, 18:00–05:00)
  - синий, 11ч → **SW** (Swing, 19:00–06:00)
  - светло-голубой, 10ч → **N** (Night, 20:00–06:00)
  - пусто → выходной
- Итого: 161 смена M, 156 SW, 157 N. Ротация у каждого: M → SW → N → 2 выходных.

Совпадение имён (файл → база): Seunansy → Suenancy Salim, Eliya → Eliya Steven, Dickson → Dickson Masamaga, Naomi → Naomi Shashui, Rita → Rita Fredy, Salma → Salma Nkana, Aboubakar → Aboubakar James, Denis → Denis Samwel, Diana → Diana Ndanshau, Felista → Felista Dominic, Glady → Glady Mwakanjuki, Isaya → Isaya Lazaro, Levina → Levina Oiso, Marsisiano → Marsisiano Basso, Nicholas → Nicholas Mjema, Theresia → Theresia Mushi, Godson → Godson Geay, Hilda → Hilda Julius, Manfred → Manfred Lyimo, Mwanahamisi → Mwanahamisi Njama, Sisco → Sisco Mohamed, Selemani → Selemani Hamisi, Wilfred → Wilfred Mgweno.

## Что будет сделано

1. **Новая смена SW (Swing, 19:00–06:00)** — сейчас её в системе нет. Добавляется как полноценный код смены Pit: в выборе смены, в легенде, в цветовой палитре (собственный цвет, отличный от M и N) и в расчёте прогнозных часов.
2. **Часы смен Pit для Arusha**: M = 11ч, SW = 11ч, N = 10ч. Другие казино остаются на текущей схеме (M 11 / N 8).
3. **3 новых сотрудника** Pit в Arusha: New 1, New 2, New 3 (категория Trainee) — под строки «new» из файла.
4. **Перезапись роты**: снимается блокировка Pit-роты Arusha на август, удаляются текущие записи за 01–31.08.2026 (сейчас 56 смен M), заливаются 474 смены из файла, блокировка возвращается на место.
5. Часы (Σh) в роте и автозаполнение Attendance подхватят новые значения автоматически.

## Технические детали

- Миграция: добавить значение `SW` в enum `shift_type` (нужно отдельной миграцией, т.к. Postgres не даёт использовать новое значение enum в той же транзакции).
- Вторая миграция/запись данных: создание трёх сотрудников, снятие `rota_locks` (scope `pit`, месяц 2026-08), `DELETE` + массовый `INSERT` в `pit_rota`, возврат блокировки.
- Фронтенд:
  - `src/pages/Pit.tsx` — `ROTA_SHIFTS` дополняется `SW`, легенда и подсказки.
  - `src/lib/shift-colors.ts` — цвета и тинты для `SW`.
  - `src/lib/shift-hours.ts` — часы Pit для Arusha (M 11 / SW 11 / N 10), для остальных казино поведение без изменений.
- Проверка после импорта: сверка числа смен по дням с итоговыми строками файла (M/SW/N ≈ 5/5/5 в день, суммарно 15–16 человек в смену).
