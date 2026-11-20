// Ревизия логиста: шапка + строки. Только свои таблицы — склад эти записи не трогают.
import { db } from '../lib/db'
import { stockChecks, stockCheckLines } from '../db/schema'
import { and, eq, desc, sql } from 'drizzle-orm'

export const insertCheck = (v: typeof stockChecks.$inferInsert) =>
  db.insert(stockChecks).values(v).returning({ id: stockChecks.id })

export const insertLines = (v: (typeof stockCheckLines.$inferInsert)[]) =>
  v.length ? db.insert(stockCheckLines).values(v) : Promise.resolve()

export const listChecks = (orgId: string) =>
  db.select().from(stockChecks).where(eq(stockChecks.orgId, orgId))
    .orderBy(desc(stockChecks.date), desc(stockChecks.createdAt)).limit(100)

export const checkById = (id: string) =>
  db.select().from(stockChecks).where(eq(stockChecks.id, id)).limit(1)

export const linesOf = (checkId: string) =>
  db.select().from(stockCheckLines).where(eq(stockCheckLines.checkId, checkId)).orderBy(stockCheckLines.name)

export const setStatus = (id: string, status: string) =>
  db.update(stockChecks).set({ status, acceptedAt: status === 'accepted' ? sql`now()` : null })
    .where(eq(stockChecks.id, id))

export const removeCheck = (id: string) => db.delete(stockChecks).where(eq(stockChecks.id, id))

// Ревизия за этот день уже есть? (чтобы не плодить по одному дню)
export const checkOnDate = (orgId: string, date: string) =>
  db.select().from(stockChecks).where(and(eq(stockChecks.orgId, orgId), eq(stockChecks.date, date))).limit(1)
