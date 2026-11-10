// «Прочий доход»: деньги без товара — приход по счетам + бонус 50/50 с головным.
// Склад и накладные не трогаются (себестоимости нет, вся сумма = бонус).
import { NextRequest, NextResponse } from 'next/server'
import { otherIncome } from '@/services/cashier.service'
import { resolveTarget } from '@/services/auth.service'
import { otherIncomeSchema } from '@/dto/cashier.dto'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Журнал: прочие доходы за день (для вкладки «Чеки» и «Кассы дня»).
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const t = await resolveTarget(s, sp.get('uid') || undefined)
  const { listOtherIncome } = await import('@/services/cashier.service')
  const date = sp.get('date') || new Date().toISOString().slice(0, 10)
  return NextResponse.json(await listOtherIncome(t.orgId, date))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = otherIncomeSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Неверные данные' }, { status: 400 })
  const { uid, ...input } = parsed.data
  const t = await resolveTarget(s, uid)
  const res: any = await otherIncome(t.orgId, input as any, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
