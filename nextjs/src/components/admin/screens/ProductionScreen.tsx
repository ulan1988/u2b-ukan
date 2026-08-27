'use client'
// Производство (филиал-производитель): материалы (сырьё) → изделия. Вкладки:
// Заказы на производство · Материалы · Производство. Связь с головным — через накладные
// (приход материала / расход готового), автоматизированные статусами карточек.
import { useState, useEffect, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDate } from '@/lib/adminFmt'
import { fetchRefs, stockOverview } from '@/lib/api/refs'
import { listProduction, createProduction, getDocument } from '@/lib/api/docs'
import NomInline from '@/components/NomInline'

const TABS = [
  { key: 'orders', label: '📋 Заказы на производство', ready: false },
  { key: 'materials', label: '📦 Материалы', ready: true },
  { key: 'produce', label: '🛠️ Производство', ready: true },
] as const
type TabKey = typeof TABS[number]['key']

const INP: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const LBL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 6, display: 'block', letterSpacing: '.04em' }

export default function ProductionScreen({ orgId }: { orgId: string }) {
  const [tab, setTab] = useState<TabKey>('produce')
  const [products, setProducts] = useState<any[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [toast, setToast] = useState('')
  const showMsg = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  useEffect(() => {
    fetchRefs(orgId).then((r: any) => {
      setProducts(r.products || [])
      const wh = (r.warehouses || []).find((w: any) => w.orgId === orgId && w.isCentral) || (r.warehouses || []).find((w: any) => w.orgId === orgId)
      setWarehouseId(wh?.id || '')
    })
  }, [orgId])

  return (
    <div className="anim-fade">
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{toast}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>🛠️ Производство</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => t.ready && setTab(t.key)} disabled={!t.ready} title={t.ready ? '' : 'Скоро'}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: t.ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: tab === t.key ? COLORS.primary : '#fff', color: tab === t.key ? '#fff' : (t.ready ? COLORS.textMuted : '#b8b1a6'), boxShadow: tab === t.key ? 'none' : '0 0 0 1.5px #e6e2dc' }}>
              {t.label}{!t.ready && <span style={{ fontSize: 10, marginLeft: 5, opacity: .8 }}>скоро</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'orders' && <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted, background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc' }}>Заказы на производство — добавим на следующем шаге (карточки-заявки на изготовление изделий).</div>}
      {tab === 'materials' && <MaterialsTab orgId={orgId} />}
      {tab === 'produce' && <ProduceTab orgId={orgId} warehouseId={warehouseId} products={products} onMsg={showMsg} />}
    </div>
  )
}

// ─── Материалы: остатки сырья на складе производителя ──────────────────────────
function MaterialsTab({ orgId }: { orgId: string }) {
  const [stock, setStock] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const load = useCallback(() => { setLoading(true); stockOverview(orgId).then((s: any) => setStock(s || [])).finally(() => setLoading(false)) }, [orgId])
  useEffect(() => { load() }, [load])
  const rows = stock.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>на складе позиций: <b style={{ color: COLORS.text }}>{stock.length}</b></span>
        <input style={{ ...INP, maxWidth: 260, marginLeft: 'auto' }} placeholder="🔍 Поиск материала…" value={q} onChange={e => setQ(e.target.value)} />
        <button onClick={load} style={{ ...INP, width: 'auto', cursor: 'pointer' }}>⟳</button>
      </div>
      {loading ? <div style={{ padding: 30, color: COLORS.textMuted }}>Загрузка…</div>
        : rows.length === 0 ? <div style={{ padding: 30, color: COLORS.textMuted, background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', textAlign: 'center' }}>Материалов на складе нет. Они приходят от головного приходной накладной.</div>
          : (
            <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#f8f6f3' }}>{['МАТЕРИАЛ', 'ЕД.', 'НА СКЛАДЕ', 'РЕЗЕРВ', 'ДОСТУПНО'].map(h => <th key={h} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: h === 'МАТЕРИАЛ' ? 'left' : 'center' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((s, i) => { const avail = Math.max(0, s.qty - s.reserved); return (
                    <tr key={s.id} style={{ borderTop: i > 0 ? '1px solid #f1efec' : 'none' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500, fontSize: 14 }}>{s.name}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, color: '#5f5952' }}>{s.unit}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>{s.qty}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#4a5aaa' }}>{s.reserved > 0 ? s.reserved : '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: avail > 0 ? '#2e8a5e' : '#b03020' }}>{avail}</td>
                    </tr>
                  ) })}
                </tbody>
              </table>
            </div>
          )}
    </div>
  )
}

// ─── Производство: список ПРЗ + форма (материалы → изделия) ─────────────────────
function ProduceTab({ orgId, warehouseId, products, onMsg }: { orgId: string; warehouseId: string; products: any[]; onMsg: (m: string) => void }) {
  const [docs, setDocs] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [openDocId, setOpenDocId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ins, setIns] = useState<{ productId: string; qty: string; price: string }[]>([{ productId: '', qty: '', price: '' }])
  const [outs, setOuts] = useState<{ productId: string; qty: string; lengthCm: string; widthCm: string; rate: string; price: string }[]>([{ productId: '', qty: '', lengthCm: '', widthCm: '', rate: '', price: '' }])
  const load = useCallback(() => { listProduction(orgId).then((d: any) => setDocs(d || [])) }, [orgId])
  useEffect(() => { load() }, [load])

  const pById = (id: string) => products.find(p => p.id === id)
  const setIn = (i: number, patch: any) => setIns(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  const setOut = (i: number, patch: any) => setOuts(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  const inCost = ins.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0)

  async function submit() {
    const inputs = ins.filter(r => r.productId && Number(r.qty) > 0).map(r => ({ productId: r.productId, qty: Number(r.qty), price: Number(r.price) || 0 }))
    const outputs = outs.filter(r => r.productId && Number(r.qty) > 0).map(r => ({ productId: r.productId, qty: Number(r.qty), lengthCm: r.lengthCm ? Number(r.lengthCm) : undefined, widthCm: r.widthCm ? Number(r.widthCm) : undefined, rate: r.rate ? Number(r.rate) : undefined, price: r.price ? Number(r.price) : undefined }))
    if (!outputs.length) { onMsg('⚠ Добавьте хотя бы одно изделие'); return }
    if (!warehouseId) { onMsg('⚠ Нет склада у этой организации'); return }
    setBusy(true)
    const r: any = await createProduction({ orgId, warehouseId, inputs, outputs })
    setBusy(false)
    if (r.id || r.ok) { onMsg(`✓ Производство ${r.number || ''} проведено`); setOpen(false); setIns([{ productId: '', qty: '', price: '' }]); setOuts([{ productId: '', qty: '', lengthCm: '', widthCm: '', rate: '', price: '' }]); load() }
    else onMsg('⚠ ' + (r.error || 'Ошибка'))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>проведено: <b style={{ color: COLORS.text }}>{docs.length}</b></span>
        <button onClick={() => setOpen(o => !o)} style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{open ? '× Свернуть' : '+ Новое производство'}</button>
      </div>

      {open && (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', padding: 18, marginBottom: 16 }}>
          {/* Материалы (списание) */}
          <div style={LBL}>МАТЕРИАЛЫ (спишутся со склада)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
            {ins.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}><NomInline products={products} value={r.productId} name={pById(r.productId)?.name || ''} onPick={p => setIn(i, { productId: p.id, price: r.price || String(p.priceIn ?? '') })} /></div>
                <input style={{ ...INP, width: 80, textAlign: 'right' }} type="number" placeholder="кол-во" value={r.qty} onChange={e => setIn(i, { qty: e.target.value })} />
                <input style={{ ...INP, width: 90, textAlign: 'right' }} type="number" placeholder="цена" value={r.price} onChange={e => setIn(i, { price: e.target.value })} title="себестоимость материала" />
                <button onClick={() => setIns(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} style={{ border: 'none', background: 'none', color: '#b03020', fontSize: 16, cursor: 'pointer', paddingTop: 6 }}>×</button>
              </div>
            ))}
          </div>
          <button onClick={() => setIns(rs => [...rs, { productId: '', qty: '', price: '' }])} style={{ border: '1.5px dashed #d8d3cc', borderRadius: 7, padding: '4px 12px', background: 'none', cursor: 'pointer', fontSize: 12.5, color: '#5f5952', fontFamily: 'inherit', marginBottom: 14 }}>＋ материал</button>

          {/* Готовые изделия (приход) */}
          <div style={LBL}>ГОТОВЫЕ ИЗДЕЛИЯ (придут на склад)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
            {outs.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}><NomInline products={products} value={r.productId} name={pById(r.productId)?.name || ''} onPick={p => setOut(i, { productId: p.id, price: r.price || String(p.priceRetail ?? '') })} /></div>
                <input style={{ ...INP, width: 70, textAlign: 'right' }} type="number" placeholder="кол-во" value={r.qty} onChange={e => setOut(i, { qty: e.target.value })} />
                <input style={{ ...INP, width: 64, textAlign: 'right' }} type="number" placeholder="см" value={r.lengthCm} onChange={e => setOut(i, { lengthCm: e.target.value })} title="длина, см (размерное ценообразование)" />
                <input style={{ ...INP, width: 64, textAlign: 'right' }} type="number" placeholder="см" value={r.widthCm} onChange={e => setOut(i, { widthCm: e.target.value })} title="ширина, см" />
                <input style={{ ...INP, width: 74, textAlign: 'right' }} type="number" placeholder="ставка/м²" value={r.rate} onChange={e => setOut(i, { rate: e.target.value })} title="ставка за м²" />
                <input style={{ ...INP, width: 84, textAlign: 'right' }} type="number" placeholder="цена/шт" value={r.price} onChange={e => setOut(i, { price: e.target.value })} title="цена за штуку (если без размеров)" />
                <button onClick={() => setOuts(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} style={{ border: 'none', background: 'none', color: '#b03020', fontSize: 16, cursor: 'pointer', paddingTop: 6 }}>×</button>
              </div>
            ))}
          </div>
          <button onClick={() => setOuts(rs => [...rs, { productId: '', qty: '', lengthCm: '', widthCm: '', rate: '', price: '' }])} style={{ border: '1.5px dashed #d8d3cc', borderRadius: 7, padding: '4px 12px', background: 'none', cursor: 'pointer', fontSize: 12.5, color: '#5f5952', fontFamily: 'inherit' }}>＋ изделие</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1efec' }}>
            <span style={{ fontSize: 13, color: COLORS.textMuted }}>Себестоимость материалов: <b style={{ color: COLORS.text }}>{fmtMoney(inCost)} ₸</b></span>
            <button onClick={submit} disabled={busy} style={{ marginLeft: 'auto', padding: '9px 20px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', opacity: busy ? .6 : 1 }}>{busy ? 'Провожу…' : '🛠️ Провести производство'}</button>
          </div>
        </div>
      )}

      {/* Список проведённых */}
      {docs.length === 0 ? <div style={{ padding: 30, color: COLORS.textMuted, background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', textAlign: 'center' }}>Производств пока нет.</div>
        : <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f8f6f3' }}>{['НОМЕР', 'ДАТА', 'ИЗДЕЛИЯ', 'СУММА'].map(h => <th key={h} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: h === 'СУММА' ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {docs.map((d, i) => (
                  <tr key={d.id} onClick={() => setOpenDocId(d.id)} style={{ borderTop: i > 0 ? '1px solid #f1efec' : 'none', cursor: 'pointer' }}>
                    <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: COLORS.primary, fontSize: 13 }}>{d.number}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#5f5952' }}>{fmtDate(d.date)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#5f5952' }}>{d.items || '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmtMoney(Number(d.total))} ₸</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}

      {openDocId && <ProdDocDrawer id={openDocId} onClose={() => setOpenDocId(null)} />}
    </div>
  )
}

// ─── Просмотр документа производства (шторка справа) ────────────────────────────
function ProdDocDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { setLoading(true); getDocument(id).then((d: any) => setData(d)).finally(() => setLoading(false)) }, [id])
  const doc = data?.doc
  const lines: any[] = data?.lines || []
  const inputs = lines.filter(l => l.role === 'input')
  const outputs = lines.filter(l => l.role !== 'input')
  const dim = (l: any) => [l.lengthCm && Number(l.lengthCm) ? `${Number(l.lengthCm)}×` : '', l.widthCm && Number(l.widthCm) ? `${Number(l.widthCm)} см` : ''].join('') || null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.28)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 100%)', height: '100%', background: '#faf8f6', boxShadow: '-8px 0 32px rgba(0,0,0,.18)', overflowY: 'auto', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 18, fontFamily: "'JetBrains Mono', monospace", color: COLORS.primary }}>{doc?.number || '…'}</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#5f5952', background: '#eee9e2', padding: '3px 9px', borderRadius: 6 }}>🛠️ Производство</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#8a837a', lineHeight: 1 }}>×</button>
        </div>

        {loading ? <div style={{ color: COLORS.textMuted, padding: 20 }}>Загрузка…</div> : !doc ? <div style={{ color: '#b03020' }}>Документ не найден</div> : (
          <>
            <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 16 }}>Дата: <b>{fmtDate(doc.date)}</b>{data?.warehouse ? <> · Склад: <b>{data.warehouse.name}</b></> : null}</div>

            <div style={LBL}>ГОТОВЫЕ ИЗДЕЛИЯ (приход на склад)</div>
            <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden', marginBottom: 16 }}>
              {outputs.length === 0 ? <div style={{ padding: 14, color: COLORS.textMuted, fontSize: 13 }}>—</div> : outputs.map((l, i) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: i > 0 ? '1px solid #f1efec' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{l.name}</div>
                    {dim(l) && <div style={{ fontSize: 12, color: COLORS.textMuted }}>{dim(l)}{l.rate && Number(l.rate) ? ` · ${Number(l.rate)}/м²` : ''}</div>}
                  </div>
                  <div style={{ fontSize: 13, color: '#5f5952', whiteSpace: 'nowrap' }}>{Number(l.qty)} {l.unit || 'шт'}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, minWidth: 90, textAlign: 'right' }}>{fmtMoney(Number(l.amount))} ₸</div>
                </div>
              ))}
            </div>

            <div style={LBL}>МАТЕРИАЛЫ (списаны со склада)</div>
            <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden', marginBottom: 16 }}>
              {inputs.length === 0 ? <div style={{ padding: 14, color: COLORS.textMuted, fontSize: 13 }}>Сырьё не указано (списание — раскроем).</div> : inputs.map((l, i) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: i > 0 ? '1px solid #f1efec' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{l.name}</div>
                  <div style={{ fontSize: 13, color: '#5f5952', whiteSpace: 'nowrap' }}>{Number(l.qty)} {l.unit || 'шт'}</div>
                  <div style={{ fontSize: 13, color: COLORS.textMuted, minWidth: 90, textAlign: 'right' }}>{fmtMoney(Number(l.amount))} ₸</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #e6e2dc' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Итого выпуск</span>
              <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 17, color: COLORS.primary }}>{fmtMoney(Number(doc.total))} ₸</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
