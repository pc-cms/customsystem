# План: End Day (manual) + Pit Book

## Задача 1 — "Balances" → "End Day" (manual only)

**Проблема:** в Slot Cage в распечатке Cashless вместо введённых вручную балансов появляются NET-результаты (Cashless IN − Cashless OUT). Это происходит, потому что блок `CashlessProvidersBlock` при пустом значении подставляет вычисленный NET как fallback и он попадает в печать.

**Решение — раз и навсегда:**
1. Переименовать колонку/секцию `Balances` → `End Day` во всех местах (Slot Cage closing, Live Game cage closing, Shift Closing Report, печатные отчёты).
2. End Day — **только ручной ввод**:
   - Никаких автозаполнений из NET, из прошлой смены, из RPC — вообще ничего.
   - Пустое поле в БД = `null` → в UI и в печати показываем `—` (em dash).
   - Заполненное = показываем число как есть, даже если совпадает с предыдущей сменой.
3. В **Live Game Cage** (`CloseShiftDialog`) сейчас этого блока нет — добавить компактно в шаге Closing, по той же схеме что в Slot Cage: одна строка на провайдера, единственное поле "End Day", без подсказок/префиллов.
4. В печатных отчётах (Slot + Live Game `ShiftClosingReport`):
   - Колонка называется `End Day`.
   - Если `null` → `—`.
   - Никогда не подставлять NET / Cashless Final / расчётные значения.

**Файлы:**
- `src/components/cage/CashlessProvidersBlock.tsx` — переименовать, убрать любые fallback на NET, dirty-flag оставить.
- `src/components/cage/CloseShiftDialog.tsx` (live game) — встроить компактный End Day блок.
- `src/components/cage/ShiftClosingReport.tsx` — заголовок + рендер `—` для null.
- `src/components/cage-slots/SlotsShiftClosingReport.tsx` (или эквивалент) — то же.
- Hook/мутации записи: сохранять `null` если поле не трогали, не подставлять 0.

## Задача 2 — Pit Book (shift handover log)

**Что это:** сквозной журнал смены, куда Pit Boss / Shift Manager / Floor Manager записывают события (incidents, гости, замены, проблемы с оборудованием, договорённости) — чтобы следующая смена прочитала и приняла дела. Индустриальный стандарт: "Pit Log" / "Shift Pass-Down Book" в казино — обычно хронологический фид с timestamp + автор + текст, без редактирования постфактум (audit), с возможностью acknowledge принимающей сменой.

**UX:**
- Маршрут `/pit/pitbook` (возвращаем в Pit shell как новую вкладку рядом с Breaklist / Rota / Attendance).
- Две внутренние вкладки: **Pit Bosses** и **Managers** (раздельные потоки, разные читатели).
- Вид — чат-фид, наш стиль (не пузыри — inline таблица-как-чат, плотная, моноширинные timestamp):
  ```text
  09:42  P.Mwangi · PB    Table 4 dealer swap — Asha → John (10 min break overrun)
  10:15  S.Otieno · SM    VIP Mr. K seated T7, comp dinner approved
  10:40  P.Mwangi · PB    Camera 12 offline, reported to surveillance
  ```
- Composer внизу: textarea + Enter to post, Shift+Enter newline. Без вложений в v1.
- Date picker сверху — любой день для чтения. Запись только в текущий business day.
- Sticky-to-bottom поведение, jump-to-bottom кнопка.

**Доступ:**
- **Запись:** `pit_boss`, `shift_manager`, `floor_manager` — каждый видит обе вкладки, пишет в свою.
- **Чтение (любая дата):** те же роли + `surveillance` / `cctv` + `manager` / `super_admin`.
- Остальным — пункт меню скрыт.

**Иммутабельность:** записи нельзя редактировать/удалять (как incidents). Опечатка → новая запись "correction: …".

**Данные:**
```sql
create table public.pit_book_entries (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casinos(id),
  business_date date not null,
  channel text not null check (channel in ('pit_bosses','managers')),
  author_id uuid not null,            -- auth.uid()
  author_name text not null,          -- snapshot
  author_role text not null,          -- snapshot (PB/SM/FM)
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
-- GRANTs + RLS: SELECT for читателей по casino_id; INSERT для писателей по casino_id;
-- никаких UPDATE/DELETE policies (иммутабельно).
-- Realtime: ALTER PUBLICATION supabase_realtime ADD TABLE public.pit_book_entries;
```

**Файлы (новые):**
- `src/pages/pit/PitBookPage.tsx`
- `src/components/pit/PitBookFeed.tsx` (рендер строк)
- `src/components/pit/PitBookComposer.tsx`
- `src/hooks/use-pit-book.ts` (list + post + realtime invalidation)
- Маршрут в `src/App.tsx` + пункт в Pit shell + access-matrix.

## Техническая часть (для меня, не для UI)
- Bump версии до `1.3.419`.
- AI Elements здесь **не используем** — это внутренний журнал, не AI-чат. Делаем плотной inline-таблицей в стиле проекта.
- Realtime инвалидация через существующий `use-realtime` (добавить таблицу).
- Печатные отчёты End Day: проверить и Slot Cage print view, и Live Game print view, и Cage History экспорт.

## Порядок реализации
1. End Day переименование + удаление NET fallback (Slot Cage) — фикс острой проблемы.
2. End Day блок в Live Game Cage closing.
3. Pit Book: миграция → hook → UI → роутинг → доступ.

Подтвердите, и я начну с пункта 1 (фикс печати).