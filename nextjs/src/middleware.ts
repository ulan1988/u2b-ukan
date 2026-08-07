import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken, COOKIE } from '@/lib/auth'

// Пускаем без сессии: логин и его API + статика PWA (манифест/воркер/иконки).
// Всё остальное — только авторизованным.
const PUBLIC = ['/login', '/register', '/api/auth', '/api/health', '/track', '/api/track', '/manifest.json', '/sw.js', '/icons']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()

  const token = req.cookies.get(COOKIE)?.value
  const session = token ? await verifyToken(token) : null
  if (!session) {
    if (pathname.startsWith('/api')) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const url = req.nextUrl.clone(); url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/).*)'] }
