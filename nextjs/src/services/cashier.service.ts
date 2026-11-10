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
async function createHqSaleToClient(clientId: string, positions: any[], cardId: string, projectId?: string | null, date?: string) {
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
  // Мать третьего звена — ПРИХОДНАЯ головного по этой же карточке (её родила расходная
  // производителя). Так дерево идёт сплошняком: Нипа расходная → ГО приходная → ГО расходная.
  const docRepo = await import('../repositories/document.repo')
  const hqIn = await docRepo.docBySourceOrg(cardId, hq, 'purchase')
  return docSvc.createSale({ orgId: hq, contragentId: clientId, warehouseId: wh.id, lines, date: date || today(), sourceOrderId: cardId, projectId: projectId || null, parentDocId: hqIn?.id || null, comment: `Продажа клиенту через филиал · ${cardId}` } as any)
}

// date — рабочая дата (проведение задним числом): расходная + платежи лягут на этот день.
// Пусто → today() (поведение магазина-продавца не меняется). Разрешена любая дата.
export interface PayInput { cash?: number; kaspi?: number; qr?: number; change?: number; changeFrom?: string; localDebt?: boolean; markOnly?: boolean; finalize?: boolean; date?: string }

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
    const pr = await produceToBase(cardId, actor, p.date)
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
    try { inv = await postOrderInvoice(cardId, actor, p.date) }
    finally { await repo.updateOrder(cardId, { contactId: endClient as string }) }   // вернуть заказчика даже при сбое проведения
    if (inv.ok) { try { await createHqSaleToClient(endClient as string, positions, cardId, (order as any).specProjectId, p.date) } catch (e) { console.error('createHqSaleToClient', cardId, e) } }
  } else {
    inv = await postOrderInvoice(cardId, actor, p.date)
  }
  if (!inv.ok) return { ok: false as const, error: inv.error }
  const [after] = await repo.getOrder(cardId)
  const docId = after.linkedDocId as string

  // Оплаты нал/каспи в кассу (гасят дебиторку), привязка к документу.
  const acc = await ensureCashAccounts(order.orgId)
  const day = p.date || today()   // рабочая дата: платежи лягут на выбранный день (проведение задним числом)
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
  // Сторно чека снимает и бонус. Долг товара соседу НЕ трогаем: товар у него уже взят,
  // возврат соседу разбирается вручную в журнале «Долг товаров».
  try { const { dropBonus } = await import('./bonus.service'); await dropBonus(cardId) } catch (e) { console.error('dropBonus', cardId, e) }
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
  // Оплачено = ВСЕ приходы по документу чека (касса + погашение долга), а не только order.paid*
  // (продажа в долг оплачивается позже отдельным платежом «Погашение долга» — он тоже считается).
  const paid = Number((await sqlClient`
    select coalesce(sum(amount),0)::float s from payments
    where org_id=${order.orgId} and document_id=${order.linkedDocId} and direction='in'
  ` as unknown as Array<any>)[0]?.s) || 0
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
  // ЧТО возвращаем на склад — берём из строки ПРОДАЖНОЙ накладной по этой позиции: именно
  // этот товар и по этой цене физически отгрузили. Если товар в позиции потом обменяли,
  // по текущей позиции вернулся бы ДРУГОЙ товар (старый навсегда остался бы «проданным»).
  const soldRows = await sqlClient`
    select dl.source_pos_id pid, dl.product_id::text "productId", dl.price::float price, dl.unit, dl.width_cm::float "widthCm", p.name
    from document_lines dl join products p on p.id = dl.product_id
    where dl.document_id = ${order.linkedDocId} and dl.source_pos_id is not null
  ` as unknown as Array<any>
  const sold: Record<string, any> = {}; for (const r of soldRows) sold[r.pid] = r
  const lines = sel.map(x => {
    const s = sold[x.pos.id]
    return {
      productId: s?.productId || x.pos.productId,
      name: s?.name || x.pos.name1c || x.pos.oral,
      qty: x.qty, unit: s?.unit || x.pos.unit || 'шт',
      price: s ? Number(s.price) || 0 : Number(x.pos.price) || 0,
      widthCm: s?.widthCm != null ? Number(s.widthCm) : (x.pos.widthCm != null ? Number(x.pos.widthCm) : undefined),
      sourcePosId: x.pos.id,
    }
  })
  const ret = await createReturn({ orgId: order.orgId, contragentId: order.contactId, warehouseId: wh.id, lines, date: today(), sourceOrderId: cardId, comment: `Возврат по чеку ${cardId}`, projectId: (order as any).specProjectId || null } as any, 'return_in')

  // Деньги: остаток после гашения долга — со счёта возврата (payment out). Без счёта («в долг») —
  // деньги не возвращаем, остаток остаётся кредитом контрагента (отрицательной дебиторкой).
  const refundOut = opts.accountId ? refund : 0
  if (refundOut > 0) {
    try {
      await payRepo.insertPayment({ id: randomUUID(), orgId: order.orgId, contragentId: order.contactId, direction: 'out', amount: String(refundOut), date: today(), cashAccountId: opts.accountId as string, documentId: ret.id, projectId: (order as any).specProjectId || null, comment: `Возврат ${cardId}` })
    } catch (e) {
      // не удалось вернуть деньги → откатываем возвратную накладную, чтобы товар не вернулся на склад без выплаты
      await cancelDocument(ret.id).catch(() => {})
      return { ok: false as const, error: 'Не удалось провести выплату возврата, возврат отменён' }
    }
  }
  const debtCleared = Math.min(R, currentDebt)
  // Чек полностью возвращён, когда по каждой позиции возвращённое + текущее ≥ проданного.
  const fullyReturned = positions.every((p: any) => (retQ[p.id] || 0) + (sel.find(x => x.pos.id === p.id)?.qty || 0) >= Number(p.qty) - 0.0000001)
  await repo.insertHistory({ cardId, action: 'return', detail: `Возврат ${ret.number}: ${sel.length} поз. на ${R} ₸ (долг −${debtCleared}, со счёта −${refundOut})`, userName: actor?.name || 'Система' })
  return { ok: true as const, number: ret.number, returned: R, refund: refundOut, debtCleared, fullyReturned }
}

// ── ОБМЕН ПО ЧЕКУ (касса магазина) ───────────────────────────────────────────
// Покупатель принёс товар и берёт взамен другой. Решение владельца 08.11.2026:
//  • исходный чек НЕ трогаем — он остаётся в отчёте своего дня (правка чека сторнировала
//    бы накладную и перенесла выручку на сегодня);
//  • обмен проводится СЕГОДНЯ двумя документами: сданное — возвратной накладной на склад,
//    выданное — расходной со склада;
//  • денег не трогаем: обмен только на РАВНУЮ сумму, долг от расходной гасится кредитом
//    от возвратной, выручка дня не растёт (продано +X, возврат −X).
export async function exchangeSale(cardId: string, inp: { back: { posId: string; qty: number }[]; out: any[] }, actor?: Session | null) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Чек не найден' }
  if (!order.linkedDocId) return { ok: false as const, error: 'Чек не проведён' }
  if (!order.contactId) return { ok: false as const, error: 'У чека нет заказчика' }
  if (!inp.back?.length || !inp.out?.length) return { ok: false as const, error: 'Укажите, что сдают и что выдаём' }
  const positions = await repo.positionsByCard(cardId)
  const { sqlClient } = await import('../lib/db')
  const { lineAmount } = await import('../lib/lineAmount')

  // Сколько по каждой позиции уже ушло возвратами/обменами — больше этого сдать нельзя.
  const doneRows = await sqlClient`
    select dl.source_pos_id pid, coalesce(sum(dl.qty),0)::float q from document_lines dl
    join documents d on d.id = dl.document_id
    where d.type='return_in' and d.status<>'cancelled' and d.source_order_id=${cardId} and dl.source_pos_id is not null
    group by dl.source_pos_id
  ` as unknown as Array<{ pid: string; q: number }>
  const retQ: Record<string, number> = {}
  for (const r of doneRows) retQ[r.pid] = Number(r.q) || 0

  const sel: { pos: any; qty: number }[] = []
  for (const it of inp.back) {
    const p = positions.find((x: any) => x.id === it.posId); if (!p) continue
    const q = Math.min(Number(it.qty) || 0, Number(p.qty) - (retQ[p.id] || 0))
    if (q > 0.0000001) sel.push({ pos: p, qty: q })
  }
  if (!sel.length) return { ok: false as const, error: 'Нечего сдавать (кол-во исчерпано)' }

  const amtOf = (p: any, qty: number) => lineAmount({ name: p.name1c || p.oral, qty, price: p.price, widthCm: p.widthCm })
  const back = sel.reduce((s, x) => s + amtOf(x.pos, x.qty), 0)
  const out = inp.out.reduce((s: number, p: any) => s + lineAmount({ name: p.name1c, qty: Number(p.qty), price: Number(p.price) || 0, widthCm: p.widthCm }), 0)
  if (Math.abs(back - out) > 0.5) {
    const d = Math.round(Math.abs(back - out))
    return { ok: false as const, error: `Обмен только на равную сумму: сдали ${Math.round(back)} ₸, выдали ${Math.round(out)} ₸, разница ${d} ₸` }
  }

  const refsRepo = await import('../repositories/refs.repo')
  const wh = await refsRepo.centralWarehouse(order.orgId)
  if (!wh) return { ok: false as const, error: 'Склад филиала не найден' }

  // Возврат: тот же товар и по той же цене, что физически отгрузили (строки продажной накладной).
  const soldRows = await sqlClient`
    select dl.source_pos_id pid, dl.product_id::text "productId", dl.price::float price, dl.unit, dl.width_cm::float "widthCm", p.name
    from document_lines dl join products p on p.id = dl.product_id
    where dl.document_id = ${order.linkedDocId} and dl.source_pos_id is not null
  ` as unknown as Array<any>
  const sold: Record<string, any> = {}; for (const r of soldRows) sold[r.pid] = r
  const backLines = sel.map(x => {
    const s = sold[x.pos.id]
    return {
      productId: s?.productId || x.pos.productId,
      name: s?.name || x.pos.name1c || x.pos.oral,
      qty: x.qty, unit: s?.unit || x.pos.unit || 'шт',
      price: s ? Number(s.price) || 0 : Number(x.pos.price) || 0,
      widthCm: s?.widthCm != null ? Number(s.widthCm) : (x.pos.widthCm != null ? Number(x.pos.widthCm) : undefined),
      sourcePosId: x.pos.id,
    }
  })

  const { ensureProduct } = await import('./producer.service')
  const outLines: any[] = []
  for (const p of inp.out) {
    const name = String(p.name1c || '').trim()
    if (!name) return { ok: false as const, error: 'У выдаваемого товара нет названия' }
    outLines.push({
      productId: p.productId || (await ensureProduct(name, order.orgId)),
      name, qty: Number(p.qty), unit: p.unit || 'шт',
      price: Number(p.price) || 0,
      widthCm: p.widthCm != null ? Number(p.widthCm) : undefined,
    })
  }

  const { createReturn, createSale } = await import('./document.service')
  const mark = `Обмен по чеку ${cardId}`
  const ret = await createReturn({ orgId: order.orgId, contragentId: order.contactId, warehouseId: wh.id, lines: backLines, date: today(), sourceOrderId: cardId, comment: mark, projectId: (order as any).specProjectId || null } as any, 'return_in')
  let sale: any
  try {
    sale = await createSale({ orgId: order.orgId, contragentId: order.contactId, warehouseId: wh.id, lines: outLines, date: today(), sourceOrderId: cardId, comment: mark, projectId: (order as any).specProjectId || null } as any)
  } catch (e) {
    // выдать не смогли — откатываем приём, иначе товар вернулся бы на склад без выдачи
    await cancelDocument(ret.id).catch(() => {})
    return { ok: false as const, error: 'Не удалось выдать товар, обмен отменён' }
  }
  await repo.insertHistory({ cardId, action: 'exchange', detail: `Обмен ${ret.number} → ${sale.number}: сдано ${sel.length} поз. на ${Math.round(back)} ₸, выдано ${outLines.length} поз.`, userName: actor?.name || 'Система' })
  return { ok: true as const, retNumber: ret.number, saleNumber: sale.number, sum: Math.round(back) }
}

// Погашение долга по чеку (касса магазина): приход денег на счёт, гасит дебиторку заказчика.
// Сумма клампится к текущему остатку долга (итог − уже оплачено). Пишется в payments (in),
// привязка к документу чека — так остаток долга (net − Σ payments in) уменьшается.
// splits — разбивка погашения по счетам (смешанная оплата): [{accountId, amount}]. Итог клампится
// к остатку долга (лишнее по порядку не пишется). Каждый счёт — отдельный приход (payments in).
export async function payDebt(cardId: string, splits: { accountId: string; amount: number }[], actor?: Session | null, date?: string) {
  // date — рабочий день погашения: пусто → сегодня; прошедшая дата проводит деньги тем днём
  // (попадают в «Кассу дня» и остатки счетов за тот день).
  const day = /^d{4}-d{2}-d{2}$/.test(String(date || '')) ? String(date) : today()
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
  const myIds: string[] = []
  for (const s of valid) {
    if (remaining <= 0.0000001) break
    const amt = Math.min(Math.max(0, Number(s.amount) || 0), remaining)
    if (amt <= 0) continue
    const pid = randomUUID(); myIds.push(pid)
    await payRepo.insertPayment({ id: pid, orgId: order.orgId, contragentId: order.contactId, direction: 'in', amount: String(amt), date: day, cashAccountId: s.accountId, documentId: order.linkedDocId as string, projectId: (order as any).specProjectId || null, comment: `Погашение долга ${cardId}` })
    remaining -= amt; paidNow += amt
  }
  // Двойной тап/параллельный запрос: если после записи оплат стало больше чека — откатываем свои
  const paidAfter = Number((await sqlClient`select coalesce(sum(amount),0)::float s from payments where direction='in' and document_id=${order.linkedDocId}` as unknown as Array<any>)[0]?.s) || 0
  if (paidAfter > net + 0.01 && myIds.length) {
    await sqlClient`delete from payments where id = any(${myIds})`
    return { ok: false as const, error: 'Долг уже погашен (повторное нажатие)' }
  }
  await repo.insertHistory({ cardId, action: 'debtpay', detail: `Погашение долга: ${Math.round(paidNow)} ₸ (остаток ${Math.round(debt - paidNow)})${day !== today() ? ' · датой ' + day : ''}`, userName: actor?.name || 'Система' })
  try { await syncSellerBankToHq(order.orgId) } catch { /* noop */ }
  return { ok: true as const, paid: paidNow, debtLeft: Math.max(0, debt - paidNow), date: day }
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
  clientCode?: string      // код чека — последние цифры телефона покупателя (поиск при возврате)
  comment?: string
  cash?: number; kaspi?: number; qr?: number; change?: number; changeFrom?: string
  discountSum?: number; discountPct?: number     // скидка по чеку (₸ и/или % — инфо)
  // bonusCost/bonusAgentId — бонусная позиция (товар соседа из папки «Долг товар»):
  // идёт мимо склада, себестоимости в чеке нет, бонус делится 50/50 с головным.
  positions: { productId?: string; name1c: string; oral?: string; qty: number; unit?: string; price: number; widthCm?: number; bonusCost?: number; bonusAgentId?: string }[]
}

// Доля головного в бонусе: 50% (для бонусных позиций вместо обычной маржи 60/40).
export const BONUS_HQ_SHARE = 0.5

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
    const pid = p.productId || (lookupOnly ? await findByName(name) : await ensureProduct(name, orgId))
    // Бонусная позиция: товар соседа (группа «Долг товар») — мимо склада (transit),
    // цена соседа и сам сосед остаются на строке, по ним потом считается бонус и долг.
    const bonusCost = Math.max(0, Number(p.bonusCost) || 0)
    const isBonus = bonusCost > 0 && !!p.bonusAgentId
    positions.push({
      productId: pid,
      name1c: name, oral: p.oral || name,
      qty: Number(p.qty), unit: p.unit || 'шт', price: Number(p.price) || 0,
      widthCm: p.widthCm != null ? Number(p.widthCm) : undefined,
      transit: isBonus,
      bonusCost: isBonus ? String(bonusCost) : '0',
      bonusAgentId: isBonus ? p.bonusAgentId : null,
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
  // Код чека — последние цифры телефона покупателя: по нему кассир находит чек при возврате.
  const clientCode = (i.clientCode || '').replace(/\D/g, '').slice(-8)
  if (seller || i.sellerId || disc || dpct || clientCode) await repo.updateOrder(id, { seller, sellerId: i.sellerId || null, discountSum: String(disc), discountPct: String(dpct), clientCode } as any)

  const res = await payCard(id, { cash: i.cash, kaspi: i.kaspi, qr: i.qr, change: i.change, changeFrom: i.changeFrom }, actor)
  if (!res.ok) return res
  await repo.updateOrder(id, { status: 'Доставлено' })
  // Бонусные позиции (товар соседа): записать бонус и долг товара — не роняя продажу.
  try { const { registerBonus } = await import('./bonus.service'); await registerBonus(orgId, id, undefined, actor) }
  catch (e) { console.error('registerBonus', id, e) }
  // QR/банк магазина сразу к головному (наша кюар) — не роняем продажу при сбое синка.
  try { await syncSellerBankToHq(orgId) } catch { /* noop */ }
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
  // accepted=false — деньги уже считаются, но строка в «Деньгах» ждёт «Принять»/«Отказать».
  await payRepo.insertPayment({ id: randomUUID(), orgId, contragentId, direction: 'in', amount: String(amount), date: today(), cashAccountId: accountId, documentId: null, accepted: false, comment: `Оплата из кабинета (${acc.name})${actor?.name ? ' · ' + actor.name : ''}` } as any)
  try {
    const { notifyOrgAdmins } = await import('./notifyHelpers')
    const [c] = await (await import('../repositories/document.repo')).contragentById(contragentId)
    await notifyOrgAdmins(orgId, `💰 Оплата от «${c?.name || 'клиента'}» — ${Math.round(amount).toLocaleString('ru-RU')} ₸ (${acc.name}). Подтвердите в «Деньгах».`)
  } catch { /* уведомление не должно ронять оплату */ }
  return { ok: true as const, account: acc.name }
}

// ИНКАССАЦИЯ: филиал отправляет деньги головному — сразу на главный «Банковский счёт» головного.
// В книге филиала: расход со счёта на мост-головной; в книге головного:
// приход на главный «Банковский счёт» от моста-филиала. Склад не трогается.
export async function encashment(filialOrgId: string, fromAccountId: string, amount: number, actor?: Session | null, dateOverride?: string) {
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
  // Приход — СРАЗУ на главный «Банковский счёт» головного (а не на отдельный QR-счёт филиала): деньги магазина/филиала
  // не копятся на QR, откуда их потом надо собирать руками. Откуда пришло — видно по контрагенту-мосту и комментарию.
  const banks = await db.select().from(cashAccounts).where(and(eq(cashAccounts.orgId, hq.id), eq(cashAccounts.archived, false), eq(cashAccounts.kind, 'bank')))
  const isQr = (n: string) => { const x = (n || '').toLowerCase(); return x.includes('qr') || x.includes('кюар') || x.includes('кюр') }
  const headQR: any = banks.find(a => a.clientPay && (a.name || '').toLowerCase().includes('банков')) || banks.find(a => (a.name || '').toLowerCase().includes('банков')) || banks.find(a => !isQr(a.name || '')) || null
  if (!headQR) return { ok: false as const, error: 'Главный «Банковский счёт» головного не найден' }
  const [headBridge] = await db.select().from(contragents).where(and(eq(contragents.orgId, filialOrgId), eq(contragents.orgRefId, hq.id))).limit(1)
  const [filialBridge] = await db.select().from(contragents).where(and(eq(contragents.orgId, hq.id), eq(contragents.orgRefId, filialOrgId))).limit(1)
  if (!headBridge || !filialBridge) return { ok: false as const, error: 'Мост-контрагент между орг не найден' }
  const day = dateOverride || today()
  // Тип счёта-источника филиала → в какую колонку «Операций» головного падает (нал/каспи/банк).
  const srcNm = (fromAcc.name || '').toLowerCase()
  const srcType = (srcNm.includes('касп') || srcNm.includes('kaspi')) ? 'каспи' : (srcNm.includes('налич') || srcNm.includes('касса')) ? 'нал' : 'банк'
  // Обе проводки ОДНИМ запросом: либо обе, либо ни одной (раньше сбой между ними оставлял деньги «в воздухе»)
  const { payments: paymentsTbl } = await import('../db/schema')
  await db.insert(paymentsTbl).values([
    { id: randomUUID(), orgId: filialOrgId, contragentId: headBridge.id, direction: 'out', amount: String(amount), date: day, cashAccountId: fromAccountId, documentId: null, comment: `Инкассация → головной (${headQR.name})` },
    { id: randomUUID(), orgId: hq.id, contragentId: filialBridge.id, direction: 'in', amount: String(amount), date: day, cashAccountId: headQR.id, documentId: null, comment: `Инкассация от ${filial.name} · ${srcType}` },
  ])
  return { ok: true as const, headQR: headQR.name }
}

// СРАЗУ К ГОЛОВНОМУ: «Банковский счёт» магазина (seller) = наша QR = деньги головного. Инкассируем
// ПО ДНЯМ (дата = дата продажи) остаток, который ещё не ушёл головному — так деньги реально у
// головного и видны в его «Операциях» того же дня. Нал/каспи не трогаем (физическая касса). Идемпотентно:
// gross(день) = все приходы банка кроме инкассаций; enc(день) = уже инкассировано; шлём разницу.
export async function syncSellerBankToHq(sellerOrgId: string) {
  const { db, sqlClient } = await import('../lib/db')
  const { organizations, cashAccounts } = await import('../db/schema')
  const { eq, and } = await import('drizzle-orm')
  const [org] = await db.select().from(organizations).where(eq(organizations.id, sellerOrgId)).limit(1)
  if (!org || org.kind !== 'seller' || org.archived) return { ok: true as const, skipped: true }
  const banks = await db.select().from(cashAccounts).where(and(eq(cashAccounts.orgId, sellerOrgId), eq(cashAccounts.kind, 'bank'), eq(cashAccounts.archived, false)))
  const bank = banks.find(a => (a.name || '').toLowerCase().includes('банков')) || banks[0]
  if (!bank) return { ok: true as const, skipped: true }
  const rows = await sqlClient`
    select date::text d,
      coalesce(sum(case when (comment is null or comment not like 'Инкассация%') then (case when direction='in' then amount else -amount end) else 0 end),0)::float gross,
      coalesce(sum(case when comment like 'Инкассация → головной%' and direction='out' then amount else 0 end),0)::float enc
    from payments where cash_account_id=${bank.id} group by date order by date
  ` as unknown as Array<{ d: string; gross: number; enc: number }>
  const done: any[] = []
  for (const r of rows) {
    const remain = Math.round(((Number(r.gross) || 0) - (Number(r.enc) || 0)) * 100) / 100
    if (remain <= 0) continue
    const res: any = await encashment(sellerOrgId, bank.id, remain, null, r.d)
    done.push({ date: r.d, amount: remain, ok: !!res?.ok, error: res?.error || null })
  }
  return { ok: true as const, done }
}

// ── РЕДАКТИРОВАНИЕ ПРОБИТОГО ЧЕКА (касса магазина) ───────────────────────────────────────
// Продавец ошибся в кол-ве/цене/счёте или забыл позицию — вместо «возврат + пробить заново»
// правим чек на месте: сторно старой расходной и оплат → новый состав позиций → проводим снова
// (payCard). Номер накладной будет новый, история карточки сохраняет след правки.
// Чек с возвратом править нельзя — сначала отмените возврат (иначе разъедутся остатки).
export interface EditCheckInput {
  positions: { posId?: string; productId?: string; name1c: string; qty: number; unit?: string; price: number; widthCm?: number }[]
  cash?: number; kaspi?: number; qr?: number; change?: number; changeFrom?: string
  discountSum?: number; discountPct?: number
  contactId?: string
}
export async function editCheck(cardId: string, i: EditCheckInput, actor?: Session | null) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Чек не найден' }
  if (!i.positions?.length) return { ok: false as const, error: 'В чеке должна остаться хотя бы одна позиция' }
  const { db, sqlClient } = await import('../lib/db')
  const { documents, payments } = await import('../db/schema')
  const { eq, and, ne } = await import('drizzle-orm')

  // возврат по чеку уже делали — правка запрещена (иначе остатки и деньги разъедутся)
  const [ret] = await sqlClient`
    select count(*)::int c from documents
    where type='return_in' and status<>'cancelled' and source_order_id=${cardId}
  ` as unknown as Array<any>
  if (Number(ret?.c) > 0) return { ok: false as const, error: 'По чеку был возврат — правка запрещена, отмените возврат' }

  // 1) сторно: документы чека + все оплаты по ним
  const docs = await db.select({ id: documents.id }).from(documents)
    .where(and(eq(documents.sourceOrderId, cardId), ne(documents.status, 'cancelled')))
  for (const d of docs) { await db.delete(payments).where(eq(payments.documentId, d.id)); await cancelDocument(d.id) }
  await repo.updateOrder(cardId, { linkedDocId: null, posted1c: false, paidCash: '0', paidKaspi: '0', paidQr: '0', changeSum: '0', changeFrom: '', payment: '' })

  // 2) новый состав позиций: что убрали — удаляем, что изменилось — правим, новое — добавляем
  const { ensureProduct } = await import('./producer.service')
  const old = await repo.positionsByCard(cardId)
  const keep = new Set((i.positions.map(p => p.posId).filter(Boolean)) as string[])
  for (const p of old) if (!keep.has(p.id)) await repo.deletePosition(p.id)
  let idx = (await repo.nextPosSeq(cardId)) - 1   // максимум занятых номеров: после удаления строки count коллизит
  for (const p of i.positions) {
    const name = (p.name1c || '').trim()
    const productId = p.productId || (await ensureProduct(name, order.orgId))
    const patch: any = {
      productId, name1c: name, oral: name, qty: String(Number(p.qty)), unit: p.unit || 'шт',
      price: String(Number(p.price) || 0), widthCm: p.widthCm != null ? String(Number(p.widthCm)) : null,
    }
    if (p.posId && old.some(o => o.id === p.posId)) await repo.updatePosition(p.posId, patch)
    else await repo.insertPosition({ id: `${cardId}-P${++idx}`, cardId, leg: 2, status: 'Доставлено', ...patch } as any)
  }

  // 3) скидка/покупатель и повторное проведение чека
  const patchCard: any = {}
  if (i.discountSum !== undefined) patchCard.discountSum = String(Math.max(0, Number(i.discountSum) || 0))
  if (i.discountPct !== undefined) patchCard.discountPct = String(Math.max(0, Number(i.discountPct) || 0))
  if (i.contactId) patchCard.contactId = i.contactId
  if (Object.keys(patchCard).length) await repo.updateOrder(cardId, patchCard)

  const res = await payCard(cardId, { cash: i.cash, kaspi: i.kaspi, qr: i.qr, change: i.change, changeFrom: i.changeFrom }, actor)
  if (!res.ok) return res
  await repo.updateOrder(cardId, { status: 'Доставлено' })
  await repo.insertHistory({ cardId, action: 'edit', detail: `Чек изменён: ${i.positions.length} поз., нал ${i.cash || 0}, каспи ${i.kaspi || 0}, QR ${i.qr || 0}`, userName: actor?.name || 'Система' })
  return { ...res, id: cardId }
}

// ── ПРОЧИЙ ДОХОД: деньги без товара, прибыль 50/50 с головным ───────────────────
// Кассир берёт деньги, которых нет в товарном чеке (услуга, доставка, мелочь соседу
// и т.п.): склад и накладные НЕ трогаем, себестоимости нет — вся сумма идёт в бонус,
// половина доля головного (как у товара соседа). Деньги ложатся на счета по способам.
export async function otherIncome(orgId: string, i: {
  contactId?: string; cash?: number; kaspi?: number; qr?: number; comment?: string; seller?: string; date?: string
}, actor?: Session | null) {
  const cash = Math.max(0, Math.round(Number(i.cash) || 0))
  const kaspi = Math.max(0, Math.round(Number(i.kaspi) || 0))
  const qr = Math.max(0, Math.round(Number(i.qr) || 0))
  const sum = cash + kaspi + qr
  if (!(sum > 0)) return { ok: false as const, error: 'Впишите сумму по счетам (нал / каспи / QR)' }

  const contactId = i.contactId || await ensureRetailContragent(orgId)
  const acc = await ensureCashAccounts(orgId)
  const day = i.date || today()
  const note = (i.comment || '').trim()
  const label = `Прочий доход${note ? ` · ${note}` : ''}${i.seller ? ` · ${i.seller}` : ''}`
  if (cash > 0) await payRepo.insertPayment({ id: randomUUID(), orgId, contragentId: contactId, direction: 'in', amount: String(cash), date: day, cashAccountId: acc.cash, documentId: null, comment: `${label} · нал` } as any)
  if (kaspi > 0) await payRepo.insertPayment({ id: randomUUID(), orgId, contragentId: contactId, direction: 'in', amount: String(kaspi), date: day, cashAccountId: acc.kaspi, documentId: null, comment: `${label} · каспи` } as any)
  if (qr > 0) await payRepo.insertPayment({ id: randomUUID(), orgId, contragentId: contactId, direction: 'in', amount: String(qr), date: day, cashAccountId: acc.bank, documentId: null, comment: `${label} · QR` } as any)

  // Дележ 50/50 — тем же журналом, что бонус товара соседа (виден в «Кассе дня»).
  const { db } = await import('../lib/db')
  const { bonusRows } = await import('../db/schema')
  const hq = Math.round(sum * 0.5)
  await db.insert(bonusRows).values({
    id: randomUUID(), orgId, date: day, cardId: null, posId: null, agentId: null,
    productName: note ? `Прочий доход · ${note}` : 'Прочий доход',
    qty: '1', price: String(sum), cost: '0', bonus: String(sum), hqShare: String(hq),
  } as any)
  return { ok: true as const, sum, hqShare: hq, ourShare: sum - hq }
}

// Прочие доходы за день (для журнала чеков и «Кассы дня»): платежи без документа,
// помеченные комментарием «Прочий доход…». Товара в них нет — показываем отдельной строкой.
export async function listOtherIncome(orgId: string, date: string) {
  const { sqlClient } = await import('../lib/db')
  const rows = await sqlClient`
    select p.id, p.amount::float amount, coalesce(p.comment,'') comment, p.created_at ts, coalesce(a.name,'') account
    from payments p left join cash_accounts a on a.id = p.cash_account_id
    where p.org_id = ${orgId} and p.date = ${date} and p.direction = 'in' and p.comment ilike 'Прочий доход%'
    order by p.created_at desc` as unknown as Array<any>
  const total = rows.reduce((s2: number, r: any) => s2 + (Number(r.amount) || 0), 0)
  return { rows, total }
}
