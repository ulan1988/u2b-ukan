'use client'
import { useEffect, useState, useCallback } from 'react'
import OrderCard from '@/components/admin/OrderCard'
import InvoiceForm from '@/components/admin/InvoiceForm'

import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDMY, ymdKey } from '@/lib/adminFmt'
import { postInvoice } from '@/lib/adminApi'

// kind: 'in' = приходные (закуп/возврат), 'out' = расходные (продажа).
// Готовит карточки с экрана «К учёту» и превращает их в ERP-документы.
export default function InvoicesScreen({ kind, orders, orgId, onReload, onOpen }: {
  kind: 'in' | 'out'; orders: any[]; orgId: string; onReload: () => void; onOpen?: (o: any) => void
}) {
  const [docs, setDocs] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [openDocId, setOpenDocId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // Фильтры проведённых накладных: по дате (с/по), поставщику и заказчику/покупателю.
  const [dFrom, setDFrom] = useState('')
  const [dTo, setDTo] = useState('')
  const [fSup, setFSup] = useState('')     // поставщик
  const [fParty, setFParty] = useState('') // заказчик (приход) / покупатель (расход)

  const wantKind = kind === 'in' ? 'purchase' : 'sale'
  const title = kind === 'in' ? 'Приходные накладные' : 'Расходные накладные'
  const endpoint = kind === 'in' ? '/api/documents' : '/api/sales'

  const loadDocs = useCallback(() => {
    fetch(`${endpoint}?orgId=${orgId}`).then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : [])).catch(() => {})
  }, [endpoint, orgId])
  useEffect(() => { loadDocs() }, [loadDocs])

  // Карточки «К учёту» нужного типа, ещё не проведённые в накладную.
  const pending = orders.filter(o => o.screen === 'accounting' && !o.isCancelled && o.kind === wantKind && !o.linkedDocId)

  // Поставщик и вторая сторона по типу накладной (приход: заказчик; расход: покупатель).
  const supplierOf = (d: any) => (kind === 'in' ? d.contragent : (d as any).supplier) || ''
  const partyOf = (d: any) => (kind === 'in' ? d.customer : d.contragent) || ''
  const partyLabel = kind === 'in' ? 'Заказчик' : 'Покупатель'
  const suppliers = Array.from(new Set(docs.map(supplierOf).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'))
  const parties = Array.from(new Set(docs.map(partyOf).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'))
  const filteredDocs = docs.filter(d => {
    const k = ymdKey(d.date)
    if (dFrom && k && k < dFrom) return false
    if (dTo && k && k > dTo) return false
    if (fSup && supplierOf(d) !== fSup) return false
    if (fParty && partyOf(d) !== fParty) return false
    return true
  })
  const hasFilter = !!(dFrom || dTo || fSup || fParty)
  const clearFilters = () => { setDFrom(''); setDTo(''); setFSup(''); setFParty('') }

  async function post(id: string) {
    setMsg('')
    const r = await postInvoice(id)
    if (!r.ok) { setMsg('⚠ ' + (r.error || 'Ошибка')); return }
    setMsg(`✅ Накладная ${r.number} проведена`)
    onReload(); loadDocs()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>{title}</div>
        <button onClick={() => setCreating(true)} style={{ padding: '8px 16px', border: 'none', borderRadius: 9, background: COLORS.primary, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          + Создать {kind === 'in' ? 'приход' : 'расход'}
        </button>
      </div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 16 }}>
        Из экрана «К учёту»: {kind === 'in' ? 'закуп (ЗП) и возвраты → приход на склад' : 'продажи → списание со склада'}. Либо «+ Создать» — накладная напрямую.
      </div>
      {msg && <div style={{ fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>К ПРОВЕДЕНИЮ ({pending.length})</div>
      {pending.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc', color: COLORS.textMuted, fontSize: 14, marginBottom: 20 }}>Нет карточек к проведению</div>
        : <div style={{ marginBottom: 20 }}>{pending.map(o => (
          <OrderCard key={o.id} order={o} onOpen={onOpen} onAction={(id) => post(id)}
            actions={[{ action: 'invoice', label: kind === 'in' ? 'Провести приход' : 'Провести расход', variant: 'primary' }]} />
        ))}</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>ПРОВЕДЁННЫЕ НАКЛАДНЫЕ ({filteredDocs.length}{hasFilter ? ` из ${docs.length}` : ''})</div>

      {/* Фильтр: дата (с/по) · поставщик · заказчик/покупатель — тот же порядок на приходе и расходе */}
      {docs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', padding: '10px 14px', marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#5f5952', display: 'flex', flexDirection: 'column', gap: 3 }}>Дата с
            <input type="date" value={dFrom} max={dTo || undefined} onChange={e => setDFrom(e.target.value)} style={fInp} /></label>
          <label style={{ fontSize: 11, color: '#5f5952', display: 'flex', flexDirection: 'column', gap: 3 }}>по
            <input type="date" value={dTo} min={dFrom || undefined} onChange={e => setDTo(e.target.value)} style={fInp} /></label>
          <label style={{ fontSize: 11, color: '#5f5952', display: 'flex', flexDirection: 'column', gap: 3 }}>Поставщик
            <select value={fSup} onChange={e => setFSup(e.target.value)} style={{ ...fInp, minWidth: 180 }}>
              <option value="">— все —</option>
              {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select></label>
          <label style={{ fontSize: 11, color: '#5f5952', display: 'flex', flexDirection: 'column', gap: 3 }}>{partyLabel}
            <select value={fParty} onChange={e => setFParty(e.target.value)} style={{ ...fInp, minWidth: 180 }}>
              <option value="">— все —</option>
              {parties.map(s => <option key={s} value={s}>{s}</option>)}
            </select></label>
          {hasFilter && <button onClick={clearFilters} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#5f5952' }}>✕ Сбросить</button>}
        </div>
      )}

      {docs.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14, padding: 12 }}>Пока нет</div>
        : filteredDocs.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc', color: COLORS.textMuted, fontSize: 14 }}>По фильтру ничего не найдено. <button onClick={clearFilters} style={{ border: 'none', background: 'none', color: COLORS.primary, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, textDecoration: 'underline', padding: 0 }}>Сбросить</button></div>
        : (
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{(kind === 'in' ? ['Номер', 'Дата', 'Поставщик', 'Заказчик', 'Сумма', 'Статус'] : ['Номер', 'Дата', 'Покупатель', 'Поставщик', 'Себест.', 'Сумма', 'Статус']).map((h, i) => <th key={h} style={{ textAlign: i >= 4 ? 'right' : 'left', padding: '8px 16px' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredDocs.map(d => {
                  const notReviewed = d.status !== 'cancelled' && !d.reviewed
                  return (
                  <tr key={d.id} onClick={() => setOpenDocId(d.id)} style={{ borderTop: '1px solid #f1efec', cursor: 'pointer', background: d.transit ? '#fff4ea' : notReviewed ? '#fff8e1' : 'transparent' }} title={d.transit ? 'Сквозная — товар мимо склада' : notReviewed ? 'Не проверено — откройте и проверьте цены/кол-во' : ''}>
                    <td style={{ padding: '8px 16px', fontWeight: 600, color: COLORS.primary }}>{d.number} {d.transit && <span style={{ fontSize: 11, fontWeight: 700, color: '#c2570f', background: '#ffe8d6', padding: '1px 7px', borderRadius: 20 }}>🔀 сквозная</span>}</td>
                    <td style={{ padding: '8px 16px', color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{fmtDMY(d.date)}</td>
                    <td style={{ padding: '8px 16px' }}>{d.contragent || '—'}</td>
                    {/* Приход: заказчик (для кого закупали). Расход: поставщик (у кого этот товар куплен). */}
                    <td style={{ padding: '8px 16px' }} title={kind === 'in' ? 'Заказчик (конечный клиент) из карточки-основания — для кого / на кого долг' : 'Поставщик проданного товара — из связанного закупа'}>{(kind === 'in' ? d.customer : (d as any).supplier) || '—'}</td>
                    {kind === 'out' && <td style={{ padding: '8px 16px', textAlign: 'right', color: COLORS.textMuted }} title="Себестоимость = Σ(кол-во × приходная цена)">{fmtMoney(Number(d.cost || 0))} ₸</td>}
                    <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(Number(d.total))} ₸</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {d.status === 'cancelled' ? <span style={{ color: '#b03020' }}>отменён</span>
                        : notReviewed ? <span style={{ color: '#8a6f00', fontWeight: 700 }}>⚠ не проверено</span>
                        : <span style={{ color: '#2e8a5e' }}>✓ проверено</span>}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}

      {openDocId && <InvoiceForm id={openDocId} onClose={() => setOpenDocId(null)} onSaved={loadDocs} />}
      {creating && <InvoiceForm createKind={kind === 'in' ? 'purchase' : 'sale'} orgId={orgId} onClose={() => setCreating(false)} onSaved={() => { loadDocs(); setMsg('✅ Накладная создана') }} />}
    </div>
  )
}

const fInp: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: '#26231f', outline: 'none', boxSizing: 'border-box' }
