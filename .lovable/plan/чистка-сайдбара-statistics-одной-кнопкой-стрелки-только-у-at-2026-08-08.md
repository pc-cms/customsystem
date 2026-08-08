# Чистка сайдбара: Statistics одной кнопкой, стрелки только у Attendance/Rota

## Что меняем

1. **Statistics** — убрать семь отдельных кнопок (Total / Live Game / Slots / Miss Chips / Graphics / Groups / Tables). Оставить один отдельный пункт «Statistics» → `/reports`. Стрелки нет.
2. **Заголовки разделов** — убрать стрелки и возможность сворачивать у всех блоков (PIT, STAFF, CASHIER, STATISTICS и т.д.). Заголовки остаются жирными статичными метками для визуальной группировки.
3. **Стрелки оставляем только там, где есть реальные подпункты** — `Attendance` и `Rota`, которые разворачивают Live / Floor / Security / Office / Management.
4. Внутри `/reports` порядок табов сохраняем: Total / Live Game / Slots / Miss Chips / Graphics / Groups / Tables (по умолчанию Total).

## Где

- `src/components/layout/AppSidebar.tsx` — основные изменения: список `NAV_ITEMS`, группировка по секциям, рендеринг заголовков, логика активности, мобильный заголовок.
- `src/pages/Reports.tsx` — default tab уже Total, править не нужно.

## Технические детали

- В `NAV_ITEMS` заменить 7 пунктов `section: "STATISTICS"` на один `{ to: "/reports", icon: FileBarChart, label: "Statistics", ... }`.
- Рендеринг секций: убрать `onClick` и `ChevronDown/ChevronRight` у заголовков секций. Заголовок — статичный `<div>` или `<span>` с сохранением жирного стиля и цвета активности.
- Логика `open[section]` и `toggle(section)` удаляется для секций, остаётся только для виртуальных групп Attendance/Rota (`__attendance__` / `__rota__`).
- `activeSection` продолжает подсвечивать текущий раздел, чтобы заголовок оставался цветным при активном маршруте.
- `EXACT_NAV_PATHS` — оставить `/reports` для корректного exact-матчинга активности Statistics.
- Мобильный заголовок (`currentItem` в `MobileHeader`) уже находит пункт по `routeMatchesNavItem`, с одним `/reports` всё работает.
