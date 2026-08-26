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
  const lines = positions.filter((p: any) => p.productId).map((p: any) => ({ productId: p.productId as string, qty: Number(p.qty), price: Number(p.price), unit: p.unit || 'шт', name: p.name1c || p.oral, widthCm: p.widthCm }))
  if (!lines.length) return null
  const docSvc = await import('./document.service')
  return docSvc.createSale({ orgId: hq, contragentId: clientId, warehouseId: wh.id, lines, date: today(), sourceOrderId: cardId, projectId: projectId || null, comment: `Продажа клиенту через филиал · ${cardId}` } as any)
}

export interface PayInput { cash?: number; kaspi?: number; qr?: number; change?: number; changeFrom?: string }

export async function payCard(cardId: string, p: PayInput, actor?: Session | null) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Заявка не найдена' }
  if (order.linkedDocId) return { ok: false as const, error: 'Уже продано — сначала отмените продажу' }
  const positions = await repo.positionsByCard(cardId)
  if (!positions.length) return { ok: false as const, error: 'Нет позиций' }
  // Производственный цикл: изделия должны быть в базе (товар на складе). Если у позиции нет
  // product_id — автоматически вносим в базу (создаём товар + выпуск на склад), затем продаём.
  if (positions.some((x: any) => !x.productId)) {
    const { produceToBase } = await import('./producer.service')
    const pr = await produceToBase(cardId, actor)
    if (!pr.ok) return { ok: false as const, error: pr.error }
  }
  const { lineAmount } = await import('../lib/lineAmount')
  const total = positions.reduce((s: number, x: any) => s + lineAmount({ name: x.name1c || x.oral, qty: x.qty, price: x.price, widthCm: x.widthCm }), 0)
  const cash = Math.max(0, Number(p.cash) || 0), kaspi = Math.max(0, Number(p.kaspi) || 0), qr = Math.max(0, Number(p.qr) || 0)
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
  const endClient = contactId !== bridge ? contactId : null
  const chain = debt > 0 && debt === total && !!bridge && !!endClient
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
  await repo.updateOrder(cardId, { paidCash: String(cash), paidKaspi: String(kaspi), paidQr: String(qr), changeSum: String(change), changeFrom: p.changeFrom || '', payment: label, prodPhase: 'sold', delivered: new Date() })
  await repo.insertHistory({ cardId, action: 'pay', detail: `Продано (${inv.number}): нал ${cash}, каспи ${kaspi}, QR ${qr}, долг ${debt}${change > 0 ? `, сдача ${change}` : ''}`, userName: actor?.name || 'Система' })
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
