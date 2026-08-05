import { NextRequest, NextResponse } from 'next/server'
import { listForUser } from '@/services/notification.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  return NextResponse.json(await listForUser(s.id))
}
