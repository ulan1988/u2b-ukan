# Схема БД нового ядра ERP (U2B / финанс-модель)

Фундамент под цепочку документов с двойной проводкой: закуп → приходные накладные
(по поставщикам) → доставка → расходная накладная → финанс/дашборд. Одна база,
`org_id` на всём (мульти-орг: мы + 2 филиала). Деньги = `numeric`, удаления нет —
архивация/сторно. Черновик v1, дорабатываем вместе.

---

## Карта связей (кто на кого ссылается)

```
organization ─┬─< user
              ├─< contragent ──(если филиал)──> organization
              ├─< product* (общий каталог, можно глобально)
              ├─< warehouse
              ├─< cash_account
              └─< document ─┬─< document_line >── product
                            │
                            ├── contragent   (поставщик для прихода / клиент для расхода)
                            ├── warehouse
                            └── created_by (user)

document(приход) ──< doc_link >── document(расход)   ← ЦЕПОЧКА (рентабельность, «блокчейн»)

payment ── contragent, cash_account, document?      ← ОПЛАТЫ (деньги)
stock_movement ── warehouse, product, document      ← ОСТАТКИ СКЛАДА
opening_balance ── contragent | warehouse+product | cash_account   ← НАЧАЛЬНЫЕ ОСТАТКИ из 1С
```

---

## 1. Справочники

### organization — организация
| поле | тип | смысл |
|---|---|---|
| id | pk | |
| name | text | «U2B головной», «Филиал-производитель», «Филиал-продавец» |
| kind | text | `hq` \| `producer_seller` \| `seller` |
| archived | bool | |

### user — пользователь системы
`id, org_id→organization, name, phone, email, password(bcrypt), role (admin|bookkeeper|logist|manager|…), active, created_at`

### contragent — контрагент (клиент/поставщик; филиал тоже контрагент)
| поле | тип | смысл |
|---|---|---|
| id | pk | |
| org_id | fk | в чьей книге числится |
| name | text | |
| kind | text | `client` \| `supplier` \| `both` |
| org_ref_id | fk? | если контрагент — наш филиал, ссылка на его `organization` (для меж-орг продаж) |
| price_type | text | `retail` \| `opt` — какая цена по умолчанию |
| phone, comment | | |
| archived | bool | |

### product — номенклатура (общий каталог)
`id, name, unit, category (material|goods|service), group, subgroup, archived, created_at`
> `category` решает правило филиалов: филиалу-продавцу продаём только `goods`, производителю — `material`+`goods`.

### price — цены (гибко: приход/розница/опт, можно по орг)
`id, product_id→product, price_type (in|retail|opt), org_id?(null=глобально), amount numeric, valid_from`
> Проще на старте держать 3 цены полями в `product`; вынести в `price` когда понадобится история/пер-орг.

### warehouse — склад
`id, org_id, name, is_central(bool), archived` — Центр-Склад = `is_central`.

### cash_account — касса/банк (для остатка денег)
`id, org_id, name, kind (cash|bank), currency (default 'KZT'), archived`

---

## 2. Документы (ядро)

### document — накладная/документ
| поле | тип | смысл |
|---|---|---|
| id | pk | |
| org_id | fk | чья книга |
| type | text | `purchase` (приход/закуп) \| `sale` (расход/продажа) \| `production` (производство: материалы→товар) \| `transfer` (перемещение между складами/орг) \| `act` (акт услуг/сверка) \| `opening` (нач. остаток) |
| number | text | ЗП-0001-DDMMYY / ПР-0001-DDMMYY (раздельные счётчики по типу) |
| contragent_id | fk | поставщик (приход) / заказчик (расход) |
| warehouse_id | fk | склад прихода/отгрузки |
| date | date | дата документа |
| status | text | `draft` \| `posted` (проведён) \| `paid` \| `cancelled` (сторно) |
| total | numeric | сумма (Σ строк; хранить для скорости отчётов) |
| comment | text | |
| created_by | fk | user |
| created_at, updated_at | ts | |

### document_line — позиция накладной
| поле | тип | смысл |
|---|---|---|
| id | pk | |
| document_id | fk→document | |
| product_id | fk→product | |
| role | text | `main` (приход/расход) \| `input` (сырьё в производство) \| `output` (готовый товар из производства) |
| qty | numeric | кол-во |
| price | numeric | цена за единицу |
| amount | numeric | сумма (qty×price, либо по размерам — см. ниже) |
| length_cm, width_cm, area_m2 | numeric? | РАЗМЕРЫ (для производителя) |
| rate | numeric? | ставка за м² (см×м²×сумма) |
| comment | text | |
> **Размерное ценообразование (производитель):** если заданы размеры — `amount = area_m2 × rate × qty`, иначе обычное `qty × price`. Это те «особенные колонки см · м² · сумма», что нужны филиалу-производителю.

### doc_link — цепочка приход↔расход (рентабельность / «блокчейн»)
`id, purchase_doc_id→document, sale_doc_id→document, product_id, qty numeric`
> Наследник нашего `ProcurementLink`. По нему: себестоимость каждой продажи, маржа, «из какого закупа ушло сколько кому».

---

## 3. Деньги

### payment — оплата
| поле | тип | смысл |
|---|---|---|
| id | pk | |
| org_id | fk | |
| contragent_id | fk | кому/от кого |
| direction | text | `in` (от клиента, гасит дебиторку) \| `out` (поставщику, гасит кредиторку) |
| amount | numeric | |
| date | date | |
| cash_account_id | fk | из какой кассы/на какой счёт |
| document_id | fk? | какой документ гасит (или null = общий баланс, FIFO) |
| comment, created_by, created_at | | |

---

## 4. Склад и начальные остатки

### stock_movement — движение товара (для остатков)
`id, org_id, warehouse_id, product_id, qty numeric (+приход / −расход), document_id→document, date`
> Остаток склада = Σ(qty) по (warehouse, product). Приход (+) от `purchase`, расход (−) от `sale`.

### opening_balance — начальные остатки (разовый импорт из 1С)
| поле | тип | смысл |
|---|---|---|
| id | pk | |
| org_id | fk | |
| kind | text | `debt` (сальдо контрагента) \| `stock` (остаток товара) \| `cash` (остаток денег) |
| contragent_id | fk? | для `debt` |
| warehouse_id, product_id | fk? | для `stock` |
| cash_account_id | fk? | для `cash` |
| amount | numeric | сумма долга / кол-во товара / сумма денег |
| direction | text? | для `debt`: нам должны / мы должны |
| as_of | date | дата отсечения |

---

## 5. Как из этого считается ВСЁ (SQL-агрегаты, мгновенно)

- **Долг контрагента** = `opening_balance(debt)` + Σ(`document` sale к нему) − Σ(`payment` in от него)  [клиент];
  + Σ(`document` purchase у него) − Σ(`payment` out ему)  [поставщик].
- **Остаток склада** = `opening_balance(stock)` + Σ(`stock_movement.qty`) по (склад, товар).
- **Остаток денег** = `opening_balance(cash)` + Σ(`payment` in) − Σ(`payment` out) по счёту.
- **Рентабельность продажи** = `document(sale).total` − Σ(себестоимость из `doc_link` × `purchase` цен).
- **Дашборд** = агрегаты по документам/оплатам за период, с фильтром `org_id`.

---

## 6. Как ложится твоя цепочка

1. **Логист подтвердил закуп** → сервис создаёт `document` type=`purchase` **по каждому поставщику** (группируя строки закупа по `contragent`), `stock_movement`(+) на Центр-Склад. → долг поставщикам ↑, склад ↑.
2. **Логист доставил** → `document` type=`sale` заказчику, `stock_movement`(−), `doc_link` на исходный приход. → долг заказчика ↑, склад ↓, себестоимость известна.
3. **Финанс** тянет долги/оплаты/дашборд SQL-агрегатами (раздел 5).
4. **Акты/движение/склады** — из `document`(act) + `stock_movement` + `doc_link`.
5. **2 филиала** = 2 `organization` + они же `contragent`(с `org_ref_id`); правило цен по `product.category` (продавцу — `goods`, производителю — `material`+`goods`).

### Производство (филиал-производитель)
Филиал-производитель — это ПОЛНАЯ орг (свой склад/закуп/продажа через `org_id`) + один лишний тип документа:
- **`document` type=`production`**: строки `role=input` (сырьё/материалы, списываются со склада `stock_movement −`) и `role=output` (готовый товар, приходуется `stock_movement +`).
- **Себестоимость готового** = Σ(amount строк `input`) [+ работа, если заводим]. Она же — цена прихода товара на склад производителя.
- **Размеры (см · м² · сумма):** в строках производитель задаёт `length_cm/width_cm/area_m2/rate`, `amount = area_m2 × rate × qty`.
- Дальше произведённый товар продаётся обычным `sale` (нам или наружу), долг/склад считаются как у всех.

Итог: филиалы получают ТОЧНО ту же систему (склад+продажа+закуп) через `org_id`, а производитель — плюс тип `production` с размерным ценообразованием. Ничего «мало» — всё масштабируется одной моделью.

---

## 7. Правила схемы (из метода)
- `org_id` на КАЖДОЙ бизнес-таблице; каждый кабинет видит только свою орг.
- Деньги/кол-во — `numeric`, не float; пусто → `'0'`.
- Не удаляем — `status=cancelled` (сторно) / `archived`.
- Индексы: `(org_id)`, `(contragent_id)`, `(date)`, `doc_link(purchase_doc_id)`, `doc_link(sale_doc_id)`, `stock_movement(warehouse_id, product_id)`.
- Слои: route(zod)→dto→service(вся логика проводок)→repository(запросы)→db. Проводки документа (создание строк + движений + связей) — в service, атомарно.
