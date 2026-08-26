import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { products, contragents } from '@/db/schema'
import { inArray, eq, sql } from 'drizzle-orm'
import { priceForClient } from '@/lib/lineAmount'

export const dynamic = 'force-dynamic'

// Автоцены: цена под тип клиента (retail|opt|spec). Для изделий это цена ЗА СМ.
// GET ?productIds=a,b,c&names=Изделие 7024 15 см|…&contragentId=… → { [id|name]: price }
// Возвращаем и по id (товар из 1С), и по имени (изделие ещё без товара — матчим по имени).
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const ids = (p.get('productIds') || '').split(',').filter(Boolean)
  const names = (p.get('names') || '').split('|').map(s => s.trim()).filter(Boolean)
  const contragentId = p.get('contragentId')
  if (!ids.length && !names.length) return NextResponse.json({})

  let priceType = 'retail'
  if (contragentId) {
    const [c] = await db.select({ pt: contragents.priceType }).from(contragents).where(eq(contragents.id, contragentId)).limit(1)
    if (c?.pt) priceType = c.pt
  }
  const out: Record<string, number> = {}
  if (ids.length) {
    const rows = await db.select().from(products).where(inArray(products.id, ids))
    for (const r of rows) { const v = priceForClient(r, priceType); if (v > 0) out[r.id] = v }
  }
  if (names.length) {
    // Изделие: цена ЗА СМ одна на вид+цвет — тянем с базового «Изделие {цвет}» (без «NN см»),
    // а не с конкретного «Изделие {цвет} 50 см». Ищем и точное имя, и базовое.
    const baseOf = (n: string) => n.replace(/\s*\d+([.,]\d+)?\s*см\s*$/i, '').trim()
    const wanted = new Map<string, string[]>()  // lower-ключ поиска → оригинальные имена запроса
    for (const n of names) { for (const key of [n.toLowerCase(), baseOf(n).toLowerCase()]) { const a = wanted.get(key) || []; if (!a.includes(n)) a.push(n); wanted.set(key, a) } }
    const rows = await db.select().from(products).where(inArray(sql`lower(trim(${products.name}))`, Array.from(wanted.keys())))
    for (const r of rows) {
      const v = priceForClient(r, priceType); if (!(v > 0)) continue
      const key = String(r.name).trim().toLowerCase()
      for (const orig of (wanted.get(key) || [])) if (out[orig] == null) out[orig] = v   // точное имя приоритетнее базового не нужно — оба дают одну цену/см
    }
  }
  return NextResponse.json(out)
}
