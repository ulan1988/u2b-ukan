// РЕВИЗИЯ ЛОГИСТА (правило владельца 20.11.2026).
// Логист пересчитывает Центр-Склад ЗА КОНКРЕТНЫЙ ДЕНЬ и отправляет факт админу.
// Склад при этом НЕ меняется: ни движений, ни корректировок — это сверка, по которой админ
// ищет, где потерялся товар. Учётный остаток берём НА ЭТУ ДАТУ (warehouse.stockOnDate):
// ревизия за 30.11 сверяется с остатком на 30.11, а не с сегодняшним.
import * as repo from '../repositories/stockCheck.repo'
import { stockOnDate } from './warehouse.service'
import type { StockCheckInput } from '../dto/stockCheck.dto'
import type { Session } from '../lib/auth'

const num = (n: any) => Number(n) || 0

export async function createCheck(orgId: string, i: StockCheckInput, actor?: Session | null) {
  const book = await stockOnDate(orgId, i.date)
  if (!book.items.length) return { ok: false as const, error: 'На эту дату остатка нет' }
  const fact: Record<string, number | null> = {}
  for (const r of i.rows) fact[r.productId] = r.fact == null ? null : num(r.fact)

  const lines = book.items.map((p: any) => ({
    productId: String(p.id), name: String(p.name || ''), unit: String(p.unit || 'шт'),
    book: num(p.end), fact: fact[String(p.id)] ?? null,
  }))
  const diffs = lines.filter(l => l.fact != null && Math.abs(l.fact - l.book) > 0.0005).length
  const counted = lines.filter(l => l.fact != null).length

  const [row] = await repo.insertCheck({
    orgId, date: i.date, authorId: actor?.id ?? null, authorName: actor?.name || 'Логист',
    status: 'sent', comment: i.comment || '', lines: counted, diffs,
  } as any)
  await repo.insertLines(lines.map(l => ({
    checkId: row.id, productId: l.productId, name: l.name, unit: l.unit,
    bookQty: String(l.book), factQty: l.fact == null ? null : String(l.fact),
  })) as any)
  return { ok: true as const, id: row.id, lines: counted, diffs, date: i.date }
}

export async function listChecks(orgId: string) {
  const rows = await repo.listChecks(orgId)
  return rows.map((r: any) => ({
    id: r.id, date: r.date, author: r.authorName, status: r.status,
    lines: r.lines, diffs: r.diffs, comment: r.comment,
    createdAt: r.createdAt, acceptedAt: r.acceptedAt,
  }))
}

// Документ ревизии для админа: слева склад (учёт на дату), справа ревизия (факт), третья — разница.
export async function getCheck(orgId: string, id: string) {
  const [c] = await repo.checkById(id)
  if (!c || c.orgId !== orgId) return { ok: false as const, error: 'Ревизия не найдена' }
  const rows = await repo.linesOf(id)
  const lines = rows.map((l: any) => {
    const book = num(l.bookQty)
    const fact = l.factQty == null ? null : num(l.factQty)
    return { productId: l.productId, name: l.name, unit: l.unit, book, fact,
      diff: fact == null ? null : Math.round((fact - book) * 1000) / 1000 }
  })
  return {
    ok: true as const,
    check: { id: c.id, date: c.date, author: c.authorName, status: c.status, comment: c.comment,
      lines: c.lines, diffs: c.diffs, createdAt: c.createdAt, acceptedAt: c.acceptedAt },
    lines,
  }
}

// «Разобрано» — пометка админа, склад по-прежнему не трогается.
export async function acceptCheck(orgId: string, id: string) {
  const [c] = await repo.checkById(id)
  if (!c || c.orgId !== orgId) return { ok: false as const, error: 'Ревизия не найдена' }
  const next = c.status === 'accepted' ? 'sent' : 'accepted'
  await repo.setStatus(id, next)
  return { ok: true as const, status: next }
}

export async function deleteCheck(orgId: string, id: string) {
  const [c] = await repo.checkById(id)
  if (!c || c.orgId !== orgId) return { ok: false as const, error: 'Ревизия не найдена' }
  await repo.removeCheck(id)
  return { ok: true as const }
}
