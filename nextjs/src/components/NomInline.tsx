'use client'
// Каталог-пикер товара с фильтром по группам/подгруппам и RAL-кругами (из Улкана).
import { useState, useMemo } from 'react'
import { COLORS } from '@/lib/colors'
import { RalDot, extractRal } from '@/lib/ral'

const norm = (s: string) => (s || '').trim().toLowerCase().replace(/ё/g, 'е')

export default function NomInline({ products, value, onPick }: {
  products: any[]; value?: string; onPick: (product: any) => void
}) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState('')
  const [q, setQ] = useState('')

  const selected = products.find(p => p.id === value)

  // Группы — динамически из реальных товаров (а не из статичного каталога), чтобы новые
  // папки (Изделие и т.п.) тоже были в фильтре.
  const groups = useMemo(
    () => Array.from(new Set(products.map(p => (p.group || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')),
    [products]
  )

  const list = useMemo(() => {
    let base = products
    // group совпадает с полем group ИЛИ cat (устойчиво к перепутанным полям 1С).
    if (group) base = base.filter(p => norm(p.group) === norm(group) || norm(p.cat) === norm(group))
    if (q.trim()) { const s = q.toLowerCase(); base = base.filter(p => (p.name || '').toLowerCase().includes(s)) }
    return base.slice(0, 200)
  }, [products, group, q])

  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 7, border: '1.5px solid #e6e2dc', fontFamily: 'inherit', fontSize: 13, outline: 'none' }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ ...inp, width: '100%', textAlign: 'left', cursor: 'pointer', background: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
        {selected ? <><RalDot code={extractRal(selected.name)} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span></> : <span style={{ color: '#9a938a' }}>— товар из каталога —</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 400, background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.16)', width: 340, border: '1.5px solid #e6e2dc' }}>
          <div style={{ padding: 10, display: 'flex', gap: 6, borderBottom: '1px solid #f1efec' }}>
            <select style={{ ...inp, flex: 1 }} value={group} onChange={e => setGroup(e.target.value)}>
              <option value="">Все группы</option>{groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input style={{ ...inp, flex: 1 }} placeholder="Поиск…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {list.length === 0 ? <div style={{ padding: 14, color: COLORS.textMuted, fontSize: 13, textAlign: 'center' }}>Ничего не найдено</div>
              : list.map(p => (
                <div key={p.id} onClick={() => { onPick(p); setOpen(false); setQ('') }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid #f6f3f0' }}>
                  <RalDot code={extractRal(p.name)} />
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: COLORS.textLight }}>{p.group || ''}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
