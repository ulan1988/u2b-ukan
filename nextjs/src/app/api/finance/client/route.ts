import { NextRequest, NextResponse } from 'next/server'
import { summary, contragentLedger } from '@/services/finance.service'
import { contragentOpening } from '@/repositories/finance.repo'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Баланс текущего контрагента: выписка (долг, ВОЗВРАТЫ отдельной строкой, оплаты).
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const t = await resolveTarget(s, new URL(req.url).searchParams.get('uid'))

  // Точный путь: кабинет привязан к контрагенту → полная выписка по нему.
  if (t.contragentId) {
    const opening = await contragentOpening(t.orgId, t.contragentId)
    return NextResponse.json(await contragentLedger(t.orgId, t.contragentId, opening))
  }

  // Фолбэк (старые кабинеты без привязки): долг по совпадению имени.
  const fin = await summary(t.orgId)
  const norm = (x: string) => (x || '').trim().toLowerCase()
  const c = (fin.contragents || []).find((x: any) => norm(x.name) === norm(s.name))
  if (!c) return NextResponse.json({ debt: 0, paid: 0, balance: 0, currency: '₸', transactions: [], configured: false })
  return NextResponse.json({ debt: c.theyOwe, paid: 0, balance: c.theyOwe, currency: '₸', transactions: [], configured: true })
}
