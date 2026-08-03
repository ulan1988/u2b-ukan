import { NextResponse } from 'next/server'
import * as refs from '@/repositories/refs.repo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [organizations, suppliers, warehouses, products] = await Promise.all([
    refs.listOrganizations(), refs.listSuppliers(), refs.listWarehouses(), refs.listProducts(),
  ])
  return NextResponse.json({ organizations, suppliers, warehouses, products })
}
