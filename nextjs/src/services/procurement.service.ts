// Автозакуп: сводка потребности → черновик-накопитель закупа + связи.
import * as repo from '../repositories/procurement.repo'
import * as orderRepo from '../repositories/order.repo'
import { countPositions } from '../repositories/order.repo'
import * as settingsRepo from '../repositories/settings.repo'
import { isIzdelie as isIzd, priceForClient } from '../lib/lineAmount'
import { matchCategoryKey } from '../lib/nomCatalog'
import { listRules } from '../repositories/categoryRule.repo'
import { listProducts } from '../repositories/refs.repo'
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
  // Цены ПРОДАЖИ — по орг (product_prices[orgId]). Шаблон products по продаже обнулён (розн/опт/спец=0),
  // поэтому без наложения орг-цен продажа уходила на 0 → не было ни суммы, ни долга.
  if (prodIds.length) {
    const { db } = await import('../lib/db')
    const { productPrices } = await import('../db/schema')
    const { and, eq, inArray } = await import('drizzle-orm')
    const opp = await db.select().from(productPrices).where(and(eq(productPrices.orgId, orgId), inArray(productPrices.productId, prodIds)))
    for (const x of opp) { const p = prodById[x.productId]; if (p) { p.priceRetail = x.priceRetail; p.priceOpt = x.priceOpt; p.priceSpec = x.priceSpec } }
  }

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
      // ЗАЯВКА ЖДЁТ ПРИХОДА (правило владельца 20.11.2026). Раньше она сразу уезжала в
      // «Исходящие» и висела там рядом с карточкой закупа — две карточки на одну сделку,
      // и доставить можно было то, что ещё не куплено. Теперь заявка остаётся в Приёмке
      // со статусом «Ждёт закупа», а к логисту уходит сама, когда приходная проведена
      // (releaseSalesOfPostedPurchase из invoice.service).
      await orderRepo.updateOrder(saleId, { screen: 'reception', block: '', status: 'Ждёт закупа' })
      await orderRepo.insertHistory({ cardId: saleId, action: 'linked', detail: `🟡 Закуп оформлен (${purchaseCardId}) — ждём приход, после него заявка уйдёт логисту`, userName: 'Система' })
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

  // ДВЕ ЦЕНЫ В АВТОЗАКУПЕ (правило владельца 27.11.2026): у товара — ЗАКУП (products.price_in, уйдёт в
  // приходную закупа), у каждой заявки — ПРОДАЖА её заказчику (цена строки заявки; пусто → по типу цены
  // заказчика из прайса этой орг, auto). Продажа дойдёт до расходной заказчику и до его приходной.
  type DemRow = { cardId: string; from: string; qty: number; posIds: string[]; price: number; auto: number; priceType: string }
  const byProduct: Record<string, { name: string; unit: string; total: number; widthCm?: number | null; folder: string; folderOrder: number; priceIn: number; rows: DemRow[] }> = {}
  // Папка номенклатуры каждого товара (группа > категория > подгруппа) — автозакуп собирается по папкам.
  const prods = await listProducts(orgId)
  const prodByName = new Map<string, any>(); const prodById = new Map<string, any>()
  for (const pr of prods as any[]) { prodById.set(pr.id, pr); for (const nm of [pr.name, pr.alias]) if (nm) prodByName.set(normNom(nm), pr) }
  const { listContragents } = await import('../repositories/refs.repo')
  const ptOf = new Map<string, string>(((await listContragents()) as any[]).map(c => [c.id, c.priceType || 'retail']))
  const cardPT: Record<string, string> = {}
  for (const c of cards as any[]) cardPT[c.id] = (c.contactId && ptOf.get(c.contactId)) || 'retail'
  const folderOf = new Map<string, { folder: string; order: number }>()
  const firstOrder: Record<string, number> = {}
  prods.forEach((pr: any, i: number) => {
    const cat = (pr.cat || '').trim(), sub = (pr.subgroup || '').trim(), grp = (pr.group || '').trim()
    const folder = sub ? (sub.toLowerCase().includes(cat.toLowerCase()) && cat ? sub : (cat ? `${cat} · ${sub}` : sub)) : (cat || grp || 'Без папки')
    const key = [grp, cat, sub].join('>')
    if (firstOrder[key] === undefined) firstOrder[key] = i   // порядок папок = порядок первой номенклатуры в дереве
    for (const nm of [pr.name, pr.alias]) if (nm) folderOf.set(normNom(nm), { folder, order: firstOrder[key] })
  })
  for (const p of positions) {
    const name = (p.name1c || p.oral || '').trim()
    if (!name) continue
    if (procuredSet.has(`${p.cardId}::${name.toLowerCase()}`)) continue     // уже закуплено
    const key = name.toLowerCase()
    const fo = folderOf.get(normNom(name))
    const prod = (p.productId && prodById.get(p.productId)) || prodByName.get(normNom(name))
    const izd = isIzd(name)
    if (!byProduct[key]) byProduct[key] = { name, unit: p.unit || 'шт', total: 0, widthCm: p.widthCm != null ? Number(p.widthCm) : null, folder: fo?.folder || 'Без папки', folderOrder: fo ? fo.order : 1e9, priceIn: izd ? 0 : (Number(prod?.priceIn) || 0), rows: [] }
    byProduct[key].total += Number(p.qty)
    const pt = cardPT[p.cardId] || 'retail'
    // Одна заявка может держать товар двумя строками — собираем в одну плашку.
    const ex = byProduct[key].rows.find(r => r.cardId === p.cardId)
    if (ex) { ex.qty += Number(p.qty); ex.posIds.push(p.id); if (!ex.price) ex.price = Number(p.price) || 0 }
    else byProduct[key].rows.push({ cardId: p.cardId, from: cardName[p.cardId] || p.cardId, qty: Number(p.qty), posIds: [p.id], price: Number(p.price) || 0, auto: prod ? priceForClient(prod, pt) : 0, priceType: pt })
  }
  // По папкам (в порядке номенклатуры), внутри папки — по названию.
  return Object.values(byProduct).sort((a, b) => a.folderOrder - b.folderOrder || a.folder.localeCompare(b.folder, 'ru') || a.name.localeCompare(b.name, 'ru', { numeric: true }))
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
export async function stage(orgId: string, items: { name: string; unit: string; total: number; widthCm?: number | null; price?: number | null; rows: { cardId: string; qty: number; posIds?: string[]; salePrice?: number | null }[] }[], actor?: Session | null) {
  if (!items.length) return { ok: false as const, error: 'Нет товаров' }

  // ЦЕНА ПРОДАЖИ ЗАЯВКИ из автозакупа (правило 27.11.2026): вписанная/подставленная цена ложится в строку
  // заявки — по ней логист повезёт и выпишется расходная заказчику (и его приходная, если он филиал).
  // Пусто/0 — строку не трогаем. Только строки этой заявки, не проведённые.
  for (const it of items) for (const r of it.rows || []) {
    const sp = Number(r.salePrice) || 0
    if (sp <= 0 || !r.cardId || !Array.isArray(r.posIds) || !r.posIds.length) continue
    const pos = await orderRepo.positionsByCard(r.cardId)
    for (const p of pos as any[]) if (r.posIds.includes(p.id) && p.status !== 'Доставлено' && Number(p.price) !== sp)
      await orderRepo.updatePosition(p.id, { price: String(sp) })
  }

  // черновик-накопитель
  let [draft] = await repo.openDraft(orgId)
  if (!draft) {
    const id = await orderRepo.nextFreeOrderId(orgId, 'purchase')   // глобально уникальный id (меж орг)
    const [created] = await repo.insertDraft({
      id, orgId, kind: 'purchase', screen: 'incoming', block: '', status: 'В ожидании',
      source: 'admin_manual', isDraft: true, fromName: actor?.name || 'Автозакуп', trackingLink: encodeURIComponent(id),
      // Закуп делается ПОД заявки — но их может быть несколько, поэтому материнским номером
      // ставим сам закуп; конкретные заявки видны через procurement_links («Документ движений»).
      rootCardId: id,
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
  const base = (await orderRepo.nextPosSeq(draft!.id)) - 1   // максимум занятых номеров, не количество (дубль PK после удаления строки)
  // Поставщики из правил категорий → plечо позиции (филиал-поставщик = leg 1, падает в кабинет).
  const ruleSuppliers = items.map(it => {
    const prod = byName.get(it.name.trim().toLowerCase())
    const key = prod ? matchCategoryKey(prod.group || '', prod.cat || '') : ''
    return key ? (ruleByCat[key]?.supplierId || null) : null
  })
  const { legForSuppliers } = await import('../lib/legDetect')
  const legMap = await legForSuppliers(ruleSuppliers)
  const defLogist = await settingsRepo.orgDefaultLogist(orgId)   // закупщик по умолчанию (Бауыржан)
  // Повторное нажатие «В закуп» не должно плодить дубли: строка с таким же товаром
  // в черновике уже есть — обновляем её количество, новую не добавляем.
  const existing = await orderRepo.positionsByCard(draft!.id)
  const existingByName = new Map(existing.map((p: any) => [String(p.name1c || p.oral || '').trim().toLowerCase(), p]))
  const fresh = items.filter(it => !existingByName.has(it.name.trim().toLowerCase()))
  for (const it of items) {
    const ex = existingByName.get(it.name.trim().toLowerCase())
    if (ex && Number(ex.qty) !== Number(it.total)) await orderRepo.updatePosition(ex.id, { qty: String(it.total) })
    if (ex && Number(it.price) > 0 && Number(ex.price) !== Number(it.price)) await orderRepo.updatePosition(ex.id, { price: String(it.price) })
  }
  const posValues = fresh.map((it, idx) => {
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
    // Ширина (см): из позиции, иначе вытащить из имени «… 20 см» — иначе колонка СМ в черновике пустая.
    const mCm = (it.name || '').match(/(\d+)\s*см\s*$/i)
    const wcm = it.widthCm != null ? Number(it.widthCm) : (mCm ? Number(mCm[1]) : null)
    return {
      id: `${draft!.id}-P${base + idx + 1}`, cardId: draft!.id,
      productId: prod?.id ?? null, name1c: it.name, oral: it.name,
      qty: String(it.total), unit: it.unit || 'шт', price: String(Number(it.price) > 0 ? Number(it.price) : (isIzdelie ? 0 : (prod?.priceIn ?? 0))),   // закуп: вписанный в автозакупе, иначе из карточки товара
      widthCm: wcm != null ? String(wcm) : null,
      supplierId, respUserId: respUserId || defLogist || null, leg: supplierId ? (legMap[supplierId] ?? 2) : 2, status: 'В работе',
    }
  })
  await repo.insertPositions(posValues)

  // связи закуп→продажи (без дублей: та же тройка закуп+продажа+товар уже записана)
  const had = new Set((await repo.linksByPurchases([draft!.id])).map((l: any) => `${l.saleCardId}::${String(l.product || '').trim().toLowerCase()}`))
  const links = items.flatMap(it => (it.rows || []).filter(r => r.cardId).map(r => {
    const prod = byName.get(it.name.trim().toLowerCase())
    return { purchaseCardId: draft!.id, saleCardId: r.cardId, productId: prod?.id ?? null, product: it.name, qty: String(r.qty) }
  })).filter(l => {
    const k = `${l.saleCardId}::${String(l.product || '').trim().toLowerCase()}`
    if (had.has(k)) return false
    had.add(k); return true
  })
  if (links.length) await repo.insertLinks(links)

  return { ok: true as const, draftId: draft.id, added: posValues.length }
}

// Закуп ОТМЕНЁН → товар не куплен, значит связанные продажи должны снова попасть
// в «Заказ на закуп». Автозакуп собирает потребность только с Входящих/Приёмки, поэтому
// продажу, которую закуп уже увёл к логисту (Исходящие), возвращаем в Приёмку —
// иначе она зависает: и у логиста доставить нечем, и в закуп больше не попадает.
// Продажи, у которых есть ДРУГОЙ (не отменённый) закуп, не трогаем.
export async function releaseSalesOfCancelledPurchase(purchaseCardId: string, actor?: Session | null) {
  const links = await repo.linksByPurchases([purchaseCardId])
  const saleIds = Array.from(new Set(links.map((l: any) => l.saleCardId).filter(Boolean))) as string[]
  if (!saleIds.length) return { returned: 0 }
  const active = new Set((await repo.activeLinksForSales(saleIds)).map((r: any) => r.saleCardId))
  let returned = 0
  for (const sid of saleIds) {
    if (active.has(sid)) continue                       // закуплено другим закупом
    const [sale] = await orderRepo.getOrder(sid)
    if (!sale || sale.isCancelled || sale.linkedDocId) continue   // отменена или уже проведена
    if (!['incoming', 'reception', 'outgoing'].includes(sale.screen || '')) continue
    if (sale.screen !== 'outgoing') { returned++; continue }       // уже в потребности
    await orderRepo.updateOrder(sid, { screen: 'reception', block: '', status: 'В ожидании' })
    await orderRepo.resetPositionsForReturn(sid)
    try { const { releaseCard } = await import('./reserve.service'); await releaseCard(sid) } catch {}
    await orderRepo.insertHistory({ cardId: sid, action: 'returnToReception', detail: `↩ Закуп ${purchaseCardId} отменён — возвращена в заказ на закуп`, userName: actor?.name || 'Система' })
    returned++
  }
  if (returned) { try { const { pushSignal } = await import('../lib/pusherServer'); await pushSignal('orders') } catch {} }
  return { returned }
}


// ПРИХОД ПРИШЁЛ — ОТПУСКАЕМ ЗАЯВКИ (правило владельца 20.11.2026). Закуп проведён, товар
// на складе: связанные с ним продажи уходят к логисту в «Исходящие» и становятся рабочими.
export async function releaseSalesOfPostedPurchase(purchaseCardId: string, actor?: Session | null) {
  const links = await repo.linksByPurchases([purchaseCardId])
  const ids = Array.from(new Set(links.map((l: any) => String(l.saleCardId))))
  let opened = 0
  for (const saleId of ids) {
    const [sale] = await orderRepo.getOrder(saleId)
    if (!sale || sale.isCancelled || sale.kind !== 'sale') continue
    if (!['incoming', 'reception'].includes(sale.screen || '')) continue
    await orderRepo.updateOrder(saleId, { screen: 'outgoing', block: '', status: 'В работе' })
    await orderRepo.insertHistory({ cardId: saleId, action: 'linked',
      detail: `🟢 Закуп ${purchaseCardId} пришёл — заявка у логиста, можно везти`,
      userName: actor?.name || 'Система' })
    opened++
  }
  if (opened) { try { const { pushSignal } = await import('../lib/pusherServer'); await pushSignal('orders') } catch {} }
  return { opened }
}
// 🗑 УБРАТЬ ТОВАР ИЗ АВТОЗАКУПА = УДАЛИТЬ ЕГО ПОЗИЦИИ В ЗАЯВКАХ (решение владельца 20.11.2026).
// Автозакуп — не список, а СРЕЗ потребности живых заявок, скрыть строку «на время» негде.
// Поэтому корзина удаляет саму позицию в карточке-заявке: её не повезёт и логист.
// ПРАВИЛО ДОМИНО: трогаем только заявки, которые ещё в Входящих/Приёмке и не проведены;
// последнюю позицию карточки не удаляем (пустая карточка = баг) — такую возвращаем
// списком, владелец отменяет карточку целиком. В журнал каждой заявки пишем строку.
export async function dropDemand(orgId: string, names: string[], actor?: Session | null) {
  const keys = new Set(names.map(n => normNom(n)))
  if (!keys.size) return { ok: false as const, error: 'Нечего убирать' }
  const { cards, positions } = await repo.saleDemand(orgId)
  const live = new Set(cards.map(c => c.id))
  const victims = positions.filter(p => live.has(p.cardId) && keys.has(normNom(p.name1c || p.oral || '')))
  if (!victims.length) return { ok: false as const, error: 'Позиции уже нет в потребности' }

  const byCard = new Map<string, any[]>()
  for (const p of victims) byCard.set(p.cardId, [...(byCard.get(p.cardId) || []), p])

  let removed = 0
  const kept: string[] = []
  for (const [cardId, poss] of Array.from(byCard.entries())) {
    const total = await countPositions(cardId)
    if (total - poss.length < 1) { kept.push(cardId); continue }   // последнюю позицию не трогаем
    for (const p of poss) await orderRepo.deletePosition(p.id)
    removed += poss.length
    await orderRepo.insertHistory({
      cardId, action: 'deletePos',
      detail: `🗑 Убрано из автозакупа и из заявки: ${poss.map(p => `${p.name1c || p.oral} ${Number(p.qty)} ${p.unit || 'шт'}`).join(', ')}`,
      userName: actor?.name || 'Система',
    })
  }
  if (removed) { try { const { pushSignal } = await import('../lib/pusherServer'); await pushSignal('orders') } catch {} }
  return { ok: true as const, removed, kept }
}
