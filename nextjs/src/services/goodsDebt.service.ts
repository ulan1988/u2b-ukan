// «Долг товаров» (касса магазина) — бизнес-логика. Журнал НЕ трогает склад.
// Две стороны, остаток на КОЛИЧЕСТВО товара. Долг гасится ТОВАРОМ или ДЕНЬГАМИ:
//  • МЫ ДОЛЖНЫ (weOwe): взяли (take) → вернули товаром (return) ИЛИ оплатили деньгами (pay). = Σtake − Σ(return+pay).
//  • НАМ ДОЛЖНЫ (theyOwe): отдали (give) → сосед вернул товаром (giveback) ИЛИ оплатил деньгами (receive). = Σgive − Σ(giveback+receive).
// При pay/receive деньги идут по счёту (payments out/in). Контрагент — только свой орг.
import * as repo from '../repositories/goodsDebt.repo'
import * as payRepo from '../repositories/payment.repo'
import { today } from '../lib/num'
import { randomUUID } from 'crypto'

type Actor = { id?: string; name?: string } | null

const n = (v: any) => Number(v) || 0
// Ключ позиции долга = товар + ед.изм (взаимозачёт только по одинаковому товару).
const key = (productName: string, unit: string) => `${(productName || '').trim().toLowerCase()}|${(unit || 'шт').trim().toLowerCase()}`

// Журнал + свёрнутые остатки по контрагенту→товару (обе стороны).
export async function listGoodsDebts(orgId: string) {
  const entries = await repo.listByOrg(orgId)
  const byCag = new Map<string, any>()
  for (const e of entries as any[]) {
    let g = byCag.get(e.contragentId)
    if (!g) { g = { contragentId: e.contragentId, contragentName: e.contragentName, items: new Map<string, any>() }; byCag.set(e.contragentId, g) }
    const k = key(e.productName, e.unit)
    let it = g.items.get(k)
    if (!it) { it = { productId: e.productId, productName: e.productName, unit: e.unit || 'шт', took: 0, returned: 0, paid: 0, given: 0, givenBack: 0, received: 0 }; g.items.set(k, it) }
    if (e.direction === 'return') it.returned += n(e.qty)
    else if (e.direction === 'pay') it.paid += n(e.qty)           // мы оплатили деньгами
    else if (e.direction === 'give') it.given += n(e.qty)
    else if (e.direction === 'giveback') it.givenBack += n(e.qty)
    else if (e.direction === 'receive') it.received += n(e.qty)   // сосед оплатил деньгами
    else it.took += n(e.qty)
  }
  const balances = Array.from(byCag.values()).map(g => {
    const items = Array.from(g.items.values()).map((it: any) => ({
      ...it,
      weOwe: Math.max(0, it.took - it.returned - it.paid),           // мы должны соседу
      theyOwe: Math.max(0, it.given - it.givenBack - it.received),   // сосед должен нам
    }))
    const weOweTotal = items.reduce((s: number, it: any) => s + it.weOwe, 0)
    const theyOweTotal = items.reduce((s: number, it: any) => s + it.theyOwe, 0)
    return { contragentId: g.contragentId, contragentName: g.contragentName, items, weOweTotal, theyOweTotal }
  })
    .filter(g => g.items.some((it: any) => it.took > 0 || it.returned > 0 || it.paid > 0 || it.given > 0 || it.givenBack > 0 || it.received > 0))
    .sort((a, b) => (b.weOweTotal + b.theyOweTotal) - (a.weOweTotal + a.theyOweTotal))
  return { entries, balances }
}

// Запись события: take/return/pay (мы должны) | give/giveback/receive (нам должны). contragentId — свой орг.
// pay = мы оплатили деньгами (out по счёту), receive = сосед оплатил деньгами (in по счёту).
const DIRS = ['take', 'return', 'give', 'giveback', 'pay', 'receive']
export async function addGoodsDebt(
  orgId: string,
  input: { contragentId: string; productId?: string | null; productName: string; unit?: string; direction: string; qty: number; note?: string; accountId?: string; amount?: number },
  actor?: Actor,
) {
  const cag = await repo.contragentInOrg(input.contragentId, orgId)
  if (!cag) return { ok: false as const, error: 'Контрагент не найден у этого магазина' }
  const name = (input.productName || '').trim()
  if (!name) return { ok: false as const, error: 'Укажите товар' }
  const qty = n(input.qty)
  if (qty <= 0) return { ok: false as const, error: 'Количество должно быть больше 0' }
  const dir = DIRS.includes(input.direction) ? input.direction : 'take'
  const money = dir === 'pay' || dir === 'receive'
  if (money && !input.accountId) return { ok: false as const, error: 'Выберите счёт для оплаты' }
  const amount = n(input.amount)
  const [row] = await repo.insertEntry({
    orgId,
    contragentId: input.contragentId,
    contragentName: (cag as any).name || '',
    productId: input.productId || null,
    productName: name,
    unit: (input.unit || 'шт').trim() || 'шт',
    direction: dir,
    qty: String(qty),
    note: (input.note || '').trim(),
    createdBy: actor?.name || 'Система',
  })
  // Деньги по счёту: pay → out (мы платим соседу), receive → in (сосед платит нам). Склад не трогаем.
  if (money && amount > 0 && input.accountId) {
    await payRepo.insertPayment({
      id: randomUUID(), orgId, contragentId: input.contragentId,
      direction: dir === 'pay' ? 'out' : 'in', amount: String(amount), date: today(),
      cashAccountId: input.accountId, documentId: null,
      comment: `Долг товаров (${dir === 'pay' ? 'оплата' : 'приход'}): ${name}`,
    })
  }
  return { ok: true as const, id: row.id }
}

export async function deleteGoodsDebt(id: string, orgId: string) {
  const row = await repo.getEntry(id, orgId)
  if (!row) return { ok: false as const, error: 'Запись не найдена' }
  await repo.deleteEntry(id, orgId)
  return { ok: true as const }
}
