import { NextRequest, NextResponse } from 'next/server'
import { encashment } from '@/services/cashier.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Инкассация филиала → QR-счёт головного: { fromAccountId, amount, uid }.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b?.fromAccountId || !(Number(b?.amount) > 0)) return NextResponse.json({ error: 'Нужны счёт и сумма' }, { status: 400 })
  const t = await resolveTarget(s, b.uid)
  const res: any = await encashment(t.orgId, b.fromAccountId, Number(b.amount), t as any)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
