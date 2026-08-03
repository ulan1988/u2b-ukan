import { NextResponse } from 'next/server'
import { seedIfEmpty } from '@/services/seed.service'

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(await seedIfEmpty())
}
