import { NextRequest, NextResponse } from 'next/server'
import { actionSchema } from '@/dto/order.dto'
import { dispatchAction } from '@/services/orderWorkflow'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  const parsed = actionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Действие не задано' }, { status: 400 })

  const r = await dispatchAction(params.id, parsed.data.action, s, parsed.data.payload)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
