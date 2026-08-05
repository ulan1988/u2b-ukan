// Резерв Центр-Склада под заявку-продажу (из Улкана: reserve/release).
import { randomUUID } from 'crypto'
import * as repo from '../repositories/reserve.repo'
import { today } from '../lib/num'

// Зарезервировать позиции продажи на центральном складе (kind='reserve', qty<0).
// Идемпотентно: сначала снимаем прежние резервы этой карточки.
export async function reserveForCard(orgId: string, cardId: string, positions: any[]) {
  const wh = await repo.centralWarehouse(orgId)
  if (!wh) return
  await repo.deleteReservesByCard(cardId)
  const moves = positions.filter(p => p.productId && Number(p.qty) > 0).map(p => ({
    id: randomUUID(), orgId, warehouseId: wh.id, productId: p.productId,
    qty: String(-Math.abs(Number(p.qty))), kind: 'reserve', cardId, date: today(),
  }))
  await repo.insertMoves(moves)
}

// Снять резерв (при доставке/отмене — товар списывается настоящим расходом или возвращается).
export const releaseCard = (cardId: string) => repo.deleteReservesByCard(cardId)
