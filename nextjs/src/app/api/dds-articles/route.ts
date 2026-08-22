import { NextRequest, NextResponse } from 'next/server'
import { listDdsArticles, saveDdsArticle, archiveDdsArticle } from '@/services/ddsArticle.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'
const ADMIN = ['admin', 'super_admin', 'bookkeeper']

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const orgId = new URL(req.url).searchParams.get('orgId') || s.orgId
  return NextResponse.json(await listDdsArticles(orgId))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || !ADMIN.includes(s.role)) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const res: any = await saveDdsArticle(b?.orgId || s.orgId, b)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  return NextResponse.json(res, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || !ADMIN.includes(s.role)) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
  return NextResponse.json(await archiveDdsArticle(id))
}
