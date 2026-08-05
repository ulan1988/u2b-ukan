// Суточный отчёт логиста (смена): черновик-накопитель строк приход/расход.
import * as repo from '../repositories/report.repo'
import { today } from '../lib/num'
import type { Session } from '../lib/auth'

async function ensureDraft(orgId: string, logistId: string, date: string) {
  const [ex] = await repo.draftForDay(orgId, logistId, date)
  if (ex) return ex
  const [created] = await repo.createReport({ orgId, logistId, date, status: 'processing' })
  return created
}

export async function getDraft(actor: Session, date?: string) {
  const d = date || today()
  const draft = await ensureDraft(actor.orgId, actor.id, d)
  const rows = await repo.rowsByReport(draft.id)
  return { report: draft, rows }
}

export async function addRow(actor: Session, row: any, date?: string) {
  const draft = await ensureDraft(actor.orgId, actor.id, date || today())
  const [r] = await repo.addRow({
    reportId: draft.id, posId: row.posId || null,
    fromWho: row.fromWho || '', name: row.name || '',
    qtyIn: String(row.qtyIn || 0), commentIn: row.commentIn || '',
    toWho: row.toWho || '', qtyOut: String(row.qtyOut || 0), commentOut: row.commentOut || '',
    invoiceNum: row.invoiceNum || '',
  })
  return r
}

export const deleteRow = (id: string) => repo.deleteRow(id)

export async function closeShift(actor: Session, date?: string) {
  const draft = await ensureDraft(actor.orgId, actor.id, date || today())
  const [r] = await repo.setStatus(draft.id, 'done')
  return r
}

export const closedReports = (orgId: string) => repo.closedReports(orgId)
