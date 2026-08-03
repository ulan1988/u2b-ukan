import { NextRequest, NextResponse } from 'next/server'
import { createUserSchema } from '@/dto/auth.dto'
import { createUser, listUsers } from '@/services/auth.service'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await listUsers())
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s || s.role !== 'admin') return NextResponse.json({ error: 'Только администратор' }, { status: 403 })

  const parsed = createUserSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте поля', issues: parsed.error.issues }, { status: 400 })
  try {
    return NextResponse.json(await createUser(parsed.data))
  } catch (e: any) {
    const msg = String(e?.message || '')
    if (msg.includes('duplicate') || msg.includes('unique')) return NextResponse.json({ error: 'Такой email уже есть' }, { status: 409 })
    return NextResponse.json({ error: 'Ошибка создания' }, { status: 500 })
  }
}
