# Основные категории расходов (17) в Casino Monthly Balance

Вводим фиксированный верхний уровень из 17 главных категорий. Все существующие статьи расходов становятся подкатегориями внутри них. В отчёте по умолчанию видны только 17 строк (+ Unallocated), раскрытие показывает подкатегории.

## Главные категории

Taxes, Rent, Rent Equipment, Service, Licences, Visa & Permits, Transport, Salary, Utilitys, Bar, Stationary, CAPEX, Marketing, Repair, Bonus, Corporate, Fees.
18-я служебная строка — **Unallocated** — для статей, которым главная категория ещё не назначена (Collection, Money Change, Inter-Casino Transfer и т.п.). Она всегда внизу списка.

## Что меняется

### 1. Отчёт Expenses by Category (открывается из колонки Expenses в CMB)
- Строки = 17 главных категорий в указанном порядке + Unallocated.
- Каждая строка сворачиваемая: внутри — текущие статьи (подкатегории) с теми же колонками по дням.
- Суммы главной строки = сумма подкатегорий по каждому дню и по Total.
- Клик по сумме (главной или подкатегории) открывает боковую панель со списком расходов, как сейчас.
- Пустые ячейки — 0, палитра/тепловая карта без изменений.
- Такое же поведение в Company → Expenses (casino / office scope).

### 2. Ввод расхода
Во всех формах создания расхода (Daily Expenses, Add Office, Slots Expenses) выбор становится двухшаговым:
1. Main category — список из 17.
2. Subcategory — статьи, привязанные к выбранной главной.

Плюс кнопка **+ New subcategory** прямо в форме (для ролей с правом администрирования): создаёт новую статью внутри выбранной главной категории. Сами 17 главных категорий фиксированы и не редактируются.

### 3. Уже внесённые расходы
Не трогаем: они привязаны к своим статьям, а те — к главным категориям, поэтому исторические цифры автоматически перегруппируются по новым главным строкам.

## Техническая часть

- Новая таблица `fin_main_categories` (code, label, sort_order) с сидом 17 записей + GRANT/RLS (чтение всем аутентифицированным, изменение — админам).
- Новая колонка `fin_categories.main_code` (nullable, FK на `fin_main_categories.code`). NULL → строка Unallocated.
- Первичный маппинг существующих статей задаётся data-миграцией по смыслу названий (Hall Rent/House Rent → Rent, EGT & Novomatic → Rent Equipment, GB Gaming Licence/Fire/COSOTA → Licences, Work Permits → Visa & Permits, Petrol/Taxi/Service Car → Transport, Salary/зарплатные → Salary, Internet/DSTV/электро-вода → Utilitys, Food/Alcohol/Bar charge → Bar, Service Levy/аудит/юрист → Fees, CAPEX → CAPEX и т.д.). Не распознанные остаются NULL → Unallocated.
- `use-expenses-matrix.ts`: возвращает дерево `main → subcategories`, суммы считаются на обоих уровнях.
- `ExpensesMatrix.tsx`: строки-группы с раскрытием (SmartTable), заголовок группы жирный, подстроки с отступом.
- Формы ввода: общий компонент выбора «Main → Sub» на базе `use-expense-categories` / `fin_categories`.
- Версия приложения повышается.

## Открытый пункт
Точный маппинг существующих статей я предложу в миграции; после применения его можно поправить, перепривязав статью к другой главной категории.
