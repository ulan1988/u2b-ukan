// Касса мастера: прямая продажа с карточки (нал/каспи/долг/сдача). «Оплатить» проводит
// расходную (postOrderInvoice → у головного авто-приходная) и пишет оплаты нал/каспи в
// payments; долг = Σ − нал − каспи (остаётся дебиторкой). Долг по умолчанию на головной
// офис (мост-контрагент). Правки после продажи — через «Отменить продажу» (сторно + заново).
import { randomUUID } from 'crypto'
import * as repo from '../repositories/order.repo'
import * as payRepo from '../repositories/payment.repo'
import { postOrderInvoice } from './invoice.service'
import { cancelDocument } from './document.service'
import { today } from '../lib/num'
import type { Session } from '../lib/auth'

// Счета «Наличка»/«Каспи» филиала — создаём, если нет.
async function ensureCashAccounts(orgId: string) {
  const { db } = await import('../lib/db')
  const { cashAccounts } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')
  const existing = await db.select().from(cashAccounts).where(eq(cashAccounts.orgId, orgId))
  const ensure = async (name: string, sort: number) => {
    const hit = existing.find((c: any) => (c.name || '').trim().toLowerCase() === name.toLowerCase())
    if (hit) return hit.id
    const id = randomUUID()
    await db.insert(cashAccounts).values({ id, orgId, name, kind: 'cash', sortOrder: sort })
    return id
  }
  // Наличка = «Основная касса», каспи = «KASPI GOLD» (личный мастера), QR = «Банковский счет».
  return { cash: await ensure('Основная касса', 3), kaspi: await ensure('KASPI GOLD', 2), bank: await ensure('Банковский счет', 1) }
}

// Мост-контрагент филиала на головной офис (contragents.orgRefId = hq org).
async function hqBridgeContragent(orgId: string): Promise<string | null> {
  const { db } = await import('../lib/db')
  const { contragents, organizations } = await import('../db/schema')
  const { eq, and } = await import('drizzle-orm')
  const [hq] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.kind, 'hq')).limit(1)
  if (!hq) return null
  const [cg] = await db.select({ id: contragents.id }).from(contragents)
    .where(and(eq(contragents.orgId, orgId), eq(contragents.orgRefId, hq.id))).limit(1)
  return cg?.id || null
}

// Вид организации (hq | producer_seller | seller) — от него зависит логика кассы:
// цепочка долга через головной есть только у производителя, магазин-продавец держит долг у себя.
async function orgKindOf(orgId: string): Promise<string> {
  const { db } = await import('../lib/db')
  const { organizations } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')
  const [o] = await db.select({ kind: organizations.kind }).from(organizations).where(eq(organizations.id, orgId)).limit(1)
  return o?.kind || 'seller'
}

// Головной офис (org kind='hq').
async function hqOrgId(): Promise<string | null> {
  const { db } = await import('../lib/db')
  const { organizations } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')
  const [hq] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.kind, 'hq')).limit(1)
  return hq?.id || null
}

// 2-й уровень долга: головной продаёт конечному заказчику (Машон) → расходная у головного на его имя,
// заказчик становится должником головного (в его кабинете долг растёт). Товар у головного — из
// зеркальной приходной (производитель→головной), поэтому расход не уходит в минус по факту.
async function createHqSaleToClient(clientId: string, positions: any[], cardId: string, projectId?: string | null) {
  const hq = await hqOrgId(); if (!hq || !clientId) return null
  const refsRepo = await import('../repositories/refs.repo')
  const wh = await refsRepo.centralWarehouse(hq); if (!wh) return null
  // Цена продажи у ГОЛОВНОГО — по типу цены ЗАКАЗЧИКА (розн/опт/спец) из product_prices[hq].
  // Нет цены у головного → берём цену Нипы (пользователь поправит вручную у себя).
  const { sqlClient } = await import('../lib/db')
  const [cl] = (await sqlClient`select coalesce(price_type,'retail') pt from contragents where id=${clientId} limit 1` as unknown as Array<any>)
  const pt = (cl?.pt as string) || 'retail'
  const prodIds = Array.from(new Set(positions.filter((p: any) => p.productId).map((p: any) => p.productId))) as string[]
  const pp = prodIds.length ? await sqlClient`select product_id::text pid, price_retail::float r, price_opt::float o, price_spec::float s from product_prices where org_id=${hq} and product_id = any(${prodIds})` as unknown as Array<any> : []
  const pmap = new Map(pp.map((x: any) => [x.pid, pt === 'opt' ? x.o : pt === 'spec' ? x.s : x.r]))
  const lines = positions.filter((p: any) => p.productId).map((p: any) => {
    const hqPrice = Number(pmap.get(p.productId)) || 0
    return { productId: p.productId as string, qty: Number(p.qty), price: hqPrice > 0 ? hqPrice : (Number(p.price) || 0), unit: p.unit || 'шт', name: p.name1c || p.oral, widthCm: p.widthCm }
  })
  if (!lines.length) return null
  const docSvc = await import('./document.service')
  return docSvc.createSale({ orgId: hq, contragentId: clientId, warehouseId: wh.id, lines, date: today(), sourceOrderId: cardId, projectId: projectId || null, comment: `Продажа клиенту через филиал · ${cardId}` } as any)
}

export interface PayInput { cash?: number; kaspi?: number; qr?: number; change?: number; changeFrom?: string; localDebt?: boolean; markOnly?: boolean; finalize?: boolean }

export async function payCard(cardId: string, p: PayInput, actor?: Session | null) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Заявка не найдена' }
  if (order.linkedDocId) return { ok: false as const, error: 'Уже продано — сначала отмените продажу' }
  // «Долг к головному» (markOnly): только ПОМЕТИТЬ карточку — расходная (цепочка) проведётся
  // автоматически на ДОСТАВКЕ логистом, с финальными кол-вами (недовоз/брак попадут в документ).
  if (p.markOnly) {
    await repo.updateOrder(cardId, { pendingDebtHead: true, payment: 'Долг' } as any)
    await repo.insertHistory({ cardId, action: 'debtHead', detail: 'Долг к головному — расходная проведётся на доставке логистом', userName: actor?.name || 'Система' })
    return { ok: true as const, pending: true }
  }
  // Оплата НЕ должна выкидывать карточку производителя из «В работе»: запоминаем её произв.
  // этап/экран/статус, чтобы вернуть после проводки (postOrderInvoice ставит bookkeeping/Проведён).
  const prevPhase = (order as any).prodPhase || ''
  const prevScreen = order.screen
  const prevStatus = order.status
  const positions = await repo.positionsByCard(cardId)
  if (!positions.length) return { ok: false as const, error: 'Нет позиций' }
  const orgKind = await orgKindOf(order.orgId)
  // Производственный цикл (только у филиала-производителя): изделия должны быть в базе (товар
  // на складе). Если у позиции нет product_id — вносим в базу (товар + выпуск на склад), затем
  // продаём. У магазина-продавца производства нет: товар берётся из номенклатуры, а позиции без
  // product_id подхватит `ensureProductIdsByName` при проведении накладной.
  if (orgKind === 'producer_seller' && positions.some((x: any) => !x.productId)) {
    const { produceToBase } = await import('./producer.service')
    const pr = await produceToBase(cardId, actor)
    if (!pr.ok) return { ok: false as const, error: pr.error }
  }
  const { lineAmount } = await import('../lib/lineAmount')
  const subtotal = positions.reduce((s: number, x: any) => s + lineAmount({ name: x.name1c || x.oral, qty: x.qty, price: x.price, widthCm: x.widthCm }), 0)
  // Скидка по чеку: итог = Σпозиций − скидка (хранится на заказе, попадает в накладную).
  const disc = Math.max(0, Math.min(Number((order as any).discountSum) || 0, subtotal))
  const total = subtotal - disc
  const cashRaw = Math.max(0, Number(p.cash) || 0), kaspiRaw = Math.max(0, Number(p.kaspi) || 0), qr = Math.max(0, Number(p.qr) || 0)
  // Сдача выдаётся с нала (по умолчанию) или каспи → в кассу реально попадает оплата МИНУС сдача.
  // Иначе при переплате (дал 100 000 за 97 750) в счёт писалось 100 000, а не чистые 97 750.
  const changeAmt = Math.max(0, Number(p.change) || 0)
  // Сдача уменьшает реально внесённое: сначала с выбранного счёта, если не хватает — перелив на другой.
  let cash = cashRaw, kaspi = kaspiRaw, rem = changeAmt
  if (p.changeFrom === 'kaspi') { const a = Math.min(kaspi, rem); kaspi -= a; rem -= a; const b = Math.min(cash, rem); cash -= b; rem -= b }
  else { const a = Math.min(cash, rem); cash -= a; rem -= a; const b = Math.min(kaspi, rem); kaspi -= b; rem -= b }
  const debt = Math.max(0, total - cash - kaspi - qr)

  // Контрагент: заказчик карточки, иначе мост на головной офис.
  const bridge = await hqBridgeContragent(order.orgId)
  let contactId = order.contactId as string | null
  if (!contactId) {
    contactId = bridge
    if (contactId) await repo.updateOrder(cardId, { contactId })
  }
  if (!contactId) return { ok: false as const, error: 'Нет заказчика и не найден мост на головной офис' }

  // Две логики долга:
  //  • НЕ в долг (оплачено) → расходная у производителя на заказчика, карточка закрывается тут.
  //  • В долг + конечный заказчик (не мост) → ЦЕПОЧКА: производитель→головной (расходная + зеркальная
  //    приходная у головного), затем головной→Машон (расходная у головного на его имя). Должник — Машон.
  // Цепочка — только у производителя: он продаёт исключительно через головной. Магазин-продавец
  // (Кристалл) торгует своим товаром со своего склада, долг остаётся дебиторкой филиала.
  // localDebt=true → долг ОСТАЁТСЯ у Нипы (своя дебиторка на заказчика), цепочка в головной НЕ идёт.
  const endClient = contactId !== bridge ? contactId : null
  const chain = !p.localDebt && orgKind === 'producer_seller' && debt > 0 && debt === total && !!bridge && !!endClient
  let inv: any
  if (chain) {
    await repo.updateOrder(cardId, { contactId: bridge as string })   // расходная производителя → головному (мост → зеркало)
    inv = await postOrderInvoice(cardId, actor)
    await repo.updateOrder(cardId, { contactId: endClient as string })   // вернуть заказчика на карточку (для отображения)
    if (inv.ok) { try { await createHqSaleToClient(endClient as string, positions, cardId, (order as any).specProjectId) } catch {} }
  } else {
    inv = await postOrderInvoice(cardId, actor)
  }
  if (!inv.ok) return { ok: false as const, error: inv.error }
  const [after] = await repo.getOrder(cardId)
  const docId = after.linkedDocId as string

  // Оплаты нал/каспи в кассу (гасят дебиторку), привязка к документу.
  const acc = await ensureCashAccounts(order.orgId)
  const day = today()
  const projectId = (order as any).specProjectId || null   // разбивка оплат по проекту контрагента
  if (cash > 0) await payRepo.insertPayment({ id: randomUUID(), orgId: order.orgId, contragentId: contactId, direction: 'in', amount: String(cash), date: day, cashAccountId: acc.cash, documentId: docId, projectId, comment: `Касса ${cardId} · нал` })
  if (kaspi > 0) await payRepo.insertPayment({ id: randomUUID(), orgId: order.orgId, contragentId: contactId, direction: 'in', amount: String(kaspi), date: day, cashAccountId: acc.kaspi, documentId: docId, projectId, comment: `Касса ${cardId} · каспи` })
  if (qr > 0) await payRepo.insertPayment({ id: randomUUID(), orgId: order.orgId, contragentId: contactId, direction: 'in', amount: String(qr), date: day, cashAccountId: acc.bank, documentId: docId, projectId, comment: `Касса ${cardId} · QR` })

  const methods = [cash && 'Наличка', kaspi && 'Каспи', qr && 'QR'].filter(Boolean) as string[]
  const label = debt > 0 ? (methods.length ? 'Частично' : 'Долг') : (methods.length > 1 ? 'Смешанная' : methods[0] || 'Наличка')
  const change = Math.max(0, Number(p.change) || 0)
  const base: any = { paidCash: String(cash), paidKaspi: String(kaspi), paidQr: String(qr), changeSum: String(change), changeFrom: p.changeFrom || '', payment: label, delivered: new Date() }
  // Производитель: оплата не влияет на произв. статус — карточка ОСТАЁТСЯ «В работе» (не уходит
  // в ПРОДАНО/Бухгалтерию). Расход проведён (linkedDocId стоит), но этап/экран/статус возвращаем.
  // Остальные орг — как раньше: prodPhase='sold' (карточка продана).
  // finalize (проводка на ДОСТАВКЕ) — НЕ откатываем в вид мастера: карточка завершается в Бухгалтерии.
  if (orgKind === 'producer_seller' && !p.finalize) { base.prodPhase = prevPhase || 'working'; base.screen = ['bookkeeping', 'archive'].includes(prevScreen) ? 'reception' : prevScreen; base.status = prevStatus }
  else { base.prodPhase = 'sold' }
  await repo.updateOrder(cardId, base)
  await repo.insertHistory({ cardId, action: 'pay', detail: `Оплата (${inv.number}): нал ${cash}, каспи ${kaspi}, QR ${qr}, долг ${debt}${change > 0 ? `, сдача ${change}` : ''}`, userName: actor?.name || 'Система' })
  return { ok: true as const, total, cash, kaspi, qr, debt, number: inv.number }
}

// Отмена продажи: сторно всех документов карточки (расходная + зеркальная у головного),
// удаление оплат, возврат карточки в работу (редактируемую).
export async function unpostSale(cardId: string, actor?: Session | null) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Заявка не найдена' }
  if (!order.linkedDocId) return { ok: false as const, error: 'Карточка не проведена' }
  const { db } = await import('../lib/db')
  const { documents, payments } = await import('../db/schema')
  const { eq, and, ne } = await import('drizzle-orm')
  const docs = await db.select({ id: documents.id }).from(documents)
    .where(and(eq(documents.sourceOrderId, cardId), ne(documents.status, 'cancelled')))
  for (const d of docs) await cancelDocument(d.id)
  await db.delete(payments).where(eq(payments.documentId, order.linkedDocId as string))
  await repo.updateOrder(cardId, { linkedDocId: null, posted1c: false, screen: 'reception', status: 'Готов к доставке', prodPhase: 'ready', paidCash: '0', paidKaspi: '0', paidQr: '0', changeSum: '0', changeFrom: '', payment: '', delivered: null })
  await repo.insertHistory({ cardId, action: 'unpay', detail: 'Продажа отменена — карточка снова в работе', userName: actor?.name || 'Система' })
  return { ok: true as const, cancelled: docs.length }
}

// Возврат по чеку (касса магазина): выбранные позиции (или весь чек) → возвратная накладная
// (return_in: товар +склад филиала, −долг заказчика), затем деньги — сначала ГАСИМ ДОЛГ по чеку,
// оставшееся ВОЗВРАЩАЕМ со СЧЁТА ВОЗВРАТА (payment out). Исходная продажа остаётся (учёт цел),
// возврат — отдельный документ. Повторный возврат тех же позиций не пробьётся (source_pos_id).
export async function returnSale(cardId: string, opts: { items?: { posId: string; qty: number }[]; accountId?: string }, actor?: Session | null) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Заявка не найдена' }
  if (!order.linkedDocId) return { ok: false as const, error: 'Чек не проведён' }
  // accountId пусто → возврат «в долг» (товар на склад, долг заказчика −; деньги не возвращаем).
  if (!order.contactId) return { ok: false as const, error: 'У чека нет заказчика' }
  const positions = await repo.positionsByCard(cardId)
  if (!positions.length) return { ok: false as const, error: 'Нет позиций' }

  const { sqlClient } = await import('../lib/db')
  // Уже возвращённое КОЛ-ВО по каждой позиции (по source_pos_id в проведённых return_in карточки).
  const doneRows = await sqlClient`
    select dl.source_pos_id pid, coalesce(sum(dl.qty),0)::float q from document_lines dl
    join documents d on d.id = dl.document_id
    where d.type='return_in' and d.status<>'cancelled' and d.source_order_id=${cardId} and dl.source_pos_id is not null
    group by dl.source_pos_id
  ` as unknown as Array<{ pid: string; q: number }>
  const retQ: Record<string, number> = {}
  for (const r of doneRows) retQ[r.pid] = Number(r.q) || 0

  // Что возвращаем: заданные позиции с кол-вом (клампим к остатку) или весь остаток чека.
  const req = opts.items?.length ? opts.items : positions.map((p: any) => ({ posId: p.id, qty: Number(p.qty) }))
  const sel: { pos: any; qty: number }[] = []
  for (const it of req) {
    const p = positions.find((x: any) => x.id === it.posId); if (!p) continue
    const remaining = Number(p.qty) - (retQ[p.id] || 0)
    const q = Math.min(Number(it.qty) || 0, remaining)
    if (q > 0.0000001) sel.push({ pos: p, qty: q })
  }
  if (!sel.length) return { ok: false as const, error: 'Нечего возвращать (кол-во исчерпано)' }

  const { lineAmount } = await import('../lib/lineAmount')
  const amtOf = (p: any, qty: number) => lineAmount({ name: p.name1c || p.oral, qty, price: p.price, widthCm: p.widthCm })
  const R = sel.reduce((s, x) => s + amtOf(x.pos, x.qty), 0)

  const refsRepo = await import('../repositories/refs.repo')
  const wh = await refsRepo.centralWarehouse(order.orgId)
  if (!wh) return { ok: false as const, error: 'Склад филиала не найден' }

  // Текущий долг по чеку: всего(−скидка) − оплачено − уже применённый кредит возвратов.
  const total = Math.max(0, positions.reduce((s: number, p: any) => s + amtOf(p, Number(p.qty)), 0) - (Number((order as any).discountSum) || 0))
  const paid = (Number(order.paidCash) || 0) + (Number(order.paidKaspi) || 0) + (Number(order.paidQr) || 0)
  const prevRet = Number((await sqlClient`
    select coalesce(sum(total),0)::float s from documents
    where type='return_in' and status<>'cancelled' and source_order_id=${cardId}
  ` as unknown as Array<any>)[0]?.s) || 0
  const prevRefund = Number((await sqlClient`
    select coalesce(sum(amount),0)::float s from payments
    where direction='out' and org_id=${order.orgId} and comment like ${'Возврат ' + cardId + '%'}
  ` as unknown as Array<any>)[0]?.s) || 0
  const currentDebt = Math.max(0, total - paid - (prevRet - prevRefund))
  const refund = Math.max(0, R - currentDebt)

  // Возвратная накладная: товар обратно на склад филиала, кредит контрагенту (−долг).
  const { createReturn } = await import('./document.service')
  const lines = sel.map(x => ({ productId: x.pos.productId, name: x.pos.name1c || x.pos.oral, qty: x.qty, unit: x.pos.unit || 'шт', price: Number(x.pos.price) || 0, widthCm: x.pos.widthCm != null ? Number(x.pos.widthCm) : undefined, sourcePosId: x.pos.id }))
  const ret = await createReturn({ orgId: order.orgId, contragentId: order.contactId, warehouseId: wh.id, lines, date: today(), sourceOrderId: cardId, comment: `Возврат по чеку ${cardId}`, projectId: (order as any).specProjectId || null } as any, 'return_in')

  // Деньги: остаток после гашения долга — со счёта возврата (payment out). Без счёта («в долг») —
  // деньги не возвращаем, остаток остаётся кредитом контрагента (отрицательной дебиторкой).
  const refundOut = opts.accountId ? refund : 0
  if (refundOut > 0) {
    await payRepo.insertPayment({ id: randomUUID(), orgId: order.orgId, contragentId: order.contactId, direction: 'out', amount: String(refundOut), date: today(), cashAccountId: opts.accountId as string, documentId: ret.id, projectId: (order as any).specProjectId || null, comment: `Возврат ${cardId}` })
  }
  const debtCleared = Math.min(R, currentDebt)
  // Чек полностью возвращён, когда по каждой позиции возвращённое + текущее ≥ проданного.
  const fullyReturned = positions.every((p: any) => (retQ[p.id] || 0) + (sel.find(x => x.pos.id === p.id)?.qty || 0) >= Number(p.qty) - 0.0000001)
  await repo.insertHistory({ cardId, action: 'return', detail: `Возврат ${ret.number}: ${sel.length} поз. на ${R} ₸ (долг −${debtCleared}, со счёта −${refundOut})`, userName: actor?.name || 'Система' })
  return { ok: true as const, number: ret.number, returned: R, refund: refundOut, debtCleared, fullyReturned }
}

// Погашение долга по чеку (касса магазина): приход денег на счёт, гасит дебиторку заказчика.
// Сумма клампится к текущему остатку долга (итог − уже оплачено). Пишется в payments (in),
// привязка к документу чека — так остаток долга (net − Σ payments in) уменьшается.
// splits — разбивка погашения по счетам (смешанная оплата): [{accountId, amount}]. Итог клампится
// к остатку долга (лишнее по порядку не пишется). Каждый счёт — отдельный приход (payments in).
export async function payDebt(cardId: string, splits: { accountId: string; amount: number }[], actor?: Session | null) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Чек не найден' }
  if (!order.linkedDocId) return { ok: false as const, error: 'Чек не проведён' }
  if (!order.contactId) return { ok: false as const, error: 'У чека нет заказчика' }
  const valid = (splits || []).filter(s => s.accountId && Number(s.amount) > 0)
  if (!valid.length) return { ok: false as const, error: 'Укажите счёт и сумму' }
  const positions = await repo.positionsByCard(cardId)
  const { lineAmount } = await import('../lib/lineAmount')
  const subtotal = positions.reduce((s: number, p: any) => s + lineAmount({ name: p.name1c || p.oral, qty: p.qty, price: p.price, widthCm: p.widthCm }), 0)
  const net = Math.max(0, subtotal - (Number((order as any).discountSum) || 0))
  const { sqlClient } = await import('../lib/db')
  const paidBefore = Number((await sqlClient`select coalesce(sum(amount),0)::float s from payments where direction='in' and document_id=${order.linkedDocId}` as unknown as Array<any>)[0]?.s) || 0
  const debt = Math.max(0, net - paidBefore)
  if (debt <= 0) return { ok: false as const, error: 'Долга нет' }
  let remaining = debt, paidNow = 0
  for (const s of valid) {
    if (remaining <= 0.0000001) break
    const amt = Math.min(Math.max(0, Number(s.amount) || 0), remaining)
    if (amt <= 0) continue
    await payRepo.insertPayment({ id: randomUUID(), orgId: order.orgId, contragentId: order.contactId, direction: 'in', amount: String(amt), date: today(), cashAccountId: s.accountId, documentId: order.linkedDocId as string, projectId: (order as any).specProjectId || null, comment: `Погашение долга ${cardId}` })
    remaining -= amt; paidNow += amt
  }
  await repo.insertHistory({ cardId, action: 'debtpay', detail: `Погашение долга: ${Math.round(paidNow)} ₸ (остаток ${Math.round(debt - paidNow)})`, userName: actor?.name || 'Система' })
  return { ok: true as const, paid: paidNow, debtLeft: Math.max(0, debt - paidNow) }
}

// ── Касса продавца (филиал-магазин, напр. «Магазин Кристалл») ────────────────────────────
// Продавец с телефона набирает товар из каталога (NomPicker) и сразу пробивает чек: одна
// кнопка = карточка-продажа в книге филиала + проведение расходной (склад филиала −) + оплаты.
// Отличие от кассы мастера: производства нет, товар берётся из номенклатуры (по имени), долг
// остаётся дебиторкой филиала (без цепочки через головной).

// «Розничный покупатель» филиала — контрагент по умолчанию, когда чек без выбора клиента.
const RETAIL_NAME = 'Розничный покупатель'
async function ensureRetailContragent(orgId: string): Promise<string> {
  const { db } = await import('../lib/db')
  const { contragents } = await import('../db/schema')
  const { and, eq, sql } = await import('drizzle-orm')
  const [hit] = await db.select({ id: contragents.id }).from(contragents)
    .where(and(eq(contragents.orgId, orgId), sql`lower(trim(${contragents.name})) = ${RETAIL_NAME.toLowerCase()}`)).limit(1)
  if (hit) return hit.id
  const { addContragent } = await import('./catalog.service')
  const c = await addContragent({ orgId, name: RETAIL_NAME, kind: 'client', priceType: 'retail', phone: '' } as any)
  return c.id
}

export interface SellInput {
  contactId?: string
  sellerId?: string        // продавец за кассой (employees.id) — выбран на телефоне и держится до смены
  seller?: string          // его имя на момент чека
  comment?: string
  cash?: number; kaspi?: number; qr?: number; change?: number; changeFrom?: string
  discountSum?: number; discountPct?: number     // скидка по чеку (₸ и/или % — инфо)
  positions: { productId?: string; name1c: string; oral?: string; qty: number; unit?: string; price: number; widthCm?: number }[]
}

export async function sellDirect(orgId: string, i: SellInput, actor?: Session | null) {
  if (!i.positions?.length) return { ok: false as const, error: 'Пустой чек' }
  const { ensureProduct } = await import('./producer.service')
  const { createOrder } = await import('./order.service')
  // Магазин (seller) НЕ плодит новые SKU в общей номенклатуре — только берёт существующие
  // (продажа идёт из каталога, где товар уже есть). Производитель может заводить (изделия).
  const orgKind = await orgKindOf(orgId)
  const lookupOnly = orgKind === 'seller'
  const findByName = async (name: string): Promise<string | undefined> => {
    const { db } = await import('../lib/db')
    const { products } = await import('../db/schema')
    const { sql } = await import('drizzle-orm')
    const [ex] = await db.select({ id: products.id }).from(products).where(sql`lower(trim(${products.name})) = ${name.toLowerCase()}`).limit(1)
    return ex?.id
  }

  // Товар из справочника: по имени. Производитель — заводит, если нет; магазин — только ищет.
  const positions = [] as any[]
  for (const p of i.positions) {
    const name = (p.name1c || '').trim()
    const pid = p.productId || (lookupOnly ? await findByName(name) : await ensureProduct(name))
    positions.push({
      productId: pid,
      name1c: name, oral: p.oral || name,
      qty: Number(p.qty), unit: p.unit || 'шт', price: Number(p.price) || 0,
      widthCm: p.widthCm != null ? Number(p.widthCm) : undefined,
    })
  }
  const contactId = i.contactId || await ensureRetailContragent(orgId)
  const seller = (i.seller || '').trim()
  const { id } = await createOrder({
    orgId, kind: 'sale', source: 'cashier', screen: 'bookkeeping', contactId,
    fromName: seller,                                     // в списках чек подписан продавцом
    comment: i.comment || 'Касса магазина', positions,
  } as any, actor)
  // Продавец на чеке: id — для отчёта «кто сколько продал», имя — чтобы показывать без join.
  // Скидка по чеку — на заказ (payCard/накладная её учтут).
  const disc = Math.max(0, Number(i.discountSum) || 0), dpct = Math.max(0, Number(i.discountPct) || 0)
  if (seller || i.sellerId || disc || dpct) await repo.updateOrder(id, { seller, sellerId: i.sellerId || null, discountSum: String(disc), discountPct: String(dpct) } as any)

  const res = await payCard(id, { cash: i.cash, kaspi: i.kaspi, qr: i.qr, change: i.change, changeFrom: i.changeFrom }, actor)
  if (!res.ok) return res
  await repo.updateOrder(id, { status: 'Доставлено' })
  return { ...res, id, seller }
}

// Отмена продажи в кассе магазина: сторнируем расходную+оплаты (unpostSale) и ПОЛНОСТЬЮ отменяем
// карточку (товар вернулся на склад, деньги сняты, чек исчезает из журнала). Для исправления ошибок.
export async function cancelStoreSale(cardId: string, actor?: Session | null) {
  const r: any = await unpostSale(cardId, actor)
  if (r?.ok === false) return r
  await repo.updateOrder(cardId, { isCancelled: true, cancelReason: 'Отмена продажи (касса магазина)', screen: 'archive', prodPhase: '' })
  await repo.insertHistory({ cardId, action: 'cancelSale', detail: 'Продажа отменена и карточка аннулирована', userName: actor?.name || 'Система' })
  return { ok: true as const }
}

// ОПЛАТА ИЗ КАБИНЕТА КЛИЕНТА (инкассация клиента): клиент выбирает счёт своей орг и сумму —
// в книге орг приход на счёт от его контрагента, долг клиента (theyOwe) уменьшается.
export async function clientPay(orgId: string, contragentId: string, accountId: string, amount: number, actor?: Session | null) {
  if (!(amount > 0)) return { ok: false as const, error: 'Сумма должна быть больше 0' }
  const { db } = await import('../lib/db')
  const { cashAccounts } = await import('../db/schema')
  const { eq, and } = await import('drizzle-orm')
  const [acc] = await db.select().from(cashAccounts).where(and(eq(cashAccounts.id, accountId), eq(cashAccounts.orgId, orgId), eq(cashAccounts.clientPay, true))).limit(1)
  if (!acc) return { ok: false as const, error: 'Счёт недоступен для оплаты из кабинета' }
  await payRepo.insertPayment({ id: randomUUID(), orgId, contragentId, direction: 'in', amount: String(amount), date: today(), cashAccountId: accountId, documentId: null, comment: `Оплата из кабинета (${acc.name})${actor?.name ? ' · ' + actor.name : ''}` })
  return { ok: true as const, account: acc.name }
}

// ИНКАССАЦИЯ: филиал отправляет деньги головному — попадают в ЕГО QR-счёт в книге головного.
// Нипа листогиб → «QR Листогиб», Магазин Кристалл → «QR Кристалл» (авто-подбор по ключевому
// слову имени филиала). В книге филиала: расход со счёта на мост-головной; в книге головного:
// приход на QR-счёт от моста-филиала. Склад не трогается.
export async function encashment(filialOrgId: string, fromAccountId: string, amount: number, actor?: Session | null) {
  if (!(amount > 0)) return { ok: false as const, error: 'Сумма должна быть больше 0' }
  const { db } = await import('../lib/db')
  const { organizations, cashAccounts, contragents } = await import('../db/schema')
  const { eq, and } = await import('drizzle-orm')
  const [hq] = await db.select().from(organizations).where(and(eq(organizations.kind, 'hq'), eq(organizations.archived, false))).limit(1)
  if (!hq) return { ok: false as const, error: 'Головной не найден' }
  const [filial] = await db.select().from(organizations).where(eq(organizations.id, filialOrgId)).limit(1)
  if (!filial) return { ok: false as const, error: 'Организация не найдена' }
  const [fromAcc] = await db.select().from(cashAccounts).where(and(eq(cashAccounts.id, fromAccountId), eq(cashAccounts.orgId, filialOrgId))).limit(1)
  if (!fromAcc) return { ok: false as const, error: 'Счёт списания не найден' }
  // Приход — в QR-счёт ЭТОГО филиала у головного (вкладка «Счета» принимает на кюар): подбор по
  // ключевому слову имени филиала. Нипа листогиб → «QR Листогиб», Магазин Кристалл → «QR Кристалл».
  const banks = await db.select().from(cashAccounts).where(and(eq(cashAccounts.orgId, hq.id), eq(cashAccounts.archived, false), eq(cashAccounts.kind, 'bank')))
  const words = (filial.name || '').toLowerCase().split(/\s+/).filter(w => w.length >= 4)
  let headQR: any = null, best = 0
  for (const a of banks) { const n = (a.name || '').toLowerCase(); if (!n.includes('qr') && !n.includes('кюар') && !n.includes('кюр')) continue; let sc = 0; for (const w of words) if (n.includes(w)) sc = Math.max(sc, w.length); if (sc > best) { best = sc; headQR = a } }
  if (!headQR) return { ok: false as const, error: 'QR-счёт этого филиала в головном не найден' }
  const [headBridge] = await db.select().from(contragents).where(and(eq(contragents.orgId, filialOrgId), eq(contragents.orgRefId, hq.id))).limit(1)
  const [filialBridge] = await db.select().from(contragents).where(and(eq(contragents.orgId, hq.id), eq(contragents.orgRefId, filialOrgId))).limit(1)
  if (!headBridge || !filialBridge) return { ok: false as const, error: 'Мост-контрагент между орг не найден' }
  const day = today()
  // Тип счёта-источника филиала → в какую колонку «Операций» головного падает (нал/каспи/банк).
  const srcNm = (fromAcc.name || '').toLowerCase()
  const srcType = (srcNm.includes('касп') || srcNm.includes('kaspi')) ? 'каспи' : (srcNm.includes('налич') || srcNm.includes('касса')) ? 'нал' : 'банк'
  await payRepo.insertPayment({ id: randomUUID(), orgId: filialOrgId, contragentId: headBridge.id, direction: 'out', amount: String(amount), date: day, cashAccountId: fromAccountId, documentId: null, comment: `Инкассация → головной (${headQR.name})` })
  await payRepo.insertPayment({ id: randomUUID(), orgId: hq.id, contragentId: filialBridge.id, direction: 'in', amount: String(amount), date: day, cashAccountId: headQR.id, documentId: null, comment: `Инкассация от ${filial.name} · ${srcType}` })
  return { ok: true as const, headQR: headQR.name }
}
