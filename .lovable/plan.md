# Время смен в легенде Rota

## Что меняется
Легенда над таблицей Rota (цветные метки D, M, N…) будет показывать время и часы из Shift codes выбранного подотдела и казино, например:

```text
D 10:00–18:00 · 8h    M 13:00–21:00 · 8h    N 18:00–06:00 · 12h
```

- **Live Game:** на вкладке Dealers — коды Dealers, на Pit Bosses — коды Pit Bosses. На вкладке All — коды Dealers.
- **Floor / Security / Office:** коды выбранного подотдела (Bar, Slots, HR и т.д.). Если выбран All, показываются коды отдела без подотдела.
- Для кодов без времени (выходной, отпуск) остаётся как сейчас: название без времени.
- Легенда обновляется сразу после правки кодов в Shift codes.
- Если коды для казино не заданы, остаются нынешние подписи.

Больше ничего не меняется. Расчёт часов, данные и Attendance остаются как есть.

## Технические детали
- Новый хелпер `formatShiftCodeLegend(code)` → `"10:00–18:00 · 8h"` (из `start_time`, `end_time`, `hours`).
- `Staff.tsx` (легенда Rota, ~стр. 230): `useShiftCodes(activeCasino.id, rotaGroupKey, codesUnit ?? null)`, подпись = время из кода, иначе `rotaGroup.shiftLabels[s]`.
- `Pit.tsx` (`belowHeader`, только при `activeTab === "rota"`): `useShiftCodes(casinoId, "pit", tab === "pit_bosses" ? "pit_bosses" : "dealers")`, иначе `pitLabels[s]`.
- Одна проверка типов и одна сборка. Версия приложения поднимается.
