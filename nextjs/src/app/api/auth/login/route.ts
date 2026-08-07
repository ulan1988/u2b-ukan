import { NextRequest, NextResponse } from 'next/server'
import { loginSchema } from '@/dto/auth.dto'
import { login } from '@/services/auth.service'
import { COOKIE } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Введите логин и пароль' }, { status: 400 })

  const r = await login(parsed.data.email, parsed.data.password)
  if (!r) return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 })

  const res = NextResponse.json({ user: r.user })
  res.cookies.set(COOKIE, r.token, {
    httpOnly: true, path: '/', sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
