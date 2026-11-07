'use client'
// Компактная шапка-фильтр каталога: папки и ПОДПАПКИ в одной строке (подпапки появляются
// справа от выбранной папки), ниже — узкая полоса цветов. Сама ничего не выбирает:
// отдаёт выбор наверх, экран решает, что с ним делать. В «Расчёте» этот фильтр задаёт
// область, внутри которой ищет строка-поиск.
import { useMemo, type CSSProperties } from 'react'
import { FOLDERS, KOMPLEKT_CHIPS, extraFolders, subRowsOf, thicksOf, emptySel, type CatalogSel, type Folder } from '@/lib/catalogNav'
import { ralOrdered } from '@/lib/ral'

const PRIMARY = '#d4613a', DARK = '#26231f'

export default function CatalogFilterBar({ products, sel, onChange, allColors, onAllColors }: {
  products: any[]; sel: CatalogSel; onChange: (s: CatalogSel) => void
  allColors?: boolean; onAllColors?: (v: boolean) => void
}) {
  const folders = useMemo<Folder[]>(() => [...FOLDERS, ...extraFolders(products)], [products])
  const folder = folders.find(f => f.key === sel.folder) || folders[0]
  const subRows = useMemo(() => folder ? subRowsOf(products, folder, sel.path) : [], [products, folder, sel.path])
  const thicks = useMemo(() => folder ? thicksOf(products, folder, sel.path) : [], [products, folder, sel.path])

  const chip = (on: boolean, c = PRIMARY): CSSProperties => ({ flexShrink: 0, border: on ? 'none' : '1px solid #e2ddd5', background: on ? c : '#fff', color: on ? '#fff' : '#5f5952', borderRadius: 16, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap', lineHeight: 1.45 })
  const sep = <span style={{ flexShrink: 0, width: 1, alignSelf: 'stretch', background: '#e6e2dc', margin: '0 2px' }} />

  return (
    <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 0 0 1px #e6e2dc', marginBottom: 10, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* папки → сразу справа подпапки выбранной папки (и толщина / чипы комплектующих) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {folders.map(f => { const on = folder?.key === f.key; return (
          <button key={f.key} onClick={() => onChange(emptySel(f.key))} style={{ flexShrink: 0, border: 'none', background: on ? '#f4efe9' : 'none', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? PRIMARY : '#6b645b', whiteSpace: 'nowrap' }}>{f.label}</button>
        )})}
        {subRows.length > 0 && sep}
        {subRows.map(row => row.vals.map(v => { const on = sel.path[row.level] === v; return (
          <button key={`${row.level}-${v}`} onClick={() => { const next = sel.path.slice(0, row.level); if (sel.path[row.level] !== v) next[row.level] = v; onChange({ ...sel, path: next, thick: '', color: '' }) }} style={chip(on)}>{v}</button>
        )}))}
        {thicks.length > 0 && sep}
        {thicks.map(tk => <button key={tk} onClick={() => onChange({ ...sel, thick: sel.thick === tk ? '' : tk })} style={chip(sel.thick === tk, '#2a5aaa')}>{tk}</button>)}
        {folder?.build && sep}
        {folder?.build && KOMPLEKT_CHIPS.map(nm => <button key={nm} onClick={() => onChange({ ...sel, kfilter: sel.kfilter === nm ? '' : nm })} style={chip(sel.kfilter === nm)}>{nm}</button>)}
      </div>

      {/* цвета — узкой полосой */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid #f1efec', paddingTop: 6 }}>
        <button onClick={() => onChange({ ...sel, color: '' })} title="Без фильтра по цвету" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, background: 'linear-gradient(45deg, transparent 44%, #c1121c 44%, #c1121c 56%, transparent 56%), #fff', boxShadow: sel.color === '' ? `0 0 0 2px ${PRIMARY}, inset 0 0 0 1px #ddd8d0` : '0 0 0 1px #ddd8d0' }} />
          <span style={{ fontSize: 11, fontWeight: sel.color === '' ? 800 : 600, color: sel.color === '' ? DARK : '#8a8377', whiteSpace: 'nowrap' }}>без цвета</span>
        </button>
        {ralOrdered(!!allColors).map((c: any) => { const on = sel.color === c.code; return (
          <button key={c.code} onClick={() => onChange({ ...sel, color: on ? '' : c.code })} title={c.code} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: c.hex || c.bg, boxShadow: on ? `0 0 0 2px ${PRIMARY}, inset 0 0 0 1px #ddd8d0` : '0 0 0 1px #ddd8d0' }} />
            <span style={{ fontSize: 11, fontWeight: on ? 800 : 600, color: on ? DARK : '#8a8377' }}>{c.code === 'decor' ? 'дерево' : c.code}</span>
          </button>
        )})}
        {onAllColors && <button onClick={() => onAllColors(!allColors)} style={{ flexShrink: 0, border: '1px solid #e2ddd5', background: '#fff', color: '#8a8377', borderRadius: 16, padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600 }}>{allColors ? 'меньше' : 'ещё цвета'}</button>}
      </div>
    </div>
  )
}
