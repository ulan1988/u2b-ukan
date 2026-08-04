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
import ListScreen from '@/components/admin/screens/ListScreen'
import BookkeepingScreen from '@/components/admin/screens/BookkeepingScreen'
import InvoicesScreen from '@/components/admin/screens/InvoicesScreen'
import WarehouseScreen from '@/components/admin/screens/WarehouseScreen'
import NomenclatureScreen from '@/components/admin/screens/NomenclatureScreen'
import SettingsScreen from '@/components/admin/screens/SettingsScreen'

export default function AdminScreenPage() {
  const { screen } = useParams() as { screen: string }
  const a = useAdmin()
  if (!a) return null

  switch (screen) {
    case 'dashboard': return <DashboardScreen orders={a.orders} />
    case 'history': return <HistoryScreen orgId={a.orgId} onOpen={a.openCard} />
    case 'incoming': return <IncomingScreen orders={a.visible} onAction={a.act} onOpen={a.openCard} />
    case 'reception': return <ReceptionScreen orders={a.visible} orgId={a.orgId} onAction={a.act} onReload={a.reload} onOpen={a.openCard} />
    case 'outgoing': return <OutgoingScreen orders={a.visible} onAction={a.act} onReload={a.reload} onOpen={a.openCard} />
    case 'procurement': return <ProcurementScreen orgId={a.orgId} />
    case 'filter': return <FilterScreen orders={a.orders} onAction={a.act} onOpen={a.openCard} />
    case 'accounting': return <ListScreen title="К учёту" screen="accounting" orders={a.visible} onAction={a.act} onOpen={a.openCard} empty="Нет карточек к учёту"
      actions={[{ action: 'postAcc', label: 'В бухгалтерию', variant: 'primary' }, { action: 'returnToIncoming', label: 'Вернуть' }]} />
    case 'bookkeeping': return <BookkeepingScreen orders={a.visible} orgId={a.orgId} onAction={a.act} onOpen={a.openCard} />
    case 'invoice_in': return <InvoicesScreen kind="in" orders={a.orders} orgId={a.orgId} onReload={a.reload} onOpen={a.openCard} />
    case 'invoice_out': return <InvoicesScreen kind="out" orders={a.orders} orgId={a.orgId} onReload={a.reload} onOpen={a.openCard} />
    case 'archive': return <ListScreen title="Архив" screen="archive" orders={a.visible} onAction={a.act} onOpen={a.openCard} empty="Архив пуст"
      actions={[{ action: 'unarchive', label: 'Из архива' }]} />
    case 'warehouse': return <WarehouseScreen orgId={a.orgId} />
    case 'nomenclature': return <NomenclatureScreen />
    case 'settings': return <SettingsScreen orgId={a.orgId} />
    default: return <div style={{ color: '#5f5952', padding: 20 }}>Раздел не найден</div>
  }
}
