// Автозакуп: сводка потребности → черновик-накопитель закупа + связи.
import * as repo from '../repositories/procurement.repo'
import * as orderRepo from '../repositories/order.repo'
import { countPositions } from '../repositories/order.repo'
import * as settingsRepo from '../repositories/settings.repo'
import { docNumber } from '../lib/num'
import { isIzdelie as isIzd } from '../lib/lineAmount'
import { matchCategoryKey } from '../lib/nomCatalog'
import { listRules } from '../repositories/categoryRule.repo'
import type { Session } from '../lib/auth'

const normNom = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

// Связка закуп→продажа: при оформлении закупа переносим на связанные продажи
// поставщика (из позиций закупа по товару), товар 1С, цену (по типу клиента) и
// логиста по умолчанию — продажа становится «готовой» и падает на стол Приёмки.
// Как openLinkedSales в Улкане, адаптировано под модель u2b (supplierId/respUserId).
export async function openLinkedSales(orgId: string, purchaseCardId: string) {
  const links = await repo.linksByPurchases([purchaseCardId])
  if (!links.length) return { opened: 0 }

  const purchasePos = await orderRepo.positionsByCard(purchaseCardId)
  const supByProduct: Record<string, { supplierId: string | null; productId: string | null }> = {}
  for (const pp of purchasePos) {
    const nm = normNom(pp.name1c || pp.oral || '')
    if (nm && pp.supplierId) supByProduct[nm] = { supplierId: pp.supplierId, productId: pp.productId }
  }

  const defaultLogist = await settingsRepo.orgDefaultLogist(orgId)
  const cags = await (await import('../repositories/refs.repo')).listContragents()
  const cagType: Record<string, string> = {}; for (const c of cags as any[]) cagType[c.id] = c.priceType || 'retail'
  const prodIds = Array.from(new Set(Object.values(supByProduct).map(s => s.productId).filter(Boolean))) as string[]
  const prods = await repo.productsByIds(prodIds)
  const prodById: Record<string, any> = {}; for (const p of prods) prodById[p.id] = p

  const saleIds = Array.from(new Set(links.map(l => l.saleCardId)))
  let opened = 0
  for (const saleId of saleIds) {
    const [sale] = await orderRepo.getOrder(saleId)
    if (!sale || sale.isCancelled) continue
    const clientPT = cagType[sale.contactId || ''] || 'retail'
    const positions = await orderRepo.positionsByCard(saleId)
    let touched = false
    for (const sl of links.filter(l => l.saleCardId === saleId)) {
      const orig = supByProduct[normNom(sl.product || '')]
      if (!orig) continue
      // Матчим по товару БЕЗ требования пустого поставщика — иначе продажа с уже
      // проставленным поставщиком (вручную/автозакупом) не двигалась в Приёмку и висела во Входящих.
      const pos = positions.find((p: any) => normNom(p.name1c || p.oral || '') === normNom(sl.product || ''))
      if (!pos) continue
      const set: any = {}
      if (!pos.supplierId && orig.supplierId) { const { legForSupplier } = await import('../lib/legDetect'); set.supplierId = orig.supplierId; set.leg = await legForSupplier(orig.supplierId) }
      if (orig.productId && !pos.productId) set.productId = orig.productId
      if (!(pos.name1c || '').trim() && sl.product) set.name1c = sl.product
      if (!(Number(pos.price) > 0)) { const prod = orig.productId ? prodById[orig.productId] : null; if (prod) { const { priceForClient } = await import('../lib/lineAmount'); const pr = priceForClient(prod, clientPT); if (pr > 0) set.price = String(pr) } }
      if (!pos.respUserId && defaultLogist) set.respUserId = defaultLogist
      if (Object.keys(set).length) await orderRepo.updatePosition(pos.id, set)
      touched = true   // связь найдена → продажу двигаем в Приёмку, даже если поля уже заполнены
    }
    if (touched) {
      // Продажа уходит СРАЗУ к логисту (Исходящие), без повторного захода в Приёмку.
      // Пока закуп не пришёл (нет приходной) — у логиста она серая (waitingProcure);
      // как только закуп проведён (linked_doc_id), waitingProcure гаснет и её можно доставлять.
      await orderRepo.updateOrder(saleId, { screen: 'outgoing', block: '', status: 'В работе' })
      await orderRepo.insertHistory({ cardId: saleId, action: 'linked', detail: `🟢 Закуплено (закуп ${purchaseCardId}) — поставщик и цена назначены, у логиста (ждёт прихода закупа)`, userName: 'Система' })
      opened++
    }
  }
  if (opened) { try { const { pushSignal } = await import('../lib/pusherServer'); await pushSignal('orders') } catch {} }
  return { opened }
}

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

  // Под-id позиций как в системе Улкана: {cardId}-P{n}, сквозной (продолжаем нумерацию
  // от уже накопленных в черновике позиций — черновик закупа накапливается).
  const base = await countPositions(draft!.id)
  // Поставщики из правил категорий → plечо позиции (филиал-поставщик = leg 1, падает в кабинет).
  const ruleSuppliers = items.map(it => {
    const prod = byName.get(it.name.trim().toLowerCase())
    const key = prod ? matchCategoryKey(prod.group || '', prod.cat || '') : ''
    return key ? (ruleByCat[key]?.supplierId || null) : null
  })
  const { legForSuppliers } = await import('../lib/legDetect')
  const legMap = await legForSuppliers(ruleSuppliers)
  const posValues = items.map((it, idx) => {
    const prod = byName.get(it.name.trim().toLowerCase())
    let supplierId: string | null = null, respUserId: string | null = null
    if (prod) {
      const key = matchCategoryKey(prod.group || '', prod.cat || '')
      const rule = key ? ruleByCat[key] : null
      if (rule) { supplierId = rule.supplierId || null; respUserId = rule.respUserId || null }
    }
    // Изделия производятся (цена = доля листа, а не закуп) → цену НЕ подставляем, вписывается
    // при приходной накладной. Покупные товары — тянем последнюю цену закупа (priceIn).
    const isIzdelie = isIzd(it.name)
    return {
      id: `${draft!.id}-P${base + idx + 1}`, cardId: draft!.id,
      productId: prod?.id ?? null, name1c: it.name, oral: it.name,
      qty: String(it.total), unit: it.unit || 'шт', price: String(isIzdelie ? 0 : (prod?.priceIn ?? 0)),
      supplierId, respUserId, leg: supplierId ? (legMap[supplierId] ?? 2) : 2, status: 'В работе',
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
