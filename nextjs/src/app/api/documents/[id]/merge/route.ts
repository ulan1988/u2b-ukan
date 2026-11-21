import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import { mergeCandidates, mergeInvoices } from '@/services/document.service'
import { mergeDocsSchema } from '@/dto/document.dto'

export const dynamic = 'force-dynamic'

const STAFF = ['admin', 'super_admin', 'bookkeeper']

// GET — приходные того же поставщика, которые можно слить в эту.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !STAFF.includes(s.role)) return NextResponse.json({ error: 'Нет прав' }, { status: 403 })
  return NextResponse.json(await mergeCandidates(params.id))
}

// POST — объединить выбранные приходные В ЭТУ (строки, склад, связки, оплаты).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !STAFF.includes(s.role)) return NextResponse.json({ error: 'Нет прав' }, { status: 403 })
  const p = mergeDocsSchema.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message || 'Неверные данные' }, { status: 400 })
  const res = await mergeInvoices(params.id, p.data.ids, s as any)
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
