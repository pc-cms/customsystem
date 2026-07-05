Закрыть обе Project monitoring findings за один заход.

## 1. High: permission denied на RPC (реальная, гонка при anon-контексте)

### Migration — выдать EXECUTE ролям `anon`

Все 4 функции — `SECURITY DEFINER`, ничего чувствительного не возвращают анонимному вызову (они принимают `user_id`/`casino_id` параметрами; для случайного UUID вернут пустой результат или false). Разрешаем anon EXECUTE, чтобы гоночные вызовы во время рефреша сессии и RLS-инвокации на публичных путях перестали падать.

```sql
GRANT EXECUTE ON FUNCTION public.effective_module_perms(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_current_business_date(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_casino_id(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_has_casino_access(uuid, uuid) TO anon;
```

Это не меняет реальные права: RLS на таблицах и внутренние проверки внутри функций остаются. Просто снимаем «декоративную» блокировку EXECUTE, которая ломала гоночные вызовы.

### Клиент — не звать `get_current_business_date` без сессии

`src/hooks/use-business-day-closure.ts` (`useEffectiveBusinessDate`):
- добавить `const { user } = useAuth()`;
- `enabled: !!casinoId && !!user`.

На публичных страницах (Landing, /login, Club до логина) хук перестанет стрелять — вместо RPC на первом рендере отработает `initialData` из cache или fallback `getBusinessDate()`.

Это защита в глубину: даже если grant по какой-то причине откатится, гонка исчезнет как класс.

## 2. Medium: убрать Undo Merge полностью

`undo_player_merge` восстанавливает только поля `players`, но не переносит обратно ~25 дочерних таблиц. Пользователь просит убрать кнопку — merge становится необратимой операцией.

### `src/components/merge/MergedBanner.tsx`
- Удалить импорты `useUndoMergePlayers`, `RotateCcw`, `useAuth`, константу `canManageMerge`.
- Удалить кнопки «Undo» и «Undo last».
- Оставить информационный баннер: «This profile was merged → link to survivor» и «Merged from N duplicate profiles».
- Убрать фильтр `!h.undone_at` (все записи финальные).

### `src/hooks/use-merge-players.ts`
- Удалить экспорт `useUndoMergePlayers`.
- Поле `undone_at` в типе оставить (types.ts не трогаем — авто-ген).

### `src/components/merge/MergeWizard.tsx` (стр. 245)
Ack-текст:
- было: «…It can be undone within 30 days by a manager.»
- станет: «…**This action is permanent and cannot be undone.**»

### `src/pages/admin/MergePlayersPage.tsx` (стр. 28)
Subtitle:
- было: «Combine 2–5 duplicate profiles into a single surviving record. Reversible within 30 days.»
- станет: «Combine 2–5 duplicate profiles into a single surviving record. **This action is permanent.**»

### БД не трогаем
Таблица `player_merges` и функция `undo_player_merge` остаются — история merges продолжает писаться, super_admin теоретически может откатить руками через SQL. Просто из UI никто не вызывает.

## Проверки после реализации

1. `rg -n "useUndoMergePlayers|undo_player_merge" src/` → 0 результатов.
2. Открыть Landing / Login → `get_current_business_date` **не** должен вызываться (Network tab).
3. Открыть `/admin/merge-players` под super_admin → кнопок Undo нет; wizard текст обновлён.
4. Оба Project monitoring findings пометить как **fixed** через `project_monitoring--resolve_finding`.
