import { NextRequest, NextResponse } from 'next/server'
import { masterShift, cashReport, addShiftExpense, closeMasterShift, incassate, remitToHQ } from '@/services/shift.service'
import { sessionFromRequest } from '@/lib/auth'
import { today } from '@/lib/num'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

const ADMIN = ['admin', 'super_admin', 'bookkeeper']

// Касса дня (десктоп-финанс): орг выбирается явно (админ-селектор), не из сессии.
// GET ?orgId&date — сводка. POST { orgId, action } — расход / перевод GOLD→банк / закрытие.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const orgId = sp.get('orgId') || s.orgId
  if (sp.get('mode') === 'month') {
    const from = sp.get('from') || today(), to = sp.get('to') || today()
    return NextResponse.json(await cashReport(orgId, from, to))
  }
  const date = sp.get('date') || today()
  return NextResponse.json(await masterShift(orgId, date))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || !ADMIN.includes(s.role)) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const orgId = b?.orgId || s.orgId
  const date = b?.date || today()
  let res: any
  if (b?.action === 'close') res = await closeMasterShift(orgId, date, s)
  else if (b?.action === 'incassate') res = await incassate(orgId, Number(b?.cash), Number(b?.kaspi), date, s)
  else if (b?.action === 'remit') res = await remitToHQ(orgId, Number(b?.amount), date, s)
  else res = await addShiftExpense(orgId, { kind: b?.kind === 'salary' ? 'salary' : 'current', who: b?.who, article: b?.article, accountId: b?.accountId, amount: Number(b?.amount), date }, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
