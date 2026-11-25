import { NextRequest, NextResponse } from 'next/server'
import { settleGoodsDebt } from '@/services/goodsDebt.service'
import { resolveTarget } from '@/services/auth.service'
import { goodsDebtSettleSchema } from '@/dto/cashier.dto'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// «Долг товаров» — погашение чеком: { contragentId, dir, mode, items[{productName, unit, qty}], accountId?, amount?, date?, uid }.
// Отмеченные позиции соседа гасятся одним действием: товаром или деньгами (деньги — одним платежом по счёту).
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = goodsDebtSettleSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Неверные данные' }, { status: 400 })
  const { uid, ...input } = parsed.data
  const t = await resolveTarget(s, uid)
  const res: any = await settleGoodsDebt(t.orgId, input as any, t)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
