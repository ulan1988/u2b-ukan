import { NextRequest, NextResponse } from 'next/server'
import { summary } from '@/services/finance.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  return NextResponse.json(await summary(orgId))
}
