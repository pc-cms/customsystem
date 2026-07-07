
# Финальный roadmap: A → B → E (v2)

**Изменение по core-правилам:** почти всё, что раньше было "immutable в коде", становится **settings-driven per casino** с понятным объяснением в UI. Клиент/менеджер сам решает, как работает его казино.

---

## Пересмотр core-правил

### Immutable (реально нельзя трогать — только код и триггеры БД)

Оставляем в железе только то, без чего система теряет смысл как учётная:

- **Финансовые транзакции нельзя удалять** — корректировка только новой обратной проводкой (аудит-требование, не бизнес-правило)
- **Аудит-логи пишутся триггерами БД, не из UI** (техническое, невидимо клиенту)
- **Каждая денежная операция принадлежит business_day** (без этого не работают отчёты)

Всё остальное — настройка.

### Settings-driven (per-casino, редактируется в `/admin/settings`)

Все переезжают в таблицу `casino_settings(casino_id, key, value jsonb, updated_by, updated_at)` + один компонент `SettingCard` с явным описанием "что это, зачем, что произойдёт при переключении".

| Ключ настройки | Значения | По умолчанию | Объяснение в UI |
|---|---|---|---|
| `chip_conservation.mode` | `strict` / `observation` | `strict` (новое казино) | "Strict — фишки на столах и в кассе всегда равны эмиссии; расхождение блокирует закрытие. Observation — расхождение только отмечается в месячном отчёте Miss Chips, работа не блокируется. Ставь Observation при внедрении в работающее казино, где часть фишек уже у игроков." |
| `cashless.enabled` | `true` / `false` | `false` | "Включает Cashless-модуль. Игроки могут держать баланс, не забирая фишки." |
| `cashless.balance_source` | `manual` / `derived` | `manual` | "Manual — баланс вводится кассиром вручную по каждому депозиту/выводу. Derived — баланс автоматически рассчитывается из транзакций. Manual безопаснее для аудита, Derived удобнее для клиента." |
| `tips.neutral_in_cdr` | `true` / `false` | `true` | "Neutral — типы не влияют на Cash Drop Report и Shift Balance, живут отдельным потоком. Off — типы включаются в отчёт кассовой смены." |
| `tips.include_in_drawer_count` | `true` / `false` | `false` | "Считать ли типы при пересчёте ящика кассы." |
| `chips.visibility_per_casino` | `true` / `false` | `true` | "Скрывать неиспользуемые деноминации фишек из интерфейса кассы. Off — показывать все деноминации всегда." |
| `currency.mode` | `single` / `multi` | `single` | "Single — всё считается в основной валюте казино (например TZS). Multi — можно вести операции в нескольких валютах одновременно (нужен модуль fx-rates). Смена single → multi необратима без миграции." |
| `currency.primary` | `TZS` / `USD` / ... | `TZS` | "Основная валюта отчётности." |
| `currency.denominations` | `[10000, 5000, 2000, 1000]` | по валюте | "Разрешённые номиналы. Порядок = порядок в UI." |
| `business_day.rollover_time` | `07:00` | `07:00` | "Во сколько заканчивается операционный день. Все транзакции до этого времени относятся к предыдущему дню." |
| `business_day.timezone` | IANA tz | `Africa/Dar_es_Salaam` | "Часовой пояс казино." |
| `date_format` | `DD/MM/YYYY` / `MM/DD/YYYY` / `YYYY-MM-DD` | `DD/MM/YYYY` | |
| `number_separator` | `space` / `comma` / `dot` | `space` | "Разделитель тысяч в отображении сумм." |

### Как выглядит UI настройки (для chip conservation как пример)

```text
┌─ Chip Conservation Law ─────────────────────────────┐
│ Как система относится к расхождению фишек           │
│                                                      │
│ ○ Strict (жёсткий инвариант)                        │
│   Общее количество фишек = начальной эмиссии.       │
│   Расхождение блокирует закрытие смены. Подходит    │
│   для нового казино, где эмиссия точно известна.    │
│                                                      │
│ ● Observation (наблюдение)                          │
│   Расхождение фишек не блокирует операции.          │
│   Отклонения фиксируются в месячном отчёте          │
│   Miss Chips. Подходит для внедрения в работающее   │
│   казино — часть фишек уже на руках у игроков.      │
│                                                      │
│ [Save]  Изменено: super_admin, 2 дня назад          │
└─────────────────────────────────────────────────────┘
```

Все настройки — с такими же карточками, чтобы клиент/менеджер понимал, **что произойдёт при переключении**, а не только "включено/выключено".

### Кто может менять

- `super_admin` — все настройки, включая необратимые (`currency.mode`, `chip_conservation.mode` на активном казино)
- `manager` — операционные (`tips.*`, `date_format`, `number_separator`, `chips.visibility_per_casino`)
- `admin` — только просмотр
- Остальные роли — не видят раздел

RLS-политика на `casino_settings` + отдельный список "requires_super_admin" в коде + серверная проверка в триггере на UPDATE.

### Что уже частично сделано

- `casinos.chip_conservation_mode` — уже есть, `ChipConservationModeCard` + `use-chip-conservation-mode.ts` работают. **Оставляем как первый образец**, потом мигрируем в общий `casino_settings` в Фазе B.
- `TimeSettingsPanel` уже редактирует часть настроек (working hours, rollover implicit через shift_end). Мигрируем в тот же паттерн.

---

## Фаза A — Realtime-first (2 недели) — БЕЗ ИЗМЕНЕНИЙ

Правим "тройной F5":
1. `src/lib/module-live-spec.ts` — реестр таблиц по модулям
2. `src/lib/live-query-options.ts` — обёртка над React Query: `staleTime: Infinity`, invalidation только по Realtime
3. Логин → параллельный префетч + Realtime-подписки на все таблицы разрешённых модулей
4. Правки во всех `src/hooks/use-*.ts` — снять `refetchOnWindowFocus/Mount`
5. `src/lib/auth-context.tsx` — запуск Realtime после логина

**Никаких изменений БД.**

---

## Фаза B — Пакеты + Settings-driven core (2 недели)

### Часть 1: Signed license file (без изменений от прошлой версии)

- CLI `deploy/cli/cms-license.mjs sign ...` на твоей машине, приватный ключ у тебя
- Публичный ключ вшит в код и в `verify_license()` SQL
- Файл `license.dat` доставляется любым способом
- Локальная super_admin-панель `/superadmin/license`
- Таблица `casino_packages(casino_id, package_key, expires_at, signature)`
- 9 пакетов: `core` (PIT + Cage Live + Cage Slots + Reception), `manager`, `system`, `fin_manager`, `cctv`, `pos`, `club`, `multi_location_sync`, `cloud_access`
- `<ModuleGate>` вокруг роутов

### Часть 2: Settings-driven core (новое, замена immutable-правил)

**Миграция:**
```sql
CREATE TABLE casino_settings (
  casino_id uuid REFERENCES casinos(id),
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (casino_id, key)
);
-- GRANT + RLS
-- Триггер: список ключей, требующих super_admin
-- Seed: заполнить defaults для всех существующих казино
```

**Код:**
- `src/lib/casino-settings-spec.ts` — реестр всех настроек с описаниями, defaults, кто может менять, необратимость
- `src/hooks/use-casino-setting.ts` — `useCasinoSetting(key)` + `useUpdateCasinoSetting(key)` с оптимистичным апдейтом и Realtime-подпиской
- `src/components/settings/SettingCard.tsx` — универсальная карточка с объяснением, вариантами, "изменено {кем, когда}", кнопкой Save
- `src/pages/admin/CasinoSettingsPage.tsx` — добавить табы: **General**, **Chips**, **Cashless**, **Tips**, **Currency**, **Time** — каждый рендерит нужные `SettingCard`

**Миграция существующего кода на настройки:**
- `useChipConservationMode` → wrapper над `useCasinoSetting("chip_conservation.mode")`, поле `casinos.chip_conservation_mode` deprecated
- `cage-balance.ts`, `use-cashless.ts` — читают `cashless.balance_source` вместо хардкода
- `use-tips.ts`, `cage-balance.ts` — читают `tips.neutral_in_cdr` и `tips.include_in_drawer_count`
- `chip-colors.ts`, `FloatManagement` — читают `chips.visibility_per_casino`
- `currency.ts`, `format-money.ts` — читают `currency.mode`, `currency.primary`, `currency.denominations`, `number_separator`
- `business-day.ts` — читает `business_day.rollover_time`, `business_day.timezone`
- `format-date.ts` — читает `date_format`

**Обратимость и защита:**
- Необратимые смены (`currency.mode: single → multi`, `chip_conservation.mode: observation → strict` при непустых операциях) — модалка подтверждения "введите название казино", запись в audit log
- Настройки — Realtime-подписка, чтобы во всех открытых клиентах синхронно обновились

---

## Фаза E — Автономный локальный сервер (2-3 месяца) — БЕЗ ИЗМЕНЕНИЙ

- Установка через USB-tarball, без интернета
- Локальный Postgres + GoTrue + PostgREST + Realtime + Nginx + локальная super_admin-панель
- Cloud-access через наш VPS reverse-proxy + Tailscale
- Multi-location sync через тонкий Cloud-relay (только для купивших модуль)
- `cms-update` / `cms-rollback` через SCP/Tailscale/USB
- Существующие Cloud-казино Arusha/Mwanza мигрируются последними, отдельным ночным cutover-планом

Таблица `casino_settings` живёт и в Cloud, и в локальном Postgres — редактируется в локальной super_admin-панели, работает офлайн.

---

## Порядок работы

1. **Сейчас → Фаза A** (2 недели). Realtime-first, "тройной F5" уходит.
2. **Фаза B** (2 недели):
   - Signed license + пакеты
   - `casino_settings` + `SettingCard` + миграция всех "immutable" правил в настройки с объяснениями
3. **Фаза E** (2-3 месяца). Автономный локальный сервер.
4. **После E:** миграция Arusha/Mwanza с Cloud → local, Cloud остаётся только как VPS-proxy + опциональный multi-location-relay.

После утверждения → build-mode на Фазу A.
