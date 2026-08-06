import { NextRequest, NextResponse } from 'next/server'
import { setReportStatus } from '@/services/report.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Бухгалтер меняет статус отчёта: processing → done → archive.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin', 'bookkeeper'].includes(s.role)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  const { status } = await req.json().catch(() => ({}))
  if (!status) return NextResponse.json({ error: 'Статус не задан' }, { status: 400 })
  const [r] = await setReportStatus(params.id, status)
  await pushSignal()
  return NextResponse.json(r)
}
