import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import * as svc from '@/services/accDocs.service'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

async function auth(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin', 'bookkeeper'].includes(s.role)) return null
  return new URL(req.url).searchParams.get('orgId') || s.orgId
}
export async function GET(req: NextRequest) {
  const orgId = await auth(req); if (!orgId) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  return NextResponse.json(await svc.getOrgSettings(orgId))
}
export async function PATCH(req: NextRequest) {
  const orgId = await auth(req); if (!orgId) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  return NextResponse.json(await svc.updateOrgSettings(orgId, await req.json().catch(() => ({}))))
}
