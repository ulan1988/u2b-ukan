import { NextRequest, NextResponse } from 'next/server'
import { createSpecProject } from '@/services/settings.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
  return NextResponse.json(await createSpecProject(s.orgId, b.name, b.clientId || null, b.items || []), { status: 201 })
}

// Список проектов с остатками (кол-во / вынесено / остаток).
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const orgId = new URL(req.url).searchParams.get('orgId') || s.orgId
  const { specProjectsWithRemaining } = await import('@/services/settings.service')
  return NextResponse.json(await specProjectsWithRemaining(orgId))
}
