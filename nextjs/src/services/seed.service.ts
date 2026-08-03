// Стартовые данные, чтобы форма «Приход» была сразу рабочей. Идемпотентно:
// сеет только если организаций ещё нет.
import { db } from '../lib/db'
import { organizations, contragents, warehouses, products, cashAccounts } from '../db/schema'
import { sql } from 'drizzle-orm'

export async function seedIfEmpty() {
  const r = await db.select({ c: sql<number>`count(*)::int` }).from(organizations)
  if ((r[0]?.c ?? 0) > 0) return { seeded: false }

  const [org] = await db.insert(organizations).values({ name: 'U2B головной', kind: 'hq' }).returning()
  // 2 филиала
  await db.insert(organizations).values([
    { name: 'Филиал-производитель', kind: 'producer_seller' },
    { name: 'Филиал-продавец', kind: 'seller' },
  ])
  await db.insert(warehouses).values({ orgId: org.id, name: 'Центр-Склад', isCentral: true })
  await db.insert(cashAccounts).values([
    { orgId: org.id, name: 'Касса', kind: 'cash' },
    { orgId: org.id, name: 'Банк (осн.)', kind: 'bank' },
  ])
  await db.insert(contragents).values([
    { orgId: org.id, name: 'Металл Профиль', kind: 'supplier' },
    { orgId: org.id, name: 'Нипа Листагиб', kind: 'supplier' },
    { orgId: org.id, name: 'Кристалл (заказчик)', kind: 'client' },
    { orgId: org.id, name: 'Астана Строй', kind: 'client' },
  ])
  await db.insert(products).values([
    { name: 'Желоб 9003 3м', unit: 'шт', category: 'goods', priceIn: '1500' },
    { name: 'Труба 7024 3м', unit: 'шт', category: 'goods', priceIn: '1200' },
    { name: 'Лист оцинкованный 0.5', unit: 'м2', category: 'material', priceIn: '900' },
  ])
  return { seeded: true, orgId: org.id }
}
