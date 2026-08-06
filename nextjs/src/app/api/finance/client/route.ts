import { NextRequest, NextResponse } from 'next/server'
import { summary } from '@/services/finance.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Баланс текущего клиента: находим его контрагента по имени и отдаём долг/оплату.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const fin = await summary(s.orgId)
  const norm = (x: string) => (x || '').trim().toLowerCase()
  const c = (fin.contragents || []).find((x: any) => norm(x.name) === norm(s.name))
  if (!c) return NextResponse.json({ debt: 0, paid: 0, balance: 0, currency: '₸', transactions: [], configured: false })
  return NextResponse.json({ debt: c.theyOwe, paid: 0, balance: c.theyOwe, currency: '₸', transactions: [], configured: true })
}
