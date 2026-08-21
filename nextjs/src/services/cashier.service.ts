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
  return { cash: await ensure('Наличка', 1), kaspi: await ensure('Каспи', 2) }
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

export interface PayInput { cash?: number; kaspi?: number; change?: number; changeFrom?: string }

export async function payCard(cardId: string, p: PayInput, actor?: Session | null) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Заявка не найдена' }
  if (order.linkedDocId) return { ok: false as const, error: 'Уже продано — сначала отмените продажу' }
  const positions = await repo.positionsByCard(cardId)
  if (!positions.some((x: any) => x.productId)) return { ok: false as const, error: 'Нет позиций с товаром из справочника — нельзя провести расходную' }
  const total = positions.reduce((s: number, x: any) => s + Number(x.qty || 0) * Number(x.price || 0), 0)
  const cash = Math.max(0, Number(p.cash) || 0), kaspi = Math.max(0, Number(p.kaspi) || 0)
  const debt = Math.max(0, total - cash - kaspi)

  // Контрагент: заказчик карточки, иначе мост на головной офис.
  let contactId = order.contactId as string | null
  if (!contactId) {
    contactId = await hqBridgeContragent(order.orgId)
    if (contactId) await repo.updateOrder(cardId, { contactId })
  }
  if (!contactId) return { ok: false as const, error: 'Нет заказчика и не найден мост на головной офис' }

  // Провести расходную (у головного авто-приходная по мосту).
  const inv = await postOrderInvoice(cardId, actor)
  if (!inv.ok) return { ok: false as const, error: inv.error }
  const [after] = await repo.getOrder(cardId)
  const docId = after.linkedDocId as string

  // Оплаты нал/каспи в кассу (гасят дебиторку), привязка к документу.
  const acc = await ensureCashAccounts(order.orgId)
  if (cash > 0) await payRepo.insertPayment({ id: randomUUID(), orgId: order.orgId, contragentId: contactId, direction: 'in', amount: String(cash), date: today(), cashAccountId: acc.cash, documentId: docId, comment: `Касса ${cardId} · нал` })
  if (kaspi > 0) await payRepo.insertPayment({ id: randomUUID(), orgId: order.orgId, contragentId: contactId, direction: 'in', amount: String(kaspi), date: today(), cashAccountId: acc.kaspi, documentId: docId, comment: `Касса ${cardId} · каспи` })

  const label = debt > 0 ? (cash || kaspi ? 'Частично' : 'Долг') : (cash && kaspi ? 'Смешанная' : cash ? 'Наличка' : 'Каспи')
  const change = Math.max(0, Number(p.change) || 0)
  await repo.updateOrder(cardId, { paidCash: String(cash), paidKaspi: String(kaspi), changeSum: String(change), changeFrom: p.changeFrom || '', payment: label, prodPhase: 'sold' })
  await repo.insertHistory({ cardId, action: 'pay', detail: `Продано (${inv.number}): нал ${cash}, каспи ${kaspi}, долг ${debt}${change > 0 ? `, сдача ${change}` : ''}`, userName: actor?.name || 'Система' })
  return { ok: true as const, total, cash, kaspi, debt, number: inv.number }
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
  await repo.updateOrder(cardId, { linkedDocId: null, posted1c: false, screen: 'reception', status: 'Готов к доставке', prodPhase: 'ready', paidCash: '0', paidKaspi: '0', changeSum: '0', changeFrom: '', payment: '' })
  await repo.insertHistory({ cardId, action: 'unpay', detail: 'Продажа отменена — карточка снова в работе', userName: actor?.name || 'Система' })
  return { ok: true as const, cancelled: docs.length }
}
