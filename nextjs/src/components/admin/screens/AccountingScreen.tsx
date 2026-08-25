'use client'
import { useEffect, useMemo, useState } from 'react'
import OrderCard, { type CardAction } from '@/components/admin/OrderCard'
import KanbanColumns from '@/components/admin/KanbanColumns'
import { COLORS } from '@/lib/colors'
import { settings as fetchSettings } from '@/lib/api/refs'

// «К учёту» — МОСТ-ПРОСМОТР (не стадия воркфлоу). Как в 1С: документ проводится сразу
// на доставке, карточка уходит в Бухгалтерию. Сюда попадают только те, что авто-провести
// НЕ удалось (нет 1С-товара/поставщика) — их видно и можно провести вручную кнопкой «Провести».
// Сверху фильтры: дата, поставщик, поисковое слово.
const sel: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', fontFamily: 'inherit', fontSize: 13, outline: 'none' }

// Мост: единственное действие — «Провести» (проводит накладную → Бухгалтерия). Плюс отмена.
function actionsFor(o: any): CardAction[] {
  if (o.isCancelled) return [{ action: 'restore', label: 'Восстановить' }]
  return [
    { action: 'invoice', label: o.kind === 'purchase' ? 'Провести приход' : 'Провести расход', variant: 'primary' },
    { action: 'postpone', label: o.postponed ? 'Снять откл.' : 'Отложить' },
    { action: 'cancel', label: 'Отмена', variant: 'danger' },
  ]
}

export default function AccountingScreen({ orders, orgId, onAction, onOpen }: {
  orders: any[]; orgId: string; onAction: (id: string, a: string) => void; onOpen: (o: any) => void
}) {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')

  useEffect(() => { fetchSettings(orgId).then((s: any) => setSuppliers(s.suppliers || [])) }, [orgId])

  // Все карточки «к учёту»: готовые (incoming+toacc) + уже в учёте (accounting).
  const base = useMemo(() => orders.filter(o =>
    !o.isCancelled && ((o.screen === 'incoming' && o.toacc) || o.screen === 'accounting'),
  ), [orders])

  const list = useMemo(() => base.filter(o => {
    if (supplierId && !(o.positions || []).some((p: any) => p.supplierId === supplierId)) return false
    if (q.trim() && !`${o.id} ${o.fromName} ${o.comment}`.toLowerCase().includes(q.toLowerCase())) return false
    if (dateFrom && new Date(o.createdAt) < new Date(dateFrom)) return false
    if (dateTo && new Date(o.createdAt) > new Date(dateTo + 'T23:59:59')) return false
    return true
  }), [base, supplierId, q, dateFrom, dateTo])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>К учёту</div>
        <span style={{ background: '#fff0ea', color: '#c0532a', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>Не проведено: {base.length}</span>
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.textMuted, marginBottom: 14 }}>
        Мост-просмотр. Документы проводятся сразу на доставке — сюда падают только те, что авто-провести не удалось (нет 1С-товара/поставщика). Нажмите «Провести» → карточка уйдёт в Бухгалтерию.
      </div>

      {/* Фильтры: поиск, поставщик, даты */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Номер / заказчик / коммент" style={{ ...sel, flex: 1, minWidth: 200 }} />
        <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={sel}>
          <option value="">Все поставщики</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>с</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={sel} />
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>по</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={sel} />
        {(q || supplierId || dateFrom || dateTo) && <button onClick={() => { setQ(''); setSupplierId(''); setDateFrom(''); setDateTo('') }} style={{ ...sel, cursor: 'pointer', background: '#faeaea', color: '#b03020', border: 'none', fontWeight: 600 }}>✕ Сброс</button>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['kanban', 'list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ ...sel, cursor: 'pointer', background: view === v ? COLORS.primary : '#fff', color: view === v ? '#fff' : COLORS.textMuted, border: 'none', boxShadow: view === v ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{v === 'kanban' ? '▦ Канбан' : '☰ Список'}</button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 10 }}>Найдено: {list.length}</div>

      {list.length === 0
        ? <div style={{ textAlign: 'center', padding: 40, color: COLORS.textMuted, fontSize: 14 }}>Нет карточек к учёту</div>
        : view === 'kanban'
          // Авто-канбан по заказчику (как в бывшей вкладке Входящие→К учёту)
          ? <KanbanColumns cards={list} groupBy={o => o.fromName} renderCard={o => <OrderCard key={o.id} order={o} actions={actionsFor(o)} onAction={onAction} onOpen={onOpen} />} />
          : <div style={{ maxWidth: 680 }}>{list.map(o => <OrderCard key={o.id} order={o} actions={actionsFor(o)} onAction={onAction} onOpen={onOpen} />)}</div>}
    </div>
  )
}
