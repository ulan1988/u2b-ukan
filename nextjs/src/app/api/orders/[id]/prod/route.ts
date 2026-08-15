import { NextRequest, NextResponse } from 'next/server'
import { setProdStage } from '@/services/order.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Этап производства по позиции: { posId, stage: 'cut' | 'bent' }.
// cut = распилено (на листогиб), bent = согнуто (готово). Статус карточки пересчитывается.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.posId || (b.stage !== 'cut' && b.stage !== 'bent'))
    return NextResponse.json({ error: 'posId и stage (cut|bent) обязательны' }, { status: 400 })
  const res: any = await setProdStage(params.id, b.posId, b.stage, s)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
