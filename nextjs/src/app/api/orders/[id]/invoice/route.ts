import { NextRequest, NextResponse } from 'next/server'
import { postOrderInvoice } from '@/services/invoice.service'
import { sessionFromRequest } from '@/lib/auth'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  const r = await postOrderInvoice(params.id, s)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  await pushSignal()
  return NextResponse.json(r)
}
