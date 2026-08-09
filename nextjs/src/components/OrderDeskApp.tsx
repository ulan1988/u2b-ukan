'use client'
// Единый «внешний» заказ-кабинет: для контрагентов без своего кабинета.
// Оператор выбирает ОТ КОГО (контрагент из справочника) → добавляет товары → отправляет.
// Карточка падает во Входящие (source cabinet), дальше идёт обычным маршрутом, история пишется.
import { useEffect, useState, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import NomInline from '@/components/NomInline'
import ContragentPicker from '@/components/ContragentPicker'
import { fetchRefs } from '@/lib/api/refs'
import { settings as fetchSettings } from '@/lib/api/refs'
import { createOrder } from '@/lib/api/orders'
import { logout } from '@/lib/api/auth'

const DARK = '#211f1c', PRIMARY = '#d4613a'
const inp: React.CSSProperties = { width: '100%', padding: '11px 14px', borderRadius: 9, fontSize: 15, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 5, display: 'block', letterSpacing: '.04em' }
const emptyRow = () => ({ productId: '', name1c: '', unit: 'шт', qty: '1' })

export default function OrderDeskApp({ user }: { user: { id: string; name: string; orgId: string } }) {
  const [contragents, setContragents] = useState<any[]>([])
  const [defaultCagId, setDefaultCagId] = useState('')
  const [products, setProducts] = useState<any[]>([])
  const [cagId, setCagId] = useState('')
  const [rows, setRows] = useState<any[]>([emptyRow()])
  const [phone, setPhone] = useState(''); const [deadline, setDeadline] = useState(''); const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false); const [toast, setToast] = useState(''); const [sentToday, setSentToday] = useState<string[]>([])

  useEffect(() => {
    fetchRefs().then((r: any) => {
      const inOrg = (x: any) => !x.orgId || x.orgId === user.orgId
      setContragents((r.contragents || []).filter(inOrg))
      setProducts(r.products || [])
    })
    fetchSettings(user.orgId).then((s: any) => setDefaultCagId(s.defaultContragentId || ''))
  }, [user.orgId])

  const show = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 2500) }, [])
  const cag = contragents.find(c => c.id === cagId)
  const setRow = (i: number, patch: any) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  const addRow = () => setRows(rs => [...rs, emptyRow()])
  const delRow = (i: number) => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)
  const validRows = rows.filter(r => (r.name1c || '').trim() && Number(r.qty) > 0)

  async function submit() {
    if (!cagId) { show('Выберите — от кого заказ'); return }
    if (!validRows.length) { show('Добавьте хотя бы один товар'); return }
    setBusy(true)
    const r: any = await createOrder({
      orgId: user.orgId, kind: 'sale', source: 'cabinet',
      contactId: cagId, fromName: cag?.name || '',
      phone: phone || undefined, deadline: deadline || undefined, comment,
      positions: validRows.map(x => ({ productId: x.productId || undefined, name1c: x.name1c, oral: x.name1c, qty: Number(x.qty), unit: x.unit || 'шт', price: 0 })),
    })
    setBusy(false)
    if (r.id || r.ok !== false) {
      show(`✓ Заказ от «${cag?.name}» отправлен`)
      setSentToday(s => [`${cag?.name} · ${validRows.length} поз.`, ...s].slice(0, 20))
      setCagId(''); setRows([emptyRow()]); setPhone(''); setDeadline(''); setComment('')
    } else show('⚠ ' + (r.error || 'Ошибка отправки'))
  }

  return (
    <div style={{ background: '#dedbd6', minHeight: '100vh', fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: DARK, color: '#fff', padding: '11px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999 }}>{toast}</div>}

      <div style={{ background: DARK, padding: '14px 18px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="U2B" style={{ width: 40, height: 40, borderRadius: 9 }} />
            <div><div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>U2B · Приём заказов</div><div style={{ color: '#8c857a', fontSize: 12 }}>{user.name}</div></div>
          </div>
          <button onClick={async () => { await logout(); location.href = '/login' }} style={{ background: '#322f2b', border: 'none', borderRadius: 7, padding: '6px 12px', color: '#cfc9c0', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Выйти</button>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 14px 40px' }}>
        {/* ОТ КОГО */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          <label style={lbl}>ОТ КОГО (КОНТРАГЕНТ) *</label>
          <ContragentPicker contragents={contragents} value={cagId} defaultId={defaultCagId} onPick={c => setCagId(c.id)} placeholder="— выберите контрагента —" style={{ fontSize: 15 }} />
          {cag && <div style={{ marginTop: 8, fontSize: 13, color: '#2e8a5e', fontWeight: 600 }}>✓ Заказ для: {cag.name}</div>}
        </div>

        {/* ТОВАРЫ */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Товары</div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <NomInline products={products} value={r.productId} onPick={p => setRow(i, { productId: p.id, name1c: p.name, unit: p.unit || 'шт' })} />
                {!r.productId && <input style={{ ...inp, marginTop: 6, padding: '8px 10px', fontSize: 13 }} placeholder="или впишите вручную…" value={r.name1c} onChange={e => setRow(i, { name1c: e.target.value })} />}
              </div>
              <input type="number" inputMode="decimal" style={{ ...inp, width: 70, padding: '10px 8px', textAlign: 'center' }} value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} />
              <button onClick={() => delRow(i)} style={{ padding: '10px 12px', border: '1.5px solid #f0d3c8', borderRadius: 8, background: '#fff', color: '#b03020', cursor: 'pointer', fontSize: 15 }}>×</button>
            </div>
          ))}
          <button onClick={addRow} style={{ width: '100%', padding: '10px', border: '2px dashed #d8d3cc', borderRadius: 9, background: 'none', cursor: 'pointer', fontSize: 14, color: '#5f5952', fontFamily: 'inherit', fontWeight: 600 }}>＋ Добавить товар</button>
        </div>

        {/* ДОП. ПОЛЯ */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 0 0 1.5px #e6e2dc', display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}><label style={lbl}>ТЕЛЕФОН</label><input style={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="—" /></div>
            <div style={{ flex: '1 1 160px' }}><label style={lbl}>СРОК</label><input type="date" style={inp} value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
          </div>
          <div><label style={lbl}>КОММЕНТАРИЙ</label><textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={comment} onChange={e => setComment(e.target.value)} placeholder="Пожелания, детали…" /></div>
        </div>

        <button onClick={submit} disabled={busy} style={{ width: '100%', padding: '15px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>{busy ? 'Отправка…' : 'ОТПРАВИТЬ ЗАКАЗ →'}</button>

        {sentToday.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>ОТПРАВЛЕНО В ЭТОЙ СЕССИИ ({sentToday.length})</div>
            {sentToday.map((t, i) => <div key={i} style={{ background: '#fff', borderRadius: 9, padding: '9px 12px', marginBottom: 6, fontSize: 13, boxShadow: '0 0 0 1.5px #ece7e0' }}>✓ {t}</div>)}
          </div>
        )}
      </div>
    </div>
  )
}
