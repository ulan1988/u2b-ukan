import { NextRequest, NextResponse } from 'next/server'
import { autoEncashSellers } from '@/services/cashier.service'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

// Авто-инкассация магазинов в 21:00 (Алматы) = 16:00 UTC. Вызывается Vercel Cron.
// Защита: если задан CRON_SECRET — Vercel сам шлёт "Authorization: Bearer <CRON_SECRET>".
// Ручной тест: GET с тем же заголовком. GET и POST — одинаково (на всякий случай).
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'forbidden' }, { status: 401 })
  const res = await autoEncashSellers()
  await pushSignal()
  return NextResponse.json(res)
}

export const GET = run
export const POST = run
