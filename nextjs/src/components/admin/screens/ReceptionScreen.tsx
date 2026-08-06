'use client'
import { useEffect, useState } from 'react'
import NomInline from '@/components/NomInline'
import NomPicker, { type PickedPos } from '@/components/NomPicker'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDate, isPurchase, sourceStyle, sourceLabel, statusStyle } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'
import { fetchRefs, fetchUsers, createOrder, assignLogist, updatePosition, addPosition, deletePosition, updateCard } from '@/lib/adminApi'
import { demandSummary, stage } from '@/lib/api/procurement'
import { autoPrices, settings as fetchSettings, createProject, createSpecProject } from '@/lib/api/refs'

const INP: React.CSSProperties = { width: '100%', padding: '9px 13px', borderRadius: 7, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', color: '#26231f' }
const inpSm: React.CSSProperties = { ...INP, padding: '6px 8px', fontSize: 13 }
const LBL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }
const CENTER = '🏬 Центр-Склад'
const PAY = ['', 'Оплачено', 'Не оплачено', 'Частично']
const purple = '#7a3aaa'
const emptyPos = () => ({ productId: '', name1c: '', qty: '1', unit: 'шт', price: '', respUserId: '', supplierId: '', deadline: '', payment: '' })

function Btn({ onClick, children, variant, disabled, style }: { onClick: () => void; children: React.ReactNode; variant?: 'primary' | 'ghost'; disabled?: boolean; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
        background: variant === 'primary' ? (disabled ? '#e9e5e0' : COLORS.primary) : variant === 'ghost' ? 'transparent' : COLORS.white, color: variant === 'primary' ? (disabled ? '#a89f95' : '#fff') : COLORS.text,
        boxShadow: variant === 'primary' || variant === 'ghost' ? 'none' : '0 0 0 1.5px #d8d3cc', ...style }}>{children}</button>
  )
}

export default function ReceptionScreen({ orders, orgId, onAction, onReload, onOpen }: {
  orders: any[]; orgId: string; onAction: (id: string, a: string) => void; onReload: () => void; onOpen?: (o: any) => void
}) {
  const [products, setProducts] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [logists, setLogists] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [specs, setSpecs] = useState<any[]>([])
  const [flash, setFlash] = useState('')
  const toast = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 2000) }

  // Форма
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'sale' | 'purchase'>('sale')
  const [contactId, setContactId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [specId, setSpecId] = useState('')
  const [phone, setPhone] = useState('')
  const [deadline, setDeadline] = useState('')
  const [comment, setComment] = useState('')
  const [rows, setRows] = useState<any[]>([emptyPos()])
  const [showCatalog, setShowCatalog] = useState(false)
  const [busy, setBusy] = useState(false)

  function loadSettings() { fetchSettings(orgId).then((s: any) => { setProjects((s.projects || []).filter((p: any) => p.status === 'active')); setSpecs((s.specProjects || []).filter((p: any) => p.status === 'active')) }) }
  useEffect(() => {
    fetchRefs().then((r: any) => {
      const inOrg = (x: any) => !x.orgId || x.orgId === orgId
      setProducts(r.products || [])
      setClients((r.contragents || []).filter((c: any) => inOrg(c) && c.kind !== 'supplier'))
      setSuppliers((r.contragents || []).filter((c: any) => inOrg(c) && c.kind !== 'client'))
    })
    fetchUsers().then((us: any[]) => setLogists(us.filter(u => u.role === 'logist' && u.orgId === orgId)))
    loadSettings()
  }, [orgId]) // eslint-disable-line

  function openForm(k: 'sale' | 'purchase') { setKind(k); setOpen(true); setRows([emptyPos()]) }
  const setRow = (i: number, patch: any) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  function pickProduct(i: number, p: any) { setRow(i, { productId: p.id, name1c: p.name, unit: p.unit || 'шт', price: p.priceRetail != null ? String(p.priceRetail) : '' }) }
  const assignAllLogist = (uid: string) => uid && setRows(rs => rs.map(r => ({ ...r, respUserId: uid })))
  const assignAllSupplier = (sid: string) => sid && setRows(rs => rs.map(r => ({ ...r, supplierId: sid })))

  async function pullPrices() {
    const ids = rows.map(r => r.productId).filter(Boolean)
    if (!ids.length) { toast('Нет товаров из 1С для цен'); return }
    const prices: any = await autoPrices(ids, kind === 'sale' ? (contactId || undefined) : undefined)
    setRows(rs => rs.map(r => (r.productId && prices[r.productId] != null ? { ...r, price: String(prices[r.productId]) } : r)))
    toast('Цены подтянуты')
  }
  function addFromCatalog(items: PickedPos[]) {
    setRows(rs => [...rs.filter(r => r.name1c || r.productId), ...items.map(it => ({ ...emptyPos(), name1c: it.name1c, qty: String(it.qty), unit: it.unit }))])
    setShowCatalog(false)
  }
  async function newProject() { const name = window.prompt('Название проекта'); if (!name) return; const r: any = await createProject({ orgId, name }); if (r.ok || r.id) { loadSettings(); toast('Проект создан') } }
  async function newSpec() { const name = window.prompt('Название спецпроекта'); if (!name) return; const r: any = await createSpecProject({ orgId, name }); if (r.ok || r.id) { loadSettings(); toast('Спецпроект создан') } }

  async function submit(asDraft: boolean) {
    setBusy(true)
    const client = clients.find(c => c.id === contactId)
    const positions = rows.filter(r => r.name1c || r.productId).map(r => ({
      productId: r.productId || undefined, name1c: r.name1c, oral: r.name1c, qty: Number(r.qty) || 0, unit: r.unit,
      price: Number(r.price) || 0, respUserId: r.respUserId || undefined, supplierId: kind === 'purchase' ? (r.supplierId || undefined) : undefined,
      deadline: r.deadline || undefined, payment: r.payment || '',
    }))
    const body: any = {
      orgId, kind, comment, phone, deadline: deadline || undefined, positions,
      projectId: projectId || undefined, specProjectId: specId || undefined,
      screen: asDraft ? 'incoming' : 'reception', block: asDraft ? '' : 'processing', isDraft: asDraft,
    }
    if (kind === 'sale') { body.contactId = contactId || undefined; body.fromName = client?.name || '' }
    else body.fromName = 'Центр-Склад'
    const r: any = await createOrder(body)
    setBusy(false)
    if (r.id || r.ok) { setOpen(false); setContactId(''); setProjectId(''); setSpecId(''); setPhone(''); setDeadline(''); setComment(''); setRows([emptyPos()]); onReload(); toast(asDraft ? 'Черновик сохранён' : 'Отправлено') }
  }

  const waiting = orders.filter(o => o.screen === 'reception' && o.block !== 'processing' && !o.isCancelled)
  const processing = orders.filter(o => o.screen === 'reception' && o.block === 'processing' && !o.isCancelled)
  const purchaseDrafts = orders.filter(o => o.isDraft && isPurchase(o) && !o.isCancelled)
  const saleDrafts = orders.filter(o => o.isDraft && !isPurchase(o) && !o.isCancelled)
  const changed = orders.filter(o => o.isChanged && !o.isCancelled)
  const allDrafts = orders.filter(o => o.isDraft && !o.isCancelled)

  const counters = [
    { label: 'В ожидании', val: waiting.length, bg: '#fff0ea', color: '#c0532a' },
    { label: 'К приёму', val: processing.length, bg: '#fdf8e1', color: '#8a6f00' },
    { label: 'Изменено', val: changed.length, bg: '#faeaea', color: '#b03020' },
    { label: 'Черновики', val: allDrafts.length, bg: '#efece8', color: '#6b655b' },
  ]

  return (
    <div className="anim-fade">
      {flash && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{flash}</div>}

      {/* Счётчики */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>Приёмка</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {counters.map(c => <div key={c.label} style={{ background: c.bg, color: c.color, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700 }}>{c.label} {c.val}</div>)}
        </div>
      </div>

      {/* Форма создания */}
      <div style={{ background: '#fff', borderRadius: 14, marginBottom: 20, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: open ? '1px solid #f1efec' : 'none' }}>
          {(['sale', 'purchase'] as const).map(k => {
            const active = open && kind === k; const isP = k === 'purchase'
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
              <div>
                <label style={LBL}>ПРОЕКТ</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select style={{ ...INP, flex: 1 }} value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">—</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  <button onClick={newProject} style={{ padding: '0 10px', borderRadius: 7, border: '1.5px solid #e6e2dc', background: '#f1efec', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>＋</button>
                </div>
              </div>
              <div>
                <label style={LBL}>СПЕЦПРОЕКТ</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select style={{ ...INP, flex: 1 }} value={specId} onChange={e => setSpecId(e.target.value)}><option value="">—</option>{specs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  <button onClick={newSpec} style={{ padding: '0 10px', borderRadius: 7, border: '1.5px solid #e6e2dc', background: '#f1efec', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>＋</button>
                </div>
              </div>
              <div><label style={LBL}>ТЕЛЕФОН</label><input style={INP} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 700 000 00 00" /></div>
              <div><label style={LBL}>СРОК</label><input style={INP} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={LBL}>КОММЕНТАРИЙ</label><textarea style={{ ...INP, minHeight: 56, resize: 'vertical' }} value={comment} onChange={e => setComment(e.target.value)} placeholder="Дополнительные пожелания..." /></div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#5f5952', letterSpacing: '.04em' }}>ПОЗИЦИИ</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', background: '#f8f6f3', borderRadius: 8, padding: '5px 8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#5f5952' }}>КО ВСЕМ:</span>
                <select style={{ ...inpSm, width: 150 }} value="" onChange={e => assignAllLogist(e.target.value)}><option value="">Логист →</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                {kind === 'purchase' && <select style={{ ...inpSm, width: 150 }} value="" onChange={e => assignAllSupplier(e.target.value)}><option value="">Поставщик →</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead><tr style={{ background: '#f1efec' }}>{['НАИМЕНОВАНИЕ', 'КОЛ-ВО', 'ЕД.', 'ЦЕНА (ТГ)', 'ЛОГИСТ', ...(kind === 'purchase' ? ['ПОСТАВЩИК'] : []), 'СРОК', 'ОПЛАТА', ''].map(h => <th key={h} style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1efec' }}>
                      <td style={{ padding: '6px 4px', minWidth: 220 }}><NomInline products={products} value={r.productId} onPick={p => pickProduct(i, p)} /></td>
                      <td style={{ padding: '6px 4px', width: 70 }}><input style={inpSm} type="number" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 56 }}><input style={inpSm} value={r.unit} onChange={e => setRow(i, { unit: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 100 }}><input style={{ ...inpSm, textAlign: 'right', fontWeight: 600 }} type="number" value={r.price} onChange={e => setRow(i, { price: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 130 }}><select style={inpSm} value={r.respUserId} onChange={e => setRow(i, { respUserId: e.target.value })}><option value="">—</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></td>
                      {kind === 'purchase' && <td style={{ padding: '6px 4px', width: 130 }}><select style={inpSm} value={r.supplierId} onChange={e => setRow(i, { supplierId: e.target.value })}><option value="">—</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>}
                      <td style={{ padding: '6px 4px', width: 120 }}><input style={inpSm} type="date" value={r.deadline} onChange={e => setRow(i, { deadline: e.target.value })} /></td>
                      <td style={{ padding: '6px 4px', width: 120 }}><select style={inpSm} value={r.payment} onChange={e => setRow(i, { payment: e.target.value })}>{PAY.map(p => <option key={p} value={p}>{p || '—'}</option>)}</select></td>
                      <td style={{ padding: '6px 4px', width: 60 }}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button onClick={() => setRows(rs => { const arr = [...rs]; arr.splice(i + 1, 0, { ...rs[i] }); return arr })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5f5952', fontSize: 15 }} title="Клонировать">📋</button>
                          <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b03020', fontSize: 15 }} title="Удалить">🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setRows(rs => [...rs, emptyPos()])} style={{ border: '1.5px dashed #d8d3cc', borderRadius: 7, padding: '6px 16px', background: 'none', cursor: 'pointer', fontSize: 13, color: '#5f5952', fontFamily: 'inherit' }}>＋ Добавить позицию</button>
              <button onClick={() => setShowCatalog(true)} style={{ border: 'none', borderRadius: 7, padding: '6px 16px', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>📖 Каталог</button>
              <button onClick={pullPrices} style={{ border: '1.5px solid #e6c9b8', borderRadius: 7, padding: '6px 16px', background: '#fff8f5', color: '#c0532a', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>💰 Подтянуть цены</button>
            </div>
            {showCatalog && <NomPicker onPick={addFromCatalog} onClose={() => setShowCatalog(false)} />}

            <div style={{ display: 'flex', gap: 10, paddingTop: 12, marginTop: 12, borderTop: '1px solid #f1efec' }}>
              <Btn onClick={() => submit(true)} disabled={busy}>Сохранить черновик</Btn>
              <Btn variant="primary" onClick={() => submit(false)} disabled={busy || (kind === 'sale' && !contactId)}>{kind === 'purchase' ? 'ОТПРАВИТЬ ЗАКУП →' : 'ОТПРАВИТЬ ЗАКАЗ →'}</Btn>
              <Btn variant="ghost" onClick={() => setOpen(false)} style={{ marginLeft: 'auto', color: '#5f5952' }}>Отмена</Btn>
            </div>
          </div>
        )}
      </div>

      {/* Автозакуп */}
      <AutoProcure orgId={orgId} onReload={onReload} toast={toast} />

      {/* Черновик закупа (накопитель) */}
      {purchaseDrafts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {purchaseDrafts.map(d => <PurchaseDraft key={d.id} draft={d} logists={logists} suppliers={suppliers} onAction={onAction} onReload={onReload} toast={toast} />)}
        </div>
      )}

      {/* Стол приёмки */}
      {processing.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>Стол приёмки <span style={{ fontSize: 13, background: '#fdf8e1', color: '#8a6f00', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{processing.length}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {processing.map(o => <ProcessingCard key={o.id} order={o} clients={clients} logists={logists} products={products} onAction={onAction} onReload={onReload} toast={toast} />)}
          </div>
        </div>
      )}

      {/* Ожидание */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>Ожидание <span style={{ fontSize: 13, background: '#fff0ea', color: '#c0532a', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{waiting.length}</span></div>
        {waiting.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14, padding: '16px 0' }}>Нет карточек в ожидании</div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
              {waiting.map(o => (
                <div key={o.id} style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: COLORS.primary }}>{o.id}</span>
                    {o.source && <span style={sourceStyle(o.source)}>{sourceLabel(o.source)}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5f5952' }}>{fmtDate(o.createdAt)}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{o.fromName} → {o.toName || '—'}</div>
                  {o.comment && <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{o.comment}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant="primary" onClick={() => onAction(o.id, 'take')} style={{ flex: 1 }}>ПРИНЯТЬ В ОБРАБОТКУ →</Btn>
                    <Btn onClick={() => onAction(o.id, 'returnToIncoming')}>← Вернуть</Btn>
                  </div>
                </div>
              ))}
            </div>}
      </div>

      {/* Черновики */}
      {saleDrafts.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>Черновики <span style={{ fontSize: 13, background: '#efece8', color: '#6b655b', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{saleDrafts.length}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {saleDrafts.map(o => (
              <div key={o.id} style={{ background: '#faf8f6', borderRadius: 12, padding: 16, border: '1.5px dashed #d8d3cc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: '#5f5952' }}>{o.id}</span>
                  <span style={statusStyle('Черновик')}>Черновик</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5f5952' }}>{fmtDate(o.createdAt)}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{o.fromName}</div>
                {o.comment && <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 10 }}>{o.comment.slice(0, 60)}...</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn onClick={() => onOpen?.(o)}>Доработать</Btn>
                  <Btn variant="primary" onClick={() => onAction(o.id, 'accept')}>Отправить</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Черновик закупа (накопитель) ─────────────────────────────────────────────
function PurchaseDraft({ draft, logists, suppliers, onAction, onReload, toast }: { draft: any; logists: any[]; suppliers: any[]; onAction: (id: string, a: string) => void; onReload: () => void; toast: (m: string) => void }) {
  const ps = draft.positions || []
  const ready = ps.length > 0 && ps.every((p: any) => p.respUserId && p.supplierId)
  const total = ps.reduce((s: number, p: any) => s + Number(p.price || 0) * Number(p.qty || 0), 0)
  async function upd(posId: string, patch: any) { await updatePosition(draft.id, posId, patch); onReload() }
  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e3d4f0', borderLeft: '4px solid #7a3aaa', overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#faf7fd', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: '#7a3aaa' }}>{draft.id}</span>
        <span style={{ fontSize: 12, fontWeight: 700, background: '#f3eeff', color: '#7a3aaa', padding: '2px 9px', borderRadius: 20 }}>🛒 ЧЕРНОВИК ЗАКУПА · {ps.length} поз.</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...inpSm, width: 150 }} value="" onChange={e => { if (e.target.value) ps.forEach((p: any) => upd(p.id, { respUserId: e.target.value })) }}><option value="">Закупщик → всем</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select style={{ ...inpSm, width: 150 }} value="" onChange={e => { if (e.target.value) ps.forEach((p: any) => upd(p.id, { supplierId: e.target.value })) }}><option value="">Поставщик → всем</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <Btn variant="primary" disabled={!ready} onClick={() => onAction(draft.id, 'finalizePurchase')}>✓ Оформить закуп →</Btn>
        </div>
      </div>
      <div style={{ padding: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr style={{ background: '#f1efec' }}>{['НАИМЕНОВАНИЕ', 'КОЛ-ВО', 'ЦЕНА (ПРИХОД)', 'СУММА', 'ЗАКУПЩИК', 'ПОСТАВЩИК'].map(h => <th key={h} style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>
            {ps.map((pos: any) => (
              <tr key={pos.id} style={{ borderBottom: '1px solid #f1efec' }}>
                <td style={{ padding: '6px 8px', fontSize: 13, fontWeight: 500 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RalDot code={extractRal(pos.name1c || pos.oral || '')} size={12} />{pos.name1c || pos.oral}</span></td>
                <td style={{ padding: '6px 8px', width: 90 }}><input key={`${pos.id}-q-${pos.qty}`} type="number" defaultValue={Number(pos.qty)} style={{ ...inpSm, width: 78, textAlign: 'right' }} onBlur={e => { const q = Number(e.target.value) || 0; if (q !== Number(pos.qty)) upd(pos.id, { qty: q }) }} /> <span style={{ fontSize: 12, color: '#837c72' }}>{pos.unit}</span></td>
                <td style={{ padding: '6px 8px', width: 110 }}><input key={`${pos.id}-p-${pos.price}`} type="number" defaultValue={Number(pos.price) || ''} placeholder="0" style={{ ...inpSm, width: 96, textAlign: 'right', fontWeight: 600 }} onBlur={e => { const pr = Number(e.target.value) || 0; if (pr !== Number(pos.price)) upd(pos.id, { price: pr }) }} /></td>
                <td style={{ padding: '6px 8px', width: 100, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: '#7a3aaa' }}>{Number(pos.price) > 0 ? fmtMoney(Number(pos.price) * Number(pos.qty)) : '—'}</td>
                <td style={{ padding: '6px 8px', width: 150 }}><select style={inpSm} value={pos.respUserId || ''} onChange={e => upd(pos.id, { respUserId: e.target.value })}><option value="">—</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></td>
                <td style={{ padding: '6px 8px', width: 150 }}><select style={inpSm} value={pos.supplierId || ''} onChange={e => upd(pos.id, { supplierId: e.target.value })}><option value="">—</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, fontSize: 13 }}>
          <span style={{ color: '#5f5952' }}>Итого приход:&nbsp;</span><span style={{ fontWeight: 800, color: '#7a3aaa' }}>{fmtMoney(total)}</span>
        </div>
        {!ready && <div style={{ fontSize: 12, color: '#8a6f00', marginTop: 8 }}>Назначь логиста и поставщика всем позициям — тогда откроется «Оформить».</div>}
      </div>
    </div>
  )
}

// ─── Стол приёмки: карточка с инлайн-редактором позиций ───────────────────────
function ProcessingCard({ order, clients, logists, products, onAction, onReload, toast }: { order: any; clients: any[]; logists: any[]; products: any[]; onAction: (id: string, a: string) => void; onReload: () => void; toast: (m: string) => void }) {
  const [editing, setEditing] = useState<Record<string, any>>({})
  const ps = order.positions || []

  async function upd(posId: string, patch: any) { await updatePosition(order.id, posId, patch); onReload() }
  function startEdit(pos: any) { setEditing(e => ({ ...e, [pos.id]: { name1c: pos.name1c, qty: String(pos.qty), unit: pos.unit, price: String(pos.price), respUserId: pos.respUserId || '', deadline: pos.deadline ? String(pos.deadline).slice(0, 10) : '', payment: pos.payment || '' } })) }
  function cancelEdit(id: string) { setEditing(e => { const n = { ...e }; delete n[id]; return n }) }
  async function saveEdit(pos: any) {
    const ed = editing[pos.id]
    await updatePosition(order.id, pos.id, { name1c: ed.name1c, qty: Number(ed.qty) || 0, unit: ed.unit, price: Number(ed.price) || 0, respUserId: ed.respUserId || undefined, deadline: ed.deadline || null, payment: ed.payment })
    cancelEdit(pos.id); onReload()
  }
  async function clone(pos: any) { await addPosition(order.id, { name1c: pos.name1c, oral: pos.oral, qty: Number(pos.qty), unit: pos.unit, price: Number(pos.price), respUserId: pos.respUserId || undefined, supplierId: pos.supplierId || undefined }); onReload(); toast('Позиция клонирована') }
  async function del(pos: any) { await deletePosition(order.id, pos.id); onReload() }
  async function pullPrices() {
    const ids = ps.map((p: any) => p.productId).filter(Boolean)
    if (!ids.length) { toast('Нет товаров 1С для цен'); return }
    const prices: any = await autoPrices(ids, order.contactId || undefined)
    for (const p of ps) if (p.productId && prices[p.productId] != null) await updatePosition(order.id, p.id, { price: prices[p.productId] })
    onReload(); toast('Цены подтянуты')
  }
  async function send() {
    // Сначала сохраняем все открытые правки позиций (как в Улкане), потом валидация.
    for (const pos of ps) { if (editing[pos.id]) await saveEdit(pos) }
    const eff = (p: any) => editing[p.id] || {}
    if (ps.some((p: any) => !((eff(p).name1c ?? p.name1c) || '').trim())) { toast('⚠️ Заполните НАИМ. 1С у всех позиций'); return }
    if (!order.contactId && order.kind === 'sale') { toast('Укажите получателя (Кому)'); return }
    if (ps.some((p: any) => !(eff(p).respUserId ?? p.respUserId))) { toast('Назначьте логиста всем позициям'); return }
    onAction(order.id, 'process')
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: '#faf8f6', borderBottom: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14, color: COLORS.primary }}>{order.id}</span>
        <span style={statusStyle(order.status)}>{order.status}</span>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{order.fromName} →</span>
        {order.kind === 'sale'
          ? <select value={order.contactId || ''} onChange={e => { updateCard(order.id, { contactId: e.target.value }).then(onReload) }} style={{ ...inpSm, minWidth: 140, width: 'auto' }}><option value="">К кому / куда</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          : <span style={{ fontSize: 13, color: purple, fontWeight: 700 }}>Центр-Склад</span>}
        {order.deadline && <span style={{ fontSize: 13, color: '#5f5952' }}>срок {fmtDate(order.deadline)}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...inpSm, width: 140 }} value="" onChange={e => { if (e.target.value) ps.forEach((p: any) => upd(p.id, { respUserId: e.target.value })) }}><option value="">Логист → всем</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <button onClick={pullPrices} style={{ border: '1.5px solid #e6c9b8', borderRadius: 7, padding: '5px 12px', background: '#fff8f5', color: '#c0532a', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>💰 Цены</button>
          <Btn onClick={() => onAction(order.id, 'returnToIncoming')}>← Вернуть</Btn>
          <Btn variant="primary" onClick={send}>ОТПРАВИТЬ В ИСХОДЯЩИЕ →</Btn>
        </div>
      </div>

      <div style={{ padding: '12px 16px', overflowX: 'auto' }}>
        {ps.length === 0 && <div style={{ background: '#fff8e1', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 14, color: '#8a6f00', fontWeight: 500 }}>💬 Со слов: {order.comment}</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead><tr style={{ background: '#f1efec' }}>{['СО СЛОВ', 'НАИМ. 1С', 'КОЛ-ВО', 'ЕД.', 'ЦЕНА', 'ЛОГИСТ', 'СРОК', 'ОПЛАТА', ''].map(h => <th key={h} style={{ padding: '7px 8px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>
            {ps.map((pos: any) => {
              const ed = editing[pos.id]; const isEd = !!ed
              return (
                <tr key={pos.id} style={{ borderBottom: '1px solid #f1efec', background: !(isEd ? ed.name1c : pos.name1c) ? '#fff5f0' : 'transparent', cursor: isEd ? 'default' : 'pointer' }} onClick={() => !isEd && startEdit(pos)}>
                  <td style={{ padding: '6px 8px' }}><div style={{ background: '#fff8e1', borderRadius: 6, padding: '4px 8px', fontSize: 13, color: '#8a6f00', minWidth: 80, cursor: 'default' }}>{pos.oral || '—'}</div></td>
                  <td style={{ padding: '6px 4px', minWidth: 170 }}>{isEd ? <NomInline products={products} value="" onPick={p => setEditing(e => ({ ...e, [pos.id]: { ...e[pos.id], name1c: p.name, unit: p.unit || e[pos.id].unit, price: p.priceRetail != null ? String(p.priceRetail) : e[pos.id].price } }))} /> : <span style={{ fontSize: 13 }}>{pos.name1c || <span style={{ color: '#837c72' }}>—</span>}</span>}{isEd && ed.name1c && <div style={{ fontSize: 12, color: '#5f5952', marginTop: 2 }}>{ed.name1c}</div>}</td>
                  <td style={{ padding: '6px 4px', width: 70 }}>{isEd ? <input style={{ ...inpSm, width: 60 }} type="number" value={ed.qty} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], qty: e.target.value } }))} /> : <span style={{ fontSize: 13 }}>{Number(pos.qty)}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 50 }}>{isEd ? <input style={{ ...inpSm, width: 44 }} value={ed.unit} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], unit: e.target.value } }))} /> : <span style={{ fontSize: 13 }}>{pos.unit}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 96, whiteSpace: 'nowrap' }}>{isEd ? <input style={{ ...inpSm, width: 84, textAlign: 'right' }} type="number" value={ed.price} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], price: e.target.value } }))} /> : <span style={{ fontSize: 13, fontWeight: 700, color: Number(pos.price) > 0 ? '#26231f' : '#837c72' }}>{Number(pos.price) > 0 ? fmtMoney(Number(pos.price)) : '—'}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 120 }}>{isEd ? <select style={{ ...inpSm, width: 112 }} value={ed.respUserId} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], respUserId: e.target.value } }))}><option value="">—</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select> : <span style={{ fontSize: 13 }}>{pos.resp || <span style={{ color: '#837c72' }}>—</span>}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 110 }}>{isEd ? <input style={{ ...inpSm, width: 100 }} type="date" value={ed.deadline} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], deadline: e.target.value } }))} /> : <span style={{ fontSize: 13 }}>{fmtDate(pos.deadline)}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 110 }}>{isEd ? <select style={{ ...inpSm, width: 100 }} value={ed.payment} onChange={e => setEditing(s => ({ ...s, [pos.id]: { ...s[pos.id], payment: e.target.value } }))}>{PAY.map(p => <option key={p} value={p}>{p || '—'}</option>)}</select> : <span style={{ fontSize: 13 }}>{pos.payment || <span style={{ color: '#837c72' }}>—</span>}</span>}</td>
                  <td style={{ padding: '6px 4px', width: 80 }}>
                    {isEd ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={e => { e.stopPropagation(); saveEdit(pos) }} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 13 }}>✓</button>
                        <button onClick={e => { e.stopPropagation(); cancelEdit(pos.id) }} style={{ padding: '4px 8px', borderRadius: 6, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`${pos.name1c || pos.oral} ${Number(pos.qty)} ${pos.unit}`); toast('Скопировано!') }} style={{ padding: '4px 7px', borderRadius: 6, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13 }} title="Копировать">📋</button>
                        <button onClick={e => { e.stopPropagation(); clone(pos) }} style={{ padding: '4px 7px', borderRadius: 6, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13 }} title="Клонировать">🔁</button>
                        <button onClick={e => { e.stopPropagation(); del(pos) }} style={{ padding: '4px 7px', borderRadius: 6, border: '1.5px solid #faeaea', background: '#fff', cursor: 'pointer', fontSize: 13 }}>🗑</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {ps.length === 0 && <div style={{ marginTop: 8, color: '#5f5952', fontSize: 13, fontStyle: 'italic' }}>Нажмите «Взять в обработку», чтобы распарсить комментарий в позиции</div>}
      </div>
    </div>
  )
}

// ─── Автозакуп: сводка потребности новых продаж по товару ─────────────────────
function AutoProcure({ orgId, onReload, toast }: { orgId: string; onReload: () => void; toast: (m: string) => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [openBlk, setOpenBlk] = useState(true)

  async function load() { if (orgId) setRows(await demandSummary(orgId) as any) }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line

  const chosen = rows.filter(r => checked[r.name])
  const needCards = new Set(rows.flatMap((r: any) => (r.rows || []).map((x: any) => x.cardId ?? x.from))).size
  async function toBuy() {
    const src = chosen.length ? chosen : rows
    if (!src.length) { toast('Нет товаров для закупа'); return }
    setBusy(true)
    const r: any = await stage(src)
    setBusy(false)
    if (r.ok) { toast(`В закуп: ${r.data?.added ?? src.length}`); setChecked({}); load(); onReload() }
    else toast('⚠ ' + (r.error || 'Ошибка'))
  }

  if (rows.length === 0) return null
  return (
    <div style={{ background: '#fff', borderRadius: 14, marginBottom: 20, boxShadow: '0 0 0 1.5px #e3d4f0', overflow: 'hidden' }}>
      <div onClick={() => setOpenBlk(v => !v)} style={{ padding: '13px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: '#faf7fd', borderBottom: openBlk ? '1px solid #f0eaf6' : 'none' }}>
        <span style={{ fontSize: 16 }}>🛒</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#7a3aaa' }}>Автозакуп</span>
        <span style={{ fontSize: 12, background: '#f3eeff', color: '#7a3aaa', padding: '2px 9px', borderRadius: 20, fontWeight: 700 }}>{rows.length} товаров · из {needCards} заявок</span>
        <span style={{ marginLeft: 'auto', fontSize: 16, color: '#7a3aaa', transform: openBlk ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>▸</span>
      </div>
      {openBlk && (
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {rows.map(r => {
              const on = !!checked[r.name]
              return (
                <div key={r.name} style={{ border: `1.5px solid ${on ? '#7a3aaa' : '#f0eaf6'}`, borderRadius: 10, padding: '10px 12px', background: on ? '#faf7fd' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={on} onChange={e => setChecked(c => ({ ...c, [r.name]: e.target.checked }))} style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#7a3aaa' }} />
                    <RalDot code={extractRal(r.name)} size={13} />
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#7a3aaa', whiteSpace: 'nowrap' }}>{r.total} {r.unit}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 44 }}>
                    {(r.rows || []).map((x: any, ri: number) => <span key={ri} style={{ fontSize: 12, background: '#f6f3f0', color: '#5f5952', padding: '2px 9px', borderRadius: 20 }}>{x.from}: <b style={{ color: '#211f1c' }}>{x.qty} {r.unit}</b></span>)}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={toBuy} disabled={busy} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: '#7a3aaa', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>🛒 В закуп {chosen.length ? `(${chosen.length})` : 'по всем'} →</button>
            {chosen.length > 0 && <button onClick={() => setChecked({})} style={{ padding: '10px 14px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', color: '#5f5952', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Сбросить</button>}
            <span style={{ fontSize: 12, color: '#837c72' }}>Товары уйдут в черновик закупа ниже. Оформишь его одной кнопкой.</span>
          </div>
        </div>
      )}
    </div>
  )
}
