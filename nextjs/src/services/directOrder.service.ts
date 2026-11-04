// Прямой заказ: дерево карточек ЗКП → ПРД.
//
// ЗКП (мать) — закуп: логист покупает у поставщика и везёт на Центр-Склад. Когда приходная
// проведена, товар наш — рождается ДОЧЕРНЯЯ карточка ПРД (продажа клиенту) со ссылкой
// parentCardId на мать. Мать НЕ переименовываем: у неё остаются закуп, приходная и история,
// а канбан строит дерево ЗКП → ПРД → накладные по parentCardId.
//
// Позиции «переезжают со своим багажом»: та же номенклатура, кол-во, см и логист, но цена —
// ПРОДАЖИ (прайс орг по типу цены клиента), а не закупа.
import * as repo from '../repositories/order.repo'
import * as refsRepo from '../repositories/refs.repo'
import { randomUUID } from 'crypto'
import { priceForClient } from '../lib/lineAmount'
import type { Session } from '../lib/auth'

const num = (n: any) => Number(n) || 0

// Уже рождённая дочь (повторное проведение приходной не должно плодить продажи).
export async function saleChildOf(cardId: string) {
  const [child] = await repo.childrenOf(cardId)
  return child || null
}

export async function createSaleFromPurchase(cardId: string, actor?: Session | null) {
  const [mother] = await repo.getOrder(cardId)
  if (!mother) return { ok: false as const, error: 'Карточка не найдена' }
  if (!mother.directOrder) return { ok: false as const, error: 'Не прямой заказ' }
  if (!mother.contactId) return { ok: false as const, error: 'В заказе нет клиента' }
  const exists = await saleChildOf(cardId)
  if (exists) return { ok: true as const, id: exists.id, already: true }

  const positions = await repo.positionsByCard(cardId)
  if (!positions.length) return { ok: false as const, error: 'В заказе нет позиций' }

  // Цена продажи: прайс орг по типу цены клиента; нет цены — оставляем 0 (впишут в карточке).
  const [client] = await refsRepo.contragentsByIds([mother.contactId])
  const priceType = (client as any)?.priceType || 'retail'
  const prodIds = Array.from(new Set(positions.map((p: any) => p.productId).filter(Boolean))) as string[]
  const prods = await refsRepo.productsWithOrgPrices(mother.orgId, prodIds)
  const byId: Record<string, any> = {}; for (const p of prods) byId[p.id] = p

  const id = await repo.nextFreeByKind('direct_sale')
  const child = {
    id, orgId: mother.orgId, kind: 'sale', directOrder: true, parentCardId: mother.id,
    screen: 'outgoing', block: '', status: 'В работе',
    fromId: mother.fromId ?? null, contactId: mother.contactId, fromName: mother.fromName || '',
    source: 'direct_sale', comment: mother.comment || '', phone: mother.phone || '',
    deadline: mother.deadline ?? null, specProjectId: (mother as any).specProjectId ?? null,
  } as any
  const childPositions = positions.map((p: any, i: number) => ({
    id: `${id}-P${i + 1}`, cardId: id, originPosId: p.id, productId: p.productId ?? null,
    name1c: p.name1c, oral: p.oral || p.name1c, qty: p.qty, unit: p.unit || 'шт',
    widthCm: p.widthCm ?? null, leg: 2, status: 'В работе',
    respUserId: p.respUserId ?? null, supplierId: null,
    price: String(p.productId && byId[p.productId] ? priceForClient(byId[p.productId], priceType) : 0),
  }))
  await repo.insertOrderPosting(child, childPositions, {
    id: randomUUID(), cardId: id, action: 'create',
    detail: `Продажа клиенту из закупа ${mother.id} (${childPositions.length} поз.)`,
    userName: actor?.name || 'Система',
  } as any)
  await repo.insertHistory({
    cardId: mother.id, action: 'directSale',
    detail: `Товар пришёл на склад — создана продажа ${id}`, userName: actor?.name || 'Система',
  })
  return { ok: true as const, id, positions: childPositions.length }
}
