import { NextRequest, NextResponse } from 'next/server'
import { threads } from '@/services/message.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/chat/threads — карточки организации с сообщениями (сводка для чат-виджета).
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const orgId = new URL(req.url).searchParams.get('orgId') || s.orgId
  return NextResponse.json(await threads(orgId))
}
