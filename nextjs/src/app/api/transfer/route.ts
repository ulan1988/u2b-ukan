import { NextRequest, NextResponse } from 'next/server'
import { createTransferSchema } from '@/dto/transfer.dto'
import { createTransfer, listTransfers } from '@/services/document.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Список перемещений организации.
export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId обязателен' }, { status: 400 })
  return NextResponse.json(await listTransfers(orgId))
}

// Создать перемещение (головной → филиал и т.п.). Списывает со склада-источника, приходует на получателя.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const parsed = createTransferSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте склады и позиции' }, { status: 400 })
  return NextResponse.json(await createTransfer(parsed.data))
}
