'use client'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable,
  horizontalListSortingStrategy, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cardProgress, barColor, fmtDate } from '@/lib/adminFmt'
import { COLORS } from '@/lib/colors'
import { settings as fetchSettings } from '@/lib/api/refs'

// Фильтр — drag-and-drop канбан (dnd-kit). Портирован из Улкана 1:1.
type FilterStatus = 'incoming' | 'inwork' | 'delivered' | 'all'
type ColType = 'client' | 'supplier' | 'project' | 'specproject'
interface Column { id: string; title: string; type: ColType; orders: any[]; specItems?: Array<{ name: string; unit: string; needed: number; collected: number; pct: number }> }

function ProgressBar({ pct, height = 4 }: { pct: number; height?: number }) {
  return (
    <div style={{ height, background: '#f1efec', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor(pct), borderRadius: 4 }} />
    </div>
  )
}
function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    'В ожидании': '#4a5aaa', 'Новая заявка': '#4a5aaa',
    'Принят': '#c0532a', 'В обработке': '#c0532a', 'В работе': '#c0532a',
    'Готово к отгрузке': '#8a6f00', 'В пути': '#8a6f00',
    'Доставлено': '#2e8a5e', 'К учёту': '#2e8a5e',
  }
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: map[status] || '#837c72', display: 'inline-block', flexShrink: 0 }} />
}

interface Section { label: string; options: Array<{ id: string; name: string; count: number }> }

function SectionDropdown({ sections, selected, onToggle, onClose, placeholder }: {
  sections: Section[]; selected: string[]; onToggle: (id: string) => void; onClose: () => void; placeholder: string
}) {
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])
  const q = search.toLowerCase()
  const filtered = sections.map(s => ({ ...s, options: s.options.filter(o => o.name.toLowerCase().includes(q)) })).filter(s => s.options.length > 0)
  return (
    <div ref={ref} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 300, background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.16)', width: 280, border: '1.5px solid #e6e2dc' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1efec' }}>
        <input ref={inputRef} style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1.5px solid #e6e2dc', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} placeholder={placeholder} value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {filtered.length === 0
          ? <div style={{ padding: '14px', fontSize: 14, color: '#5f5952', textAlign: 'center' }}>Ничего не найдено</div>
          : filtered.map(sec => (
            <div key={sec.label}>
              <div style={{ padding: '8px 14px 4px', fontSize: 12, fontWeight: 700, color: '#5f5952', letterSpacing: '.06em', textTransform: 'uppercase' }}>{sec.label}</div>
              {sec.options.map(opt => {
                const active = selected.includes(opt.id)
                return (
                  <div key={opt.id} onClick={() => onToggle(opt.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', background: active ? '#fff8f5' : 'transparent' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${active ? COLORS.primary : '#d8d3cc'}`, background: active ? COLORS.primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                      {active && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: active ? 600 : 400 }}>{opt.name}</span>
                    <span style={{ fontSize: 12, color: '#5f5952', flexShrink: 0 }}>{opt.count}</span>
                  </div>
                )
              })}
            </div>
          ))}
      </div>
      {selected.length > 0 && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid #f1efec', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {selected.map(id => {
            const opt = sections.flatMap(s => s.options).find(o => o.id === id)
            if (!opt) return null
            return (
              <span key={id} onClick={() => onToggle(id)} style={{ fontSize: 12, background: '#fff0ea', color: COLORS.primary, padding: '2px 8px', borderRadius: 20, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                {opt.name} <span style={{ opacity: .6 }}>✕</span>
              </span>
            )
          })}
          <button onClick={() => selected.forEach(id => onToggle(id))} style={{ fontSize: 12, color: '#5f5952', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 2 }}>Сбросить</button>
        </div>
      )}
    </div>
  )
}

function DropBtn({ label, icon, sections, selected, onToggle, placeholder }: {
  label: string; icon: string; sections: Section[]; selected: string[]; onToggle: (id: string) => void; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const hasAny = sections.some(s => s.options.length > 0)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => hasAny && setOpen(p => !p)} style={{ padding: '6px 12px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: hasAny ? 'pointer' : 'default', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, background: selected.length > 0 ? COLORS.primary : '#fff', color: selected.length > 0 ? '#fff' : '#5f5952', boxShadow: '0 0 0 1.5px #e6e2dc', opacity: hasAny ? 1 : .5 }}>
        <span>{icon}</span><span>{label}</span>
        {selected.length > 0 && <span style={{ background: 'rgba(255,255,255,.28)', color: '#fff', fontSize: 12, padding: '0 5px', borderRadius: 10, fontWeight: 700 }}>{selected.length}</span>}
        {hasAny && <span style={{ fontSize: 11, opacity: .6 }}>{open ? '▲' : '▼'}</span>}
      </button>
      {open && <SectionDropdown sections={sections} selected={selected} onToggle={id => onToggle(id)} onClose={() => setOpen(false)} placeholder={placeholder} />}
    </div>
  )
}

function KanbanCard({ order, onOpen, isDragging = false }: { order: any; onOpen: () => void; isDragging?: boolean }) {
  const pct = cardProgress(order)
  return (
    <div onClick={onOpen} style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,.18)' : '0 0 0 1.5px #e6e2dc', cursor: 'grab', marginBottom: 8, opacity: isDragging ? .85 : 1, transform: isDragging ? 'rotate(2deg)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: COLORS.primary }}>{order.id}</span>
        <StatusDot status={order.status} />
        {order.isChanged && <span style={{ fontSize: 11, background: '#fff0ea', color: '#c0532a', padding: '1px 5px', borderRadius: 10, fontWeight: 700 }}>⚡</span>}
        {order.postponed && <span style={{ fontSize: 11, background: '#eef2ff', color: '#4a5aaa', padding: '1px 5px', borderRadius: 10, fontWeight: 700 }}>откл.</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5f5952' }}>{fmtDate(order.createdAt)}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.fromName || '—'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1 }}><ProgressBar pct={pct} /></div>
        <span style={{ fontSize: 12, fontWeight: 700, color: barColor(pct), flexShrink: 0 }}>{pct}%</span>
      </div>
      {order.deadline && <div style={{ fontSize: 12, color: '#5f5952', marginTop: 4 }}>срок {fmtDate(order.deadline)}</div>}
    </div>
  )
}

function SortableCard({ order, onOpen }: { order: any; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: order.id, data: { type: 'card', order } })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }} {...attributes} {...listeners}>
      <KanbanCard order={order} onOpen={onOpen} />
    </div>
  )
}

function SortableColumn({ column, onOpen, onHide }: { column: Column; onOpen: (o: any) => void; onHide: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id, data: { type: 'column' } })
  const cardIds = column.orders.map(o => o.id)
  const typeColors: Record<ColType, string> = { client: COLORS.sidebar.bg, supplier: '#1a2a3a', project: '#1e3040', specproject: '#2a1a3a' }
  const typeBadge: Record<ColType, string> = { client: 'заказчик', supplier: 'поставщик', project: 'проект', specproject: 'спецпроект' }
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .5 : 1, flexShrink: 0, width: 288, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 190px)' }}>
      <div {...attributes} {...listeners} style={{ padding: '10px 12px', background: typeColors[column.type], borderRadius: '10px 10px 0 0', cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{column.title}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 1 }}>{typeBadge[column.type]}</div>
        </div>
        <span style={{ background: COLORS.primary, color: '#fff', fontSize: 12, padding: '1px 7px', borderRadius: 20, fontWeight: 700, flexShrink: 0 }}>{column.orders.length}</span>
        <button onClick={e => { e.stopPropagation(); onHide() }} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 14, flexShrink: 0 }}>✕</button>
      </div>
      {column.type === 'specproject' && column.specItems && column.specItems.length > 0 && (
        <div style={{ background: '#faf8f6', border: '1px solid #e6e2dc', borderTop: 'none', padding: '10px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 6, letterSpacing: '.04em' }}>СМЕТА vs СОБРАНО</div>
          {column.specItems.map((item, i) => (
            <div key={i} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{item.name}</span>
                <span style={{ fontSize: 12, color: '#5f5952', flexShrink: 0, marginLeft: 4 }}>{item.collected}/{item.needed} {item.unit}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ flex: 1 }}><ProgressBar pct={item.pct} height={3} /></div>
                <span style={{ fontSize: 12, fontWeight: 700, color: barColor(item.pct), width: 28, textAlign: 'right', flexShrink: 0 }}>{item.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f8f6f3', border: '1px solid #e6e2dc', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '10px 8px', minHeight: 80 }}>
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {column.orders.length === 0
            ? <div style={{ textAlign: 'center', padding: '20px 0', color: '#837c72', fontSize: 13 }}>Пусто</div>
            : column.orders.map(o => <SortableCard key={o.id} order={o} onOpen={() => onOpen(o)} />)}
        </SortableContext>
      </div>
    </div>
  )
}

export default function FilterScreen({ orders, orgId, onOpen }: { orders: any[]; orgId: string; onOpen: (o: any) => void }) {
  const [settings, setSettings] = useState<any>({ suppliers: [], projects: [], specProjects: [] })
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selPeople, setSelPeople] = useState<string[]>([])
  const [selProjects, setSelProjects] = useState<string[]>([])
  const [selSpecs, setSelSpecs] = useState<string[]>([])
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [colOrder, setColOrder] = useState<string[]>([])
  const [cardOverrides, setCardOverrides] = useState<Record<string, string>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<'card' | 'column' | null>(null)
  const [activeOrder, setActiveOrder] = useState<any>(null)

  useEffect(() => { fetchSettings(orgId).then(setSettings) }, [orgId])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const toggleSel = (id: string, arr: string[], set: (v: string[]) => void) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])

  const filteredOrders = useMemo(() => {
    let base = orders.filter(o => o.screen !== 'archive' && !o.isDraft && !o.isCancelled)
    if (statusFilter === 'incoming') base = base.filter(o => o.screen === 'incoming' && !o.toacc)
    if (statusFilter === 'inwork') base = base.filter(o => o.screen === 'outgoing' || o.screen === 'reception')
    if (statusFilter === 'delivered') base = base.filter(o => o.status === 'Доставлено' || o.toacc)
    if (dateFrom) base = base.filter(o => new Date(o.createdAt) >= new Date(dateFrom))
    if (dateTo) base = base.filter(o => new Date(o.createdAt) <= new Date(dateTo + 'T23:59:59'))
    return base
  }, [orders, statusFilter, dateFrom, dateTo])

  const peopleSections = useMemo<Section[]>(() => {
    const clients = Array.from(new Set(filteredOrders.map(o => o.fromName))).filter(Boolean).sort().map(name => ({
      id: `client:${name}`, name, count: filteredOrders.filter(o => o.fromName === name).length,
    }))
    const suppliers = (settings?.suppliers || []).map((s: any) => ({
      id: `sup:${s.id}`, name: s.name, count: filteredOrders.filter(o => (o.positions || []).some((p: any) => p.supplierId === s.id)).length,
    })).filter((s: any) => s.count > 0)
    return [{ label: 'Заказчики', options: clients }, { label: 'Поставщики', options: suppliers }]
  }, [filteredOrders, settings])

  const projectSections = useMemo<Section[]>(() => {
    const projs = (settings?.projects || []).filter((p: any) => p.status === 'active').map((p: any) => ({
      id: `prj:${p.id}`, name: p.name, count: filteredOrders.filter(o => o.projectId === p.id).length,
    }))
    return [{ label: 'Проекты', options: projs }]
  }, [filteredOrders, settings])

  const specSections = useMemo<Section[]>(() => {
    const specs = (settings?.specProjects || []).filter((s: any) => s.status === 'active').map((s: any) => ({
      id: `sp:${s.id}`, name: s.name, count: filteredOrders.filter(o => o.specProjectId === s.id).length,
    }))
    return [{ label: 'СпецПроекты', options: specs }]
  }, [filteredOrders, settings])

  const baseColumns = useMemo<Column[]>(() => {
    const cols: Column[] = []
    selPeople.filter(id => !hiddenIds.includes(id)).forEach(id => {
      if (id.startsWith('client:')) {
        const name = id.replace('client:', '')
        cols.push({ id, title: name, type: 'client', orders: filteredOrders.filter(o => o.fromName === name) })
      } else if (id.startsWith('sup:')) {
        const supId = id.replace('sup:', '')
        const sup = settings?.suppliers.find((s: any) => s.id === supId)
        if (sup) cols.push({ id, title: sup.name, type: 'supplier', orders: filteredOrders.filter(o => (o.positions || []).some((p: any) => p.supplierId === sup.id)) })
      }
    })
    selProjects.filter(id => !hiddenIds.includes(id)).forEach(id => {
      const prjId = id.replace('prj:', '')
      const prj = settings?.projects.find((p: any) => p.id === prjId)
      if (prj) cols.push({ id, title: prj.name, type: 'project', orders: filteredOrders.filter(o => o.projectId === prj.id) })
    })
    selSpecs.filter(id => !hiddenIds.includes(id)).forEach(id => {
      const spId = id.replace('sp:', '')
      const sp = settings?.specProjects.find((s: any) => s.id === spId)
      if (sp) {
        const spOrders = filteredOrders.filter(o => o.specProjectId === sp.id)
        const specItems = (sp.items || []).map((item: any) => {
          const collected = spOrders.reduce((s, o) => s + (o.positions || []).filter((p: any) => p.name1c === item.name || p.oral === item.name).reduce((ps: number, p: any) => ps + Number(p.qty), 0), 0)
          const pct = item.qty > 0 ? Math.round(Math.min(collected / item.qty * 100, 100)) : 0
          return { name: item.name, unit: item.unit, needed: item.qty, collected, pct }
        })
        cols.push({ id, title: sp.name, type: 'specproject', orders: spOrders, specItems })
      }
    })
    return cols
  }, [filteredOrders, selPeople, selProjects, selSpecs, hiddenIds, settings])

  const columns = useMemo<Column[]>(() => {
    const withOverrides = baseColumns.map(col => ({
      ...col,
      orders: [
        ...col.orders.filter(o => !cardOverrides[o.id]),
        ...baseColumns.flatMap(c => c.orders).filter(o => cardOverrides[o.id] === col.id),
      ].filter((o, i, arr) => arr.findIndex(x => x.id === o.id) === i),
    }))
    if (colOrder.length === 0) return withOverrides
    const ordered: Column[] = []
    colOrder.forEach(id => { const col = withOverrides.find(c => c.id === id); if (col) ordered.push(col) })
    withOverrides.forEach(col => { if (!ordered.find(c => c.id === col.id)) ordered.push(col) })
    return ordered
  }, [baseColumns, colOrder, cardOverrides])

  const columnIds = columns.map(c => c.id)
  const totalCards = columns.reduce((s, c) => s + c.orders.length, 0)
  const totalSelected = selPeople.length + selProjects.length + selSpecs.length

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    const data = e.active.data.current
    setActiveType(data?.type === 'column' ? 'column' : 'card')
    setActiveOrder(data?.order || null)
  }, [])

  const handleDragOver = useCallback((e: DragOverEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id || active.data.current?.type === 'column') return
    const cardId = String(active.id); const overId = String(over.id)
    let targetColId: string | null = null
    for (const col of columns) {
      if (col.id === overId) { targetColId = col.id; break }
      if (col.orders.some(o => o.id === overId)) { targetColId = col.id; break }
    }
    if (targetColId) setCardOverrides(prev => ({ ...prev, [cardId]: targetColId! }))
  }, [columns])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null); setActiveType(null); setActiveOrder(null)
    if (!over || active.id === over.id) return
    if (active.data.current?.type === 'column') {
      const ids = columns.map(c => c.id)
      const oldIdx = ids.indexOf(String(active.id)); const newIdx = ids.indexOf(String(over.id))
      if (oldIdx !== -1 && newIdx !== -1) setColOrder(arrayMove(ids, oldIdx, newIdx))
    }
  }, [columns])

  const pilBtn = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
    background: active ? COLORS.primary : '#fff', color: active ? '#fff' : '#5f5952', boxShadow: '0 0 0 1.5px #e6e2dc',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, paddingBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <DropBtn label="Заказчики / Поставщики" icon="👥" sections={peopleSections} selected={selPeople} onToggle={id => toggleSel(id, selPeople, setSelPeople)} placeholder="Поиск..." />
          <DropBtn label="Проекты" icon="📁" sections={projectSections} selected={selProjects} onToggle={id => toggleSel(id, selProjects, setSelProjects)} placeholder="Поиск по проектам..." />
          <DropBtn label="СпецПроекты" icon="⭐" sections={specSections} selected={selSpecs} onToggle={id => toggleSel(id, selSpecs, setSelSpecs)} placeholder="Поиск по спецпроектам..." />
          <div style={{ width: 1, height: 20, background: '#e6e2dc' }} />
          <span style={{ fontSize: 13, color: '#5f5952', fontWeight: 600 }}>Статус:</span>
          {([['incoming', '🆕 Новые входящие'], ['inwork', 'В работе'], ['delivered', 'Доставлено'], ['all', 'Все']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setStatusFilter(k)} style={pilBtn(statusFilter === k)}>{l}</button>
          ))}
          <div style={{ width: 1, height: 20, background: '#e6e2dc' }} />
          <span style={{ fontSize: 13, color: '#5f5952', fontWeight: 600 }}>Даты:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '4px 8px', borderRadius: 7, border: '1.5px solid #e6e2dc', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          <span style={{ fontSize: 13, color: '#5f5952' }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '4px 8px', borderRadius: 7, border: '1.5px solid #e6e2dc', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }} style={{ padding: '4px 8px', borderRadius: 7, border: 'none', background: '#faeaea', color: '#b03020', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>✕ Даты</button>}
          {hiddenIds.length > 0 && <button onClick={() => setHiddenIds([])} style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: '#fdf8e1', color: '#8a6f00', boxShadow: '0 0 0 1.5px #f0dfa0' }}>↺ Показать скрытые ({hiddenIds.length})</button>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {totalSelected === 0
              ? <span style={{ fontSize: 13, color: '#837c72', fontStyle: 'italic' }}>← Выберите колонки для отображения</span>
              : <span style={{ fontSize: 13, color: '#5f5952' }}>{totalCards} карточек · {columns.length} колонок</span>}
          </div>
        </div>
      </div>

      {totalSelected === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 48 }}>🗂</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#26231f' }}>Выберите что показать</div>
          <div style={{ fontSize: 14, color: '#5f5952', textAlign: 'center', maxWidth: 400 }}>Нажмите на кнопки выше и выберите заказчиков, поставщиков, проекты или спецпроекты — они появятся как колонки. Карточки и колонки можно перетаскивать.</div>
        </div>
      )}

      {totalSelected > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden', flex: 1, paddingBottom: 16, alignItems: 'flex-start' }}>
              {columns.map(col => <SortableColumn key={col.id} column={col} onOpen={onOpen} onHide={() => setHiddenIds(prev => [...prev, col.id])} />)}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeType === 'card' && activeOrder && <KanbanCard order={activeOrder} onOpen={() => {}} isDragging />}
            {activeType === 'column' && activeId && (() => {
              const col = columns.find(c => c.id === activeId)
              return col ? <div style={{ width: 288, background: COLORS.sidebar.bg, borderRadius: 10, padding: '10px 12px' }}><span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{col.title}</span></div> : null
            })()}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
