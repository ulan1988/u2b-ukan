'use client'
// Шапка-фильтр каталога (как в кассе магазина): папки · подпапки · толщина · цвет.
// Сама ничего не выбирает — отдаёт выбор наверх, а экран решает, что с ним делать.
// В «Расчёте» этот фильтр задаёт область, внутри которой ищет строка-поиск.
import { useMemo, type CSSProperties } from 'react'
import { FOLDERS, KOMPLEKT_CHIPS, extraFolders, subRowsOf, thicksOf, emptySel, type CatalogSel, type Folder } from '@/lib/catalogNav'
import { ralOrdered } from '@/lib/ral'

const PRIMARY = '#d4613a', DARK = '#26231f'

export default function CatalogFilterBar({ products, sel, onChange, allColors, onAllColors, compact }: {
  products: any[]; sel: CatalogSel; onChange: (s: CatalogSel) => void
  allColors?: boolean; onAllColors?: (v: boolean) => void; compact?: boolean
}) {
  const folders = useMemo<Folder[]>(() => [...FOLDERS, ...extraFolders(products)], [products])
  const folder = folders.find(f => f.key === sel.folder) || folders[0]
  const subRows = useMemo(() => folder ? subRowsOf(products, folder, sel.path) : [], [products, folder, sel.path])
  const thicks = useMemo(() => folder ? thicksOf(products, folder, sel.path) : [], [products, folder, sel.path])
  const sz = compact ? 36 : 46
  const chip = (on: boolean): CSSProperties => ({ flexShrink: 0, border: on ? 'none' : '1.5px solid #e2ddd5', background: on ? PRIMARY : '#fff', color: on ? '#fff' : '#5f5952', borderRadius: 20, padding: '6px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap' })

  return (
    <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 0 0 1.5px #e6e2dc', marginBottom: 12 }}>
      {/* папки */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e6e2dc', overflowX: 'auto' }}>
        {folders.map(f => { const on = folder?.key === f.key; return (
          <button key={f.key} onClick={() => onChange(emptySel(f.key))} style={{ flexShrink: 0, border: 'none', background: 'none', padding: '11px 14px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? PRIMARY : '#6b645b', borderBottom: `3px solid ${on ? PRIMARY : 'transparent'}`, whiteSpace: 'nowrap' }}>{f.label}</button>
        )})}
      </div>

      {/* подпапки */}
      {subRows.map(row => (
        <div key={row.level} style={{ display: 'flex', gap: 6, padding: '7px 10px', background: '#faf8f5', borderBottom: '1px solid #efeae3', overflowX: 'auto' }}>
          {row.vals.map(v => { const on = sel.path[row.level] === v; return (
            <button key={v} onClick={() => { const next = sel.path.slice(0, row.level); if (sel.path[row.level] !== v) next[row.level] = v; onChange({ ...sel, path: next, thick: '', color: '' }) }} style={chip(on)}>{v}</button>
          )})}
        </div>
      ))}

      {/* толщина */}
      {thicks.length > 0 && (
        <div style={{ display: 'flex', gap: 6, padding: '7px 10px', background: '#f4f6f8', borderBottom: '1px solid #e6eaef', overflowX: 'auto', alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: '#8a8377', fontWeight: 700, flexShrink: 0 }}>толщина:</span>
          <button onClick={() => onChange({ ...sel, thick: '' })} style={{ ...chip(sel.thick === ''), background: sel.thick === '' ? DARK : '#fff' }}>все</button>
          {thicks.map(tk => <button key={tk} onClick={() => onChange({ ...sel, thick: sel.thick === tk ? '' : tk })} style={{ ...chip(sel.thick === tk), background: sel.thick === tk ? '#2a5aaa' : '#fff' }}>{tk}</button>)}
        </div>
      )}

      {/* чипы комплектующих */}
      {folder?.build && (
        <div style={{ display: 'flex', gap: 6, padding: '7px 10px', background: '#faf8f5', borderBottom: '1px solid #efeae3', overflowX: 'auto' }}>
          <button onClick={() => onChange({ ...sel, kfilter: '' })} style={{ ...chip(sel.kfilter === ''), background: sel.kfilter === '' ? DARK : '#fff' }}>все</button>
          {KOMPLEKT_CHIPS.map(nm => <button key={nm} onClick={() => onChange({ ...sel, kfilter: sel.kfilter === nm ? '' : nm })} style={chip(sel.kfilter === nm)}>{nm}</button>)}
        </div>
      )}

      {/* цвета */}
      <div style={{ padding: '9px 10px 10px', display: 'flex', gap: 9, overflowX: 'auto' }}>
        <button onClick={() => onChange({ ...sel, color: '' })} title="Без фильтра по цвету" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ width: sz, height: sz, borderRadius: 13, background: 'linear-gradient(45deg, transparent 44%, #c1121c 44%, #c1121c 56%, transparent 56%), #fff', boxShadow: sel.color === '' ? `0 0 0 3px ${PRIMARY}, inset 0 0 0 1px #ddd8d0` : '0 0 0 1px #ddd8d0' }} />
          <span style={{ fontSize: 10.5, fontWeight: sel.color === '' ? 800 : 600, color: sel.color === '' ? DARK : '#6b645b', whiteSpace: 'nowrap' }}>без цвета</span>
        </button>
        {ralOrdered(!!allColors).map((c: any) => { const on = sel.color === c.code; return (
          <button key={c.code} onClick={() => onChange({ ...sel, color: on ? '' : c.code })} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ width: sz, height: sz, borderRadius: 13, background: c.hex || c.bg, boxShadow: on ? `0 0 0 3px ${PRIMARY}, inset 0 0 0 1px #ddd8d0` : '0 0 0 1px #ddd8d0' }} />
            <span style={{ fontSize: 10.5, fontWeight: on ? 800 : 600, color: on ? DARK : '#6b645b' }}>{c.code === 'decor' ? 'дерево' : c.code}</span>
          </button>
        )})}
        {onAllColors && (
          <button onClick={() => onAllColors(!allColors)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ width: sz, height: sz, borderRadius: 13, background: '#f7f5f2', boxShadow: '0 0 0 1px #ddd8d0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>👁</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: '#8a8377' }}>{allColors ? 'меньше' : 'ещё'}</span>
          </button>
        )}
      </div>
    </div>
  )
}
