import { NextRequest, NextResponse } from 'next/server'
import { getAttendance, saveAttendance } from '@/services/attendance.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ADMIN = ['admin', 'super_admin', 'bookkeeper']
const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || !ADMIN.includes(s.role)) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  const sp = new URL(req.url).searchParams
  return NextResponse.json(await getAttendance(sp.get('orgId') || s.orgId, sp.get('month') || curMonth()))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || !ADMIN.includes(s.role)) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  return NextResponse.json(await saveAttendance(b?.orgId || s.orgId, b?.month || curMonth(), b?.data || {}))
}
