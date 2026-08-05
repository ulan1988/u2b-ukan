import { NextRequest, NextResponse } from 'next/server'
import { createSpecProject } from '@/services/settings.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
  return NextResponse.json(await createSpecProject(s.orgId, b.name, b.items || []), { status: 201 })
}
