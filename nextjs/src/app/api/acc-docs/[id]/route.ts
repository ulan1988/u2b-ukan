import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import * as svc from '@/services/accDocs.service'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin', 'bookkeeper'].includes(s.role)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  await svc.removeDoc(params.id)
  return NextResponse.json({ ok: true })
}
