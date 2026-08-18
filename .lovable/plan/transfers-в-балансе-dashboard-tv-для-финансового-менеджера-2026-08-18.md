# Transfers в балансе + Dashboard TV для финансового менеджера

## 1. Transfers вычитаются из Expected

Сейчас строка «Transfers (internal move)» показывается справочно и не входит в формулу. Меняем: трансферы считаются реальным движением денег наружу, как Collections.

Новая формула:
```text
Expected = Starting Float + Live + Slots + Other + JP + Card Balance
           + Miss Chips + Miss Cards − Expenses − Collections − Transfers
Actual   = Σ кошельков (физический пересчёт или ledger)
Variance = Actual − Expected
```

Интерфейс на странице Wallets:
- Строка «Transfers (internal move)» становится «Transfers» — красная, со знаком «−», рядом с Collections; больше не приглушённая справочная.

## 2. Dashboard TV для Михаила (обе учётки)

- Модуль `boss_dashboard` (Dashboard TV) открывается роли финансового менеджера — появляется в сайдбаре и доступен по маршруту.
- Обе учётные записи Михаила получают видимость всех казино на этом экране (как у boss/GM), при этом остальные их права не меняются.
- Доступ только на просмотр: запись/редактирование на Dashboard TV не появляется.

## Технические детали

- `src/hooks/use-fin-balance.ts` → `computeBalanceTotals`: вычесть `transfers_total` из `expected`; обновить комментарий формулы.
- `src/pages/finances/FinancesWalletsPage.tsx` (~строка 678): строка Transfers как отрицательная (тон/знак как у Collections), убрать `muted`.
- Проверить и обновить регрессионный тест `src/test/expenses-collections-regression.test.ts`, если он фиксирует нейтральность трансферов.
- Права: добавить строку в `role_module_defaults` для `finance_manager` → `boss_dashboard` (can_view = true, can_write = false), плюс per-user override для двух учёток Михаила при необходимости.
- Кросс-казино доступ на Dashboard TV: обеспечить, что список казино для этих пользователей включает все казино (проверка `can_view_all_casinos` / RLS на `casinos`), не расширяя доступ к другим модулям.
- Поднять версию в `package.json`.
