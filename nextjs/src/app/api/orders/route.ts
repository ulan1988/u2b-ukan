import { NextRequest, NextResponse } from 'next/server'
import { createOrderSchema } from '@/dto/order.dto'
import { createOrder, listOrders } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  const screen = searchParams.get('screen') || undefined   // без screen → все экраны
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  return NextResponse.json(await listOrders(orgId, screen))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  const parsed = createOrderSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await createOrder(parsed.data, s), { status: 201 })
}
