import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import * as svc from '@/services/finmoney.service'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// Платежи одной ячейки авто-строки (день + счёт + контрагент) — чтобы было видно,
// из чего сложилась сумма, и какую именно проводку правим.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s?.orgId) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const date = sp.get('date') || ''
  const accountId = sp.get('accountId') || ''
  if (!date || !accountId) return NextResponse.json({ error: 'Нужны дата и счёт' }, { status: 400 })
  return NextResponse.json({ data: await svc.cellPayments(s.orgId, date, accountId, sp.get('contragentId')) })
}

const patchSchema = z.object({ id: z.string().uuid(), amount: z.coerce.number().nonnegative() })

// Правка суммы платежа: двигает кассу, долг контрагента, оплату по накладной
// и зеркальную проводку второй орг (инкассация/возврат головного).
export async function PATCH(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s?.orgId) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте сумму' }, { status: 400 })
  return NextResponse.json(await svc.editAutoPayment(s.orgId, parsed.data.id, parsed.data.amount))
}
