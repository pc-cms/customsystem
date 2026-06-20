## Цель
Унифицировать popup выбора смен (только буквы, одинаковые размеры/выравнивание, умное позиционирование) и привести легенды Rota/Attendance к единому формату «только время начала».

## 1. `CellPicker.tsx` — единый компонент для всех popup

**Только буквы, одинаковые кнопки**
- Убрать рендер `opt.title` как подписи под кнопкой (строки 127–131). `title` остаётся только как нативный hover-tooltip на `<button title={opt.title}>`.
- Привести все option-кнопки к одинаковому размеру: фиксированная `min-w-[28px] h-6`, центрированный текст, одинаковый padding. Сейчас padding `px-1.5 py-0.5` — ок, добавить `min-w-` и `inline-flex items-center justify-center`.
- Row label (`Hours`, `Sick after Nh` и т.п.) оставить — это разделитель групп, а не подпись опции.

**Горизонтальный flip (новое глобальное правило)**
- Добавить state `dropLeft` параллельно `dropUp`.
- В `useLayoutEffect` помимо вертикальной проверки измерять `spaceRight = window.innerWidth - btnRect.left - 8` vs `popW = pop.offsetWidth`; если `popW > spaceRight` → `setDropLeft(true)`.
- В классе popup: `${dropUp ? "bottom-9" : "top-9"} ${dropLeft ? "right-0" : "left-0"}`.

Это автоматически починит все попапы (Pit rota, Pit attendance, Staff rota, Staff attendance и любые будущие).

## 2. Pit attendance popup (`src/pages/Pit.tsx` ~1082–1099)
- Убрать `title: "Absent"` / `title: "Sick"` у A/S опций — больше не нужны (легенда выше уже объясняет). Опционально оставить как hover-tooltip — но согласно правилу «только буквы» убираем совсем.
- Row label `"Shifts"` и `"Hours"` и `"Sick after Nh"` оставить.
- Никаких изменений в логике save.

## 3. Унифицированные легенды (`только начало смены, без дефисов`)

**Pit (`SHIFT_LABELS` в `src/pages/Pit.tsx`)** — используется в одной общей легенде для rota+attendance:
```
M  → 17:45
N  → 20:45
EM → 17:45        // Extra Middle = тот же старт, что M
EN → 20:45        // Extra Night = тот же старт, что N
L  → Leave
O  → Off
```
A → Absent, S → Sick (статусы, не смены — оставить как есть).

**Floor (`ROTA_GROUPS.floor.shiftLabels` + общий `STAFF_SHIFT_LABELS` в `src/hooks/use-staff.ts`)**:
```
D → 12:30
N → 20:45
E → 17:45         // Extra = Middle-старт (общий с дилерами)
L → Leave
O → Off
```

**Security (`ROTA_GROUPS.security.shiftLabels`)** — уже в нужном формате, не трогать:
```
D 06:00 / M 13:45 / N 17:45 / G 21:45 / L Leave / E Extra / O Off
```
Только заменить `E: "Extra"` → `E: "17:45"` для единообразия, и при желании оставить `L: "Leave"`, `O: "Off"`.

**Office (`ROTA_GROUPS.office.shiftLabels`)** — как Floor.

**Attendance Staff (`STAFF_SHIFT_LABELS`)** — синхронизировать с Floor (используется в `Staff.tsx:217` для D/N подсказок).

Никаких `(...)` скобок, никаких слов `Day`/`Night`/`Middle` — только `HH:MM` для рабочих смен, односложные слова для статусов (`Leave`, `Off`, `Absent`, `Sick`).

## 4. Затронутые файлы
- `src/components/grids/CellPicker.tsx` — popup styling + horizontal flip
- `src/pages/Pit.tsx` — `SHIFT_LABELS`, удалить `title` у A/S
- `src/hooks/use-staff.ts` — `shiftLabels` у floor/security/office + `STAFF_SHIFT_LABELS`

## Не входит
- Логика смен, часов, бэкфилл, backend. Только UI/презентация.
- Легенды Live Game в других местах (Dashboard, Breaklist) не трогаем — у пользователя речь о Rota/Attendance.
