import { NextRequest, NextResponse } from 'next/server'
import { getDocument } from '@/services/document.service'
import { cardRoute } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Маршрут («Связки») накладной: документ → карточка-основание (sourceOrderId) → путь-граф.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const doc = await getDocument(params.id)
  if (!doc) return NextResponse.json({ error: 'Накладная не найдена' }, { status: 404 })
  const cardId = (doc.doc as any).sourceOrderId
  const route = cardId ? await cardRoute(cardId) : null
  if (route) return NextResponse.json(route)
  // Нет карточки-основания — минимальный граф из самой накладной.
  return NextResponse.json({
    document: { no: doc.doc.number, kind: doc.doc.type === 'purchase' ? 'Приходная' : 'Расходная', title: doc.contragent?.name || '', sum: Number(doc.doc.total), contragent: doc.contragent?.name || '—', status: doc.doc.status },
    nodes: [{ id: 0, level: 0, lane: 0, label: 'Накладная', key: 'invoice', state: 'current', at: doc.doc.createdAt, user: null, detail: 'Без карточки-основания' }],
    edges: [],
  })
}
