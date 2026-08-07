// JWT-сессия (jose — работает и в Edge/middleware). bcrypt здесь НЕ импортируем
// (он Node-only, используется только в сервисах на роутах).
import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-change-me-min-32-characters!!')
export const COOKIE = 'u2b_session'

export interface Session { id: string; name: string; role: string; orgId: string; slug?: string }

// Домашний экран по роли (та же логика, что при входе): админ→/admin, порталы→свой slug.
export function homePathFor(s: Session): string {
  switch (s.role) {
    case 'logist': return s.slug ? `/rsp/${s.slug}` : '/login'
    case 'warehouse_manager': return s.slug ? `/warehouse/${s.slug}` : '/login'
    case 'branch': return s.slug ? `/branch/${s.slug}` : '/login'
    case 'client':
    case 'supplier_client': return s.slug ? `/client/${s.slug}` : '/login'
    default: return '/admin'   // admin | super_admin | bookkeeper
  }
}

export async function createToken(s: Session): Promise<string> {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(secret)
}

export async function verifyToken(token: string): Promise<Session | null> {
  try { const { payload } = await jwtVerify(token, secret); return payload as unknown as Session } catch { return null }
}

// Для API-роутов (Node): достаём сессию из cookie запроса.
export async function sessionFromRequest(req: NextRequest): Promise<Session | null> {
  const t = req.cookies.get(COOKIE)?.value
  return t ? verifyToken(t) : null
}

// Для серверных компонентов (страниц). next/headers импортируем динамически,
// чтобы этот модуль оставался Edge-safe (middleware тянет только verifyToken/COOKIE).
export async function getSession(): Promise<Session | null> {
  const { cookies } = await import('next/headers')
  const store = await cookies()
  const t = store.get(COOKIE)?.value
  return t ? verifyToken(t) : null
}
