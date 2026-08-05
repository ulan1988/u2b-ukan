// Суточные отчёты логиста (смены). Только запросы Drizzle.
import { db } from '../lib/db'
import { dailyReports, dailyReportRows } from '../db/schema'
import { and, eq, desc } from 'drizzle-orm'

export const draftForDay = (orgId: string, logistId: string, date: string) =>
  db.select().from(dailyReports).where(and(
    eq(dailyReports.orgId, orgId), eq(dailyReports.logistId, logistId),
    eq(dailyReports.date, date), eq(dailyReports.status, 'processing'),
  )).limit(1)

export const createReport = (v: typeof dailyReports.$inferInsert) => db.insert(dailyReports).values(v).returning()
export const rowsByReport = (reportId: string) =>
  db.select().from(dailyReportRows).where(eq(dailyReportRows.reportId, reportId))

export const addRow = (v: typeof dailyReportRows.$inferInsert) => db.insert(dailyReportRows).values(v).returning()
export const deleteRow = (id: string) => db.delete(dailyReportRows).where(eq(dailyReportRows.id, id))
export const setStatus = (id: string, status: string) =>
  db.update(dailyReports).set({ status }).where(eq(dailyReports.id, id)).returning()

// Закрытые отчёты организации (для админа).
export const closedReports = (orgId: string) =>
  db.select().from(dailyReports).where(and(eq(dailyReports.orgId, orgId), eq(dailyReports.status, 'done'))).orderBy(desc(dailyReports.date))
