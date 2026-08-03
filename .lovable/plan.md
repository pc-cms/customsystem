# Менеджеры в Incidents + отключение Pit Book у CCTV

## 1. Менеджеры в Incidents

Сейчас в `src/pages/Incidents.tsx` есть один общий список `STANDING_MANAGERS` (Bakha, Daniyar, Hussein, Oxana, Peter, Raushan, Sergey T, Sveta, Taras, Vadim, Yurii) — он одинаковый для всех казино.

Что сделать:
- Добавить недостающих: **Valeriy**, **Carol** (Mwanza), **Konstantin** (Arusha). Vadim уже в списке.
- Сделать список зависимым от казино: общие менеджеры остаются для всех, а новые привязываются к своему казино (Mwanza: Valeriy, Carol; Arusha: Vadim, Konstantin) — в выпадающем списке показываются только релевантные текущему казино.

## 2. Убрать Pit Book у CCTV (роль surveillance)

Доступ у surveillance сейчас есть в трёх местах — убрать во всех:

- **Кнопка в меню**: в `src/components/layout/AppSidebar.tsx` пункт «Pit Book» перечисляет роль `surveillance` — убрать её оттуда, кнопка исчезнет.
- **Права модуля**: в базе у роли `surveillance` для модуля `pit_book` стоит просмотр и запись — снять оба флага, чтобы прямой переход по адресу `/pitbook` блокировался защитой маршрута.
- **Права в базе на уровне данных**: политики чтения/записи `pit_book_entries` явно разрешают роль `surveillance` — убрать это условие из политик.
- Дополнительно в `src/hooks/use-pit-book-unread.ts` убрать `surveillance` из списков видимых каналов и прав на запись, чтобы не считались непрочитанные сообщения.

Если у отдельного пользователя-CCTV окажется персональное разрешение на `pit_book` — оно тоже снимается (сейчас таких записей нет).

## Технические детали

- Файлы: `src/pages/Incidents.tsx`, `src/components/layout/AppSidebar.tsx`, `src/hooks/use-pit-book-unread.ts`.
- Миграция: обновление `role_module_defaults` для роли `surveillance` (`can_view=false, can_write=false`) и пересоздание политик `pit_book read` / `pit_book write` без `surveillance`.
- Поднять версию в `package.json`.
