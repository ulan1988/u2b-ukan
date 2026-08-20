import { NextRequest, NextResponse } from 'next/server'
import { monthClose } from '@/services/material.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Месячная сверка по листам: ?orgId&from&to (YYYY-MM-DD, [from, to)).
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const orgId = sp.get('orgId') || s.orgId
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  if (!from || !to) return NextResponse.json({ error: 'Укажите период from/to' }, { status: 400 })
  return NextResponse.json(await monthClose(orgId, from, to))
}
