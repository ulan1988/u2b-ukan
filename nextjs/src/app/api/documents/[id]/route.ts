import { NextRequest, NextResponse } from 'next/server'
import { getDocument, updateDocument } from '@/services/document.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const doc = await getDocument(params.id)
  if (!doc) return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
  return NextResponse.json(doc)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin', 'bookkeeper'].includes(s.role)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const res = await updateDocument(params.id, b || {})
  await pushSignal()
  return NextResponse.json(res)
}
