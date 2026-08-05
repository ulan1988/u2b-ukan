import { NextRequest, NextResponse } from 'next/server'
import { markRead } from '@/services/notification.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  await markRead(params.id, s.id)
  return NextResponse.json({ ok: true })
}
