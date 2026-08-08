import { NextRequest, NextResponse } from 'next/server'
import { settingsBundle, setDefaultLogist, setDefaultContragent } from '@/services/settings.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  return NextResponse.json(await settingsBundle(orgId))
}

// PATCH — общие настройки организации (пока: логист по умолчанию).
export async function PATCH(req: NextRequest) {
  const b = await req.json()
  if (!b?.orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  if (b.defaultLogistId !== undefined) await setDefaultLogist(b.orgId, b.defaultLogistId || null)
  if (b.defaultContragentId !== undefined) await setDefaultContragent(b.orgId, b.defaultContragentId || null)
  return NextResponse.json({ ok: true })
}
