// Центральное управление накладными: наша РАСХОДНАЯ — мать, зеркальные ПРИХОДНЫЕ филиалов —
// дочери (documents.parent_doc_id). Правим мать один раз и жмём «Применить всем» — состав,
// количество и цены разъезжаются по всем дочерним, а филиалы получают уведомление и флаг
// «не проверено». Так не нужно дозваниваться каждому.
//
// Правило склада (решение владельца): применяем ВСЕГДА, но если у филиала остаток уходит
// в минус (товар уже перепродан) — возвращаем предупреждение и помечаем документ.
import * as docRepo from '../repositories/document.repo'
import { randomUUID } from 'crypto'
import { lineAmount } from '../lib/lineAmount'
import type { Session } from '../lib/auth'

const num = (n: any) => Number(n) || 0

export type SyncWarning = { doc: string; product: string; left: number }

export async function applyToChildren(docId: string, actor?: Session | null) {
  const [mother] = await docRepo.getDoc(docId)
  if (!mother) return { ok: false as const, error: 'Накладная не найдена' }
  if (mother.status === 'cancelled') return { ok: false as const, error: 'Накладная отменена' }
  const children = await docRepo.childDocs(docId)
  if (!children.length) return { ok: false as const, error: 'У этой накладной нет дочерних (филиальных) накладных' }

  const src = await docRepo.linesWithProduct(docId)
  const warnings: SyncWarning[] = []
  let synced = 0

  for (const child of children) {
    const cur = await docRepo.linesWithProduct(child.id)
    const byProduct = new Map<string, any>()
    for (const l of cur) if (l.productId) byProduct.set(l.productId, l)

    // 1. Приводим состав дочерней к матери: правим общие строки, добавляем новые.
    const keep = new Set<string>()
    const newLines: any[] = []
    for (const l of src) {
      if (!l.productId) continue
      const amount = lineAmount({ name: (l as any).name, qty: l.qty, price: l.price, widthCm: (l as any).widthCm })
      const ex = byProduct.get(l.productId)
      if (ex) {
        keep.add(ex.id)
        await docRepo.updateLine(ex.id, { qty: String(l.qty), price: String(l.price), amount: String(amount), unit: l.unit || 'шт', widthCm: (l as any).widthCm != null ? String((l as any).widthCm) : null } as any)
      } else {
        newLines.push({ id: randomUUID(), documentId: child.id, productId: l.productId, role: 'main', qty: String(l.qty), unit: l.unit || 'шт', price: String(l.price), amount: String(amount), widthCm: (l as any).widthCm != null ? String((l as any).widthCm) : null })
      }
    }
    if (newLines.length) await docRepo.insertLines(newLines as any)
    // 2. Строки, которых в матери больше нет, — убираем.
    for (const l of cur) if (!keep.has(l.id) && !newLines.some(n => n.id === l.id)) await docRepo.deleteLine(l.id)

    // 3. Движения склада переписываем по новому составу (дочерняя — приход филиала).
    const after = await docRepo.linesWithProduct(child.id)
    const sign = child.type === 'purchase' ? 1 : -1
    if (!child.transit && child.warehouseId) {
      await docRepo.replaceMovements(child.id, after.filter(l => l.productId).map(l => ({
        id: randomUUID(), orgId: child.orgId, warehouseId: child.warehouseId as string,
        productId: l.productId as string, qty: String(sign * num(l.qty)), documentId: child.id, date: child.date,
      })) as any)
      // 4. Предупреждение: остаток филиала ушёл в минус (товар уже перепродан).
      const ids = after.map(l => l.productId).filter(Boolean) as string[]
      const left = await docRepo.stockByProducts(child.orgId, child.warehouseId as string, ids)
      for (const l of after) {
        const q = l.productId ? left[l.productId] : 0
        if (l.productId && q < 0) warnings.push({ doc: child.number, product: (l as any).name || '', left: q })
      }
    }

    // 5. Итог + сброс «проверено»: филиал должен заново подтвердить изменённый документ.
    const total = after.reduce((s, l) => s + num(l.amount), 0)
    await docRepo.updateDoc(child.id, { total: String(total), reviewed: false, contragentAccepted: false } as any)
    synced++

    try {
      const { notifyOrgAdmins } = await import('./notifyHelpers')
      await notifyOrgAdmins(child.orgId, `✏️ Накладная ${child.number} изменена головным (${Math.round(total).toLocaleString('ru-RU')} ₸) — проверьте состав и цены.`)
    } catch { /* уведомление не должно ронять синхронизацию */ }
  }

  return { ok: true as const, synced, warnings }
}
