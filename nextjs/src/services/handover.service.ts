// Передача готового заказа филиала-производителя (Нипа листогиб) СРАЗУ головному,
// минуя логиста. Правило владельца (06.11.2026): логист в большинстве случаев в процессе
// не участвует и только тормозит — мастер жмёт «Отправить к Адал Строй 2» и цепочка
// проводится немедленно.
//
// Цепочка документов (три звена, как при «Долге к головному», но без доставки логистом):
//   1. расходная Нипы на мост-контрагент головного  — склад Нипы минус, долг ГО растёт;
//   2. зеркальная приходная головного               — Центр-Склад плюс;
//   3. расходная головного на конечного заказчика   — долг заказчика у головного.
// Всё это уже умеет cashier.payCard(finalize) — здесь мы её и вызываем, а сверху
// создаём у головного КАРТОЧКУ-ОЗНАКОМЛЕНИЕ: экран «Входящие», статус «Выполнено»,
// source='branch_done' (кнопок нет, в автозакуп не идёт, логисту не видна).
import * as repo from '../repositories/order.repo'
import * as refsRepo from '../repositories/refs.repo'
import { randomUUID } from 'crypto'
import { today } from '../lib/num'
import type { Session } from '../lib/auth'

const num = (n: any) => Number(n) || 0

export async function sendToHq(cardId: string, actor?: Session | null, date?: string) {
  const [order] = await repo.getOrder(cardId)
  if (!order) return { ok: false as const, error: 'Карточка не найдена' }
  if (order.isCancelled) return { ok: false as const, error: 'Карточка отменена' }
  if (order.linkedDocId) return { ok: false as const, error: 'По карточке уже проведена накладная' }
  if (!order.contactId) return { ok: false as const, error: 'В карточке нет заказчика' }

  const org = await refsRepo.orgById(order.orgId)
  if ((org as any)?.kind !== 'producer_seller') return { ok: false as const, error: 'Только филиал-производитель' }
  const orgs = await refsRepo.listOrganizations()
  const hq = (orgs as any[]).find(o => o.kind === 'hq')
  if (!hq) return { ok: false as const, error: 'Головная организация не найдена' }

  const positions = await repo.positionsByCard(cardId)
  if (!positions.length) return { ok: false as const, error: 'В карточке нет позиций' }

  // 1–3. Провести цепочку (без оплаты: весь итог — долг заказчика головному).
  const { payCard } = await import('./cashier.service')
  const paid = await payCard(cardId, { cash: 0, kaspi: 0, qr: 0, change: 0, changeFrom: '', finalize: true, date } as any, actor)
  if (!paid || (paid as any).ok === false) return { ok: false as const, error: (paid as any)?.error || 'Не удалось провести цепочку' }

  // Карточка мастера закрыта: товар ушёл головному, у мастера он больше не числится.
  await repo.updateOrder(cardId, { prodPhase: 'sent', status: 'Отправлено', pendingDebtHead: false } as any)

  // 4. Карточка-ознакомление у головного: что именно сделал филиал и по каким накладным.
  const docRepo = await import('../repositories/document.repo')
  const hqIn = await docRepo.docBySourceOrg(cardId, hq.id, 'purchase')     // приходная ГО (зеркало)
  const hqOut = await docRepo.docBySourceOrg(cardId, hq.id, 'sale')        // расходная ГО клиенту
  const lines = hqOut ? await docRepo.linesWithProduct(hqOut.id) : []

  const mirrorId = await repo.nextFreeByKind('sale')
  const byPos = new Map(positions.map((p: any) => [String(p.id), p]))
  const srcLines = lines.length ? lines : positions.map((p: any) => ({ productId: p.productId, name: p.name1c || p.oral, qty: p.qty, unit: p.unit, price: p.price, widthCm: p.widthCm, sourcePosId: p.id }))
  const mirrorPositions = srcLines.map((l: any, i: number) => {
    const src = l.sourcePosId ? byPos.get(String(l.sourcePosId)) : null
    return {
      id: `${mirrorId}-P${i + 1}`, cardId: mirrorId, productId: l.productId ?? null,
      originPosId: l.sourcePosId ?? null,
      name1c: l.name || (src as any)?.name1c || '', oral: l.name || (src as any)?.oral || '',
      qty: String(num(l.qty)), unit: l.unit || 'шт', price: String(num(l.price)),
      widthCm: l.widthCm != null ? String(num(l.widthCm)) : ((src as any)?.widthCm ?? null),
      leg: 2, status: 'Доставлено', respUserId: null, supplierId: null,
    }
  })

  await repo.insertOrderPosting(
    {
      id: mirrorId, orgId: hq.id, kind: 'sale', screen: 'incoming', block: '', status: 'Выполнено',
      source: 'branch_done', isDraft: false, parentCardId: cardId,
      contactId: order.contactId, fromName: (org as any)?.name || 'Филиал',
      comment: order.comment || '', phone: order.phone || '',
      linkedDocId: hqOut?.id ?? null, delivered: new Date(),
      specProjectId: (order as any).specProjectId ?? null,
    } as any,
    mirrorPositions as any,
    {
      id: randomUUID(), cardId: mirrorId, action: 'branchDone',
      detail: `Выполнено филиалом «${(org as any)?.name || ''}» · ${cardId}${hqIn ? ` · приходная ${hqIn.number}` : ''}${hqOut ? ` · расходная ${hqOut.number}` : ''}`,
      userName: actor?.name || 'Система',
    } as any,
  )

  await repo.insertHistory({
    cardId, action: 'sendHq',
    detail: `Отправлено в «${hq.name}» без логиста · карточка ${mirrorId}${hqOut ? ` · расходная ${hqOut.number}` : ''}`,
    userName: actor?.name || 'Система',
  })

  try {
    const { notifyOrgAdmins } = await import('./notifyHelpers')
    await notifyOrgAdmins(hq.id, `📦 ${(org as any)?.name || 'Филиал'} выполнил заказ ${cardId} — карточка ${mirrorId} во Входящих (${mirrorPositions.length} поз.)`)
  } catch { /* уведомление не должно ронять передачу */ }

  return { ok: true as const, mirrorId, docIn: hqIn?.number || null, docOut: hqOut?.number || null, date: date || today() }
}
