'use client'
// Единый выбор контрагента (клиент/поставщик — НЕ делим, один может быть и тем и тем).
// Поиск по имени; контрагент по умолчанию (из Настроек) закреплён первым в списке.
import { useMemo, useRef, useState, useEffect } from 'react'
import { COLORS } from '@/lib/colors'

export default function ContragentPicker({ contragents, value, onPick, defaultId, placeholder = '— выберите контрагента —', style }: {
  contragents: any[]; value?: string; onPick: (c: any) => void; defaultId?: string; placeholder?: string; style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const selected = contragents.find(c => c.id === value)

  useEffect(() => {
    function h(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    let base = s ? contragents.filter(c => (c.name || '').toLowerCase().includes(s)) : contragents.slice()
    // Дефолтный контрагент — всегда первым (если проходит поиск).
    base.sort((a, b) => {
      if (a.id === defaultId) return -1
      if (b.id === defaultId) return 1
      return (a.name || '').localeCompare(b.name || '', 'ru')
    })
    return base.slice(0, 100)
  }, [contragents, q, defaultId])

  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 7, border: '1.5px solid #e6e2dc', fontFamily: 'inherit', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div ref={boxRef} style={{ position: 'relative', ...style }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ ...inp, textAlign: 'left', cursor: 'pointer', background: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? COLORS.text : '#9a938a' }}>{selected ? selected.name : placeholder}</span>
        <span style={{ marginLeft: 'auto', color: '#9a938a', fontSize: 11 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 500, background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.16)', width: 300, maxWidth: '90vw', border: '1.5px solid #e6e2dc' }}>
          <div style={{ padding: 10, borderBottom: '1px solid #f1efec' }}>
            <input autoFocus style={inp} placeholder="Поиск контрагента…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {value && <div onClick={() => { onPick({ id: '', name: '' }); setOpen(false); setQ('') }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: '#9a938a', borderBottom: '1px solid #f6f3f0' }}>× Очистить</div>}
            {list.length === 0 ? <div style={{ padding: 14, color: COLORS.textMuted, fontSize: 13, textAlign: 'center' }}>Ничего не найдено</div>
              : list.map(c => (
                <div key={c.id} onClick={() => { onPick(c); setOpen(false); setQ('') }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid #f6f3f0', background: c.id === value ? '#fff8f5' : 'transparent' }}>
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.id === defaultId && <span title="по умолчанию" style={{ color: COLORS.primary }}>★ </span>}{c.name}</span>
                  {c.priceType === 'opt' && <span style={{ fontSize: 10, color: '#4a5aaa', fontWeight: 700 }}>опт</span>}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
