
# Заливка шаблона Mbeya в Cloud (один SQL-скрипт)

Копируем справочники из Arusha в Mbeya, чтобы после `install.sh` локальный сервер сразу подтянул готовую структуру. Никакой операционной истории не копируем.

## Что заливаем в Mbeya (`7ab2eee1-…`)

| Таблица | Действие | Кол-во |
|---|---|---|
| `chip_color_settings` | +10 недостающих номиналов из Arusha; включаем видимость топ-2 существующих | 12 итого |
| `chip_initial_baseline` | структура из Arusha, `initial_quantity = 0` | +11 |
| `chip_baseline` (cashier) | структура из Arusha, `expected_quantity = 0` | +11 |
| `chip_baseline` (table) | маппинг Arusha→Mbeya по имени стола, `expected_quantity = 0` | ~48 |
| `fin_wallets` | все 12 кошельков (Safe TZS/USD/EUR/GBP/KES, CRDB TZS/USD, AirTell/Tigo/Halo/M-Pesa, Main Phone) с балансом 0 | +12 |
| `gaming_tables` | добавляем недостающий стол `Club` (Club Poker) | +1 (итого 10) |
| `fin_daily_rates` | сегодняшние курсы: USD 2600 · EUR 2800 · GBP 3000 · KES 17 | +4 |

Всё через `INSERT … WHERE NOT EXISTS` — повторный запуск безопасен.

## Что уже готово в Mbeya и НЕ трогаем
- 9 столов (AR1-3, BJ1, P1-5), 65 сотрудников, 15 категорий расходов, 5 PAYE брекетов, payroll_settings, pos_locations.

## Что НЕ копируем (чистая история)
transactions, shifts, cage_slots_shifts, client_sessions, players, fin_wallet_tx, fin_day_closing, expenses, pos_orders, activity_logs, incidents, chip_snapshots, chip_transfers, table_daily_results, chip_emissions.

## После заливки
IP и WireGuard настраиваем на месте после разворота образа (как договорились).

**Подтверди — жму Insert.**
