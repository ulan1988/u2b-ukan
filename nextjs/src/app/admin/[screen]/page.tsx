'use client'
import { useParams } from 'next/navigation'
import { useAdmin } from '@/components/admin/AdminChrome'
import DashboardScreen from '@/components/admin/screens/DashboardScreen'
import HistoryScreen from '@/components/admin/screens/HistoryScreen'
import IncomingScreen from '@/components/admin/screens/IncomingScreen'
import ReceptionScreen from '@/components/admin/screens/ReceptionScreen'
import OutgoingScreen from '@/components/admin/screens/OutgoingScreen'
import ProcurementScreen from '@/components/admin/screens/ProcurementScreen'
import FilterScreen from '@/components/admin/screens/FilterScreen'
import ArchiveScreen from '@/components/admin/screens/ArchiveScreen'
import UkanbanScreen from '@/components/admin/screens/UkanbanScreen'
import BookkeepingScreen from '@/components/admin/screens/BookkeepingScreen'
import FinanceMoneyScreen from '@/components/admin/screens/FinanceMoneyScreen'
import CashDayScreen from '@/components/admin/screens/CashDayScreen'
import InvoicesScreen from '@/components/admin/screens/InvoicesScreen'
import WarehouseScreen from '@/components/admin/screens/WarehouseScreen'
import ProductionScreen from '@/components/admin/screens/ProductionScreen'
import NomenclatureScreen from '@/components/admin/screens/NomenclatureScreen'
import ProjectsScreen from '@/components/admin/screens/ProjectsScreen'
import MaterialScreen from '@/components/admin/screens/MaterialScreen'
import SettingsScreen from '@/components/admin/screens/SettingsScreen'

export default function AdminScreenPage() {
  const { screen } = useParams() as { screen: string }
  const a = useAdmin()
  if (!a) return null

  switch (screen) {
    case 'dashboard': return <DashboardScreen orgId={a.orgId} />
    case 'history': return <HistoryScreen orgId={a.orgId} onOpen={a.openCard} />
    case 'incoming': return <IncomingScreen orders={a.visible} onAction={a.act} onOpen={a.openCard} />
    case 'reception': return <ReceptionScreen orders={a.visible} orgId={a.orgId} onAction={a.act} onReload={a.reload} onOpen={a.openCard} />
    case 'outgoing': return <OutgoingScreen orders={a.visible} onAction={a.act} onReload={a.reload} onOpen={a.openCard} />
    case 'procurement': return <ProcurementScreen orgId={a.orgId} />
    case 'filter': return <FilterScreen orders={a.orders} orgId={a.orgId} onOpen={a.openCard} />
    case 'accounting': return <UkanbanScreen orders={a.orders} orgId={a.orgId} onAction={a.act} onOpen={a.openCard} />
    case 'bookkeeping': return <BookkeepingScreen orders={a.visible} orgId={a.orgId} onAction={a.act} onReload={a.reload} onOpen={a.openCard} />
    case 'money': return <FinanceMoneyScreen orgId={a.orgId} />
    case 'cashday': return <CashDayScreen orgId={a.orgId} />
    case 'invoice_in': return <InvoicesScreen kind="in" orders={a.orders} orgId={a.orgId} onReload={a.reload} onOpen={a.openCard} />
    case 'invoice_out': return <InvoicesScreen kind="out" orders={a.orders} orgId={a.orgId} onReload={a.reload} onOpen={a.openCard} />
    case 'archive': return <ArchiveScreen orders={a.orders} orgId={a.orgId} onAction={a.act} onOpen={a.openCard} />
    case 'warehouse': return <WarehouseScreen orgId={a.orgId} onOpenCard={id => a.openCard({ id })} />
    case 'production': return <ProductionScreen orgId={a.orgId} />
    case 'nomenclature': return <NomenclatureScreen />
    case 'projects': return <ProjectsScreen orgId={a.orgId} onOpen={a.openCard} onReload={a.reload} />
    case 'material': return <MaterialScreen orgId={a.orgId} />
    case 'settings': return <SettingsScreen orgId={a.orgId} />
    default: return <div style={{ color: '#5f5952', padding: 20 }}>Раздел не найден</div>
  }
}
