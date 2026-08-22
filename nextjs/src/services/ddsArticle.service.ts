// Справочник статей движения денежных средств (ДДС): дерево деятельность → группа → статья,
// направление приход/расход/оба. Используется в кассе (текущий расход) и отчёте ДДС.
import { randomUUID } from 'crypto'
import { db } from '../lib/db'
import { finExpenseArticles as A } from '../db/schema'
import { eq, and, asc } from 'drizzle-orm'

export const listDdsArticles = (orgId: string, all = false) =>
  db.select().from(A)
    .where(all ? eq(A.orgId, orgId) : and(eq(A.orgId, orgId), eq(A.archived, false)))
    .orderBy(asc(A.activity), asc(A.sortOrder), asc(A.name))

export async function saveDdsArticle(orgId: string, b: any) {
  if (!b?.name?.trim()) return { ok: false as const, error: 'Укажите название' }
  const fields = {
    name: b.name.trim(),
    activity: b.activity || 'operating',
    direction: b.isGroup ? 'both' : (b.direction || 'out'),
    parentId: b.parentId || null,
    isGroup: !!b.isGroup,
  }
  if (b.id) { await db.update(A).set(fields).where(eq(A.id, b.id)); return { ok: true as const, id: b.id } }
  const id = randomUUID()
  const [mx] = await db.select({ n: A.sortOrder }).from(A).where(eq(A.orgId, orgId)).orderBy(asc(A.sortOrder)).limit(1)
  await db.insert(A).values({ id, orgId, ...fields, sortOrder: (b.sortOrder ?? 0) })
  return { ok: true as const, id }
}

export async function archiveDdsArticle(id: string) {
  // архивируем статью и её детей (если это группа)
  await db.update(A).set({ archived: true }).where(eq(A.id, id))
  await db.update(A).set({ archived: true }).where(eq(A.parentId, id))
  return { ok: true as const }
}
