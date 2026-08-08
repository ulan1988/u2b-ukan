// Автоподбор номенклатуры 1С по тексту «со слов» (устное название клиента).
// В Приёмке позиция приходит из кабинета текстом (oral) — сопоставляем со справочником:
// 100% совпадение → точный товар (подставляется автоматом); иначе — ближайший кандидат (подсказка).
const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

export interface NomMatch { exact: any | null; near: any | null }

export function matchNom(oral: string, products: any[]): NomMatch {
  const o = norm(oral)
  if (!o || !products?.length) return { exact: null, near: null }

  // 1) Точное совпадение имени (без регистра/лишних пробелов) = 100%.
  const exact = products.find(p => norm(p.name) === o) || null
  if (exact) return { exact, near: null }

  // 2) Вхождение: имя товара содержит текст или наоборот (берём самое короткое имя — точнее).
  const contains = products
    .filter(p => { const n = norm(p.name); return n && (n.includes(o) || o.includes(n)) })
    .sort((a, b) => a.name.length - b.name.length)
  if (contains.length) return { exact: null, near: contains[0] }

  // 3) Совпадение по словам (токенам ≥3 символов): лучший по числу общих слов, минимум половина.
  const tokens = o.split(' ').filter(t => t.length >= 3)
  if (tokens.length) {
    let best: any = null, bestScore = 0
    for (const p of products) {
      const n = norm(p.name)
      const score = tokens.reduce((s, t) => s + (n.includes(t) ? 1 : 0), 0)
      if (score > bestScore) { bestScore = score; best = p }
    }
    if (best && bestScore >= Math.max(1, Math.ceil(tokens.length / 2))) return { exact: null, near: best }
  }
  return { exact: null, near: null }
}
