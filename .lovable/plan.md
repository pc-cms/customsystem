# Dashboard Phone — оптимизация под iPhone

## Цель
Страница `/boss-phone` должна красиво открываться на iPhone: цифры не обрезаются, шапка не дублируется, контент начинается сразу.

## Что делаем

### 1. Убираем дублирование шапки
- В `BossPhoneDashboard.tsx` убираем внутренний блок с повторным текстом «Dashboard Phone» и логотипом.
- Делаем единую компактную шапку в одну строку: логотип Premier + подпись «Dashboard Phone» + переключатель Today/Month.
- Дата/время EAT убираем из шапки или переносим рядом с переключателем мелким шрифтом, чтобы не занимать вертикальное место.

### 2. Цифры не обрезаются
- В карточках `Metric` и в `Company Total` заменяем ручной `money()` и inline-стили на существующий `Num` из `src/components/boss/tv/primitives.tsx` — он измеряет контейнер и уменьшает шрифт, не обрезая.
- Меняем сетку с `grid-cols-3 gap-1` на пропорциональную: Drop — 1.1fr, Result — 1.25fr (центральная колонка чуть шире), Hold — 0.65fr. Gap между колонками уменьшаем до 4 px.
- Базовый размер цифр в карточках — 13 px, в Company Total — 16 px; `Num` сам подгонит при переполнении.
- Hold остаётся выровненным по правому краю, Drop/Result — по правому краю с `tabular-nums`.
- Добавляем `min-w-0` и `overflow-hidden` на каждую ячейку.

### 3. Компактность и iPhone-оптимизация
- Уменьшаем вертикальные отступы между карточками (`space-y-2` вместо `space-y-3`).
- Добавляем `pt-[env(safe-area-inset-top)]` и `pb-[env(safe-area-inset-bottom)]`, чтобы шапка не уходила под Dynamic Island/Notch.
- Убираем `max-w-[560px]`-центрирование на полной ширине телефона, оставляем `px-3`.
- Цвета и фон остаются Black Gold; логотип Premier сохраняем.

### 4. Файлы
- `src/pages/BossPhoneDashboard.tsx` — единственный файл для правки.
- Используем существующие `Num`, `fmtMoney`, `fmtSigned`, `fmtPct`, `resultColor`, `resultGlow`, `IVORY` из `src/components/boss/tv/primitives.tsx`.
- Формулы и источники данных (`deriveDisplayedToday`, `deriveDisplayedMonthly`, `sumDisplayedToday`, `useBossCasinoDays`, `useAceLiveSlotsResultMany`) не трогаем.

## Проверка
- Typecheck + сборка.
- Playwright на iPhone viewport (390×844): шапка без дублирования, карточки начинаются сразу, длинные суммы (9–12 знаков) не обрезаются и не наползают друг на друга.
- Десктоп `/boss-phone` остаётся работоспособным, но фокус — телефон.
- Публикация не выполняется.
