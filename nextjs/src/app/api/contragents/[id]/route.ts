import { NextRequest, NextResponse } from 'next/server'
import { updateContragentSchema } from '@/dto/catalog.dto'
import { editContragent } from '@/services/catalog.service'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = updateContragentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await editContragent(params.id, parsed.data))
}
