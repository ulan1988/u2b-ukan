import { NextRequest, NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/auth'
import * as svc from '@/services/finmoney.service'
import { pushSignal } from '@/lib/pusherServer'

export const dynamic = 'force-dynamic'

function todayStr() { return new Date().toISOString().slice(0, 10) }

export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const date = new URL(req.url).searchParams.get('date') || todayStr()
  return NextResponse.json(await svc.financeDay(s.orgId, date))
}

export async function POST(req: NextRequest) {
  const s = await sessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const org = s.orgId
  let res: any = { ok: false }
  switch (b.action) {
    case 'save': res = await svc.saveFinRow(org, b.row); break
    case 'delete': res = await svc.deleteFinRow(b.id); break
    case 'reorder': res = await svc.reorderDay(b.ids || []); break
    case 'post': res = await svc.postFinDay(org, b.date, s.id); break
    case 'favSave': res = await svc.saveFinFavorites(org, b.favs || []); break
    case 'favApply': res = await svc.applyFavorites(org, b.date); break
    case 'docSearch': res = await svc.searchDocs(org, b.q || ''); break
    case 'openInvoices': res = await svc.openInvoices(org, b.contragentId, b.dir || 'out'); break
    case 'journal': res = await svc.financeJournal(org, b.from || '2000-01-01', b.to || '2100-01-01'); break
    case 'editDoc': res = await svc.editDoc(org, b.id, b.row, s.id); break
    case 'deleteDoc': res = await svc.deleteDocFull(b.id); break
    case 'favList': res = await svc.listFinFavorites(org); break
    case 'expList': res = await svc.listExpenseArticles(org); break
    case 'expSave': res = await svc.saveExpenseArticles(org, b.items || []); break
    default: return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  }
  await pushSignal()
  return NextResponse.json(res)
}
