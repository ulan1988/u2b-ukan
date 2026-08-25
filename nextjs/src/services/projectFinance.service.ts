// Финанализ по проектам: акт сверки нескольких проектов вместе, распределение
// аванса клиента по проектам и закрытие проекта. Слой: service → finance.repo/db.
import { randomUUID } from 'crypto'
import * as finRepo from '../repositories/finance.repo'
import { today } from '../lib/num'
import type { Session } from '../lib/auth'

async function projectsMeta(ids: string[]) {
  if (!ids.length) return [] as any[]
  const { db } = await import('../lib/db')
  const { specProjects } = await import('../db/schema')
  const { inArray } = await import('drizzle-orm')
  return db.select().from(specProjects).where(inArray(specProjects.id, ids))
}

// Акт сверки по выбранным проектам: по каждому оборот/оплачено/баланс + суммарно.
// «Оплачено» = прямые payments.project_id + распределённый аванс (project_alloc).
export async function reconcileProjects(orgId: string, ids: string[]) {
  const metas = await projectsMeta(ids)
  const valid = metas.map(m => m.id)
  const [turn, direct, alloc, docs] = await Promise.all([
    finRepo.projectsTurnover(orgId, valid),
    finRepo.projectsDirectPaid(orgId, valid),
    finRepo.projectsAllocated(orgId, valid),
    finRepo.projectsDocs(orgId, valid),
  ])
  const tById = new Map(turn.map(t => [t.projectId, t]))
  const dById = new Map(direct.map(d => [d.projectId, d.paid]))
  const aById = new Map(alloc.map(a => [a.projectId, a.alloc]))
  const docsBy: Record<string, any[]> = {}
  for (const d of docs) (docsBy[d.projectId] ||= []).push(d)

  const projects = metas.map(m => {
    const total = Number(tById.get(m.id)?.total) || 0
    const directPaid = Number(dById.get(m.id)) || 0
    const allocated = Number(aById.get(m.id)) || 0
    const paid = directPaid + allocated
    return {
      id: m.id, name: m.name, clientId: m.clientId, status: m.status,
      total, directPaid, allocated, paid, balance: total - paid,
      docs: (docsBy[m.id] || []).map(d => ({ id: d.id, number: d.number, type: d.type, date: d.date, total: Number(d.total) || 0 })),
    }
  })
  const combined = projects.reduce((s, p) => ({ total: s.total + p.total, paid: s.paid + p.paid, balance: s.balance + p.balance }), { total: 0, paid: 0, balance: 0 })

  // Клиент и его свободный аванс (общий по клиенту, если проекты одного клиента).
  const clientIds = Array.from(new Set(projects.map(p => p.clientId).filter(Boolean))) as string[]
  let client: any = null
  if (clientIds.length === 1) {
    const pool = await finRepo.clientAdvancePool(orgId, clientIds[0])
    const [c] = await (await import('../repositories/refs.repo')).listContragents().then((cs: any[]) => cs.filter(x => x.id === clientIds[0]))
    const allocs = await finRepo.listAllocations(orgId, clientIds[0])
    client = { id: clientIds[0], name: c?.name || '', advances: pool.advances, allocated: pool.allocated, freeAdvance: pool.advances - pool.allocated, allocations: allocs }
  }
  return { projects, combined, client, multiClient: clientIds.length > 1, currency: '₸' }
}

// Внести аванс (предоплату) клиента: оплата in без проекта/документа = общий кредит.
export async function addAdvance(orgId: string, i: { clientId: string; amount: number; accountId?: string; date?: string; comment?: string }, actor?: Session | null) {
  if (!i.clientId || !(Number(i.amount) > 0)) return { ok: false as const, error: 'Клиент и сумма обязательны' }
  const payRepo = await import('../repositories/payment.repo')
  await payRepo.insertPayment({
    id: randomUUID(), orgId, contragentId: i.clientId, direction: 'in', amount: String(Number(i.amount)),
    date: i.date || today(), cashAccountId: i.accountId || null, documentId: null, projectId: null,
    comment: i.comment || 'Аванс клиента', createdBy: actor?.id || null,
  } as any)
  return { ok: true as const }
}

// Распределить аванс клиента по проектам (перезапись строк распределения).
export async function allocateAdvance(orgId: string, clientId: string, allocations: Array<{ projectId: string; amount: number; comment?: string }>) {
  if (!clientId) return { ok: false as const, error: 'Не указан клиент' }
  const pool = await finRepo.clientAdvancePool(orgId, clientId)
  const sum = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  if (sum - pool.advances > 0.01) return { ok: false as const, error: `Распределено больше аванса: ${sum} из ${pool.advances}` }
  await finRepo.replaceAllocations(orgId, clientId, allocations)
  return { ok: true as const, free: pool.advances - sum }
}

// Закрыть/переоткрыть проект. Закрытие вручную; если баланс ≠ 0 — фронт предупреждает.
export async function setProjectStatus(orgId: string, projectId: string, status: 'active' | 'closed') {
  const { db } = await import('../lib/db')
  const { specProjects } = await import('../db/schema')
  const { and, eq } = await import('drizzle-orm')
  await db.update(specProjects).set({ status }).where(and(eq(specProjects.id, projectId), eq(specProjects.orgId, orgId)))
  return { ok: true as const, status }
}
