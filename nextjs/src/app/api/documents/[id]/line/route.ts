import { NextRequest, NextResponse } from 'next/server'
import { deleteDocumentLine } from '@/services/document.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// DELETE ?lineId=… — убрать ошибочную позицию из проведённой накладной (склад/итог пересчитываются).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin', 'bookkeeper'].includes(s.role)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  const lineId = new URL(req.url).searchParams.get('lineId')
  if (!lineId) return NextResponse.json({ error: 'lineId обязателен' }, { status: 400 })
  const res: any = await deleteDocumentLine(params.id, lineId, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
