import { NextRequest, NextResponse } from 'next/server'
import { userBySlug } from '@/services/auth.service'
import { sheetsByColor, materialLog } from '@/services/material.service'

export const dynamic = 'force-dynamic'

// Публичный кабинет листов по слагу производителя: остатки по цветам + журнал (кто вносил).
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const u = await userBySlug(params.slug)
  if (!u) return NextResponse.json({ error: 'Кабинет не найден' }, { status: 404 })
  const [sheets, log] = await Promise.all([sheetsByColor(u.orgId), materialLog(u.orgId)])
  return NextResponse.json({ name: u.name, sheets, log })
}
