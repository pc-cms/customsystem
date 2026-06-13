Выровнять группу C — убрать случаи, где `shift_manager` имеет более широкий доступ, чем `manager`. Shift Manager не должен превосходить Manager ни по одному модулю.

## Изменения в `role_module_defaults`

| Модуль | Сейчас SM | Сейчас Manager | Станет SM |
|---|---|---|---|
| `daily_expenses` | есть (view/write/today) | нет строки | удалить строку у SM (или добавить Manager-у такую же) |
| `pit_rota` | view+write/all | view-only/today | view-only/today (как у Manager) |
| `pit_dealers` | view/all | view/today | view/today |
| `tips_and_bonuses` | view/all | view/today | view/today |

## Вопрос по `daily_expenses`
Два варианта:
- **A.** Убрать модуль у SM (строгое выравнивание: SM ≤ Manager).
- **B.** Добавить его Manager-у с теми же правами (view/write/today) — тогда Manager тоже получит доступ к Daily Expenses.

По умолчанию возьму **вариант B** — это логичнее: Manager должен видеть всё, что видит SM. Если нужен вариант A — скажите.

## Технически
- Одна миграция: `UPDATE role_module_defaults` для трёх строк SM + `INSERT` строки `daily_expenses` для Manager (вариант B).
- Auto-bump версии в `package.json` (backend change).
- Никакого UI-кода — права читаются через `effective_module_perms`.
