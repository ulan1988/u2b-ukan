import { NextRequest, NextResponse } from 'next/server'
import { masterShift, addShiftExpense, closeMasterShift, incassate, remitToHQ } from '@/services/shift.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { today } from '@/lib/num'

export const dynamic = 'force-dynamic'

// GET ?date&uid — сводка смены мастера за день. POST — добавить расход / закрыть смену.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const t = await resolveTarget(s, sp.get('uid'))
  const date = sp.get('date') || today()
  return NextResponse.json(await masterShift(t.orgId, date))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const t = await resolveTarget(s, b?.uid)
  const date = b?.date || today()
  let res: any
  if (b?.action === 'close') res = await closeMasterShift(t.orgId, date, s)
  else if (b?.action === 'incassate') res = await incassate(t.orgId, Number(b?.cash), Number(b?.kaspi), date, s)
  else if (b?.action === 'remit') res = await remitToHQ(t.orgId, Number(b?.amount), date, s)
  else res = await addShiftExpense(t.orgId, { kind: b?.kind === 'salary' ? 'salary' : 'current', who: b?.who, article: b?.article, accountId: b?.accountId, amount: Number(b?.amount), date }, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  return NextResponse.json(res)
}
