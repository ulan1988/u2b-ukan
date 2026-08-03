import { NextResponse } from 'next/server'
import * as refs from '@/repositories/refs.repo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [organizations, suppliers, clients, contragents, warehouses, products, cashAccounts] = await Promise.all([
    refs.listOrganizations(), refs.listSuppliers(), refs.listClients(), refs.listContragents(),
    refs.listWarehouses(), refs.listProducts(), refs.listCashAccounts(),
  ])
  return NextResponse.json({ organizations, suppliers, clients, contragents, warehouses, products, cashAccounts })
}
