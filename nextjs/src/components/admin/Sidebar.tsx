'use client'
import { COLORS } from '@/lib/colors'

export interface NavItem { key: string; label: string; icon: string }

// ОРГАНИЗАЦИЯ ЖИВЁТ В САЙДБАРЕ (правило владельца 21.11.2026): переключатель орг стоит
// под «U2B ERP», на месте подписи «автоматизация бизнеса» — в шапке рабочего экрана он
// только занимал место. Нет выбора (одна орг / филиал) — показываем бейдж с её именем.
export default function Sidebar({ nav, screen, counts, user, onNav, onRefresh, onLogout, open, onClose, orgs = [], orgId, onOrg, orgColor = '#6b7280', canSwitchOrg = true }: {
  nav: NavItem[]; screen: string; counts: Record<string, number>
  user: { name: string; role: string }
  onNav: (k: string) => void; onRefresh: () => void; onLogout: () => void
  open: boolean; onClose: () => void
  orgs?: { id: string; name: string; kind?: string; color?: string }[]; orgId?: string
  onOrg?: (id: string) => void; orgColor?: string; canSwitchOrg?: boolean
}) {
  const orgName = orgs.find(o => o.id === orgId)?.name || ''
  const roleLabel = user.role === 'super_admin' || user.role === 'admin' ? 'Супер-Админ' : user.role === 'bookkeeper' ? 'Бухгалтер' : user.role

  return (
    <div className={open ? 'sidebar sidebar-open' : 'sidebar'}
      style={{ width: 256, background: COLORS.sidebar.bg, display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: `1px solid ${COLORS.sidebar.border}`, transition: 'transform .25s', zIndex: 100 }}>
      {/* Лого */}
      <div style={{ padding: '20px 16px 16px', borderBottom: `1px solid ${COLORS.sidebar.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="U2B" style={{ width: 54, height: 54, borderRadius: 13, display: 'block' }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>U2B ERP</div>
            {orgs.length > 0 ? (
              <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2d2a26', border: '1px solid #3d3933', borderRadius: 8, padding: '3px 7px', maxWidth: '100%' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: orgColor, flexShrink: 0 }} />
                {canSwitchOrg && orgs.length > 1 && onOrg ? (
                  <select value={orgId} onChange={e => onOrg(e.target.value)} title="Организация / филиал"
                    style={{ border: 'none', background: 'transparent', color: '#efe9e0', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', maxWidth: 150 }}>
                    {orgs.map(o => <option key={o.id} value={o.id} style={{ color: '#26231f' }}>{o.name}</option>)}
                  </select>
                ) : <span style={{ color: '#efe9e0', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{orgName}</span>}
              </div>
            ) : <div style={{ color: COLORS.sidebar.muted, fontSize: 12 }}>автоматизация бизнеса</div>}
          </div>
          <button onClick={onClose} className="sidebar-close" style={{ background: 'none', border: 'none', color: COLORS.sidebar.muted, cursor: 'pointer', fontSize: 20, padding: '4px', display: 'none' }}>✕</button>
        </div>
      </div>

      {/* Навигация */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {nav.map(({ key, label, icon }) => {
          const isActive = screen === key
          const count = counts[key] || 0
          return (
            <button key={key} onClick={() => onNav(key)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', border: 'none', background: isActive ? 'rgba(212,97,58,.15)' : 'transparent', color: isActive ? COLORS.sidebar.active : COLORS.sidebar.text, cursor: 'pointer', fontFamily: 'inherit', fontWeight: isActive ? 700 : 500, fontSize: 15, textAlign: 'left', borderLeft: `3px solid ${isActive ? COLORS.sidebar.active : 'transparent'}` }}>
              <span style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{icon}</span>
              <span style={{ flex: 1 }}>{label}</span>
              {count > 0 && <span style={{ background: isActive ? COLORS.primary : COLORS.sidebar.badge, color: isActive ? '#fff' : COLORS.sidebar.text, fontSize: 12, padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>{count}</span>}
            </button>
          )
        })}
      </nav>

      {/* Футер */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${COLORS.sidebar.border}` }}>
        <div style={{ color: COLORS.sidebar.text, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{user.name}</div>
        <div style={{ color: COLORS.sidebar.muted, fontSize: 12, marginBottom: 10 }}>{roleLabel}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onRefresh} title="Обновить" style={{ flex: 1, background: COLORS.sidebar.badge, border: 'none', borderRadius: 7, padding: '6px', color: COLORS.sidebar.text, cursor: 'pointer', fontSize: 14 }}>⟳</button>
          <button onClick={onLogout} style={{ flex: 1, background: COLORS.sidebar.badge, border: 'none', borderRadius: 7, padding: '6px', color: COLORS.sidebar.muted, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Выйти</button>
        </div>
      </div>
    </div>
  )
}
