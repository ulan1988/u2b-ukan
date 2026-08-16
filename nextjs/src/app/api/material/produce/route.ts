import { NextRequest, NextResponse } from 'next/server'
import { produceToStock } from '@/services/material.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// «В запас»: { items:[{productId, name, widthCm, qty}] } → списать листы раскроем +
// приходовать изделие в свой склад (готовая продукция по базе), пометка «собственное производство».
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.items?.length) return NextResponse.json({ error: 'Нет изделий' }, { status: 400 })
  const res: any = await produceToStock(b.orgId || s.orgId, b.items, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res, { status: 201 })
}
