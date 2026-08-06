import { NextRequest, NextResponse } from 'next/server'
import { closeShift, bookReports } from '@/services/report.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Все отчёты (кроме черновиков) для бухгалтерии: вкладки «Отчёты логистов» и «Смены».
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const orgId = new URL(req.url).searchParams.get('orgId') || s.orgId
  return NextResponse.json(await bookReports(orgId))
}

// Логист закрывает смену.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const res = await closeShift(s, b?.date)
  await pushSignal()
  return NextResponse.json(res)
}
