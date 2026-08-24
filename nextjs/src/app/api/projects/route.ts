import { NextRequest, NextResponse } from 'next/server'
import { createProject, listProjectsByClient } from '@/services/settings.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Проекты контрагента (любая орг) — для тегирования карточки клиентским проектом.
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const clientId = new URL(req.url).searchParams.get('clientId') || undefined
  return NextResponse.json(await listProjectsByClient(clientId))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
  return NextResponse.json(await createProject(s.orgId, b.name, b.clientId), { status: 201 })
}
