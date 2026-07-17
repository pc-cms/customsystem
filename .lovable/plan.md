# Промо-страница `/lucky` — "The Lucky One"

Мобильная промо-страница для гостей, отсканировавших QR на обратной стороне физического Lucky Chip. Объясняет, что человек стал обладателем счастливого жетона, и приглашает в одно из 4 казино.

## Маршрут и доступ

- Публичный маршрут `/lucky` (без авторизации).
- Регистрируется рядом с существующими Club-маршрутами в `src/App.tsx`.
- Работает на всех доменах, включая `casinosystem.app` и `premier.casinosystem.app`.
- Дизайн mobile-first (макс. ширина `max-w-xl`, как ClubLanding), но корректно смотрится и на десктопе.

## Визуальный стиль (наследует Club guideline)

Используем те же токены и компоненты, что и `ClubLanding`:
- Фон: `ClubBackdrop` (тёмно-красный `#A0000D` + золотые концентрические кольца + точечная сетка).
- Золото: `#E8C688` (основное), `#A68E61` (приглушённое).
- Шрифт: `font-faberge` (уже подключён), трекинг `[0.3em]–[0.4em]` для caps.
- Карточки: чёрный полупрозрачный фон `bg-black/50` с золотой hairline-рамкой.
- Логотип: `/premier-club-logo.svg`.
- Футер: `ClubFooter` (Privacy / Data / Responsible Gaming + copyright).

## Структура страницы (сверху вниз)

```text
┌──────────────────────────────────┐
│ HERO                             │
│  [Premier logo]                  │
│  eyebrow: "CONGRATULATIONS"      │
│  H1: "THE LUCKY ONE"             │
│  анимированный "чип" (SVG)       │
│  sub: "You've received a         │
│        Premier Lucky Chip."      │
├──────────────────────────────────┤
│ WHAT IS THIS?                    │
│  3 короткие карточки:            │
│  ① You hold a real chip          │
│  ② It has a cash value           │
│  ③ Redeem it at any Premier      │
├──────────────────────────────────┤
│ HOW TO REDEEM (3 шага)           │
│  01 Visit any Premier Casino     │
│  02 Present your Lucky Chip      │
│     at the cage                  │
│  03 Play or cash out             │
├──────────────────────────────────┤
│ FIND US — 4 CITIES               │
│  Карточки Arusha / Mwanza /      │
│  Dodoma / Mbeya. Каждая:         │
│   • название города              │
│   • адрес (текстом)              │
│   • кнопка "Open in Maps" →      │
│     Google Maps deep link        │
│   • кнопка "Call" (tel:) — если  │
│     телефон есть на              │
│     premiercasino.tz             │
├──────────────────────────────────┤
│ TERMS (мелким шрифтом)           │
│  • Chip must be presented        │
│    physically at the cage        │
│  • Valid ID (18+) required       │
│  • One chip per person per visit │
│  • Non-transferable, no cash     │
│    value without redemption      │
│  • Subject to house rules        │
├──────────────────────────────────┤
│ FINAL CTA                        │
│  "See you at the tables."        │
│  → большая кнопка                │
│    "Find Nearest Premier"        │
│    (скроллит к секции городов)   │
├──────────────────────────────────┤
│ ClubFooter                       │
└──────────────────────────────────┘
```

Единственный CTA согласно ответу — "Open in Maps" в блоке городов. Верхний Final CTA просто скроллит к нему.

## Google Maps метки

Каждая карточка города содержит кнопку, открывающую нативные карты через универсальный deep link:

```
https://www.google.com/maps/search/?api=1&query=<lat>,<lng>&query_place_id=<place_id>
```

На iOS/Android это открывает приложение Google Maps (или Apple Maps как fallback), на десктопе — веб-версию. `target="_blank" rel="noopener"`.

Я парсну адреса и координаты 4 казино с `https://premiercasino.tz` через `fetch_website` перед реализацией. Если сайт не отдаёт координаты — использую поисковый запрос по названию + городу:

```
https://www.google.com/maps/search/?api=1&query=Premier+Casino+Arusha
```

Fallback точно работает на всех устройствах.

## Мобильная оптимизация

- `viewport` уже задан в `index.html`.
- Всё в одну колонку, tap-targets ≥ 44px, `active:scale-[0.98]` для тактильного отклика.
- Тяжёлых изображений нет — только SVG (фон, логотип, чип).
- Ленивая загрузка не нужна, страница компактная.
- QR-сканеры открывают в in-app browser (Chrome Custom Tabs / SFSafariViewController) — работает нативно.

## SEO / head

Через `react-helmet-async` (провайдер уже стоит):
- `<title>The Lucky One — Premier Casino</title>`
- `<meta name="description" content="You've received a Premier Lucky Chip. Redeem it at any of our four casinos in Arusha, Mwanza, Dodoma or Mbeya." />`
- `<meta name="robots" content="noindex" />` — страница только для держателей чипа, не должна индексироваться.
- `og:title`, `og:description`, `og:type=website`.

## Файлы

Новые:
- `src/pages/lucky/LuckyPage.tsx` — вся страница одним файлом (небольшая, отдельные компоненты не нужны).
- `src/pages/lucky/casino-locations.ts` — константа с адресами + координатами (после парсинга premiercasino.tz).

Изменяемые:
- `src/App.tsx` — добавить публичный маршрут `<Route path="/lucky" element={<LuckyPage />} />`.

Не трогаю: существующие Club-компоненты (`ClubBackdrop`, `ClubFooter`) — используются как есть.

## Технические детали

- Только фронтенд. Никакой БД, никакой авторизации, никакого трекинга.
- Аналитика/UTM — не сейчас (можно добавить позже, если понадобится замерять конверсию QR).
- Никакой валидации серийника чипа (это тоже отдельная фича, если понадобится в будущем).
