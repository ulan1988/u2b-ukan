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
    // Ошибка Drizzle/neon оборачивает причину в e.cause (код 23505 = unique violation, constraint — имя индекса).
    const cause = e?.cause || e
    const code = String(cause?.code || '')
    const constraint = String(cause?.constraint || '')
    const text = `${e?.message || ''} ${cause?.message || ''} ${constraint}`.toLowerCase()
    if (code === '23505' || text.includes('duplicate') || text.includes('unique')) {
      const isSlug = constraint.includes('slug') || text.includes('slug')
      return NextResponse.json({ error: isSlug ? 'Кабинет с таким именем уже есть — измените имя контрагента или логин' : 'Такой логин уже занят — выберите другой' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Ошибка создания: ' + String(e?.message || cause?.message || '').slice(0, 120) }, { status: 500 })
  }
}
