import { NextRequest, NextResponse } from 'next/server'
import { listHistory } from '@/services/order.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const orgId = p.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  return NextResponse.json(await listHistory(orgId, { user: p.get('user') || undefined, from: p.get('from') || undefined, to: p.get('to') || undefined }))
}
