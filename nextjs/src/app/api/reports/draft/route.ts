import { NextRequest, NextResponse } from 'next/server'
import { getDraft, addRow, deleteRow } from '@/services/report.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const date = new URL(req.url).searchParams.get('date') || undefined
  return NextResponse.json(await getDraft(s, date))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (b?.op === 'delete' && b.id) { await deleteRow(b.id); return NextResponse.json({ ok: true }) }
  const row = await addRow(s, b?.row || {}, b?.date)
  return NextResponse.json(row, { status: 201 })
}
