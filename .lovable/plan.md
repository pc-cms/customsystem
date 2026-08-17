# Доступ ко всем казино для Michael и Michael Mwanza

## Текущее состояние (проверено в базе)

| Учётка | Основное казино | Роли | Доп. доступ |
|---|---|---|---|
| Michael | Arusha | manager, finance_manager | Arusha, Mwanza, Mbeya, Dodoma |
| Michael Mwanza | Mwanza | manager | Mwanza, Mbeya |

Всего казино в системе: Arusha, Dodoma, Mbeya, Mwanza.

## Что сделать

Добавить в таблицу доступов недостающие записи для **Michael Mwanza**: Arusha и Dodoma.
У **Michael** уже есть все четыре — изменений не требуется.

После этого обе учётки смогут переключаться между всеми четырьмя казино.

## Технические детали

Один `INSERT ... ON CONFLICT DO NOTHING` в `user_casino_access` для user_id `8054959d-…` с casino_id Arusha и Dodoma, `granted_by` — текущий супер-админ. Изменений в коде нет.
