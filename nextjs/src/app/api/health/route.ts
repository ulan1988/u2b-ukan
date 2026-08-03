import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Проверка живости деплоя: GET /api/health → { ok: true }.
export async function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() })
}
