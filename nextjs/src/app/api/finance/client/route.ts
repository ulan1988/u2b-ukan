import { NextRequest, NextResponse } from 'next/server'
import { summary, contragentLedger } from '@/services/finance.service'
import { contragentOpening } from '@/repositories/finance.repo'
import { resolveTarget } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { cashAccounts } from '@/db/schema'
import { and, eq, asc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

// Счета, доступные клиенту для оплаты из кабинета (флаг client_pay), по его орг.
async function payAccountsFor(orgId: string) {
  const rows = await db.select({ id: cashAccounts.id, name: cashAccounts.name })
    .from(cashAccounts)
    .where(and(eq(cashAccounts.orgId, orgId), eq(cashAccounts.clientPay, true), eq(cashAccounts.archived, false)))
    .orderBy(asc(cashAccounts.sortOrder), asc(cashAccounts.name))
  return rows
}

// Баланс текущего контрагента: выписка (долг, ВОЗВРАТЫ отдельной строкой, оплаты).
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const t = await resolveTarget(s, new URL(req.url).searchParams.get('uid'))

  // Точный путь: кабинет привязан к контрагенту → полная выписка по нему.
  if (t.contragentId) {
    const opening = await contragentOpening(t.orgId, t.contragentId)
    const [ledger, payAccounts] = await Promise.all([
      contragentLedger(t.orgId, t.contragentId, opening),
      payAccountsFor(t.orgId),
    ])
    return NextResponse.json({ ...ledger, payAccounts })
  }

  // Фолбэк (старые кабинеты без привязки): долг по совпадению имени.
  const fin = await summary(t.orgId)
  const norm = (x: string) => (x || '').trim().toLowerCase()
  const c = (fin.contragents || []).find((x: any) => norm(x.name) === norm(s.name))
  if (!c) return NextResponse.json({ debt: 0, paid: 0, balance: 0, currency: '₸', transactions: [], configured: false })
  return NextResponse.json({ debt: c.theyOwe, paid: 0, balance: c.theyOwe, currency: '₸', transactions: [], configured: true })
}
