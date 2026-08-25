// Правило двух плеч (как в Улкане): leg живёт на ПОЗИЦИИ и определяется её ПОСТАВЩИКОМ.
// Поставщик-филиал → leg 1 (первое плечо: изготовление, карточка проходит через филиал,
// падает в кабинет мастера). Иначе → leg 2 (обычная).
// «Филиал-поставщик» определяем по ИДЕНТИЧНОСТИ: контрагент, привязанный к пользователю
// роли branch (users.contragent_id == contragents.id) — контрагент есть ВЛАДЕЛЕЦ кабинета.
// Запасной вариант — совпадение имени (для контрагентов, ещё не привязанных к кабинету).
import { db } from './db'
import { users, contragents } from '../db/schema'
import { eq, inArray } from 'drizzle-orm'

const norm = (s?: string | null) => (s || '').trim().toLowerCase().replace(/ё/g, 'е')

// Идентичность филиалов-поставщиков: id привязанных контрагентов + имена (нижний регистр).
export async function branchSuppliers(): Promise<{ ids: Set<string>; names: Set<string> }> {
  const us = await db.select({ name: users.name, contragentId: users.contragentId }).from(users).where(eq(users.role, 'branch'))
  const ids = new Set<string>(); const names = new Set<string>()
  for (const u of us) { if (u.contragentId) ids.add(u.contragentId); names.add(norm(u.name)) }
  return { ids, names }
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
