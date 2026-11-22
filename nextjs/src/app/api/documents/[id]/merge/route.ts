import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import { mergeCandidates, mergeInvoices, mergedList, unmergeInvoice } from '@/services/document.service'
import { mergeDocsSchema } from '@/dto/document.dto'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

const STAFF = ['admin', 'super_admin', 'bookkeeper']

// GET — что можно влить в эту накладную (candidates) и что уже влито (merged, для «Разъединить»).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !STAFF.includes(s.role)) return NextResponse.json({ error: 'Нет прав' }, { status: 403 })
  const [candidates, merged] = await Promise.all([mergeCandidates(params.id), mergedList(params.id)])
  return NextResponse.json({ candidates, merged })
}

// POST — объединить выбранные приходные В ЭТУ (строки, склад, связки, оплаты).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !STAFF.includes(s.role)) return NextResponse.json({ error: 'Нет прав' }, { status: 403 })
  const p = mergeDocsSchema.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message || 'Неверные данные' }, { status: 400 })
  const res = await mergeInvoices(params.id, p.data.ids, s as any)
  await pushSignal()
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}

// DELETE ?src=<id> — разъединить: вернуть эту накладную обратно отдельной.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !STAFF.includes(s.role)) return NextResponse.json({ error: 'Нет прав' }, { status: 403 })
  const src = req.nextUrl.searchParams.get('src') || ''
  if (!src) return NextResponse.json({ error: 'Не указана накладная' }, { status: 400 })
  const res = await unmergeInvoice(params.id, src, s as any)
  await pushSignal()
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
