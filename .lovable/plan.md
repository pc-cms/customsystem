# Новая структура сайдбара + чистка прав GM

## 1. Порядок и названия разделов (для всех ролей)

Разделы идут в этом порядке; пункты, к которым у роли нет доступа, просто не показываются.

```text
Dashboard TV            (плоский пункт сверху, только для тех, у кого есть доступ)

PIT
  Dashboard
  Player Tracking
  Table Check
  Break List
  Tables Tracking
  Pit Book
  CCTV Reports          (переименование Incidents)

ANALYTICS
  Statistics
  Graphics              (новая отдельная страница)

STAFF
  Rota
  Attendance
  Employee List

MANAGEMENT
  Cage View
  Expenses
  Tips & Bonuses


FINANCE
  Office
  Casino Monthly Balance
  Office Monthly Balance
  Expenses · Casino
  Expenses · Office
```

Дальше без изменений: CASHIER (Cage Live Game, Cage Slots, Bank, Cashless, Transfers, Blank Forms), RECEPTION, HR, CRM, MARKETING, PROMO, SYSTEM (Import Reports, Logs, Admin).

Cage View, Expenses, Tips & Bonuses переезжают из CASHIER в MANAGEMENT (для кассиров Expenses/Cashless остаются доступны, просто пункт живёт в новом разделе).

## 1a. Blacklist и Merge Duplicates — в шапку Player Tracking

- Для менеджерских ролей (manager, shift_manager, finance_manager, general_manager, surveillance, super_admin) пункты Blacklist и Merge Duplicates убираются из сайдбара и появляются кнопками в шапке страницы Player Tracking (`/player-statistics`), рядом с заголовком.
- Для роли reception Blacklist остаётся в сайдбаре в разделе RECEPTION как сейчас.
- Сами страницы `/blacklist` и `/admin/merge-players` остаются доступны по своим маршрутам и правам — меняется только точка входа.


## 2. Graphics отдельной страницей

- Вкладка Graphics убирается со страницы Statistics.
- Появляется маршрут `/reports/graphics` с тем же компонентом годовых графиков (заголовок страницы «Graphics»), чтобы позже туда добавлять новые графики.
- Доступ — тот же, что у Statistics, но отдельным пунктом меню.

## 3. Права роли GM

Убирается:
- HR — все модули (у GM сейчас активен только HR Warnings; он снимается, остальные HR-модули уже закрыты).
- Blank Forms.

Monthly Tips остаётся без изменений (по вашему уточнению).

## Техническая часть

- `src/components/layout/AppSidebar.tsx`: переименовать/переставить секции (`Section`, `sectionOrder`), перенести пункты между секциями, переименовать Incidents → CCTV Reports, добавить пункт Graphics.
- Новый модуль `blank_forms` в `src/lib/modules.ts` + маппинг `/reports/blanks` в `src/lib/route-module-map.ts` (сейчас он висит на модуле `reports`, из-за чего его нельзя скрыть у GM отдельно). Миграция: выдать `blank_forms` тем ролям, у кого он есть сейчас, кроме GM.
- Новый модуль `report_graphics` + маршрут `/reports/graphics` в `src/App.tsx`, компонент `YearlyGraphicsReport` выносится на страницу; вкладка удаляется из `src/pages/Reports.tsx`.
- Миграция по `role_module_defaults`: удалить `hr_warnings` у `general_manager`.
- Поднять версию приложения.
