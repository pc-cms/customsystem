# Company: четыре отчёта + Office Monthly Balance + раздел Demo

## 1. Новая секция меню «Company»

В левом меню появляется секция **COMPANY** с четырьмя пунктами:

- **Casino Monthly Balance** — существующий `/reports/daily-balance` (пункт из FINANCE переносится сюда, дубля не остаётся).
- **Office Monthly Balance** — новая страница `/reports/office-balance`.
- **Expenses · Casino** — матрица расходов, только кассовые (live game + slots).
- **Expenses · Office** — та же матрица, только офисные расходы.

Матрица расходов сейчас одна и без фильтра по источнику; она получает параметр источника и разводится на два пункта меню (одна страница, два режима). Проверено: в базе у расходов есть источники `live_game`, `slots`, `office`.

## 2. Office Monthly Balance

Строение — как у Casino Monthly Balance (день = строка, sticky-шапка, тоталы внизу, раскрывающиеся секции, drill-down по клику), но колонки другие:

```text
Date | Fin Result | IN: Arusha Mwanza Dodoma Mbeya (+Total) | Cage Office | Bank | Expenses (office) | Transfer → Casino | OUT | Money | Balance
```

- **IN по казино** — деньги, фактически пришедшие в офис из кассы каждого казино за день (collection / transfer cage → office). Колонка Total по всем казино — headline, отдельные казино раскрываются стрелкой.
- **Diff (chips/cards) отсутствует** — это уровень казино, в офисном отчёте его нет.
- **Cage Office** — одна колонка: остаток офисных сейфов/кошельков на конец дня.
- **Bank** — TZS + USD (раскрытие на две колонки), как в казиношном отчёте.
- **Expenses** — только офисные расходы.
- **Transfer → Casino** — деньги, отправленные обратно в казино.
- **OUT** — вывод владельцу (collection / withdrawal), последняя колонка.
- **Fin Result = IN Total − Expenses − OUT** (движения между офисом и казино не считаются прибылью).
- Тоталы: потоки суммируются за месяц, остатки (Cage Office, Bank, Money) берутся по последнему дню.

Данные считаются по всем казино сразу (не по активному), источник — кошельковые движения и офисные расходы.

## 3. Оформление (обе таблицы + матрицы расходов)

- Шапка заметно крупнее и жирнее: белый текст на насыщенной цветной заливке вместо нынешнего блёклого серого.
- Каждая зона колонок — свой цвет шапки и своя заливка ячеек, на стыках двойные границы.
- Стрелки раскрытия секций — крупнее, в виде явной кнопки.
- Строка Total внизу — крупнее и контрастнее остальных, пересечение Total × Total самое яркое.
- Всё через семантические токены в `src/index.css`, без хардкода цветов.

## 4. Раздел меню «Demo»

Отдельная секция **DEMO** с теми же четырьмя страницами, но полностью заполненными демонстрационными цифрами:

- Demo · Casino Monthly Balance
- Demo · Office Monthly Balance
- Demo · Expenses Casino
- Demo · Expenses Office

Демо-данные — синтетические, зашитые в код (в базу ничего не пишем, реальные финансы не затрагиваются). Профиль цифр строится по образцу реальных расходов Аруши за июль (по категориям и порядку сумм), полный месяц заполнен по всем колонкам: результаты, кассы, банк, трансферы, расходы, OUT. На страницах виден бейдж «DEMO».

## 5. Ранее оговорённые правки Casino Monthly Balance

Остаются в этой же работе:

- В панели деноминаций: оригинальная сумма в валюте → курс → итог в TZS (для TZS курс прочерком).
- **Fin Result = Casino Result − Expenses ± Diff** (Tips, Fees и Office net из формулы убираются), тултипы обновляются.

## Технические детали

- Новые файлы: `src/pages/reports/OfficeBalanceReport.tsx`, `src/hooks/use-office-balance-report.ts`, `src/lib/demo/monthly-balance-demo.ts` (синтетика), `src/lib/office-balance-formulas.ts`.
- Правки: `src/components/layout/AppSidebar.tsx` (секции COMPANY и DEMO), `src/App.tsx` (маршруты), `src/lib/route-module-map.ts` (маппинг доступа), `src/pages/reports/ExpensesMatrix.tsx` (режим casino/office), `src/pages/reports/DailyBalanceReport.tsx`, `src/hooks/use-daily-balance-report.ts`, `src/lib/monthly-balance-formulas.ts`.
- Общая стилистика таблицы выносится в переиспользуемые классы/токены, чтобы Casino и Office отчёты выглядели одинаково.
- Доступ к секциям Company и Demo — super_admin, finance_manager, general_manager, boss.
- Поднять версию в `package.json`.
