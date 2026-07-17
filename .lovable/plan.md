## Изменения на `/lucky`

### 1. Верхняя навигационная шапка (sticky)
Новая шапка вместо текущей строки `PREMIER · CASINO`:

- **Слева:** кнопка-ссылка `Home` → `https://premiercasino.tz` (новая вкладка)
- **По центру:** крупная надпись **PREMIER CASINO** (шрифт Faberge, крупно, tracking 0.35em, золото) — как лого-заголовок, **без слоника** `/premier-club-logo.svg`
- **Справа:** кнопка-ссылка `Locations` → `https://premiercasino.tz/#locations` (новая вкладка)
- Sticky сверху, полупрозрачный тёмный фон с blur, тонкая золотая линия снизу
- Тап-цели ≥ 44px, адаптивно на мобильном (лого центр, ссылки по краям в один ряд)

### 2. Hero — слоник встраивается внутрь фишки
- Убрать отдельный `<img src="/premier-club-logo.svg">` над чипом
- Внутрь SVG-фишки (в центральный круг r=34) добавить `<image href="/premier-club-logo.svg">` — слоник становится «лицом» фишки и **крутится вместе с ней** (анимация `spin 18s` уже на SVG)
- Убрать нижний текст `LUCKY` в центре (место занимает слоник) — либо оставить как маленькую подпись под слоном; решаю **убрать**, чтобы центр читался чисто
- Заголовок `THE LUCKY ONE` и подпись `Congratulations` остаются

### 3. Тексты про «tables / slot credits»
Уточнить формулировку в двух местах:

- Карточка `Redeem With Us`:  
  «Bring it to any Premier Casino. **Play it on the tables — or exchange it for slot credits.**»
- Шаг `03`:  
  Заголовок: `Play on Tables or Slots`  
  Описание: `Play this chip on the tables — or exchange it for slot credits.`

### 4. Футер с политиками (как в Club)
Заменить `<ClubFooter minimal />` на `<ClubFooter />` — выводит ссылки Privacy Policy / Personal Data Protection / Responsible Gaming (`/club/privacy`, `/club/data-protection`, `/club/responsible-gaming`) + copyright.

### 5. Без изменений
Фон, `ClubBackdrop`, секции Manifesto / What Is This / How to Redeem / Locations / Terms / Final CTA, маршруты, SEO-мета.

### Технические детали
- Правки только в `src/pages/lucky/LuckyPage.tsx`.
- Шапка — inline-компонент внутри файла.
- Ссылки Home/Locations — `<a href target="_blank" rel="noopener noreferrer">` (внешний домен).
- Слоник внутри SVG: `<image href="/premier-club-logo.svg" x="46" y="46" width="48" height="48" />` в центре, поверх — без отдельного div-overlay.
