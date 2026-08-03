// src/db/schema.ts — ядро ERP (Drizzle + Neon Postgres)
// Правила: org_id на каждой бизнес-таблице; деньги/кол-во = numeric (не float);
// удаления нет (status=cancelled / archived); индексы под агрегаты.
import {
  pgTable, uuid, text, numeric, boolean, timestamp, date, index, uniqueIndex,
} from 'drizzle-orm/pg-core'

const money = (name: string) => numeric(name, { precision: 14, scale: 2 })
const qtyCol = (name: string) => numeric(name, { precision: 14, scale: 3 })

// ─── Справочники ───────────────────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('seller'),        // hq | producer_seller | seller
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  password: text('password'),                             // bcrypt
  role: text('role').notNull().default('manager'),        // admin|bookkeeper|logist|manager
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byOrg: index('users_org_idx').on(t.orgId), emailUniq: uniqueIndex('users_email_uniq').on(t.email) }))

export const contragents = pgTable('contragents', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('client'),         // client | supplier | both
  orgRefId: uuid('org_ref_id').references(() => organizations.id), // если контрагент — наш филиал
  priceType: text('price_type').notNull().default('retail'),       // retail | opt
  phone: text('phone'),
  comment: text('comment'),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => ({ byOrg: index('contragents_org_idx').on(t.orgId) }))

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull().default('шт'),
  category: text('category').notNull().default('goods'),  // material | goods | service
  group: text('group').default(''),
  subgroup: text('subgroup').default(''),
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
  role: text('role').notNull().default('main'),           // main | input | output (производство)
  qty: qtyCol('qty').notNull().default('0'),
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
