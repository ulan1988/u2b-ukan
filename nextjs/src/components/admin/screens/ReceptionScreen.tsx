'use client'
import { useEffect, useState } from 'react'
import OrderCard from '@/components/admin/OrderCard'
import { COLORS } from '@/lib/colors'
import { fetchRefs, fetchUsers, createOrder, assignLogist } from '@/lib/adminApi'
import { demandSummary, stage } from '@/lib/api/procurement'

const INP: React.CSSProperties = { width: '100%', padding: '9px 13px', borderRadius: 7, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', color: '#26231f' }
const LBL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }
const CENTER = '🏬 Центр-Склад'
const emptyPos = () => ({ productId: '', name1c: '', qty: '1', unit: 'шт', price: '', respUserId: '', supplierId: '' })

export default function ReceptionScreen({ orders, orgId, onAction, onReload, onOpen }: {
  orders: any[]; orgId: string; onAction: (id: string, a: string) => void; onReload: () => void; onOpen?: (o: any) => void
}) {
  const [products, setProducts] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [logists, setLogists] = useState<any[]>([])

  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'sale' | 'purchase'>('sale')
  const [contactId, setContactId] = useState('')
  const [phone, setPhone] = useState('')
  const [deadline, setDeadline] = useState('')
  const [comment, setComment] = useState('')
  const [rows, setRows] = useState<any[]>([emptyPos()])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchRefs().then(r => {
      const inOrg = (x: any) => !x.orgId || x.orgId === orgId
      setProducts(r.products || [])
      setClients((r.contragents || []).filter((c: any) => inOrg(c) && c.kind !== 'supplier'))
      setSuppliers((r.contragents || []).filter((c: any) => inOrg(c) && c.kind !== 'client'))
    })
    fetchUsers().then(us => setLogists(us.filter(u => u.role === 'logist' && u.orgId === orgId)))
  }, [orgId])

  function openForm(k: 'sale' | 'purchase') { setKind(k); setOpen(true); setRows([emptyPos()]) }
  const setRow = (i: number, patch: any) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  function pickProduct(i: number, pid: string) {
    const p = products.find(x => x.id === pid)
    setRow(i, { productId: pid, name1c: p?.name || '', unit: p?.unit || 'шт', price: p ? String(p.priceRetail) : '' })
  }
  const assignAllLogist = (uid: string) => uid && setRows(rs => rs.map(r => ({ ...r, respUserId: uid })))

  async function submit() {
    setBusy(true)
    const client = clients.find(c => c.id === contactId)
    const positions = rows.filter(r => r.productId).map(r => ({
      productId: r.productId, name1c: r.name1c, oral: r.name1c, qty: Number(r.qty) || 0, unit: r.unit,
      price: Number(r.price) || 0, respUserId: r.respUserId || undefined, supplierId: kind === 'purchase' ? (r.supplierId || undefined) : undefined,
    }))
    const body: any = { orgId, kind, screen: 'reception', block: 'processing', comment, phone, deadline: deadline || undefined, positions }
    if (kind === 'sale') { body.contactId = contactId || undefined; body.fromName = client?.name || '' }
    else body.fromName = 'Центр-Склад'
    const r = await createOrder(body)
    setBusy(false)
    if (r.ok) { setOpen(false); setContactId(''); setPhone(''); setDeadline(''); setComment(''); setRows([emptyPos()]); onReload() }
  }

  const processing = orders.filter(o => o.screen === 'reception' && o.block === 'processing' && !o.isCancelled)
  const waiting = orders.filter(o => o.screen === 'reception' && o.block !== 'processing' && !o.isCancelled)

  const purple = '#7a3aaa'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>Приёмка</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ label: 'В ожидании', val: waiting.length, bg: '#fff0ea', color: '#c0532a' }, { label: 'К приёму', val: processing.length, bg: '#fdf8e1', color: '#8a6f00' }].map(p => (
            <div key={p.label} style={{ background: p.bg, color: p.color, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700 }}>{p.label} {p.val}</div>
          ))}
        </div>
      </div>

      {/* Блок 0 — Автозакуп (сводка потребности) */}
      <AutoProcure orgId={orgId} onReload={onReload} />

      {/* Блок 1 — форма создания */}
      <div style={{ background: '#fff', borderRadius: 14, marginBottom: 20, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: open ? '1px solid #f1efec' : 'none' }}>
          {(['sale', 'purchase'] as const).map(k => {
            const active = open && kind === k
            const isP = k === 'purchase'
            return (
              <button key={k} onClick={() => (active ? setOpen(false) : openForm(k))}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, background: active ? (isP ? purple : COLORS.primary) : '#f6f3f0', color: active ? '#fff' : (isP ? purple : COLORS.primary), boxShadow: active ? 'none' : `inset 0 0 0 1.5px ${isP ? '#e3d4f0' : '#f0d9cd'}` }}>
                ＋ {isP ? 'Создать закуп' : 'Создать заказ'}
              </button>
            )
          })}
          {open && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: kind === 'purchase' ? purple : COLORS.primary }}>{kind === 'purchase' ? 'ЗАКУП · получатель Центр-Склад' : 'ПРОДАЖА'}</span>}
        </div>

        {open && (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={LBL}>{kind === 'purchase' ? 'ПОЛУЧАТЕЛЬ' : 'К КОМУ (КЛИЕНТ) *'}</label>
                {kind === 'purchase'
                  ? <input style={{ ...INP, background: '#f6f3f0', color: purple, fontWeight: 700 }} value={CENTER} disabled />
                  : <select style={INP} value={contactId} onChange={e => setContactId(e.target.value)}><option value="">— выберите клиента —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
              </div>
              <div><label style={LBL}>ТЕЛЕФОН</label><input style={INP} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 700 000 00 00" /></div>
              <div><label style={LBL}>СРОК</label><input style={INP} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={LBL}>КОММЕНТАРИЙ</label><textarea style={{ ...INP, minHeight: 56, resize: 'vertical' }} value={comment} onChange={e => setComment(e.target.value)} placeholder="Дополнительные пожелания..." /></div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', letterSpacing: '.04em' }}>ПОЗИЦИИ</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', background: '#f8f6f3', borderRadius: 8, padding: '5px 8px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>КО ВСЕМ:</span>
                <select style={{ ...INP, width: 160, padding: '6px 10px', fontSize: 13 }} value="" onChange={e => assignAllLogist(e.target.value)}>
                  <option value="">Логист →</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead><tr style={{ background: '#f1efec' }}>{['НАИМЕНОВАНИЕ', 'КОЛ-ВО', 'ЕД.', 'ЦЕНА (ТГ)', 'ЛОГИСТ', ...(kind === 'purchase' ? ['ПОСТАВЩИК'] : []), ''].map(h => <th key={h} style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1efec' }}>
                      <td style={{ padding: '6px 4px', minWidth: 200 }}><select style={INP} value={r.productId} onChange={e => pickProduct(i, e.target.value)}><option value="">— товар —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                      <td style={{ padding: '6px 4px', width: 80 }}><input style={INP} type="number" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 60 }}><input style={INP} value={r.unit} onChange={e => setRow(i, { unit: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 100 }}><input style={INP} type="number" value={r.price} onChange={e => setRow(i, { price: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 150 }}><select style={INP} value={r.respUserId} onChange={e => setRow(i, { respUserId: e.target.value })}><option value="">—</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></td>
                      {kind === 'purchase' && <td style={{ padding: '6px 4px', width: 150 }}><select style={INP} value={r.supplierId} onChange={e => setRow(i, { supplierId: e.target.value })}><option value="">—</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>}
                      <td style={{ padding: '6px 4px', width: 34 }}><button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b0a99f', fontSize: 18 }}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setRows(rs => [...rs, emptyPos()])} style={{ marginTop: 8, background: 'none', border: 'none', color: COLORS.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>＋ позиция</button>

            <div style={{ marginTop: 16 }}>
              <button disabled={busy || (kind === 'sale' && !contactId)} onClick={submit}
                style={{ padding: '11px 22px', background: kind === 'purchase' ? purple : COLORS.primary, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: busy || (kind === 'sale' && !contactId) ? 0.5 : 1 }}>
                {busy ? 'Создание…' : kind === 'purchase' ? 'Создать закуп' : 'Создать заказ'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Стол приёмки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>СТОЛ ПРИЁМКИ ({processing.length})</div>
          {processing.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14, padding: 20 }}>Пусто</div>
            : processing.map(o => {
              const noLogist = (o.positions || []).some((p: any) => !p.respUserId)
              return (
                <div key={o.id}>
                  {noLogist && (
                    <div style={{ background: '#faf8f6', borderRadius: '10px 10px 0 0', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #efece8', borderBottom: 'none' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>ЛОГИСТ:</span>
                      <select style={{ ...INP, padding: '5px 8px', fontSize: 13 }} value="" onChange={async e => { if (e.target.value) { await assignLogist(o.id, e.target.value); onReload() } }}>
                        <option value="">Назначить →</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}
                  <OrderCard order={o} actions={[{ action: 'process', label: 'В работу', variant: 'primary' }, { action: 'cancel', label: 'Отмена', variant: 'danger' }]} onAction={onAction} onOpen={onOpen} />
                </div>
              )
            })}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>ОЖИДАНИЕ ({waiting.length})</div>
          {waiting.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14, padding: 20 }}>Пусто</div>
            : waiting.map(o => <OrderCard key={o.id} order={o} actions={[{ action: 'take', label: 'Взять в обработку', variant: 'primary' }]} onAction={onAction} onOpen={onOpen} />)}
        </div>
      </div>
    </div>
  )
}

// ─── Автозакуп: сводка потребности новых продаж по товару ──────────────────────
function AutoProcure({ orgId, onReload }: { orgId: string; onReload: () => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() { if (orgId) setRows(await demandSummary(orgId) as any) }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line

  const chosen = rows.filter(r => checked[r.name])
  async function toBuy() {
    if (!chosen.length) return
    setBusy(true); setMsg('')
    const r = await stage(chosen)
    setBusy(false)
    if (r.ok) { setMsg(`✅ В закуп: ${r.data.added} тов. (черновик ${r.data.draftId})`); setChecked({}); load(); onReload() }
    else setMsg('⚠ ' + (r.error || 'Ошибка'))
  }

  if (rows.length === 0) return null
  return (
    <div style={{ background: '#fff', borderRadius: 14, marginBottom: 20, boxShadow: '0 0 0 1.5px #e3d4f0', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, background: '#faf7ff', borderBottom: '1px solid #f0eaf7' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#7a3aaa' }}>🛒 Автозакуп — потребность ({rows.length})</span>
        <button onClick={toBuy} disabled={busy || chosen.length === 0} style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, border: 'none', background: chosen.length ? '#7a3aaa' : '#e9e0f2', color: chosen.length ? '#fff' : '#b09fc4', fontWeight: 700, fontSize: 13, cursor: chosen.length ? 'pointer' : 'default', fontFamily: 'inherit' }}>
          {busy ? '…' : `В закуп (${chosen.length})`}
        </button>
        {msg && <span style={{ fontSize: 12, color: '#5f5952' }}>{msg}</span>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f8f6f3', color: '#5f5952', fontSize: 11 }}>{['', 'Товар', 'Нужно', 'Ед.', 'Заявки'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px' }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} style={{ borderTop: '1px solid #f1efec' }}>
                <td style={{ padding: '8px 12px' }}><input type="checkbox" checked={!!checked[r.name]} onChange={e => setChecked(c => ({ ...c, [r.name]: e.target.checked }))} /></td>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: '8px 12px', fontWeight: 700 }}>{r.total}</td>
                <td style={{ padding: '8px 12px', color: '#5f5952' }}>{r.unit}</td>
                <td style={{ padding: '8px 12px', color: '#5f5952', fontSize: 12 }}>{r.rows.map((x: any) => `${x.from} (${x.qty})`).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
