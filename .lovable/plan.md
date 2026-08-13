# Создание полного onboarding-гайда для CMS

## Цель
Подготовить структурированный продуктово-технический onboarding-документ, который можно отдать новому разработчику / продуктовому специалисту: архитектура, стек, модули, бизнес-логика, роли, правила работы с данными и деплой.

## Формат выходного артефакта
1. Markdown-файл в репозитории: `docs/DEVELOPER-ONBOARDING.md` (для версионирования и быстрого поиска).
2. DOCX-версия для печати/рассылки: `/mnt/documents/CMS-Developer-Onboarding.docx`.

## Общее описание продукта
CMS — операционная платформа для управления наземными казино в реальном времени. Полный цикл: касса, pit, столы, игроки, финансы, персонал, отчёты, аудит. Ключевой принцип — **ручной ввод**, иммутабельность данных, отказ от AI-автоматики, аудит через новые транзакции и CCTV.

## Технический стек
- **Frontend**: React 18, Vite 5, TypeScript 5, Tailwind CSS 3, shadcn/ui, Radix primitives.
- **State / data**: TanStack React Query 5, React Query Persist Client, offline-first outbox, IndexedDB.
- **Routing**: React Router 6.
- **Charts / motion**: Recharts, GSAP / Framer Motion (`motion`).
- **Forms**: React Hook Form + Zod.
- **PDF / Excel**: jsPDF + jspdf-autotable, ExcelJS.
- **Backend**: Lovable Cloud (Supabase) — PostgreSQL, Auth, Edge Functions, Realtime, Storage.
- **PWA**: Vite PWA plugin, Workbox, offline queue, sync engine.
- **Testing**: Vitest, Playwright, React Testing Library.
- **Деплой**: Lovable preview + published URL, on-prem Docker/самостоятельный сервер.

## Архитектура
- **Multi-tenancy**: `casino_id` на всех прикладных таблицах, RLS-изоляция через `get_user_casino_id(auth.uid())`.
- **Аутентификация**: Supabase Auth, роли в отдельной таблице `user_roles`, управление через `profiles.casino_id`.
- **Бизнес-логика в БД**: триггеры для балансов кошельков, результатов столов, контроля овердрафта, бюджетных блокировок, аудит-логов.
- **Offline-first**: write-and-sync кассира, exponential backoff 1–16 сек, outbox с автоматическим повтором.
- **Часовой пояс**: Africa/Dar_es_Salaam (EAT, UTC+3). Бизнес-день переходит в 07:00 EAT.
- **Распределение**: облако авторитетно, локальные серверы синхронизируются.

## Роли и доступ
- **Роли**: `cashier`, `cashier_slots`, `pit`, `manager`, `shift_manager`, `reception`, `finance_manager`, `surveillance`, `super_admin`, `hr`, `pos_waiter`, `pos_bartender`, `pos_manager`, `boss`, `general_manager`.
- **Financial scope**: `all` (менеджеры, финансы, супер-админ, surveillance), `shift` (pit/shift_manager), `none` (cashier, reception, hr).
- **Capability-модель**: `manage.ops`, `manage.core`, `manage.finance`, `view.all_casinos`, `manage.roles`.
- **Permission Matrix**: `role_module_defaults` + персональные оверрайды на `user_casino_access` / модульном уровне.
- **Manager Override**: временное повышение прав с логированием.

## Модули системы (группы)
- **Operations**: Dashboard, Dashboard TV, Pit (Rota, Breaklist, Attendance, Active Players, Dealers, Pit Book, Incidents), Tables, Table Tracker, Table Results, Cage, Cage Slots, Closings, Tips & Bonuses, Cashless, Bank Checks.
- **Players**: Players, Guests, Blacklist, Groups, Reception (check-in/register/update), Player CRM, KYC Reviews.
- **Finance**: Finance Dashboard, Wallets, Cash Count, Budget, Daily Review, Monthly Expenses, Payroll, Inter-Casino Transfers, Finance Summary.
- **Reports**: Reports, Miss Chips, Cancelled Transactions, Graphics, Daily Balance, Office/Casino Expenses, Activity Logs, Blank Forms, Import Reports.
- **Club**: Promo Codes, Promo Grants, Lotteries, Shop Catalog / Orders, AM Budget, AM Performance, FM Top-ups, Promo reports.
- **System**: Admin Panel, Floor Staff (Employees, Rota, Attendance, Master HR), CCTV, Marketing Campaigns, Blank Forms.

## Ключевые бизнес-правила
- **Drop**: per-table = raw сумма IN-транзакций (`in`, `buy`) по открытой смене. Total Drop = сумма peak из `player_day_drop_cache`.
- **Variance / Casino Balance**: `Variance = (Actual − Starting Float) − Expected`. Знаки инвертированы для чипов (минус = избыток денег).
- **Кошельки**: баланс = строго последний физический пересчёт (`cash_count_snapshots`), без накопления транзакций.
- **Фишки**: Chip Conservation Law — Initial = Inventory + Floor; Miss отдельно (как cage delta).
- **Расходы**: кассовые расходы откладываются до закрытия бизнес-дня; офисные/карты проводятся сразу.
- **JP**: Jackpot учитывается в Expected; отдельная страница для расходов по выплате JP.
- **Деньги / формат**: разделитель тысяч — пробел (`1 000 000`), даты — `DD/MM/YYYY`, валюты — TZS, USD, EUR, GBP, KES (сортировка от большей к меньшей).
- **Бизнес-день**: rollover в 07:00 EAT, принудительное закрытие в 09:00 EAT.

## Модель данных (обзор)
- **Операционные**: `casinos`, `profiles`, `user_roles`, `shifts`, `transactions`, `expenses`, `gaming_tables`, `chip_*`, `cash_counts`.
- **Финансовые**: `fin_wallets`, `fin_wallet_tx`, `fin_day_closing`, `fin_day_balance_snapshot`, `fin_month_closures`, `fin_budget`, `fin_categories`, `cash_count_snapshots`, `bank_checks`.
- **Игроки**: `players`, `player_cards`, `player_tags`, `player_groups`, `casino_visits`, `client_sessions`, `player_merges`.
- **Персонал**: `employees`, `dealers`, `pit_rota`, `breaklist`, `staff_rota`, `staff_attendance`, `management_rota`, `management_attendance`, `payroll_*`, `staff_warnings`.
- **POS/Club**: `pos_*`, `club_*`, `promo_*`, `lotteries`, `shop_*`, `am_budget_*`.
- **Аудит/синхронизация**: `activity_logs`, `sync_outbox`, `sync_*`, `incidents`, `cctv_observations`.

## Правила разработки
- **SmartTable**: все новые таблицы — через `SmartTable` (`src/components/ui/smart-table.tsx`); ручной `<table>` запрещён.
- **Аудит**: логи действий пишутся только триггерами через `tg_activity_log`; `logAction()` в UI запрещён.
- **Локализация UI**: интерфейс строго на английском; внутренняя коммуникация на русском.
- **Цвета**: семантические токены из `index.css` / Tailwind; никаких хардкодов `text-white`/`bg-black`/`bg-[#…]`.
- **Числа/даты**: глобальные форматёры `formatMoney`, `fmtDate`, компонент `NumberInput` с разделителем-пробелом.
- **Дебаунс**: поисковые поля — 200–250 мс; `startTransition` для переключения табов.

## Деплой и эксплуатация
- **Lovable Cloud**: миграции из `supabase/migrations/`, Edge Functions из `supabase/functions/`, автоматический деплой.
- **On-prem**: Docker Compose (`deploy/docker-compose.yml`), Nginx, PostgreSQL, sync-узлы, fleet/license agents.
- **Версионирование**: версия в `package.json` (текущая 1.3.609), Service Worker обновляется при логине.
- **Резервное копирование**: см. `deploy/ARCHIVE-RESTORE.md` и `deploy/backup/backup.sh`.

## План работы
1. **Исследование** — прочитать оставшиеся ключевые файлы: `src/App.tsx`, `src/lib/auth-context.tsx`, `src/lib/casino-context.tsx`, `src/lib/modules.ts`, `src/lib/route-module-map.ts`, `src/lib/casino-settings-spec.ts`, `docs/ACCESS-MATRIX.md`, `docs/ONBOARDING.md`, `deploy/README.md`, `supabase/migrations` (последние 5–10).
2. **Синтез** — собрать единую структуру разделов выше в Markdown.
3. **Написание Markdown** — создать `docs/DEVELOPER-ONBOARDING.md` с оглавлением, таблицами ролей/модулей/правил.
4. **Генерация DOCX** — с помощью `docx` сгенерировать форматированный документ (A4, Arial, таблицы, заголовки) и сохранить в `/mnt/documents/CMS-Developer-Onboarding.docx`.
5. **Верификация** — проверить, что оба файла созданы, DOCX валиден, Markdown отображается без ошибок.

## Критерии завершения
- [ ] `docs/DEVELOPER-ONBOARDING.md` содержит продуктовое описание, стек, архитектуру, роли, модули, бизнес-правила, модель данных, конвенции и деплой.
- [ ] `/mnt/documents/CMS-Developer-Onboarding.docx` успешно сгенерирован и валиден.
- [ ] Документ не содержит секретов (Supabase ключей, паролей, project IDs).
- [ ] Обе версии доступны для скачивания / просмотра.
