import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({ user: s })
}
