import { NextRequest, NextResponse } from 'next/server'
import { createContragentSchema } from '@/dto/catalog.dto'
import { addContragent } from '@/services/catalog.service'
import { listContragents } from '@/repositories/refs.repo'
import { listAllContragents } from '@/repositories/catalog.repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const all = new URL(req.url).searchParams.get('all')
  return NextResponse.json(all ? await listAllContragents() : await listContragents())
}

export async function POST(req: NextRequest) {
  const parsed = createContragentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await addContragent(parsed.data), { status: 201 })
}
