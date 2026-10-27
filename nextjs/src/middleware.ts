import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken, COOKIE } from '@/lib/auth'

// Пускаем без сессии: логин и его API + статика PWA (манифест/воркер/иконки).
// Всё остальное — только авторизованным.
const PUBLIC = ['/login', '/register', '/api/auth', '/api/health', '/track', '/api/track', '/listy', '/api/listy', '/manifest.json', '/order.webmanifest', '/sw.js', '/icons']

// ── Доступ по ролям (единое место, чтобы не править 30 роутов по одному) ────────────────────────────
// Раньше любой вошедший (в т.ч. самозарегистрированный «клиент») мог читать и править деньги, накладные,
// настройки и справочники любой организации по подставленному orgId. Теперь эти разделы — только для
// сотрудников (staff). Кабинеты мастера/логиста/продавца/клиента ходят в свои роуты (branch/logist/client…),
// их эти правила не касаются.
const STAFF = ['super_admin', 'admin', 'bookkeeper']
const WAREHOUSE = [...STAFF, 'warehouse_manager']
const RULES: Array<{ re: RegExp; roles: string[] }> = [
  { re: /^\/api\/seed$/, roles: ['super_admin'] },                                // служебный: создаёт админа на пустой базе
  { re: /^\/api\/(documents|payments|sales|returns|production|procurement|profit|settings|cash-accounts|history|products)(\/|$)/, roles: STAFF },
  { re: /^\/api\/finance$/, roles: STAFF },
  { re: /^\/api\/users$/, roles: STAFF },                                         // список логинов/ролей всех организаций
  { re: /^\/api\/contragents\/[^/]+$/, roles: STAFF },
  { re: /^\/api\/orders\/[^/]+\/prod$/, roles: STAFF },
  { re: /^\/api\/stock\/(movements|product-moves|income)(\/|$)/, roles: STAFF },
  { re: /^\/api\/(stock|warehouses)$/, roles: WAREHOUSE },
]

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
  // Роль: раздел только для сотрудников → остальным 403 (+ складской менеджер видит только свою организацию)
  if (isApi) {
    const rule = RULES.find(r => r.re.test(pathname))
    // Каталог: GET /api/products (БЕЗ ?all, т.е. без себестоимости) нужен кабинетам (StoreCatalog) —
    // пускаем любого авторизованного. Запись (POST/PATCH/…) и ?all (себестоимость) — только staff.
    const catalogRead = pathname === '/api/products' && req.method === 'GET' && !req.nextUrl.searchParams.get('all')
    if (rule && !catalogRead && !rule.roles.includes(session.role)) return noStore(NextResponse.json({ error: 'Нет доступа' }, { status: 403 }))
    if (rule && session.role === 'warehouse_manager') {
      const q = req.nextUrl.searchParams.get('orgId')
      if (q && q !== session.orgId) return noStore(NextResponse.json({ error: 'Нет доступа' }, { status: 403 }))
    }
  }
  return noStore(NextResponse.next())
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|order.webmanifest|sw.js|icons/).*)'] }
