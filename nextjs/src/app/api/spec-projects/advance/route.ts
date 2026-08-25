import { NextRequest, NextResponse } from 'next/server'
import { addAdvance } from '@/services/projectFinance.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Внести аванс клиента (предоплату) — общий кредит, распределяется позже.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const r = await addAdvance(b.orgId || s.orgId, { clientId: b.clientId, amount: Number(b.amount), accountId: b.accountId, date: b.date, comment: b.comment }, s)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  await pushSignal()
  return NextResponse.json(r)
}
