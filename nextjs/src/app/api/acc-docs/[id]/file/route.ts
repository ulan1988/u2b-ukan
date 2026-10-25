import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import * as svc from '@/services/accDocs.service'
import { buildInvoiceExcel, buildInvoiceWord } from '@/lib/accDocs/invoice'
import { buildNakladnayaExcel, buildNakladnayaWord, buildAktExcel, buildAktWord, buildKpExcel, buildKpWord } from '@/lib/accDocs/forms'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

type Gen = (doc: never, org: never) => Promise<Buffer>
const GENERATORS: Record<string, { excel: Gen; word: Gen }> = {
  invoice: { excel: buildInvoiceExcel as Gen, word: buildInvoiceWord as Gen },
  nakladnaya: { excel: buildNakladnayaExcel as Gen, word: buildNakladnayaWord as Gen },
  akt: { excel: buildAktExcel as Gen, word: buildAktWord as Gen },
  kp: { excel: buildKpExcel as Gen, word: buildKpWord as Gen },
}

// GET /api/acc-docs/[id]/file?fmt=excel|word → готовый файл
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionFromRequest(req)
  if (!s || !['admin', 'super_admin', 'bookkeeper'].includes(s.role)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  const r = await svc.docWithOrg(params.id)
  if (!r) return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
  const gen = GENERATORS[r.doc.type]
  if (!gen) return NextResponse.json({ error: 'Неизвестный тип документа' }, { status: 400 })
  const word = new URL(req.url).searchParams.get('fmt') === 'word'
  const buffer = word ? await gen.word(r.doc as never, r.org as never) : await gen.excel(r.doc as never, r.org as never)
  const ext = word ? 'docx' : 'xlsx'
  const ctype = word ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const fname = `${r.doc.docNo || 'Документ'}.${ext}`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: { 'Content-Type': ctype, 'Content-Disposition': `attachment; filename="document.${ext}"; filename*=UTF-8''${encodeURIComponent(fname)}` },
  })
}
