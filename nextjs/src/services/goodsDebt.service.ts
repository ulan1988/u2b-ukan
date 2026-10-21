// «Долг товаров» (касса магазина) — бизнес-логика. ОТДЕЛЬНЫЙ журнал: НЕ трогает склад/бухгалтерию.
// Взяли у соседа товар в долг (take) → вернули товаром (return). Остаток по товару = Σtake − Σreturn (на количество).
// Контрагент — только свой (орг кассы); головной (Адал Строй 2) тут не участвует.
import * as repo from '../repositories/goodsDebt.repo'

type Actor = { id?: string; name?: string } | null

const n = (v: any) => Number(v) || 0
// Ключ позиции долга = товар + ед.изм (взаимозачёт только по одинаковому товару).
const key = (productName: string, unit: string) => `${(productName || '').trim().toLowerCase()}|${(unit || 'шт').trim().toLowerCase()}`

// Журнал + свёрнутые остатки по контрагенту→товару.
export async function listGoodsDebts(orgId: string) {
  const entries = await repo.listByOrg(orgId)
  // Группируем: контрагент → товар (имя+ед) → взяли/вернули.
  const byCag = new Map<string, any>()
  for (const e of entries as any[]) {
    let g = byCag.get(e.contragentId)
    if (!g) { g = { contragentId: e.contragentId, contragentName: e.contragentName, items: new Map<string, any>() }; byCag.set(e.contragentId, g) }
    const k = key(e.productName, e.unit)
    let it = g.items.get(k)
    if (!it) { it = { productId: e.productId, productName: e.productName, unit: e.unit || 'шт', took: 0, returned: 0 }; g.items.set(k, it) }
    if (e.direction === 'return') it.returned += n(e.qty); else it.took += n(e.qty)
  }
  const balances = Array.from(byCag.values()).map(g => {
    const items = Array.from(g.items.values()).map((it: any) => ({ ...it, left: Math.max(0, it.took - it.returned) }))
    const totalLeft = items.reduce((s: number, it: any) => s + it.left, 0)
    return { contragentId: g.contragentId, contragentName: g.contragentName, items, totalLeft }
  })
    .filter(g => g.items.some((it: any) => it.took > 0 || it.returned > 0))
    .sort((a, b) => b.totalLeft - a.totalLeft)
  return { entries, balances }
}

// Запись: взяли (take) или вернули (return). contragentId обязателен и должен принадлежать орг кассы.
export async function addGoodsDebt(
  orgId: string,
  input: { contragentId: string; productId?: string | null; productName: string; unit?: string; direction: 'take' | 'return'; qty: number; note?: string },
  actor?: Actor,
) {
  const cag = await repo.contragentInOrg(input.contragentId, orgId)
  if (!cag) return { ok: false as const, error: 'Контрагент не найден у этого магазина' }
  const name = (input.productName || '').trim()
  if (!name) return { ok: false as const, error: 'Укажите товар' }
  const qty = n(input.qty)
  if (qty <= 0) return { ok: false as const, error: 'Количество должно быть больше 0' }
  const dir = input.direction === 'return' ? 'return' : 'take'
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
  return { ok: true as const, id: row.id }
}

export async function deleteGoodsDebt(id: string, orgId: string) {
  const row = await repo.getEntry(id, orgId)
  if (!row) return { ok: false as const, error: 'Запись не найдена' }
  await repo.deleteEntry(id, orgId)
  return { ok: true as const }
}
