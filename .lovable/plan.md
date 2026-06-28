# Откатить Result везде на сырой Cash In

Везде у игрока: `Result = (Cashout + Chip Out) − (Cash In + Chip In)`, `Total = Result − Comps`. Drop (peak-NEP) остаётся отдельным тайлом/колонкой и в Result НЕ участвует.

## Места, где я менял Result (все 6) — откатить

| # | Файл / строка | Сейчас (peak-NEP Drop) | Откатить на (сырой Cash In) |
|---|---|---|---|
| 1 | `src/pages/PlayerStatistics.tsx:408` (строка игрока) | `(out + chip.out) − (visitDropR + chip.in)` | `(out + chip.out) − (cashInRaw + chip.in)` — взять сырую сумму buy-in за период по игроку (то, что уже считается для колонки Cash In в той же строке). |
| 2 | `src/components/player/PlayerPreviewHeader.tsx:342` (тайл Result в шапке) | `(cashOut + chipOut) − (drop + chipIn)` | `(cashOut + chipOut) − (cashIn + chipIn)` — `usePeriodPlayerStats` уже возвращает сырой `cashIn`, использовать его. |
| 3 | `src/pages/PlayerProfile.tsx:259` (Lifetime тайл Result/Total) | `(cashout + chipOut) − (drop_peakNEP + chipIn)` | `(cashout + chipOut) − (dropGross + chipIn)`, где `dropGross = economy.total_drop` — сырой lifetime Cash In. |
| 4 | `src/pages/PlayerProfile.tsx:289-309` (Period тайл Result/Total в Info/History) | `pIn = Σ peak` из `dropByDay` | `pIn = Σ amount` по транзакциям `buy`/`in` в окне `rangeStartMs..rangeEndMs`. Тайл **Drop** в той же шапке периода берёт `Σ peak` в отдельную переменную (не сливаем). |
| 5 | `src/pages/PlayerProfile.tsx:611` (Visits — построчно) и `:701-703` (футер Total period) | `(cashout + chipOut) − (dropR + chipIn)` | `(cashout + chipOut) − (totalIn + chipIn)` — построчно и `(pOut + pChipOut) − (pIn + pChipIn)` в футере (где `pIn = Σ f.totalIn`). |
| 6 | `src/components/player/PlayerVisitsBreakdown.tsx:83` | `(out + chipOut) − (drop + chipIn)` | `(out + chipOut) − (cashIn + chipIn)` — в агрегаторе `Agg` уже есть/добавить сырой `cashIn` и использовать его вместо `drop`. Колонка Drop остаётся отдельной (peak-NEP). |

## Что НЕ меняем

- **Cash In** — везде остаётся сырой суммой buy-in транзакций. Я его нигде не пересчитывал — оставляем как есть.
- **Drop** — везде остаётся peak-NEP из `player_day_drop_cache` (`Σ` дневных пиков за период). Это отдельный тайл/колонка.
- `player_day_drop_cache` / `table_day_drop_cache`, RPC, триггеры — без изменений.
- `ShiftClosingReport.tsx` — там Result это **по столу**, не по игроку. Не трогаем.
- Reports.tsx / ActivePlayers.tsx — текущая правка туда Result не вносила (только сменили источник Drop-колонки). Перепроверим во время реализации, но Result-формулу там сейчас не правим, если она уже = `(Out + ChipOut) − (In + ChipIn)`.

## Результат для пользователя

- В карточке PATRA PATAL: Info/History тайл Total и сумма строк Visits снова сойдутся (обе посчитаны по сырому Cash In).
- Drop тайлы и колонки Drop остаются как сейчас — peak-NEP — и могут быть меньше Cash In, это нормально.
- Result/Total во всех вкладках и шапках строится по одной формуле и совпадает построчно с футером.
