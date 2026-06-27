## Pit Book — права, непрочитанные, компактный layout

### 1. Видимость вкладок и права записи
- **Pit (pit_boss)**: видит только вкладку Pit Bosses, пишет только в Pit Bosses. Вкладка Managers скрыта.
- **Managers** (manager, shift_manager, finance_manager): видят обе вкладки, пишут в обе.
- **CCTV (surveillance)**: видит обе, пишет в обе.
- **super_admin**: видит обе, пишет в обе.
- Логика в `PitBook.tsx`: вычислять `visibleChannels` и `canWriteIn(channel)` по ролям. RLS на `pit_book_entries` обновить, чтобы:
  - INSERT в `managers` запрещён для роли `pit`.
  - INSERT в `pit_bosses` разрешён для pit, manager, shift_manager, finance_manager, surveillance, super_admin.
  - INSERT в `managers` разрешён для manager, shift_manager, finance_manager, surveillance, super_admin.

### 2. Непрочитанные сообщения
- Новая таблица `public.pit_book_reads(user_id, casino_id, channel, last_read_entry_id, last_read_at)` — по записи на пользователя/казино/канал. RLS: пользователь читает/пишет только свои строки. GRANT для authenticated и service_role.
- Хук `usePitBookUnread()` возвращает `{ pit_bosses: number, managers: number, total: number }` для текущего казино, считая записи новее `last_read_entry_id` (и не свои — свои сразу прочитаны).
- **Маркировка прочитанным "при скролле к сообщению"**: в `PitBook.tsx` использовать `IntersectionObserver` на каждое сообщение. Когда сообщение попадает во viewport фида, добавлять его id в локальный буфер, и через debounce (300–500 мс) апдейтить `last_read_entry_id` до максимального id из видимых, но только если он больше текущего.
- **Sidebar**: иконка Pit Book получает заливку (`bg-primary/15 text-primary`) и точку/badge с числом, когда `total > 0`. Реализация в `AppSidebar.tsx` — подписка на `usePitBookUnread`.
- **Tabs внутри Pit Book**: к каждому `TabsTrigger` добавляем точку справа от названия, если в этом канале есть непрочитанные.
- **Реалтайм**: подписка через существующий механизм realtime на `pit_book_entries` уже инвалидирует список — добавим invalidate `pit-book-unread` на INSERT.
- Работает для всех ролей, у которых вкладка видна. Для pit непрочитанные считаются только по pit_bosses (managers он не видит).

### 3. Компактный inline-layout сообщений
- Убрать колоночную структуру `flex-col` с отдельной строкой meta и отдельной строкой body.
- Новый формат одного сообщения: один блок текста с inline-префиксом:
  - `[HH:MM] Имя · Роль  текст сообщения, который сам переносится по ширине экрана …`
  - Имя + Role badge + время рендерятся inline перед телом, тело продолжается тем же flow (`display: inline`), перенос строки по ширине контейнера через обычный wrap.
- Убрать карточку-рамку у каждого сообщения; оставить только тонкий разделитель снизу (`border-b border-border/40`) и небольшой `py-1.5 px-2`.
- **Свои сообщения справа, выделенным цветом**: для `isOwn` оборачиваем сообщение в контейнер с `ml-auto max-w-[85%] bg-primary text-primary-foreground rounded-md px-2 py-1.5`. Чужие — `mr-auto max-w-[85%]` без фона, обычный foreground. Имя/время/роль внутри пузыря inline перед текстом тем же стилем.
- Ширина фида ограничивается родителем, текст переносится по экрану естественным `break-words`.

### 4. Технические детали
- Файлы: `src/pages/PitBook.tsx`, `src/hooks/use-pit-book.ts`, `src/hooks/use-pit-book-unread.ts` (новый), `src/components/layout/AppSidebar.tsx`, миграции для `pit_book_reads` + обновление RLS `pit_book_entries`.
- Bump версии в `package.json`.