import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import * as subRepo from '@/repositories/pushSub.repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Сохранить Web Push подписку текущего пользователя.
export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sub = await req.json()
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'Некорректная подписка' }, { status: 400 })
  await subRepo.upsert({ userId: s.id, endpoint, p256dh, auth })
  return NextResponse.json({ ok: true })
}

// Отписка (при выключении уведомлений).
export async function DELETE(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const { endpoint } = await req.json().catch(() => ({}))
  if (endpoint) await subRepo.removeByEndpoint(endpoint)
  return NextResponse.json({ ok: true })
}
