import { NextRequest, NextResponse } from 'next/server'
import { cashAccountPatchSchema } from '@/dto/catalog.dto'
import { setAccountOpening } from '@/services/catalog.service'

export const dynamic = 'force-dynamic'

// Начальный остаток счёта (перенос из 1С): сумма + дата отсечения.
// Баланс = начальный остаток + движения С ЭТОЙ ДАТЫ (более ранние уже внутри остатка).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = cashAccountPatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.flatten() }, { status: 400 })
  return NextResponse.json(await setAccountOpening(params.id, parsed.data))
}
