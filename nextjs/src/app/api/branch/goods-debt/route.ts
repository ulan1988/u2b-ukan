import { NextRequest, NextResponse } from 'next/server'
import { listGoodsDebts, addGoodsDebt, deleteGoodsDebt } from '@/services/goodsDebt.service'
import { resolveTarget } from '@/services/auth.service'
import { goodsDebtSchema } from '@/dto/cashier.dto'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// «Долг товаров» (касса магазина): журнал взяли/вернули по своим контрагентам (без склада).
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const uid = req.nextUrl.searchParams.get('uid')
  const t = await resolveTarget(s, uid)
  const res = await listGoodsDebts(t.orgId)
  return NextResponse.json(res)
}

// Запись: { contragentId, productName, productId?, unit?, direction, qty, note?, uid }.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = goodsDebtSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Неверные данные' }, { status: 400 })
  const { uid, ...input } = parsed.data
  const t = await resolveTarget(s, uid)
  const res: any = await addGoodsDebt(t.orgId, input as any, t)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}

// Удалить запись журнала: ?id=…&uid=…
export async function DELETE(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  const uid = req.nextUrl.searchParams.get('uid')
  if (!id) return NextResponse.json({ error: 'Нужен id' }, { status: 400 })
  const t = await resolveTarget(s, uid)
  const res: any = await deleteGoodsDebt(id, t.orgId)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
