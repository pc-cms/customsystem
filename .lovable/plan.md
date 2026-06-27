## Что делаю

**1. Доступ к Pit Book через матрицу ролей** (миграция уже выполнена ✅)

UPSERT в `role_module_defaults` для `module_key='pit_book'`:

| Роль                | View | Write | Day depth |
|---------------------|------|-------|-----------|
| pit (PIT / PTM / планшет) | ✅ | ✅ | all |
| shift_manager       | ✅   | ✅    | all |
| manager             | ✅   | ✅    | all |
| surveillance (CCTV) | ✅   | ✅    | all |
| finance_manager     | ✅   | ❌    | all |

`super_admin` уже видит всё.

**2. RLS на `pit_book_entries`** (выполнено ✅)

- READ — pit, shift_manager, manager, surveillance, **finance_manager**, super_admin + у юзера должен быть `user_casino_access` на это казино.
- INSERT — pit, shift_manager, manager, surveillance, super_admin (finance_manager только читает); `author_id = auth.uid()` + casino access.
- Записи append-only: UPDATE/DELETE политик нет → запрещено всем (super_admin может через service_role при необходимости).

**3. В чате — имя, а не логин**

В `src/hooks/use-pit-book.ts` (`useCreatePitBookEntry`) убрать fallback `user.email`. Использовать только `displayName` (из `profiles.display_name`), при пустом — `"—"`. Email/логин в чате больше не появится.

## Что нужно от вас

Переключите в **Build mode**, чтобы я внёс правку в `use-pit-book.ts`. Миграция БД уже применена — после переключения и правки достаточно перелогиниться, чтобы вкладка Pit Book появилась у всех перечисленных ролей в Аруше и Муанзе (и автоматически в Dodoma/Mbeya, когда они запустятся).
