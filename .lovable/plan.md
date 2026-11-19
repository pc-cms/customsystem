# Столы, типы игр, флоты и результаты по играм: полный проект

## 1. Столы во всех казино сейчас

| Казино | Стол | Игра в базе | Статус | Замечание |
|---|---|---|---|---|
| Arusha | AR1, AR2, AR3 | American Roulette | активен | ок |
| Arusha | BJ1 | Blackjack | активен | ок |
| Arusha | P1–P4 | Texas Holdem | активен | ок |
| Arusha | P5 | Texas Holdem | архив | ок |
| Arusha | Club | Club Poker | активен | ок |
| Arusha | NU1 | Niu Niu | активен | ок |
| Arusha | BC1 | Baccarat | архив | ок |
| Dodoma | AR1, AR2, AR3 | American Roulette | активен | ок |
| Dodoma | AR3 (второй) | American Roulette | архив | **дубль имени AR3** |
| Dodoma | BJ1 | Blackjack | активен | ок |
| Dodoma | P1, P2, P4 | Texas Holdem | активен | ок |
| Dodoma | P3, P5 | Texas Holdem | архив | ок |
| Dodoma | N01 | **American Roulette** | активен | **должно быть Niu Niu** |
| Dodoma | N02 | Niu Niu | активен | **порядок 10, стоит рядом с AR1** |
| Mbeya | AR1, AR2 | American Roulette | активен | ок |
| Mbeya | AR3 | American Roulette | архив | ок |
| Mbeya | BJ1 | Blackjack | активен | ок |
| Mbeya | P1–P3 | Texas Holdem | активен | ок |
| Mbeya | P4, P5 | Texas Holdem | архив | ок |
| Mbeya | Club | Club Poker | архив | нет номиналов (для Club это нормально) |
| Mbeya | N01 | Niu Niu | активен | ок |
| Mwanza | AR1, AR2 | American Roulette | активен | ок |
| Mwanza | AR3 | American Roulette | архив | ок |
| Mwanza | BJ1 | Blackjack | активен | ок |
| Mwanza | P1–P4 | Texas Holdem | активен | ок |
| Mwanza | Baccarat | **Texas Holdem** | архив | **должно быть Baccarat** |
| Mwanza | N01 | Niu Niu | активен | ок |

## 2. Найденные проблемы

**Данные**
- 2 стола с неверной игрой: Dodoma N01, Mwanza Baccarat.
- Dodoma: два стола с именем AR3 (один в архиве), N02 стоит не по порядку.

**Тип игры на экранах считается по-разному**
- Statistics, Tables Tracking, Dashboard, Chip Check: уже по общему правилу (сделано в 1.3.760).
- **Pit → Active Players**: всё, что не покер, слева, покер справа. Niu Niu и Baccarat смешаны с рулеткой.
- **Break List**: роли берутся из игры в базе, поэтому N01 в Dodoma получает роли рулетки.
- **Профиль игрока (theo)**: преимущество казино берётся из игры в базе, поэтому неверная игра даёт неверный theo.
- **Расчёт фишек для стола** (use-chips): отдельное правило для рулетки, зависит от игры в базе.
- **Settings → Tables & Float** и **Admin → ACE**: две разные формы создания столов, у каждой свой список игр.

**Создание стола и флот**
- Новый стол должен сразу появляться в Tables Tracking, Chip Check, Break List, Statistics и Dashboard. Statistics и Dashboard теперь берут столы автоматически. Но если при создании выбрать неверную игру, стол попадёт не в ту группу на экранах, где учитывается игра в базе.
- В форме нет проверки уникального имени (так появился второй AR3) и подсказки по порядку.

**Fill и Credit в результатах**
- Tables Tracking, Dashboard, Chip Check: учитываются, но только для текущей смены. Если день прошлый, Fill/Credit не учитываются.
- Boss / TV: с версии 1.3.760 учитываются за бизнес-день.
- Statistics → Tables: берёт закрытые результаты (Fill/Credit уже внутри), отдельных колонок Fill/Credit нет.

## 3. Что исправить

**A. Данные (по вашему подтверждению)**
- Dodoma N01 → Niu Niu; Mwanza Baccarat → Baccarat.
- Dodoma N02: порядок после N01. Архивный дубль AR3 удалить: проверено, у него нет ни транзакций, ни результатов, ни подсчётов, ни Fill/Credit.

**B. Один источник типа игры**
- Pit Active Players, Break List, theo в профиле игрока, расчёт фишек — всё через общий модуль типов игр. Для блоков: Roulette / Poker / Blackjack / Niu Niu / Baccarat / Club.

**C. Создание стола**
- Одна форма и один список игр для Settings → Tables & Float и Admin.
- Нельзя создать два стола с одинаковым именем в одном казино (проверка в базе). Если имя не подходит к игре (например, AR с Poker), форма показывает предупреждение.
- Новый стол сразу закрыт, номиналы стандартные, порядок автоматически в конце своей группы. Он сразу появляется во всех экранах без запросов.

**D. Fill и Credit**
- Tables Tracking, Dashboard, Chip Check: на прошлый день учитывать Fill/Credit всех смен этого бизнес-дня (07:00–07:00), на сегодня — как сейчас.
- Statistics → Tables: в раскрытии дня показывать колонки Fill и Credit по каждому столу (уже есть в данных).

**E. Версия** 1.3.760 → 1.3.761.

## Ваши решения
1. Игру Dodoma N01 и Mwanza Baccarat исправить — да.
2. Архивный дубль AR3 в Dodoma удалить — да.
3. Имя стола уникально в рамках казино — да.

## Технические детали
- Данные: UPDATE gaming_tables (game, display_order, name) через запрос к данным; удаление дубля AR3 (id e634b373…) после повторной проверки ссылок, без касания результатов и транзакций.
- Уникальность: unique index (casino_id, lower(name)) после удаления дубля.
- ActivePlayers.tsx, BreaklistGrid.tsx (TABLE_ROLES по gameGroupOf), PlayerProfile.tsx и casino-edges.ts, use-chips.ts → `gameGroupOf`.
- Одна форма: вынести общий диалог из TableManagement.tsx; AceEgmLiveTab использует его.
- `useShiftTableAdjustments`: для прошлой даты запрос cage_transfers по окну бизнес-дня.
