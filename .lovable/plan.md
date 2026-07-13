## Scope

Переверстать Boss TV под TV 75" (Full HD / 4K) так:

- Каждое казино рендерится **двойным блоком**: две панели рядом — **TODAY** и **MTD** (Month-to-date).
- На широком экране (landscape TV, ≥ 1920px) две панели идут **в колонки** (Today слева, MTD справа).
- На узком/вертикальном (portrait TV или ≤ 1280px) — **две строки** (Today сверху, MTD снизу).
- Внизу страницы — большой блок **COMPANY TOTAL** (сумма по всем казино) с той же двойной структурой Today | MTD.
- Внутри COMPANY TOTAL остаются 100%-stacked-полоски (Drop и Result) с раскладкой по казино цветами.

Всё это в масштабе TV-пресета: очень крупные цифры, безопасные overscan-отступы (уже реализовано `tv:` классами).

## Что показывает каждый блок

**Casino Today** (одна панель на казино):
- Total Drop (крупно)
- Total Result (крупно, +/- цветом)
- Hold %
- Head Count
- Мелким шрифтом: Live drop / Slots drop разбивка

**Casino MTD** (вторая панель):
- MTD Drop
- MTD Result (+/-)
- MTD Hold %

**Company Total** (внизу, во всю ширину):
- Today: Sum(Drop), Sum(Result), Overall Hold, Sum(Head Count) — крупным TV-шрифтом
- MTD: Sum(Drop), Sum(Result), Overall Hold
- Две 100%-stacked-полоски: MTD Drop и MTD Result с долями казино (цвета из `--boss-casino-1..4`)

## Раскладка

```
┌──────────── Header (Premier Casino logo · Business Date · Live indicator) ────────────┐

┌── Arusha ──────────────────────────┐  ┌── Premier ─────────────────────────┐
│  TODAY            │   MTD          │  │  TODAY            │   MTD          │
│  Drop  ###        │   Drop  ###    │  │  Drop  ###        │   Drop  ###    │
│  Result ###       │   Result ###   │  │  Result ###       │   Result ###   │
│  Hold %  · HC     │   Hold %       │  │  Hold %  · HC     │   Hold %       │
└────────────────────────────────────┘  └────────────────────────────────────┘

┌── Mwanza ──────────────────────────┐  ┌── Club  ───────────────────────────┐
│  TODAY            │   MTD          │  │  TODAY            │   MTD          │
│  ...              │   ...          │  │  ...              │   ...          │
└────────────────────────────────────┘  └────────────────────────────────────┘

┌──────────────── COMPANY TOTAL ────────────────────────────────────────────────┐
│  TODAY  Drop ###  Result ###  Hold %  HC ###                                  │
│  MTD    Drop ###  Result ###  Hold %                                          │
│                                                                                │
│  MTD DROP    [▓▓▓▓▓▓▓▓▓▓░░░░░░░░]  Arusha 32% · Premier 28% · Mwanza 24% · … │
│  MTD RESULT  [▓▓▓▓▓▓▓░░░░░░░░░░░]  Arusha 40% · Premier 30% · Mwanza 20% · … │
└────────────────────────────────────────────────────────────────────────────────┘

┌── Top players today (per casino, 5 each) ── │ ── New players today (network) ──┐
```

Top Players / New Players — оставляем как сейчас, ниже COMPANY TOTAL.

## Технические детали

- Grid CSS: `grid grid-cols-1 xl:grid-cols-2 gap-6` для сетки казино. Каждый casino card = `grid grid-cols-1 landscape:grid-cols-2` внутри (портретный TV → строки, ландшафт → колонки). Используем media-query `@media (orientation: portrait)` вместо breakpoint px, чтобы на 4K-портрете layout был правильный.
- Общая структура остаётся адаптивной: 4K = увеличенный шрифт через уже существующий TV-preset (font-size scale).
- Company Total = отдельный компонент `<CompanyTotalPanel>` с двумя `<StackedShareBar>` внутри.
- Данные для агрегата — редьюсим существующий массив `CasinoDay[]` из `useBossCasinoDays`. Никаких новых запросов.
- Overscan-safe area (5% padding) сохраняется.

## Файлы

- `src/pages/BossDashboard.tsx` — переверстать под double-block + company total.
- `src/components/boss/casino-double-block.tsx` — новый компонент (Today + MTD, две панели).
- `src/components/boss/company-total-panel.tsx` — новый компонент.
- `src/components/boss/stacked-share-bar.tsx` — как в прошлом плане.
- `src/index.css` — переменные `--boss-casino-1..4` (hsl).

Всё, что было в предыдущих итерациях плана, остаётся:
1. Скрыть у boss в `role_module_defaults`: `finance_summary`, `finance_budget`, `hr_warnings`, `tips_and_bonuses`, `expenses`, `cashless`, `groups`, `bank_checks`, `pit_rota`, `staff_rota`, `pit_attendance`, `staff_attendance`, `table_tracker`.
2. Landing → `/boss-dashboard` для boss (в `RoleGuard` fallback + early Navigate в `Dashboard.tsx`).
3. Drop today считать из `player_day_drop_cache` (live) + `cage_slots_shifts.manual_drop_slots` (slots).
4. Никакого date-picker — только сегодняшний бизнес-день.
