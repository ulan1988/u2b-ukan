import { NextRequest, NextResponse } from 'next/server'
import { createContragentSchema } from '@/dto/catalog.dto'
import { addContragent } from '@/services/catalog.service'
import { listContragents } from '@/repositories/refs.repo'
import { listAllContragents } from '@/repositories/catalog.repo'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  if (url.searchParams.get('all')) return NextResponse.json(await listAllContragents())
  const s = await sessionFromRequest(req)
  const viewerOrg = url.searchParams.get('orgId') || s?.orgId || null
  return NextResponse.json(await listContragents(viewerOrg))
}

export async function POST(req: NextRequest) {
  const parsed = createContragentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await addContragent(parsed.data), { status: 201 })
}
