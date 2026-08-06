import { NextRequest, NextResponse } from 'next/server'
import { getDraft, addRow, deleteRow, updateRow, pastDrafts } from '@/services/report.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const p = new URL(req.url).searchParams
  if (p.get('scope') === 'past') return NextResponse.json(await pastDrafts(s))
  return NextResponse.json(await getDraft(s, p.get('date') || undefined))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (b?.op === 'delete' && b.id) { await deleteRow(b.id); return NextResponse.json({ ok: true }) }
  if (b?.op === 'update' && b.id) { const r = await updateRow(b.id, b.row || {}); return NextResponse.json(r) }
  const row = await addRow(s, b?.row || {}, b?.date)
  return NextResponse.json(row, { status: 201 })
}
