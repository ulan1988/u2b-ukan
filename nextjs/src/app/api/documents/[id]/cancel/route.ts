import { NextResponse } from 'next/server'
import { cancelDocument } from '@/services/document.service'

export const dynamic = 'force-dynamic'

// Сторно документа (приход/расход): POST /api/documents/<id>/cancel
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await cancelDocument(params.id)
  return NextResponse.json({ ok: true })
}
