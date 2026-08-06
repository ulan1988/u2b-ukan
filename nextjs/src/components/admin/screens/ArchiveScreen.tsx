'use client'
import { useEffect, useState } from 'react'
import OrderCard from '@/components/admin/OrderCard'
import { COLORS } from '@/lib/colors'
import { settings as fetchSettings } from '@/lib/api/refs'

// Архив 1:1: три вкладки — Карточки / Проекты / СпецПроекты.
type Tab = 'cards' | 'projects' | 'specprojects'

export default function ArchiveScreen({ orders, orgId, onAction, onOpen }: {
  orders: any[]; orgId: string; onAction: (id: string, a: string) => void; onOpen: (o: any) => void
}) {
  const [tab, setTab] = useState<Tab>('cards')
  const [projects, setProjects] = useState<any[]>([])
  const [specs, setSpecs] = useState<any[]>([])
  useEffect(() => {
    fetchSettings(orgId).then((s: any) => { setProjects(s.projects || []); setSpecs(s.specProjects || []) })
  }, [orgId])

  const archived = orders.filter(o => o.screen === 'archive')
  const archProjects = projects.filter(p => p.status === 'archive')
  const archSpecs = specs.filter(sp => sp.status === 'archive')

  const TABS: Array<[Tab, string]> = [
    ['cards', `Карточки (${archived.length})`],
    ['projects', `Проекты (${archProjects.length})`],
    ['specprojects', `СпецПроекты (${archSpecs.length})`],
  ]

  return (
    <div className="anim-fade">
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 16 }}>Архив</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: tab === t ? COLORS.primary : '#fff', color: tab === t ? '#fff' : '#5f5952', boxShadow: '0 0 0 1.5px #e6e2dc' }}>{l}</button>
        ))}
      </div>

      {tab === 'cards' && (
        archived.length === 0
          ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952', fontSize: 14 }}>Архив пуст</div>
          : <div style={{ maxWidth: 680 }}>{archived.map(o => <OrderCard key={o.id} order={o} actions={[{ action: 'unarchive', label: 'Из архива' }]} onAction={onAction} onOpen={onOpen} />)}</div>
      )}
      {tab === 'projects' && (
        archProjects.length === 0
          ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952', fontSize: 14 }}>Нет архивных проектов</div>
          : <div>{archProjects.map(p => <div key={p.id} style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', marginBottom: 8, boxShadow: '0 0 0 1.5px #e6e2dc' }}><div style={{ fontWeight: 600 }}>{p.id} · {p.name}</div><div style={{ fontSize: 13, color: '#5f5952' }}>{p.description}</div></div>)}</div>
      )}
      {tab === 'specprojects' && (
        archSpecs.length === 0
          ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952', fontSize: 14 }}>Нет архивных спецпроектов</div>
          : <div>{archSpecs.map(sp => <div key={sp.id} style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', marginBottom: 8, boxShadow: '0 0 0 1.5px #e6e2dc' }}><div style={{ fontWeight: 600 }}>{sp.id} · {sp.name}</div></div>)}</div>
      )}
    </div>
  )
}
