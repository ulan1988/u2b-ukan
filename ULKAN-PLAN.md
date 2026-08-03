# ULKAN-PLAN — пересборка блока «Улкан» (оперативка) на новой архитектуре

> Читать вместе с `PLAN.md` (ERP-ядро, блок 2). Оригинал-чертёж — `ulkan/docs/BLUEPRINT.md`.
> Метод: `route → dto → service → repository → db` (Drizzle). Никакого Prisma.

## ПОДХОД К UI (решение пользователя): точная копия интерфейса Улкана
Не переизобретаем экраны — **копируем вёрстку компонентов Улкана дословно** (инлайн-стили,
без Tailwind: палитра `lib/colors`, хелперы `lib/display`), а данные направляем на новый
бэкенд. Весь контракт фронта — в одном модуле `lib/api.ts` (+ прямые fetch в некоторых
компонентах). Потом «включаем» новые ERP-страницы (финансы/рентабельность/производство…)
в шелл Улкана. `tsconfig` → `strict:false` (UI Улкана слабо-типизирован).
Инвентарь для переноса: lib client-safe (colors/display/dates/types/ral/nomCatalog/procurement/
ids/orderStatus/orderMetrics/positionState/nomTree/reportDay/live/api/dto), ~40 API-роутов
(auth/orders/client/branch/logist/track/nomenclature/procurement/reports/settings/users/
projects/spec-projects/stock/finance/dashboard/notifications/chat/history). Каналы realtime:
orders/settings/reports. Роли: super_admin/bookkeeper/logist/branch/client/supplier_client/
warehouse_manager. Порталы: /admin, /rsp/[slug], /branch/[slug], /client/[slug], /warehouse/[slug], /track.

### Шаги копии интерфейса
- ✅ **Фундамент + логин 1:1**: tsconfig strict:false; globals с Golos Text + база/keyframes Улкана
  (Tailwind сохранён); `AppNav` (ERP-навигация прячется на экранах Улкана /login,/admin,/rsp,…);
  экран `/login` скопирован дословно (email→наш `/api/auth/login`; телефон — вид, беспарольный
  вход НЕ подключён = дыра v1); иконки/лого в public; `/admin`→временно на `/board`. Build ✅.
- ⏭ **AdminApp + порталы**: копировать client-lib + компоненты; поднять `lib/api.ts` на новый
  бэкенд (compat-слой к нашим orders/positions Ф1 + недостающие эндпоинты); getSession/slug в auth;
  расширить роли. Затем «включить» ERP-страницы как разделы.

## Решение по интеграции — Вариант A (общие данные + авто-документы)
Улкан использует ТЕ ЖЕ таблицы ERP-ядра: `products` (=номенклатура), `contragents`
(=клиенты/поставщики), `warehouses` (=Центр-Склад), `users` (роли). Оперативные карточки —
новые таблицы Улкана. При закрытии закупа → авто **приход** в `documents`, при продаже →
авто **расход**. `orders.linkedDocId → documents`. Одна база, один источник правды.

## Что такое Улкан
CRM/логистика торговли металлом. Канбан заявок по экранам: **Входящие → Приёмка →
Исходящие → Учёт → Бухгалтерия → Архив**. Заявка(карточка)→Позиции→История. Закуп ⇔
`kind='purchase'` (цель = Центр-Склад), продажа ⇔ `kind='sale'`. Плечи 1/2.

## Фазы
- **Ф0 — Домен-схема** ⏳: операционные таблицы Drizzle (orders, order_positions, order_history,
  card_messages, procurement_links, category_rules, projects, notifications, daily_reports+rows),
  FK на products/contragents/warehouses/users/documents. Push в Neon.
- **Ф1 — Заявки-ядро**: dto/repo/service заявки; создание (intake) с позициями; нумерация ЗП/ПР;
  список по экранам; воркфлоу-скелет (TRANSITIONS: accept/take/process/cancel/restore) +
  диспетчер `/api/orders/[id]/action`. Админ-доска Входящие/Приёмка.
- **Ф2 — Полный воркфлоу продажи**: reception(block waiting→processing) → назначение логиста →
  process → outgoing → updatePos логистом (В работе→В пути→Доставлено) → markAll → delivered/toacc →
  sendAcc → accounting → postAcc → bookkeeping → archive. Возвраты между экранами.
- **Ф3 — Автоподстановка + цены**: CategoryRule (поставщик+логист по группе, 4 категории),
  applyReceptionDefaults при take/стейджинге; pricing по `contragents.priceType` (retail/opt),
  «Подтянуть цены».
- **Ф4 — Автозакуп**: сводка потребности (агрегат позиций новых продаж по товару) → «В закуп» →
  черновик-накопитель (isDraft закуп) + ProcurementLink → «Черновик закупа» (назначить закупщика/
  поставщика) → finalizePurchase → outgoing → доставка → приход на Центр-Склад → автооткрытие
  связанных продаж (openLinkedSales).
- **Ф5 — Соединение с ERP**: закрытие закупа → приходный документ; продажа → расходный; doc_links
  по ProcurementLink; движение склада через stock_movements ERP. Финанс/рентабельность уже считают.
- **Ф6 — Порталы**: Логист `/rsp/[slug]`, Филиал `/branch/[slug]`, Клиент `/client/[slug]`,
  Склад `/warehouse/[slug]`, публичный Трекинг `/track`. Роли расширить в users.role + auth dto.
- **Ф7 — Коммуникации**: чат по карточке (CardMessage), уведомления, суточные отчёты логистов.
- **Ф8 — Реалтайм + проекты**: Pusher-канал orders/reports/settings + поллинг-страховка;
  проекты/спецпроекты.

## Инварианты (из BLUEPRINT §12, адаптировано)
- Даты — локальный день (свой `today()`), не UTC-срез.
- `pushSignal` после всех записей БД (когда добавим реалтайм).
- Один промпт = один коммит: `tsc → build → smoke → commit → push`.
- Каждый экран: данные / пусто / ошибка.
- Улкан НЕ дублирует справочники — только FK на ERP-ядро.

## Статус
- ✅ **Ф0 — Домен-схема**: 11 операционных таблиц Drizzle (orders, order_positions, order_history,
  card_messages, procurement_links, category_rules, projects, notifications, daily_reports+rows),
  все FK на ERP-ядро (products/contragents/warehouses/users/documents). Push в Neon применён.
- ✅ **Ф1 — Заявки-ядро**: dto/repo/service заявки + воркфлоу (декларативные TRANSITIONS:
  accept/take/process/sendAcc/postAcc/sendArchive/unarchive/returnToIncoming/postpone/cancel/restore,
  диспетчер getOrder→roles→guard→patch→history). Нумерация ЗП/ПР через docNumber. Роуты
  `POST/GET /api/orders`, `GET /api/orders/[id]` (карта+позиции+история), `POST /api/orders/[id]/action`.
  Админ-доска `/board` (6 колонок-экранов, форма новой заявки с позициями, действия на карточках).
  Smoke ✅ на Neon: создание ПР-…, канбан-переходы, guard «нужен логист», cancel/restore, каскад.
- Ф2 — следующая (полный воркфлоу продажи: назначение логиста, доставка позиций, delivered/toacc).
