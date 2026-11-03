'use client'
// Прямой заказ (админ, стол приёмки): заявка собирается в 4 шага и сразу уходит логисту,
// минуя «В ожидании» и «Отправить в исходящие». Карточка живёт ЗАКУПОМ ЗКП-0001-DDMMYY
// (логист закупает и везёт на Центр-Склад), после прихода станет продажей ПРД.
// Шаги: клиент → каталог → кол-во/цена → поставщик (логист подставлен по умолчанию).
import { useEffect, useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'
import StoreCatalog from '@/components/StoreCatalog'
import { type PickedPos } from '@/components/NomPicker'
import ContragentPicker from '@/components/ContragentPicker'
import { fetchRefs } from '@/lib/api/refs'
import { fetchUsers } from '@/lib/adminApi'
import { createOrder } from '@/lib/api/orders'
import { lineAmount, isIzdelie } from '@/lib/lineAmount'

const DEFAULT_LOGIST = 'бауыржан'   // логист по умолчанию, пока владелец не поменяет
const num = (s: any) => Number(String(s ?? '').replace(',', '.')) || 0
const money = (n: number) => Math.round(n).toLocaleString('ru-RU')
const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }

type Row = { key: string; productId?: string; name1c: string; qty: string; unit: string; widthCm?: string; price: string; supplierId: string }

export default function DirectOrderWizard({ orgId, onClose, onCreated }: { orgId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep] = useState<'client' | 'items'>('client')
  const [cags, setCags] = useState<any[]>([])
  const [logists, setLogists] = useState<any[]>([])
  const [contactId, setContactId] = useState('')
  const [logistId, setLogistId] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [showCatalog, setShowCatalog] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { fetchRefs(orgId).then((r: any) => setCags((r.contragents || []).filter((c: any) => !c.archived))) }, [orgId])
  useEffect(() => {
    fetchUsers().then((us: any[]) => {
      const mine = us.filter(u => u.role === 'logist' && u.orgId === orgId && u.active !== false)
      setLogists(mine)
      const def = mine.find(u => (u.name || '').toLowerCase().includes(DEFAULT_LOGIST)) || mine[0]
      if (def) setLogistId(def.id)
    })
  }, [orgId])

  const client = cags.find(c => c.id === contactId)
  const total = useMemo(() => rows.reduce((s, r) => s + lineAmount({ name: r.name1c, qty: num(r.qty), price: num(r.price), widthCm: r.widthCm }), 0), [rows])

  // Шаг 1 → шаг 2: выбрали клиента, сразу открываем каталог.
  function pickClient(c: any) {
    if (!c?.id) return
    setContactId(c.id); setStep('items'); setShowCatalog(true)
  }
  function addFromCatalog(items: PickedPos[]) {
    setShowCatalog(false)
    setRows(rs => [...rs, ...items.map((it, i) => ({
      key: `${Date.now()}-${i}`, productId: (it as any).productId, name1c: it.name1c,
      qty: String(it.qty || 1), unit: it.unit || 'шт', widthCm: it.widthCm != null ? String(it.widthCm) : undefined,
      price: '', supplierId: '',
    }))])
  }
  const patch = (key: string, p: Partial<Row>) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...p } : r))
  const supplierAll = (sid: string) => sid && setRows(rs => rs.map(r => ({ ...r, supplierId: sid })))

  // Шаг 4: карточка-закуп сразу в Исходящие — логист закупает и везёт на Центр-Склад.
  async function makePurchase() {
    if (!contactId) { setErr('Выберите клиента'); return }
    const filled = rows.filter(r => (r.name1c || '').trim() && num(r.qty) > 0)
    if (!filled.length) { setErr('Добавьте позиции из каталога'); return }
    if (filled.some(r => !r.supplierId)) { setErr('У каждой позиции должен быть поставщик'); return }
    setBusy(true); setErr('')
    const r: any = await createOrder({
      orgId, kind: 'purchase', directOrder: true, source: 'admin_direct',
      contactId, fromName: client?.name || '', screen: 'outgoing', block: '',
      positions: filled.map(x => ({
        productId: x.productId || undefined, name1c: x.name1c, oral: x.name1c,
        qty: num(x.qty), unit: x.unit, widthCm: x.widthCm ? num(x.widthCm) : undefined,
        price: num(x.price), supplierId: x.supplierId, respUserId: logistId || undefined,
      })),
    } as any)
    setBusy(false)
    if (r?.id) onCreated(r.id); else setErr(r?.error || 'Не удалось создать заказ')
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 14px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="anim-pop" style={{ width: 880, maxWidth: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,.2)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${COLORS.borderLight}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 17 }}>📦 Прямой заказ</span>
          <span style={{ fontSize: 12, color: COLORS.textMuted }}>клиент → каталог → кол-во → поставщик → сразу логисту</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Шаг 1 — клиент */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, marginBottom: 5, letterSpacing: '.03em' }}>1. КЛИЕНТ</div>
            {step === 'client' || !client
              ? <ContragentPicker contragents={cags} value={contactId} onPick={pickClient} placeholder="— найдите клиента —" />
              : <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>👤 {client.name}</span>
                  <button onClick={() => setStep('client')} style={{ border: `1.5px solid ${COLORS.border}`, background: '#fff', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: COLORS.textMuted }}>сменить</button>
                </div>}
          </div>

          {step === 'items' && (
            <>
              {/* Шаги 2–3 — каталог и количество, 4 — поставщик */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: '.03em' }}>2–3. ТОВАРЫ И КОЛИЧЕСТВО</span>
                  <button onClick={() => setShowCatalog(true)} style={{ border: 'none', background: COLORS.primary, color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>📖 Каталог</button>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: COLORS.textMuted }}>4. ПОСТАВЩИК КО ВСЕМ:</span>
                  <select onChange={e => supplierAll(e.target.value)} defaultValue="" style={{ ...inp, width: 230, fontSize: 13 }}>
                    <option value="">— выбрать —</option>
                    {cags.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {rows.length === 0
                  ? <div style={{ padding: 22, textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5, background: COLORS.bg, borderRadius: 10 }}>Пока пусто — откройте каталог</div>
                  : (
                    <div style={{ border: `1px solid ${COLORS.borderLight}`, borderRadius: 10, overflow: 'hidden' }}>
                      {rows.map(r => (
                        <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: `1px solid ${COLORS.borderLight}` }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name1c}{r.widthCm ? ` · ${r.widthCm} см` : ''}</span>
                          <input value={r.qty} inputMode="decimal" onChange={e => patch(r.key, { qty: e.target.value.replace(/[^0-9.,]/g, '') })} title="Количество" style={{ ...inp, width: 78, textAlign: 'center' }} />
                          <span style={{ fontSize: 12, color: COLORS.textMuted, width: 26 }}>{r.unit}</span>
                          <input value={r.price} inputMode="decimal" placeholder={isIzdelie(r.name1c) ? '₸/см' : '₸'} onChange={e => patch(r.key, { price: e.target.value.replace(/[^0-9.,]/g, '') })} title="Цена закупа" style={{ ...inp, width: 92, textAlign: 'right' }} />
                          <select value={r.supplierId} onChange={e => patch(r.key, { supplierId: e.target.value })} title="Поставщик" style={{ ...inp, width: 210, fontSize: 13 }}>
                            <option value="">— поставщик —</option>
                            {cags.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <button onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} title="Убрать" style={{ border: 'none', background: 'none', color: COLORS.primaryDark, cursor: 'pointer', fontSize: 15 }}>🗑</button>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: COLORS.textMuted }}>Логист</span>
                <select value={logistId} onChange={e => setLogistId(e.target.value)} style={{ ...inp, width: 200, fontSize: 13 }}>
                  {logists.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: COLORS.textMuted }}>Итого закупа <b style={{ color: COLORS.text, fontSize: 16 }}>{money(total)} ₸</b></span>
              </div>

              {err && <div style={{ color: '#b3261e', fontSize: 13, fontWeight: 600 }}>⚠ {err}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button disabled={busy} onClick={makePurchase} style={{ flex: 1, border: 'none', background: busy ? COLORS.border : COLORS.primary, color: '#fff', borderRadius: 11, padding: '14px', cursor: busy ? 'default' : 'pointer', fontSize: 15.5, fontWeight: 800, fontFamily: 'inherit' }}>{busy ? '…' : '📦 Сделать закуп → логисту'}</button>
                <button onClick={onClose} style={{ border: `1.5px solid ${COLORS.border}`, background: '#fff', color: COLORS.textMuted, borderRadius: 11, padding: '14px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>Отмена</button>
              </div>
            </>
          )}
        </div>
      </div>
      {showCatalog && <StoreCatalog orgId={orgId} onPick={addFromCatalog} onClose={() => setShowCatalog(false)} />}
    </div>
  )
}
