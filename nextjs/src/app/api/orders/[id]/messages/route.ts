import { NextRequest, NextResponse } from 'next/server'
import { listMessages, sendMessage } from '@/services/message.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json(await listMessages(params.id))
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => null)
  const r = await sendMessage(params.id, b?.text || '', s)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r.message, { status: 201 })
}
