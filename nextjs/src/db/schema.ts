// src/db/schema.ts — ядро ERP (Drizzle + Neon Postgres)
// Правила: org_id на каждой бизнес-таблице; деньги/кол-во = numeric (не float);
// удаления нет (status=cancelled / archived); индексы под агрегаты.
import {
  pgTable, uuid, text, numeric, boolean, timestamp, date, integer, index, uniqueIndex,
} from 'drizzle-orm/pg-core'

const money = (name: string) => numeric(name, { precision: 14, scale: 2 })
const qtyCol = (name: string) => numeric(name, { precision: 14, scale: 3 })

// ─── Справочники ───────────────────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('seller'),        // hq | producer_seller | seller
  archived: boolean('archived').notNull().default(false),
  defaultLogistId: uuid('default_logist_id'),            // логист по умолчанию для авто-связанных продаж (без FK — избегаем цикла с users)
  defaultContragentId: uuid('default_contragent_id'),    // контрагент по умолчанию (первым в списке выбора «Кому»/поставщик)
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  password: text('password'),                             // bcrypt
  role: text('role').notNull().default('manager'),        // admin|bookkeeper|logist|branch|client|supplier_client|warehouse_manager|manager
  slug: text('slug'),                                     // адрес личного портала (/rsp/{slug} и т.п.)
  priceType: text('price_type').notNull().default('retail'), // retail | opt (тип цены клиента)
  contragentId: uuid('contragent_id'),                    // точная связка кабинета с контрагентом (без FK — избегаем цикла)
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byOrg: index('users_org_idx').on(t.orgId), emailUniq: uniqueIndex('users_email_uniq').on(t.email), slugUniq: uniqueIndex('users_slug_uniq').on(t.slug) }))

export const contragents = pgTable('contragents', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('client'),         // client | supplier | both
  orgRefId: uuid('org_ref_id').references(() => organizations.id), // если контрагент — наш филиал
  priceType: text('price_type').notNull().default('retail'),       // retail | opt
  phone: text('phone'),
  bin: text('bin'),                                                 // БИН/ИИН — ключ сверки при импорте из 1С
  openingBalance: numeric('opening_balance', { precision: 14, scale: 2 }).notNull().default('0'), // нач. остаток из акта сверки: + нам должны, − мы должны
  comment: text('comment'),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byOrg: index('contragents_org_idx').on(t.orgId) }))

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull().default('шт'),
  category: text('category').notNull().default('goods'),  // material | goods | service (тип)
  group: text('group').default(''),                       // дерево каталога: корень
  cat: text('cat').default(''),                           // дерево каталога: категория (Евро брус/Комплектующие)
  subgroup: text('subgroup').default(''),                 // дерево каталога: подгруппа (лист)
  priceIn: money('price_in').notNull().default('0'),      // приходная (закуп)
  priceRetail: money('price_retail').notNull().default('0'),
  priceOpt: money('price_opt').notNull().default('0'),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byName: index('products_name_idx').on(t.name) }))

export const warehouses = pgTable('warehouses', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  isCentral: boolean('is_central').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
}, t => ({ byOrg: index('warehouses_org_idx').on(t.orgId) }))

export const cashAccounts = pgTable('cash_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('cash'),           // cash | bank
  currency: text('currency').notNull().default('KZT'),
  archived: boolean('archived').notNull().default(false),
}, t => ({ byOrg: index('cash_accounts_org_idx').on(t.orgId) }))

// ─── Документы (ядро) ────────────────────────────────────────────────────────

// (reviewed — проверена ли накладная оператором; авто-проведённые = false → жёлтая метка)
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  type: text('type').notNull(),                           // purchase|sale|production|transfer|act|opening
  number: text('number').notNull(),                       // ЗП-0001-DDMMYY / ПР-0001-DDMMYY
  contragentId: uuid('contragent_id').references(() => contragents.id),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  date: date('date').notNull(),
  status: text('status').notNull().default('draft'),      // draft|posted|paid|cancelled
  total: money('total').notNull().default('0'),
  comment: text('comment'),
  // Приходная накладная (1С УНФ): вх. документ поставщика, тип операции, скидка, оплата.
  inNumber: text('in_number'),                            // № накладной поставщика
  inDate: date('in_date'),                                // дата накладной поставщика
  operation: text('operation').notNull().default('receipt'), // receipt | return
  sourceOrderId: text('source_order_id'),                 // id карточки-основания (ЗП-0001-060826) — чтобы связь не терялась
  discountPct: money('discount_pct').notNull().default('0'),  // скидка руч., %
  discountSum: money('discount_sum').notNull().default('0'),  // скидка руч., сумма
  paidSum: money('paid_sum').notNull().default('0'),      // оплачено поставщику (вкладка Оплата)
  reviewed: boolean('reviewed').notNull().default(false), // проверена оператором? авто-проведённая = false (жёлтая метка «не проверено»)
  contragentAccepted: boolean('contragent_accepted').notNull().default(false), // принял ли контрагент документ/возврат в своём кабинете
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => ({
  byOrg: index('documents_org_idx').on(t.orgId),
  byContragent: index('documents_contragent_idx').on(t.contragentId),
  byTypeDate: index('documents_type_date_idx').on(t.type, t.date),
}))

export const documentLines = pgTable('document_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  // Атомарный ID исходной позиции карточки ({cardId}-P{n}). Тянется карточка→накладная→возврат,
  // не меняется при дроблении — по нему фильтруется вся цепочка позиции в базе.
  sourcePosId: text('source_pos_id'),
  role: text('role').notNull().default('main'),           // main | input | output (производство)
  qty: qtyCol('qty').notNull().default('0'),
  unit: text('unit').notNull().default('шт'),             // ед. изм. строки (снимок)
  price: money('price').notNull().default('0'),
  amount: money('amount').notNull().default('0'),         // qty×price ИЛИ area×rate×qty
  // Размерное ценообразование (производитель): см · м² · сумма
  lengthCm: qtyCol('length_cm'),
  widthCm: qtyCol('width_cm'),
  areaM2: qtyCol('area_m2'),
  rate: money('rate'),                                    // ставка за м²
  comment: text('comment'),
}, t => ({ byDoc: index('document_lines_doc_idx').on(t.documentId) }))

// Цепочка приход↔расход (рентабельность / «блокчейн»)
export const docLinks = pgTable('doc_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseDocId: uuid('purchase_doc_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  saleDocId: uuid('sale_doc_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  qty: qtyCol('qty').notNull().default('0'),
}, t => ({
  byPurchase: index('doc_links_purchase_idx').on(t.purchaseDocId),
  bySale: index('doc_links_sale_idx').on(t.saleDocId),
}))

// ─── Деньги ──────────────────────────────────────────────────────────────────

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  contragentId: uuid('contragent_id').notNull().references(() => contragents.id),
  direction: text('direction').notNull(),                 // in (от клиента) | out (поставщику)
  amount: money('amount').notNull().default('0'),
  date: date('date').notNull(),
  cashAccountId: uuid('cash_account_id').references(() => cashAccounts.id),
  documentId: uuid('document_id').references(() => documents.id), // что гасит (или null = общий баланс)
  comment: text('comment'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({
  byOrg: index('payments_org_idx').on(t.orgId),
  byContragent: index('payments_contragent_idx').on(t.contragentId),
}))

// ─── Склад и начальные остатки ────────────────────────────────────────────────

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  qty: qtyCol('qty').notNull().default('0'),              // + приход / − расход
  kind: text('kind').notNull().default('move'),           // move (влияет на остаток) | reserve (бронь под заявку)
  cardId: text('card_id'),                                // заявка-источник резерва
  documentId: uuid('document_id').references(() => documents.id),
  date: date('date').notNull(),
}, t => ({ byWhProduct: index('stock_wh_product_idx').on(t.warehouseId, t.productId) }))

// Начальные остатки (разовый импорт из 1С)
export const openingBalances = pgTable('opening_balances', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(),                           // debt | stock | cash
  contragentId: uuid('contragent_id').references(() => contragents.id),   // для debt
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),      // для stock
  productId: uuid('product_id').references(() => products.id),            // для stock
  cashAccountId: uuid('cash_account_id').references(() => cashAccounts.id), // для cash
  amount: money('amount').notNull().default('0'),         // долг / кол-во / деньги
  direction: text('direction'),                           // debt: receivable (нам должны) | payable (мы должны)
  asOf: date('as_of').notNull(),
}, t => ({ byOrg: index('opening_org_idx').on(t.orgId) }))

// ═══ БЛОК «УЛКАН» (оперативка) — карточки/канбан поверх ERP-ядра ══════════════
// Справочники НЕ дублируем: FK на products/contragents/warehouses/users/documents.

// Заявка-карточка. Закуп ⇔ kind='purchase' (цель = Центр-Склад), продажа ⇔ 'sale'.
export const orders = pgTable('orders', {
  id: text('id').primaryKey(),                            // ЗП-0001-DDMMYY / ПР-0001-DDMMYY
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull().default('sale'),           // sale | purchase
  screen: text('screen').notNull().default('incoming'),   // incoming|reception|outgoing|accounting|bookkeeping|archive
  block: text('block').notNull().default(''),             // '' | waiting | processing
  status: text('status').notNull().default('В ожидании'),
  source: text('source').notNull().default('cabinet'),    // cabinet|admin_manual|external|webhook|portal
  fromName: text('from_name').notNull().default(''),      // отображаемый создатель
  fromId: uuid('from_id').references(() => users.id),
  contactId: uuid('contact_id').references(() => contragents.id),   // клиент-заказчик
  toWarehouseId: uuid('to_warehouse_id').references(() => warehouses.id), // Центр-Склад для закупа
  projectId: uuid('project_id').references(() => projects.id),
  specProjectId: uuid('spec_project_id'),                 // → spec_projects.id (ленивая ссылка)
  comment: text('comment').notNull().default(''),
  phone: text('phone'),
  deadline: timestamp('deadline'),
  delivered: timestamp('delivered'),
  isDraft: boolean('is_draft').notNull().default(false),
  isChanged: boolean('is_changed').notNull().default(false),
  changeText: text('change_text').notNull().default(''),
  changePhone: text('change_phone').notNull().default(''),
  isCancelled: boolean('is_cancelled').notNull().default(false),
  cancelReason: text('cancel_reason').notNull().default(''),
  toacc: boolean('toacc').notNull().default(false),       // готов к учёту
  postponed: boolean('postponed').notNull().default(false),
  invoice: boolean('invoice').notNull().default(false),
  fact: boolean('fact').notNull().default(false),
  posted1c: boolean('posted_1c').notNull().default(false),
  cold: boolean('cold').notNull().default(false),
  trackingLink: text('tracking_link').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  leg: integer('leg').notNull().default(2),               // 1 = первое плечо (филиал-поставщик), 2 = обычная
  linkedDocId: uuid('linked_doc_id').references(() => documents.id), // ERP-документ при закрытии (авто)
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => ({
  byOrgScreen: index('orders_org_screen_idx').on(t.orgId, t.screen),
  byContact: index('orders_contact_idx').on(t.contactId),
}))

export const orderPositions = pgTable('order_positions', {
  id: text('id').primaryKey(),                            // {cardId}-P{n}
  cardId: text('card_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id),   // null у свободной позиции «со слов»
  name1c: text('name1c').notNull().default(''),           // снимок имени товара
  oral: text('oral').notNull().default(''),               // имя со слов / с RAL
  qty: qtyCol('qty').notNull().default('0'),
  unit: text('unit').notNull().default('шт'),
  price: money('price').notNull().default('0'),
  respUserId: uuid('resp_user_id').references(() => users.id),   // логист-ответственный
  supplierId: uuid('supplier_id').references(() => contragents.id), // поставщик (только в закупе)
  status: text('status').notNull().default('В работе'),   // В работе|Готово|В пути|Доставлено
  leg: integer('leg').notNull().default(2),
  late: boolean('late').notNull().default(false),
  payment: text('payment').notNull().default(''),
  deadline: timestamp('deadline'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => ({ byCard: index('order_positions_card_idx').on(t.cardId) }))

// Аудит действий по карточке
export const orderHistory = pgTable('order_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  cardId: text('card_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  detail: text('detail').notNull().default(''),
  userName: text('user_name').notNull().default('Система'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byCard: index('order_history_card_idx').on(t.cardId) }))

// Чат по карточке (FK-каскад есть — чистится с картой)
export const cardMessages = pgTable('card_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  cardId: text('card_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  userName: text('user_name').notNull().default(''),
  role: text('role').notNull().default(''),
  text: text('text').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byCard: index('card_messages_card_idx').on(t.cardId, t.createdAt) }))

// Связь закуп→продажа (цепочка для автозакупа и отчёта)
export const procurementLinks = pgTable('procurement_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseCardId: text('purchase_card_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  saleCardId: text('sale_card_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id),
  product: text('product').notNull().default(''),
  qty: qtyCol('qty').notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({
  byPurchase: index('procurement_links_purchase_idx').on(t.purchaseCardId),
  bySale: index('procurement_links_sale_idx').on(t.saleCardId),
}))

// Автоподстановка поставщик/логист по группе каталога (4 категории на орг)
export const categoryRules = pgTable('category_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  category: text('category').notNull(),                   // vodostok|materialy|eurobrus|komplekt
  supplierId: uuid('supplier_id').references(() => contragents.id),
  supplierName: text('supplier_name').notNull().default(''),
  respUserId: uuid('resp_user_id').references(() => users.id),
  logistName: text('logist_name').notNull().default(''),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => ({ byOrgCat: uniqueIndex('category_rules_org_cat_uniq').on(t.orgId, t.category) }))

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  clientId: uuid('client_id').references(() => contragents.id),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byOrg: index('projects_org_idx').on(t.orgId) }))

export const specProjects = pgTable('spec_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  clientId: uuid('client_id').references(() => contragents.id),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byOrg: index('spec_projects_org_idx').on(t.orgId) }))

export const specProjectItems = pgTable('spec_project_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  specProjectId: uuid('spec_project_id').notNull().references(() => specProjects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  qty: qtyCol('qty').notNull().default('0'),
  unit: text('unit').notNull().default('шт'),
  productId: uuid('product_id').references(() => products.id),
}, t => ({ bySpec: index('spec_project_items_spec_idx').on(t.specProjectId) }))

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  text: text('text').notNull().default(''),
  cardId: text('card_id'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byUser: index('notifications_user_idx').on(t.userId) }))

// Web Push подписки браузера/PWA пользователя (для уведомлений в шторке телефона).
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byUser: index('push_subs_user_idx').on(t.userId) }))

// Суточный отчёт логиста (смена)
export const dailyReports = pgTable('daily_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  logistId: uuid('logist_id').notNull().references(() => users.id),
  date: date('date').notNull(),
  comment: text('comment').notNull().default(''),
  status: text('status').notNull().default('processing'), // processing | done
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byLogist: index('daily_reports_logist_idx').on(t.logistId) }))

export const dailyReportRows = pgTable('daily_report_rows', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportId: uuid('report_id').notNull().references(() => dailyReports.id, { onDelete: 'cascade' }),
  posId: text('pos_id'),                                  // id позиции для авто-строк (идемпотентность)
  fromWho: text('from_who').notNull().default(''),
  name: text('name').notNull().default(''),
  qtyIn: qtyCol('qty_in').notNull().default('0'),
  commentIn: text('comment_in').notNull().default(''),
  toWho: text('to_who').notNull().default(''),
  qtyOut: qtyCol('qty_out').notNull().default('0'),
  commentOut: text('comment_out').notNull().default(''),
  invoiceNum: text('invoice_num').notNull().default(''),
}, t => ({ byReport: index('daily_report_rows_report_idx').on(t.reportId) }))

// ─── Финанс «Деньги»: дневной кассовый лист (универсальный, всё в БД по ID) ───
// Строка операции дня. Суммы по счетам — в fin_row_amounts (динамические счета).
export const finRows = pgTable('fin_rows', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  date: date('date').notNull(),                            // день листа
  type: text('type').notNull().default('etc'),            // in|out|dolg|vozv|mv|etc
  article: text('article').notNull().default(''),         // статья (Кристалл, Зарплата, Аренда…)
  contragentId: uuid('contragent_id').references(() => contragents.id),  // если завязано на контрагента
  docId: uuid('doc_id').references(() => documents.id),    // подобранный документ (накладная/счёт)
  who: text('who').notNull().default(''),                  // свободный текст «Контрагент/документ»
  status: text('status').notNull().default('draft'),      // draft | posted
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byOrgDate: index('fin_rows_org_date_idx').on(t.orgId, t.date) }))

// Сумма строки по конкретному счёту (QR/Gold/Наличка…). Знак: расход/возврат — минус.
export const finRowAmounts = pgTable('fin_row_amounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  rowId: uuid('row_id').notNull().references(() => finRows.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => cashAccounts.id),
  amount: money('amount').notNull().default('0'),
}, t => ({ byRow: index('fin_row_amounts_row_idx').on(t.rowId) }))

// Избранные статьи — шаблон строк, появляется в каждом новом дне.
export const finFavorites = pgTable('fin_favorites', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  label: text('label').notNull().default(''),
  type: text('type').notNull().default('etc'),
  contragentId: uuid('contragent_id').references(() => contragents.id),
  sortOrder: integer('sort_order').notNull().default(0),
}, t => ({ byOrg: index('fin_favorites_org_idx').on(t.orgId) }))
