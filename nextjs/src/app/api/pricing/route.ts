import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { products, contragents } from '@/db/schema'
import { inArray, eq, sql } from 'drizzle-orm'
import { priceForClient, isIzdelie } from '@/lib/lineAmount'
import { setItemPrice } from '@/services/pricing.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Быстрый ввод цены «на ходу»: сохранить цену/см изделия (по имени) в прайс.
// POST { name, price, priceType? } → создаёт/обновляет базовое изделие с этой ценой.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const r = await setItemPrice(b.name, Number(b.price), b.priceType)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r)
}

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
    // Изделие: цена ЗА СМ. Ищем по приоритету: точное имя → «Изделие {цвет}» (без «NN см»)
    // → общий «Изделие» (umbrella, без цвета и см). Берём цену с самого конкретного найденного.
    const baseOf = (n: string) => n.replace(/\s*\d+([.,]\d+)?\s*см\s*$/i, '').trim()
    const keysFor = (n: string) => {
      const ks = [n.toLowerCase()]                                       // 1. точное
      if (isIzdelie(n)) { ks.push(baseOf(n).toLowerCase()); ks.push('изделие') }  // 2. по цвету  3. общий
      return Array.from(new Set(ks))
    }
    const allKeys = new Set<string>(); for (const n of names) for (const k of keysFor(n)) allKeys.add(k)
    const rows = await db.select().from(products).where(inArray(sql`lower(trim(${products.name}))`, Array.from(allKeys)))
    const priceByKey = new Map<string, number>()
    for (const r of rows) { const v = priceForClient(r, priceType); if (v > 0) priceByKey.set(String(r.name).trim().toLowerCase(), v) }
    for (const n of names) { for (const k of keysFor(n)) { const v = priceByKey.get(k); if (v != null) { out[n] = v; break } } }  // первый найденный = самый конкретный
  }
  return NextResponse.json(out)
}
