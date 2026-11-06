import { NextRequest, NextResponse } from 'next/server'
import { sendToHq } from '@/services/handover.service'
import { sendToHqSchema } from '@/dto/handover.dto'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Кабинет мастера: «Отправить к Адал Строй 2» — цепочка накладных без логиста.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = sendToHqSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте дату' }, { status: 400 })
  const res: any = await sendToHq(params.id, s, parsed.data.date)
  if (res?.ok === false) return NextResponse.json(res, { status: 400 })
  await pushSignal()
  return NextResponse.json(res)
}
