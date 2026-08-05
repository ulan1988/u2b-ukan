import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { products, contragents } from '@/db/schema'
import { inArray, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

// Автоцены: по productIds вернуть цену под тип клиента (retail|opt).
// GET ?productIds=a,b,c&contragentId=... → { [productId]: price }
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const ids = (p.get('productIds') || '').split(',').filter(Boolean)
  const contragentId = p.get('contragentId')
  if (!ids.length) return NextResponse.json({})

  let priceType = 'retail'
  if (contragentId) {
    const [c] = await db.select({ pt: contragents.priceType }).from(contragents).where(eq(contragents.id, contragentId)).limit(1)
    if (c?.pt === 'opt') priceType = 'opt'
  }
  const rows = await db.select().from(products).where(inArray(products.id, ids))
  const out: Record<string, number> = {}
  for (const r of rows) out[r.id] = Number(priceType === 'opt' ? r.priceOpt : r.priceRetail)
  return NextResponse.json(out)
}
