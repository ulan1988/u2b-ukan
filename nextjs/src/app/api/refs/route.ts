import { NextResponse } from 'next/server'
import * as refs from '@/repositories/refs.repo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [organizations, suppliers, clients, warehouses, products] = await Promise.all([
    refs.listOrganizations(), refs.listSuppliers(), refs.listClients(), refs.listWarehouses(), refs.listProducts(),
  ])
  return NextResponse.json({ organizations, suppliers, clients, warehouses, products })
}
