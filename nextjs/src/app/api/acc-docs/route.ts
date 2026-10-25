import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import * as svc from '@/services/accDocs.service'
import type { DocType } from '@/dto/accDocs.dto'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const ROLES = ['admin', 'super_admin', 'bookkeeper']
async function auth(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || !ROLES.includes(s.role)) return { err: NextResponse.json({ error: 'Нет доступа' }, { status: 403 }) }
  const orgId = new URL(req.url).searchParams.get('orgId') || s.orgId
  return { s, orgId }
}

// GET /api/acc-docs?orgId=               → список документов орг
// GET /api/acc-docs?orgId=&next=invoice  → следующий номер
export async function GET(req: NextRequest) {
  const a: any = await auth(req); if (a.err) return a.err
  const next = new URL(req.url).searchParams.get('next')
  if (next) return NextResponse.json({ number: await svc.nextNumber(a.orgId, next as DocType) })
  return NextResponse.json(await svc.listDocs(a.orgId))
}

export async function POST(req: NextRequest) {
  const a: any = await auth(req); if (a.err) return a.err
  try {
    const d = await svc.createDoc(a.orgId, await req.json(), { id: a.s.id, name: a.s.name })
    return NextResponse.json(d, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.issues?.[0]?.message || e?.message || 'Не удалось создать' }, { status: 400 })
  }
}
