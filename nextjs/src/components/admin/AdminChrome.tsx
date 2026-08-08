'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar, { type NavItem } from '@/components/admin/Sidebar'
import Topbar from '@/components/admin/Topbar'
import CardModal from '@/components/admin/CardModal'
import ChatWidget from '@/components/ChatWidget'
import AppBadge from '@/components/AppBadge'
import PushSetup from '@/components/PushSetup'
import { COLORS } from '@/lib/colors'
import { fetchOrders, orderAction, logout } from '@/lib/adminApi'
import { fetchRefs } from '@/lib/api/refs'
import { getOrgId, setOrgId as persistOrg } from '@/lib/org'
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

  // Организация: админ может переключаться между головной и филиалами (localStorage).
  const [orgId, setOrg] = useState<string>(user.orgId)
  const [orgs, setOrgs] = useState<{ id: string; name: string; kind?: string }[]>([])
  useEffect(() => {
    fetchRefs().then((r: any) => {
      const os = r.organizations || []; setOrgs(os)
      const saved = getOrgId(); if (saved && os.some((o: any) => o.id === saved)) setOrg(saved)
    })
  }, [])
  function switchOrg(id: string) { persistOrg(id); setOrg(id) }

  const load = useCallback(async () => { setOrders(await fetchOrders(orgId)); setLoading(false) }, [orgId])
  // Живое обновление: поллинг-страховка + при возврате на вкладку (из Улкана).
  useLiveData(load, [orgId])

  async function act(id: string, action: string) {
    const payload = action === 'cancel' ? { reason: (typeof window !== 'undefined' && window.prompt('Причина отмены?')) || '' } : {}
    const r = await orderAction(id, action, payload)
    if (!r.ok) { setToast(r.error || 'Ошибка'); return }
    await load()
  }
  const openCard = (o: any) => setSelectedId(o.id)

  // Счётчики сайдбара = как показывают экраны: toacc-карточки идут в «К учёту»,
  // а не «Входящие» (иначе счётчик Входящих врёт, а вкладки пустые).
  const counts: Record<string, number> = {}
  for (const o of orders) {
    if (o.isCancelled) continue
    const key = (o.screen === 'incoming' && o.toacc) ? 'accounting' : o.screen
    counts[key] = (counts[key] || 0) + 1
  }
  // Новые карточки (как «Входящие» в дашборде) → бейдж на иконке PWA.
  const newCount = orders.filter(o => o.screen === 'incoming' && !o.toacc && !o.isDraft && !o.isCancelled).length
  const q = search.trim().toLowerCase()
  const visible = q ? orders.filter(o => `${o.id} ${o.fromName} ${o.comment}`.toLowerCase().includes(q)) : orders
  const title = NAV.find(n => n.key === screen)?.label || ''

  const ctx: Ctx = { user, orders, visible, loading, orgId, act, reload: load, openCard }

  return (
    <div style={{ display: 'flex', height: '100vh', background: COLORS.bg, fontFamily: "'Golos Text', system-ui, sans-serif", overflow: 'hidden' }}>
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
      {sideOpen && <div className="mobile-overlay" onClick={() => setSideOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 99, display: 'none' }} />}

      <Sidebar nav={NAV} screen={screen} counts={counts} user={user}
        onNav={k => { router.push(`/admin/${k}`); setSideOpen(false) }} onRefresh={load}
        onLogout={async () => { await logout(); location.href = '/login' }}
        open={sideOpen} onClose={() => setSideOpen(false)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar title={title} orders={orders} search={search} onSearch={setSearch} onBurger={() => setSideOpen(v => !v)} orgs={orgs} orgId={orgId} onOrg={switchOrg} />
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div>
            : <AdminContext.Provider value={ctx}>{children}</AdminContext.Provider>}
        </div>
      </div>

      {selectedId && <CardModal id={selectedId} myId={user.id} onClose={() => setSelectedId(null)} onAction={act} />}
      <ChatWidget myId={user.id} orgId={orgId} />
      <AppBadge count={newCount} baseTitle="U2B ERP" />
      <PushSetup />
    </div>
  )
}
