import { NextRequest, NextResponse } from 'next/server'
import * as refs from '@/repositories/refs.repo'
import { sessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Видящая орг для контрагентов: ?orgId (выбранная в шапке) иначе орг сессии.
  const s = await sessionFromRequest(req)
  const viewerOrg = new URL(req.url).searchParams.get('orgId') || s?.orgId || null
  const [organizations, suppliers, clients, contragents, warehouses, products, cashAccounts] = await Promise.all([
    refs.listOrganizations(), refs.listSuppliers(), refs.listClients(), refs.listContragents(viewerOrg),
    refs.listWarehouses(), refs.listProducts(), refs.listCashAccounts(),
  ])
  return NextResponse.json({ organizations, suppliers, clients, contragents, warehouses, products, cashAccounts })
}
