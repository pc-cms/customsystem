Проблема подтверждается в коде: в `Player Tracking` есть готовый общий механизм `useSessionState`, но сама страница `PlayerStatistics.tsx` всё ещё использует обычный `useState` для табов, периода, поиска, фильтров, Active и сортировки. Поэтому при уходе в другой модуль компонент размонтируется, и всё сбрасывается.

План:
1. Подключить `useSessionState` в `PlayerStatistics.tsx`.
2. Перевести на session-память только безопасные UI-настройки страницы:
   - выбранный tab: Day / Present / Left;
   - date / preset / range;
   - search;
   - category filter;
   - zone filter;
   - Active toggle;
   - sort key + sort direction.
3. Для `Set`-фильтров (`categoryFilter`, `zoneFilter`) хранить в sessionStorage массивы, а в коде обратно собирать `Set`, чтобы фильтрация продолжила работать без багов JSON.
4. Добавить мягкую валидацию сохранённых значений: если в storage попал старый/битый ключ, страница откроется с дефолтами, а не сломается.
5. Не сохранять модалки, выбранного игрока, inline-edit поля и operational edits — только фильтры/сортировку/период.
6. Проверить сценарий:
   - Player Tracking → сортировка по Visits → Incidents → Player Tracking: сортировка остаётся.
   - Active ON → Table Tracking → Player Tracking: Active остаётся ON.

Без backend-изменений, миграций и версии package.json: это frontend/session-state fix.