import { NextRequest, NextResponse } from 'next/server'
import { clientPay } from '@/services/cashier.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Оплата (инкассация) из кабинета клиента: приход на выбранный счёт его орг, долг уменьшается.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const t = await resolveTarget(s, body.uid)
  if (!t.contragentId) return NextResponse.json({ error: 'Кабинет не привязан к контрагенту' }, { status: 400 })
  const amount = Number(body.amount)
  if (!(amount > 0)) return NextResponse.json({ error: 'Сумма должна быть больше 0' }, { status: 400 })
  const r = await clientPay(t.orgId, t.contragentId, String(body.accountId || ''), amount, s)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r)
}
