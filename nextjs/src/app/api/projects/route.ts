import { NextRequest, NextResponse } from 'next/server'
import { listProjectsByClient } from '@/services/settings.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Проекты контрагента (spec_projects, любая орг) — для тегирования карточки клиентским проектом.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const clientId = new URL(req.url).searchParams.get('clientId') || undefined
  return NextResponse.json(await listProjectsByClient(clientId))
}
