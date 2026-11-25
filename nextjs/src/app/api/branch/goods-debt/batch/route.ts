import { NextRequest, NextResponse } from 'next/server'
import { addGoodsDebtBatch } from '@/services/goodsDebt.service'
import { resolveTarget } from '@/services/auth.service'
import { goodsDebtBatchSchema } from '@/dto/cashier.dto'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// «Долг товаров» — взяли / отдали в долг чеком: { contragentId, direction, items[{productName, unit, qty}], note?, uid }.
// Все позиции чека пишутся в журнал одним действием (склад не трогается).
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = goodsDebtBatchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Неверные данные' }, { status: 400 })
  const { uid, ...input } = parsed.data
  const t = await resolveTarget(s, uid)
  const res: any = await addGoodsDebtBatch(t.orgId, input as any, t)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
