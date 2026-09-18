# Company Report: строка CAPEX в стиле Collection

## Проверка двойного учёта (уже выполнена)
Двойного учёта **нет**. В актуальной функции `boss_monthly_report` в базе:
- `collection` = сумма расходов группы «Collections» + записи Office → Collections, **без** категории CAPEX (`FILTER (WHERE NOT is_capex)`)
- `capex` = только категория CAPEX (`FILTER (WHERE is_capex)`)
- дневная колонка Collection тоже исключает CAPEX
Каждая сумма попадает ровно в одну строку.

## Изменение (1 файл)
`src/components/boss/monthly-report-panel.tsx`:
- у строки CAPEX (блок сводки, ~стр. 388) убрать приглушённый стиль (`muted: true`), чтобы она выглядела как строка Collection — обычная полноценная строка, а не подстрока.
- Подсказку (hint) оставить — у Collection она тоже есть.

## Проверки
- Типы (`tsgo`), сборка.
- Без изменений SQL, данных и бизнес-логики. Не публиковать.
