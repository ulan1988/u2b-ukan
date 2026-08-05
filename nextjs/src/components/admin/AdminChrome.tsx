'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar, { type NavItem } from '@/components/admin/Sidebar'
import Topbar from '@/components/admin/Topbar'
import CardModal from '@/components/admin/CardModal'
import { COLORS } from '@/lib/colors'
import { fetchOrders, orderAction, logout } from '@/lib/adminApi'
import { useLiveData } from '@/lib/live'

export const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Дашборд', icon: '📊' },
  { key: 'history', label: 'История', icon: '🕓' },
  { key: 'incoming', label: 'Входящие', icon: '📥' },
  { key: 'reception', label: 'Приёмка', icon: '🔄' },
  { key: 'outgoing', label: 'Исходящие', icon: '📤' },
  { key: 'procurement', label: 'Закуп-отчёт', icon: '🛒' },
  { key: 'filter', label: 'Фильтр', icon: '🔍' },
  { key: 'accounting', label: 'К учёту', icon: '📋' },
  { key: 'bookkeeping', label: 'Бухгалтерия', icon: '📒' },
  { key: 'invoice_in', label: 'Приходные накладные', icon: '🧾' },
  { key: 'invoice_out', label: 'Расходные накладные', icon: '📄' },
  { key: 'archive', label: 'Архив', icon: '🗂' },
  { key: 'warehouse', label: 'Склад', icon: '🏭' },
  { key: 'nomenclature', label: 'Номенклатура', icon: '📦' },
  { key: 'settings', label: 'Настройки', icon: '⚙️' },
]

interface Ctx {
  user: any; orders: any[]; visible: any[]; loading: boolean; orgId: string
  act: (id: string, action: string) => Promise<void>; reload: () => Promise<void>; openCard: (o: any) => void
}
const AdminContext = createContext<Ctx | null>(null)
export const useAdmin = () => useContext(AdminContext) as Ctx

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 2300); return () => clearTimeout(t) }, [onClose])
  return <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999, animation: 'uktoast .25s ease both' }}>{msg}</div>
}

export default function AdminChrome({ user, children }: { user: { id: string; name: string; role: string; orgId: string }; children: React.ReactNode }) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sideOpen, setSideOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const pathname = usePathname() || ''
  const router = useRouter()
  const screen = pathname.split('/')[2] || 'incoming'

  const load = useCallback(async () => { setOrders(await fetchOrders(user.orgId)); setLoading(false) }, [user.orgId])
  // Живое обновление: поллинг-страховка + при возврате на вкладку (из Улкана).
  useLiveData(load, [user.orgId])

  async function act(id: string, action: string) {
    const payload = action === 'cancel' ? { reason: (typeof window !== 'undefined' && window.prompt('Причина отмены?')) || '' } : {}
    const r = await orderAction(id, action, payload)
    if (!r.ok) { setToast(r.error || 'Ошибка'); return }
    await load()
  }
  const openCard = (o: any) => setSelectedId(o.id)

  const counts: Record<string, number> = {}
  for (const o of orders) if (!o.isCancelled) counts[o.screen] = (counts[o.screen] || 0) + 1
  const q = search.trim().toLowerCase()
  const visible = q ? orders.filter(o => `${o.id} ${o.fromName} ${o.comment}`.toLowerCase().includes(q)) : orders
  const title = NAV.find(n => n.key === screen)?.label || ''

  const ctx: Ctx = { user, orders, visible, loading, orgId: user.orgId, act, reload: load, openCard }

  return (
    <div style={{ display: 'flex', height: '100vh', background: COLORS.bg, fontFamily: "'Golos Text', system-ui, sans-serif", overflow: 'hidden' }}>
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
      {sideOpen && <div className="mobile-overlay" onClick={() => setSideOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 99, display: 'none' }} />}

      <Sidebar nav={NAV} screen={screen} counts={counts} user={user}
        onNav={k => { router.push(`/admin/${k}`); setSideOpen(false) }} onRefresh={load}
        onLogout={async () => { await logout(); location.href = '/login' }}
        open={sideOpen} onClose={() => setSideOpen(false)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar title={title} orders={orders} search={search} onSearch={setSearch} onBurger={() => setSideOpen(v => !v)} />
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div>
            : <AdminContext.Provider value={ctx}>{children}</AdminContext.Provider>}
        </div>
      </div>

      {selectedId && <CardModal id={selectedId} onClose={() => setSelectedId(null)} onAction={act} />}
    </div>
  )
}
