'use client'
// «Расчёт» — локальный лист сметы по фирмам/линейкам. Слева позиции (название+кол-во),
// справа блоки-фирмы (Цена редактируется, Сумма=Цена×Кол-во авто), снизу итог по фирме.
import { Fragment, useEffect, useRef, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { calcGet, calcSave } from '@/lib/api/calc'

const fmt = (n: number) => !n ? '0' : Number(n).toLocaleString('ru-RU')
const num = (v: any) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0 }
const uid = () => 'x' + Math.random().toString(36).slice(2, 9)

export default function CalcScreen({ orgId }: { orgId: string }) {
  const [id, setId] = useState<string | null>(null)
  const [name, setName] = useState('Расчёт')
  const [brands, setBrands] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(true)
  const t = useRef<any>(null)

  useEffect(() => { (async () => {
    const d: any = await calcGet()
    setId(d?.id || null); setName(d?.name || 'Расчёт'); setBrands(d?.data?.brands || []); setRows(d?.data?.rows || []); setLoading(false)
  })() }, [])

  function commit(nb = brands, nr = rows, nm = name) {
    setBrands(nb); setRows(nr); setName(nm); setSaved(false)
    clearTimeout(t.current)
    t.current = setTimeout(async () => {
      const r: any = await calcSave(id, nm, { brands: nb, rows: nr })
      if (r?.data?.id && !id) setId(r.data.id)
      setSaved(true)
    }, 700)
  }

  // Позиции
  const setRow = (i: number, patch: any) => commit(brands, rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  const setPrice = (i: number, bid: string, val: any) => commit(brands, rows.map((r, j) => j === i ? { ...r, prices: { ...r.prices, [bid]: num(val) } } : r))
  const addRow = () => commit(brands, [...rows, { id: uid(), name: '', qty: 0, prices: {} }])
  const delRow = (i: number) => commit(brands, rows.filter((_, j) => j !== i))
  // Фирмы
  const setBrand = (bi: number, patch: any) => commit(brands.map((b, j) => j === bi ? { ...b, ...patch } : b))
  const addBrand = () => commit([...brands, { id: uid(), name: 'Фирма', color: '#6b7280' }])
  const delBrand = (bi: number) => { const b = brands[bi]; const nr = rows.map(r => { const p = { ...r.prices }; delete p[b.id]; return { ...r, prices: p } }); commit(brands.filter((_, j) => j !== bi), nr) }

  const sumOf = (r: any, b: any) => (Number(r.prices?.[b.id]) || 0) * (Number(r.qty) || 0)
  const totalOf = (b: any) => rows.reduce((s, r) => s + sumOf(r, b), 0)
  const totals: Record<string, number> = {}; for (const b of brands) totals[b.id] = totalOf(b)
  const positive = brands.map(b => totals[b.id]).filter(v => v > 0)
  const minTotal = positive.length ? Math.min(...positive) : 0

  const th: React.CSSProperties = { padding: '7px 8px', fontSize: 12, fontWeight: 700, border: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { border: `1px solid ${COLORS.border}`, padding: '2px 6px', fontSize: 13.5 }
  const tint = (hex: string, a = '14') => hex + a
  const cellInp: React.CSSProperties = { width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', fontFamily: 'inherit', fontSize: 13.5, background: 'transparent', outline: 'none', boxSizing: 'border-box' }
  const numInp: React.CSSProperties = { ...cellInp, textAlign: 'right', fontFamily: 'Consolas, monospace', fontWeight: 700 }

  if (loading) return <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontWeight: 800 }}>🧮 Расчёт</span>
        <input value={name} onChange={e => commit(brands, rows, e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit', fontWeight: 600, minWidth: 220 }} />
        <span style={{ fontSize: 12.5, color: saved ? '#2e8a5e' : COLORS.textMuted }}>{saved ? '✓ сохранено' : '… сохраняю'}</span>
        <button onClick={addBrand} style={{ marginLeft: 'auto', padding: '7px 13px', borderRadius: 8, border: 'none', background: '#eef2ff', color: '#4f46e5', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>+ Фирма</button>
      </div>

      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, boxShadow: `0 0 0 1.5px ${COLORS.border}` }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
          <thead>
            {/* Шапка-фирмы */}
            <tr>
              <th style={{ ...th, background: COLORS.bg }} rowSpan={2}>№</th>
              <th style={{ ...th, background: COLORS.bg, minWidth: 180 }} rowSpan={2}>Наименование</th>
              <th style={{ ...th, background: COLORS.bg }} rowSpan={2}>Кол-во</th>
              {brands.map((b, bi) => (
                <th key={b.id} colSpan={2} style={{ ...th, background: b.color, color: '#fff', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                    <input type="color" value={b.color} onChange={e => setBrand(bi, { color: e.target.value })} title="Цвет" style={{ width: 20, height: 20, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }} />
                    <input value={b.name} onChange={e => setBrand(bi, { name: e.target.value })} style={{ width: 110, border: 'none', background: 'transparent', color: '#fff', fontWeight: 800, fontSize: 13, textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
                    <button onClick={() => delBrand(bi)} title="Убрать фирму" style={{ border: 'none', background: 'rgba(255,255,255,.25)', color: '#fff', borderRadius: 5, cursor: 'pointer', fontWeight: 700, fontSize: 12, lineHeight: 1, padding: '1px 5px' }}>✕</button>
                  </div>
                </th>
              ))}
              <th style={{ ...th, background: COLORS.bg }} rowSpan={2}></th>
            </tr>
            <tr>
              {brands.map(b => (
                <Fragment key={b.id}>
                  <th style={{ ...th, background: tint(b.color, '22'), textAlign: 'right' }}>Цена</th>
                  <th style={{ ...th, background: tint(b.color, '33'), textAlign: 'right' }}>Сумма</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                <td style={{ ...td, textAlign: 'center', color: COLORS.textMuted }}>{i + 1}</td>
                <td style={td}><input value={r.name} onChange={e => setRow(i, { name: e.target.value })} placeholder="позиция…" style={cellInp} /></td>
                <td style={{ ...td, background: '#f4f3f0' }}><input value={r.qty ?? ''} inputMode="decimal" onChange={e => setRow(i, { qty: num(e.target.value) })} style={numInp} /></td>
                {brands.map(b => (
                  <Fragment key={b.id}>
                    <td style={{ ...td, background: tint(b.color, '10') }}><input value={r.prices?.[b.id] ?? ''} inputMode="decimal" onChange={e => setPrice(i, b.id, e.target.value)} placeholder="0" style={numInp} /></td>
                    <td style={{ ...td, background: tint(b.color, '1f'), textAlign: 'right', fontFamily: 'Consolas, monospace', fontWeight: 700 }}>{sumOf(r, b) ? fmt(sumOf(r, b)) : ''}</td>
                  </Fragment>
                ))}
                <td style={{ ...td, textAlign: 'center' }}><button onClick={() => delRow(i)} title="Убрать строку" style={{ border: 'none', background: 'transparent', color: '#b3261e', cursor: 'pointer', fontWeight: 700 }}>✕</button></td>
              </tr>
            ))}
            {/* Итого */}
            <tr style={{ background: '#fff7d6', fontWeight: 800 }}>
              <td style={td}></td>
              <td style={td} colSpan={2}>ИТОГО по фирме</td>
              {brands.map(b => {
                const isMin = totals[b.id] > 0 && totals[b.id] === minTotal
                return (
                  <Fragment key={b.id}>
                    <td style={{ ...td, background: tint(b.color, '10') }}></td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'Consolas, monospace', background: isMin ? '#d7f5e0' : tint(b.color, '1f'), color: isMin ? '#0f7b3d' : '#211f1c' }}>{fmt(totals[b.id])}{isMin ? ' ✓' : ''}</td>
                  </Fragment>
                )
              })}
              <td style={td}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button onClick={addRow} style={{ padding: '9px 16px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, background: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>+ Добавить строку</button>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: COLORS.textMuted }}>Сумма = Цена × Кол-во. Зелёным ✓ — самый дешёвый итог. Цены/фирмы/позиции редактируются прямо в таблице, сохраняется автоматически.</div>
    </div>
  )
}
