import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken, COOKIE } from '@/lib/auth'

// Пускаем без сессии: логин и его API + статика PWA (манифест/воркер/иконки).
// Всё остальное — только авторизованным.
const PUBLIC = ['/login', '/register', '/api/auth', '/api/health', '/track', '/api/track', '/listy', '/api/listy', '/manifest.json', '/order.webmanifest', '/sw.js', '/icons']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith('/api')
  // Любой ответ API — без кэша браузера/прокси. Иначе список (кабинеты, карточки,
  // накладные) может застыть на старом ответе, хотя в базе данные уже изменились.
  const noStore = (res: NextResponse) => { if (isApi) res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate'); return res }

  if (PUBLIC.some(p => pathname.startsWith(p))) return noStore(NextResponse.next())

  const token = req.cookies.get(COOKIE)?.value
  const session = token ? await verifyToken(token) : null
  if (!session) {
    if (isApi) return noStore(NextResponse.json({ error: 'Не авторизован' }, { status: 401 }))
    const url = req.nextUrl.clone(); url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  return noStore(NextResponse.next())
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|order.webmanifest|sw.js|icons/).*)'] }
