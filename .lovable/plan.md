## Задача
Открыть функционал объединения дублей (Merge Players) для менеджеров, флор-менеджеров и фин-менеджеров + добавить видимую кнопку доступа + поднять версию.

## Роли с доступом
Разрешить страницу `/admin/merge-players` для:
- `super_admin` (уже есть)
- `manager` (уже есть) — Оксана, Тарас
- `shift_manager` (уже есть, флор-менеджер) — Вадим
- **`finance_manager`** (добавить) — Данияр, Питер

## Изменения

### 1. `src/pages/admin/MergePlayersPage.tsx`
Расширить проверку доступа:
```ts
const allowed = roles.includes("super_admin") 
  || roles.includes("manager") 
  || roles.includes("shift_manager") 
  || roles.includes("finance_manager");
```

### 2. Кнопка/пункт меню
Добавить пункт "Merge Duplicates" в основное меню (там же, где остальные админ-инструменты — sidebar/bottom nav) с иконкой `Users`, видимый только ролям из списка выше. Проверю где определяется навигация (`src/components/layout/*` / route-module-map) и добавлю запись, зависящую от роли.

### 3. Route guard
Убедиться, что маршрут `/admin/merge-players` зарегистрирован и доступен этим ролям (App router). Модуль `merge-players` — если он проходит через `role_module_defaults` / `user_module_permissions`, добавлю миграцию, дающую по умолчанию доступ ролям `manager`, `shift_manager`, `finance_manager`.

### 4. Версия
`package.json`: `1.3.439` → `1.3.440`.

## Проверка
- Открыть страницу под каждой ролью — должно быть доступно.
- Проверить, что basket, поиск, wizard объединения работают полностью (компоненты уже готовы — `DuplicateSuggestions`, `ManualSearch`, `MergeBasket`, `MergeWizard`).
- Кассирам/питу/ресепшн — не видно.

Подтвердите, и я применю.
