import { NextRequest, NextResponse } from 'next/server'
import { payDebt } from '@/services/cashier.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { payDebtSchema } from '@/dto/cashier.dto'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Погашение долга по чеку (касса магазина): { cardId, amount|splits, accountId, uid, date }.
// date — день, которым провести приход (можно задним числом).
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  // Одиночная оплата {accountId, amount} — совместимость со старым клиентом: сводим к splits.
  const raw = Array.isArray(b?.splits) ? b
    : { ...b, splits: (b?.accountId && Number(b?.amount) > 0 ? [{ accountId: b.accountId, amount: Number(b.amount) }] : []) }
  const p = payDebtSchema.safeParse(raw)
  if (!p.success) return NextResponse.json({ error: 'Нужны чек, счёт и сумма' }, { status: 400 })
  await resolveTarget(s, p.data.uid)
  const res: any = await payDebt(p.data.cardId, p.data.splits, s, p.data.date)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
