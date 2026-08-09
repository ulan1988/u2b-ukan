// Правило двух плеч (как в Улкане): leg живёт на ПОЗИЦИИ и определяется её ПОСТАВЩИКОМ.
// Поставщик-филиал (контрагент, чьё имя совпадает с пользователем роли branch) → leg 1
// (первое плечо: изготовление, карточка проходит через филиал). Иначе → leg 2 (обычная).
import { db } from './db'
import { users, contragents } from '../db/schema'
import { eq, inArray } from 'drizzle-orm'

const norm = (s?: string | null) => (s || '').trim().toLowerCase().replace(/ё/g, 'е')

// Набор имён филиалов (пользователи роли branch) — нижний регистр.
export async function branchNameSet(): Promise<Set<string>> {
  const us = await db.select({ name: users.name }).from(users).where(eq(users.role, 'branch'))
  return new Set(us.map(u => norm(u.name)))
}

// leg для набора поставщиков (по id контрагента) — одним запросом.
export async function legForSuppliers(supplierIds: (string | null | undefined)[]): Promise<Record<string, number>> {
  const ids = Array.from(new Set(supplierIds.filter(Boolean))) as string[]
  const map: Record<string, number> = {}
  if (!ids.length) return map
  const [cags, branches] = await Promise.all([
    db.select({ id: contragents.id, name: contragents.name }).from(contragents).where(inArray(contragents.id, ids)),
    branchNameSet(),
  ])
  for (const c of cags) map[c.id] = branches.has(norm(c.name)) ? 1 : 2
  return map
}

export async function legForSupplier(supplierId?: string | null): Promise<number> {
  if (!supplierId) return 2
  const m = await legForSuppliers([supplierId])
  return m[supplierId] ?? 2
}
