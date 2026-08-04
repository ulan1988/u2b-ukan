'use client'
import { useEffect, useState, useCallback } from 'react'
import Sidebar, { type NavItem } from '@/components/admin/Sidebar'
import Topbar from '@/components/admin/Topbar'
import IncomingScreen from '@/components/admin/screens/IncomingScreen'
import ReceptionScreen from '@/components/admin/screens/ReceptionScreen'
import OutgoingScreen from '@/components/admin/screens/OutgoingScreen'
import ListScreen from '@/components/admin/screens/ListScreen'
import CardModal from '@/components/admin/CardModal'
import { COLORS } from '@/lib/colors'
import { fetchOrders, orderAction, logout } from '@/lib/adminApi'

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Дашборд', icon: '📊' },
  { key: 'history', label: 'История', icon: '🕓' },
  { key: 'incoming', label: 'Входящие', icon: '📥' },
  { key: 'reception', label: 'Приёмка', icon: '🔄' },
  { key: 'outgoing', label: 'Исходящие', icon: '📤' },
  { key: 'procurement', label: 'Закуп-отчёт', icon: '🛒' },
  { key: 'filter', label: 'Фильтр', icon: '🔍' },
  { key: 'accounting', label: 'К учёту', icon: '📋' },
  { key: 'warehouse', label: 'Склад', icon: '🏭' },
  { key: 'bookkeeping', label: 'Бухгалтерия', icon: '📒' },
  { key: 'archive', label: 'Архив', icon: '🗂' },
  { key: 'nomenclature', label: 'Номенклатура', icon: '📦' },
  { key: 'settings', label: 'Настройки', icon: '⚙️' },
]

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 2300); return () => clearTimeout(t) }, [onClose])
  return <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999, animation: 'uktoast .25s ease both' }}>{msg}</div>
}

function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>{title}</div>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, border: '1px solid #efece8', color: COLORS.textMuted, fontSize: 14 }}>
        Экран «{title}» переносится по методу — раздел появится следующим шагом.
      </div>
    </div>
  )
}

export default function AdminShell({ user }: { user: { id: string; name: string; role: string; orgId: string } }) {
  const [screen, setScreen] = useState('incoming')
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sideOpen, setSideOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const openCard = (o: any) => setSelectedId(o.id)

  const load = useCallback(async () => {
    setLoading(true)
    setOrders(await fetchOrders(user.orgId))
    setLoading(false)
  }, [user.orgId])
  useEffect(() => { load() }, [load])

  async function act(id: string, action: string) {
    const payload = action === 'cancel' ? { reason: (typeof window !== 'undefined' && window.prompt('Причина отмены?')) || '' } : {}
    const r = await orderAction(id, action, payload)
    if (!r.ok) { setToast(r.error || 'Ошибка'); return }
    await load()
  }

  const counts: Record<string, number> = {}
  for (const o of orders) if (!o.isCancelled) counts[o.screen] = (counts[o.screen] || 0) + 1

  const q = search.trim().toLowerCase()
  const visible = q ? orders.filter(o => `${o.id} ${o.fromName} ${o.comment}`.toLowerCase().includes(q)) : orders
  const title = NAV.find(n => n.key === screen)?.label || ''

  return (
    <div style={{ display: 'flex', height: '100vh', background: COLORS.bg, fontFamily: "'Golos Text', system-ui, sans-serif", overflow: 'hidden' }}>
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
      {sideOpen && <div className="mobile-overlay" onClick={() => setSideOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 99, display: 'none' }} />}

      <Sidebar nav={NAV} screen={screen} counts={counts} user={user}
        onNav={k => { setScreen(k); setSideOpen(false) }} onRefresh={load}
        onLogout={async () => { await logout(); location.href = '/login' }}
        open={sideOpen} onClose={() => setSideOpen(false)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar title={title} orders={orders} search={search} onSearch={setSearch} onBurger={() => setSideOpen(v => !v)} />
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading
            ? <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div>
            : screen === 'incoming'
              ? <IncomingScreen orders={visible} onAction={act} onOpen={openCard} />
              : screen === 'reception'
                ? <ReceptionScreen orders={visible} orgId={user.orgId} onAction={act} onReload={load} onOpen={openCard} />
                : screen === 'outgoing'
                  ? <OutgoingScreen orders={visible} onAction={act} onReload={load} onOpen={openCard} />
                  : screen === 'accounting'
                    ? <ListScreen title="К учёту" screen="accounting" orders={visible} onAction={act} onOpen={openCard} empty="Нет карточек к учёту"
                        actions={[{ action: 'postAcc', label: 'В бухгалтерию', variant: 'primary' }, { action: 'returnToIncoming', label: 'Вернуть' }]} />
                    : screen === 'bookkeeping'
                      ? <ListScreen title="Бухгалтерия" screen="bookkeeping" orders={visible} onAction={act} onOpen={openCard} empty="Нет проведённых карточек"
                          actions={[{ action: 'sendArchive', label: 'В архив', variant: 'primary' }]} />
                      : screen === 'archive'
                        ? <ListScreen title="Архив" screen="archive" orders={visible} onAction={act} onOpen={openCard} empty="Архив пуст"
                            actions={[{ action: 'unarchive', label: 'Из архива' }]} />
                        : <Placeholder title={title} />}
        </div>
      </div>

      {selectedId && <CardModal id={selectedId} onClose={() => setSelectedId(null)} onAction={act} />}
    </div>
  )
}
