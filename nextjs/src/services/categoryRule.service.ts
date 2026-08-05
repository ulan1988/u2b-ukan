// Автоподстановка поставщик/логист по группе товара (из Улкана).
import * as ruleRepo from '../repositories/categoryRule.repo'
import { matchCategoryKey } from '../lib/nomCatalog'

export const listRules = (orgId: string) => ruleRepo.listRules(orgId)

export async function saveRule(orgId: string, i: { category: string; supplierId?: string; supplierName?: string; respUserId?: string; logistName?: string }) {
  const [r] = await ruleRepo.upsertRule({
    orgId, category: i.category,
    supplierId: i.supplierId ?? null, supplierName: i.supplierName || '',
    respUserId: i.respUserId ?? null, logistName: i.logistName || '',
  })
  return r
}

// Применить правила к позициям: пустым supplier/resp проставить по группе товара.
// products: map productId → { group, cat }. Возвращает патчи по позициям.
export async function applyDefaults(orgId: string, positions: any[], productMeta: Map<string, { group: string; cat: string }>) {
  const rules = await ruleRepo.listRules(orgId)
  const byCat: Record<string, any> = {}
  for (const r of rules) byCat[r.category] = r
  const patches: { id: string; supplierId?: string; respUserId?: string }[] = []
  for (const p of positions) {
    if (p.supplierId && p.respUserId) continue
    const meta = p.productId ? productMeta.get(p.productId) : null
    const key = meta ? matchCategoryKey(meta.group, meta.cat) : null
    const rule = key ? byCat[key] : null
    if (!rule) continue
    const patch: any = { id: p.id }
    if (!p.supplierId && rule.supplierId) patch.supplierId = rule.supplierId
    if (!p.respUserId && rule.respUserId) patch.respUserId = rule.respUserId
    if (patch.supplierId || patch.respUserId) patches.push(patch)
  }
  return patches
}
