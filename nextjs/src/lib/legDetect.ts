// Правило двух плеч (как в Улкане): leg живёт на ПОЗИЦИИ и определяется её ПОСТАВЩИКОМ.
// Поставщик-филиал → leg 1 (первое плечо: изготовление, карточка проходит через филиал,
// падает в кабинет мастера). Иначе → leg 2 (обычная).
// «Филиал-поставщик» определяем по ИДЕНТИЧНОСТИ: контрагент, привязанный к пользователю
// роли branch (users.contragent_id == contragents.id) — контрагент есть ВЛАДЕЛЕЦ кабинета.
// Запасной вариант — совпадение имени (для контрагентов, ещё не привязанных к кабинету).
import { db } from './db'
import { users, contragents, organizations } from '../db/schema'
import { eq, inArray, or } from 'drizzle-orm'

const norm = (s?: string | null) => (s || '').trim().toLowerCase().replace(/ё/g, 'е')

// Идентичность филиалов-поставщиков: id привязанных контрагентов + имена (нижний регистр).
// Филиал-поставщик = пользователь роли branch ИЛИ кабинет-владелец филиальной орг
// (producer_seller/seller): такие кабинеты заведены как role='admin', но их контрагент-мост
// и есть «поставщик-филиал». Без них заказ головного на Нипу получал leg=2 и не падал в кабинет.
export async function branchSuppliers(): Promise<{ ids: Set<string>; names: Set<string> }> {
  const us = await db.select({ name: users.name, contragentId: users.contragentId, role: users.role, orgKind: organizations.kind })
    .from(users).leftJoin(organizations, eq(users.orgId, organizations.id))
    .where(or(eq(users.role, 'branch'), inArray(organizations.kind, ['producer_seller', 'seller'])))
  const ids = new Set<string>(); const names = new Set<string>()
  for (const u of us) {
    // branch — по имени; филиальный кабинет — только если привязан к контрагенту-мосту.
    if (u.role !== 'branch' && !u.contragentId) continue
    if (u.contragentId) ids.add(u.contragentId)
    names.add(norm(u.name))
  }
  return { ids, names }
}

// Орг филиала-ПОСТАВЩИКА по контрагенту — нужна производству (на чей склад выпускать).
// Та же идентичность, что в branchSuppliers: сначала мост (contragents.org_ref_id — контрагент
// И ЕСТЬ эта орг), затем кабинет по привязанному контрагенту, затем по имени. Проверка только
// по role='branch' здесь не годится: кабинеты филиалов заведены как role='admin'.
export async function branchOrgForSuppliers(supplierIds: (string | null | undefined)[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(supplierIds.filter(Boolean))) as string[]
  const out: Record<string, string> = {}
  if (!ids.length) return out
  const [cags, us] = await Promise.all([
    db.select({ id: contragents.id, name: contragents.name, orgRefId: contragents.orgRefId }).from(contragents).where(inArray(contragents.id, ids)),
    db.select({ orgId: users.orgId, name: users.name, contragentId: users.contragentId, role: users.role })
      .from(users).leftJoin(organizations, eq(users.orgId, organizations.id))
      .where(or(eq(users.role, 'branch'), inArray(organizations.kind, ['producer_seller', 'seller']))),
  ])
  const byCag = new Map<string, string>(), byName = new Map<string, string>()
  for (const u of us) {
    if (u.role !== 'branch' && !u.contragentId) continue
    if (u.contragentId) byCag.set(u.contragentId, u.orgId)
    byName.set(norm(u.name), u.orgId)
  }
  for (const c of cags) {
    const org = c.orgRefId || byCag.get(c.id) || byName.get(norm(c.name))
    if (org) out[c.id] = org
  }
  return out
}

// Набор имён филиалов — совместимость (используется как запасной матч).
export async function branchNameSet(): Promise<Set<string>> {
  return (await branchSuppliers()).names
}

// leg для набора поставщиков (по id контрагента) — одним запросом.
export async function legForSuppliers(supplierIds: (string | null | undefined)[]): Promise<Record<string, number>> {
  const ids = Array.from(new Set(supplierIds.filter(Boolean))) as string[]
  const map: Record<string, number> = {}
  if (!ids.length) return map
  const [cags, branch] = await Promise.all([
    db.select({ id: contragents.id, name: contragents.name }).from(contragents).where(inArray(contragents.id, ids)),
    branchSuppliers(),
  ])
  for (const c of cags) map[c.id] = (branch.ids.has(c.id) || branch.names.has(norm(c.name))) ? 1 : 2
  return map
}

export async function legForSupplier(supplierId?: string | null): Promise<number> {
  if (!supplierId) return 2
  const m = await legForSuppliers([supplierId])
  return m[supplierId] ?? 2
}
