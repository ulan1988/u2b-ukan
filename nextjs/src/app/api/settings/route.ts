import { NextRequest, NextResponse } from 'next/server'
import { settingsBundle } from '@/services/settings.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  return NextResponse.json(await settingsBundle(orgId))
}
