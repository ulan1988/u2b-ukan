// Сумма строки/позиции. Обычный товар: кол-во × цена. ИЗДЕЛИЕ (имя «Изделие …»):
// цена задаётся ЗА СМ, поэтому сумма = кол-во × см(ширина) × цена. Пример: 10 шт × 50 см × 70 = 35 000.
// «Изделие» без см (шаблон) считаем как обычный товар (за штуку), чтобы не обнулять сумму.
// ВАЖНО: без \b — в JS \b это ASCII-граница слова, а кириллица не \w, поэтому
// /^изделие\b/ НЕ матчит «Изделие 1015». Матчим просто по началу «изделие».
export const isIzdelie = (name?: string | null) => /^изделие/i.test((name || '').trim())

export function lineAmount(p: { name?: string | null; qty: number | string; price: number | string; widthCm?: number | string | null }): number {
  const q = Number(p.qty) || 0, price = Number(p.price) || 0, w = Number(p.widthCm) || 0
  return isIzdelie(p.name) && w > 0 ? q * w * price : q * price
}

// Цена по типу клиента: spec → priceSpec, opt → priceOpt, иначе розница. С откатом на розницу/опт.
export function priceForClient(prod: any, priceType?: string | null): number {
  if (!prod) return 0
  if (priceType === 'spec') return Number(prod.priceSpec) || Number(prod.priceRetail) || 0
  if (priceType === 'opt') return Number(prod.priceOpt) || Number(prod.priceRetail) || 0
  return Number(prod.priceRetail) || 0
}
