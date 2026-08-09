# Rota Management / Attendance Management

Две отдельные кнопки внутри обычных разделов Rota и Attendance (рядом с Floor / Security / Office). Сетка общая по всем казино сразу — не зависит от выбранного казино в шапке.

## Как выглядит

Месячная сетка: строки — люди, колонки — дни. Люди сгруппированы в блоки:

```text
ARUSHA
  Taras        D  M  N  ·  D ...
  Peter        ...
  Konstantin   ...
DODOMA
  ...
MWANZA
  ...
MBEYA
  Daniyar / Hussein ...
OFFICE
  ...
CCTV
  Andrew      ARU  MWZ  ·  DOD ...
  Alex        ...
```

- Блоки казино + Office: в клетке ставится смена — `D` 10:00–18:00 (8ч), `M` 13:00–21:00 (8ч), `N` 18:00–06:00 (12ч). Пусто = выходной, `L` = Leave. В Office такие же смены.
- Блок CCTV: смена всегда 18:00–06:00 (12ч), поэтому выбирается не смена, а **город**: `ARU`, `MWZ`, `MBI`, `DOD` — где человек сегодня работает удалённо.
- Итоги по человеку справа: дни и часы. У CCTV дополнительно разбивка по городам.

## Список людей

Из списка Incidents. Менеджеры распределены по своим блокам-казино:

- Arusha: Taras, Peter, Konstantin
- Mbeya: Daniyar, Hussein
- Остальные менеджеры (Bakha, Carol, Oxana, Raushan, Sergey T, Sveta, Vadim, Valeriy, Yurii) — по блокам Mwanza / Dodoma / Office, расставим по вашему указанию, поправить можно в один клик.
- CCTV: Andrew, Alex, Vladimir, Vitalii

Список хранится в справочнике в базе (блок, активность, порядок), пополняется без правки кода.

## Attendance

- Заполняется автоматически из роты: стоит смена/город → день отработан, часы по смене (`D` 8, `M` 8, `N` 12, CCTV 12).
- Поверх можно вручную поставить `A` (отсутствие), `L` (отпуск), `S` (больничный) — ручное значение важнее авто.
- Ручная правка не стирает роту, хранится отдельным слоем.

## Права

- Менеджер: видит всех, редактирует сетку.
- CCTV (surveillance): видит всё, редактирует только блок CCTV.
- GM и super_admin: редактируют всё.
- Остальные роли — только просмотр по правам модуля.

## Техническая часть

Новые таблицы (миграция, с GRANT + RLS):

- `management_people` — `id`, `name`, `block` (`casino` | `office` | `cctv`), `casino_id` (для блоков-казино), `is_active`, `sort_order`.
- `management_rota` — `person_id`, `date`, `shift` (`D`/`M`/`N`/`L` — для не-CCTV), `city_casino_id` (для CCTV), уникальность `(person_id, date)`.
- `management_attendance` — `person_id`, `date`, `value` (`A`/`L`/`S`), `recorded_by`, уникальность `(person_id, date)`.

Доступ: чтение — всем аутентифицированным с правом модуля (без casino-скоупа); запись — `is_manager_op` / `general_manager` / `super_admin`, плюс `surveillance` только для строк с `block = 'cctv'`.

Фронтенд:

- Переиспользовать существующие ключи вкладок `rota_management` / `attendance_management` (`src/pages/flat/StaffFlat.tsx`), заменив их содержимое на новую сетку.
- Новый компонент `src/components/management/ManagementGrid.tsx` — месяц, блоки, клетки, стиль как у существующей Staff Rota.
- Хук `src/hooks/use-management-rota.ts` — чтение месяца, оптимистичная запись клетки, инвалидация.
- Часы: в `src/lib/shift-hours.ts` добавить scope `management` (D 8, M 8, N 12) и CCTV 12.
- Поднять версию приложения.
