// Автозакуп: сводка потребности → черновик-накопитель закупа + связи.
import { randomUUID } from 'crypto'
import * as repo from '../repositories/procurement.repo'
import { docNumber } from '../lib/num'
import { matchCategoryKey } from '../lib/nomCatalog'
import { listRules } from '../repositories/categoryRule.repo'
import type { Session } from '../lib/auth'

// Сводка потребности: агрегируем позиции новых продаж по товару, с разбивкой по
// заявкам. Уже попавшие в закуп (ProcurementLink) — исключаем.
export async function demandSummary(orgId: string) {
  const [{ cards, positions }, procured] = await Promise.all([repo.saleDemand(orgId), repo.procuredPairs(orgId)])
  const cardName: Record<string, string> = {}
  for (const c of cards) cardName[c.id] = c.fromName || c.id
  const procuredSet = new Set(procured.map(p => `${p.saleCardId}::${(p.product || '').trim().toLowerCase()}`))

  const byProduct: Record<string, { name: string; unit: string; total: number; rows: { cardId: string; from: string; qty: number }[] }> = {}
  for (const p of positions) {
    const name = (p.name1c || p.oral || '').trim()
    if (!name) continue
    if (procuredSet.has(`${p.cardId}::${name.toLowerCase()}`)) continue     // уже закуплено
    const key = name.toLowerCase()
    if (!byProduct[key]) byProduct[key] = { name, unit: p.unit || 'шт', total: 0, rows: [] }
    byProduct[key].total += Number(p.qty)
    byProduct[key].rows.push({ cardId: p.cardId, from: cardName[p.cardId] || p.cardId, qty: Number(p.qty) })
  }
  return Object.values(byProduct).sort((a, b) => b.total - a.total)
}

// Отчёт-цепочка ЗАКУП→СКЛАД→ПРОДАЖА из ProcurementLink.
export async function chainReport(orgId: string) {
  const { cards, positions } = await repo.purchaseCards(orgId)
  if (!cards.length) return []
  const links = await repo.linksByPurchases(cards.map(c => c.id))
  const saleIds = Array.from(new Set(links.map(l => l.saleCardId)))
  const [sales, cags] = await Promise.all([
    repo.ordersByIds(saleIds),
    (await import('../repositories/refs.repo')).listContragents(),
  ])
  const saleMap: Record<string, { client: string; comment: string }> = {}
  for (const s of sales) saleMap[s.id] = { client: s.fromName || '—', comment: s.comment || '' }
  const cagName: Record<string, string> = {}
  for (const c of cags as any[]) cagName[c.id] = c.name

  const posByCard: Record<string, any[]> = {}
  for (const p of positions) (posByCard[p.cardId] ||= []).push(p)

  return cards.map(c => {
    const cardLinks = links.filter(l => l.purchaseCardId === c.id)
    return {
      id: c.id, status: c.status, createdAt: c.createdAt, delivered: c.delivered, isDraft: c.isDraft,
      positions: (posByCard[c.id] || []).map(pos => {
        const name = pos.name1c || pos.oral
        const posLinks = cardLinks.filter(l => (l.product || '').toLowerCase() === (name || '').toLowerCase())
        return {
          name, qty: Number(pos.qty), unit: pos.unit, status: pos.status,
          supplier: pos.supplierId ? (cagName[pos.supplierId] || '—') : (c.toWarehouseId ? 'Центр-Склад' : '—'),
          breakdown: posLinks.map(l => ({ client: saleMap[l.saleCardId]?.client || l.saleCardId, comment: saleMap[l.saleCardId]?.comment || '', qty: Number(l.qty) })),
        }
      }),
    }
  })
}

// «В закуп»: складываем товары в черновик-накопитель (find-or-create), пишем
// связи, автоцену priceIn, автоподстановку поставщик/логист по группе.
export async function stage(orgId: string, items: { name: string; unit: string; total: number; rows: { cardId: string; qty: number }[] }[], actor?: Session | null) {
  if (!items.length) return { ok: false as const, error: 'Нет товаров' }

  // черновик-накопитель
  let [draft] = await repo.openDraft(orgId)
  if (!draft) {
    const count = await repo.countPurchases(orgId)
    const id = docNumber('purchase', count)
    const [created] = await repo.insertDraft({
      id, orgId, kind: 'purchase', screen: 'incoming', block: '', status: 'В ожидании',
      source: 'admin_manual', isDraft: true, fromName: actor?.name || 'Автозакуп', trackingLink: encodeURIComponent(id),
    })
    draft = created
  }

  // productId/priceIn по имени
  const prods = await repo.productsByNames(items.map(i => i.name))
  const byName = new Map(prods.map((p: any) => [String(p.name).trim().toLowerCase(), p]))
  const rules = await listRules(orgId)
  const ruleByCat: Record<string, any> = {}; for (const r of rules) ruleByCat[r.category] = r

  const posValues = items.map(it => {
    const prod = byName.get(it.name.trim().toLowerCase())
    let supplierId: string | null = null, respUserId: string | null = null
    if (prod) {
      const key = matchCategoryKey(prod.group || '', prod.cat || '')
      const rule = key ? ruleByCat[key] : null
      if (rule) { supplierId = rule.supplierId || null; respUserId = rule.respUserId || null }
    }
    return {
      id: `${draft!.id}-P${randomUUID().slice(0, 8)}`, cardId: draft!.id,
      productId: prod?.id ?? null, name1c: it.name, oral: it.name,
      qty: String(it.total), unit: it.unit || 'шт', price: String(prod?.priceIn ?? 0),
      supplierId, respUserId, status: 'В работе',
    }
  })
  await repo.insertPositions(posValues)

  // связи закуп→продажи
  const links = items.flatMap(it => (it.rows || []).filter(r => r.cardId).map(r => {
    const prod = byName.get(it.name.trim().toLowerCase())
    return { purchaseCardId: draft!.id, saleCardId: r.cardId, productId: prod?.id ?? null, product: it.name, qty: String(r.qty) }
  }))
  if (links.length) await repo.insertLinks(links)

  return { ok: true as const, draftId: draft.id, added: posValues.length }
}
