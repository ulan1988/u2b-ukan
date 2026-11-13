import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import { purgeDocument } from '@/services/document.service'

export const dynamic = 'force-dynamic'

// Удалить ошибочный документ НАСОВСЕМ: движения склада, FIFO-связи, оплаты и зеркала
// филиалов уходят вместе с ним, карточка-заявка отвязывается. Только админ/бухгалтер.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin', 'bookkeeper'].includes(s.role)) {
    return NextResponse.json({ error: 'Нет прав' }, { status: 403 })
  }
  const res = await purgeDocument(params.id, s)
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
