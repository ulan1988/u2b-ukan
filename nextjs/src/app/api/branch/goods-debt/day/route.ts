import { NextRequest, NextResponse } from 'next/server'
import { goodsDebtDay } from '@/services/goodsDebt.service'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// «Долг товаров» — история за день: GET ?date=YYYY-MM-DD&uid=… → { moves[], moneyOut, moneyIn }. Только чтение.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const date = req.nextUrl.searchParams.get('date') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Нужна дата YYYY-MM-DD' }, { status: 400 })
  const t = await resolveTarget(s, req.nextUrl.searchParams.get('uid'))
  return NextResponse.json(await goodsDebtDay(t.orgId, date))
}
