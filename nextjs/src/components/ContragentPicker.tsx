'use client'
// Единый выбор контрагента (клиент/поставщик — НЕ делим, один может быть и тем и тем).
// Поиск-подсказка по имени; дефолтный контрагент закреплён первым. Выпадашка рендерится
// в ПОРТАЛ с фиксированным позиционированием — иначе её режет контейнер таблицы
// (overflow-x:auto) и пункты не видно/не кликнуть.
import { useMemo, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { COLORS } from '@/lib/colors'

export default function ContragentPicker({ contragents, value, onPick, defaultId, placeholder = '— выберите контрагента —', style }: {
  contragents: any[]; value?: string; onPick: (c: any) => void; defaultId?: string; placeholder?: string; style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const selected = contragents.find(c => c.id === value)

  const list = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/ё/g, 'е')
    let base = s ? contragents.filter(c => (c.name || '').toLowerCase().replace(/ё/g, 'е').includes(s)) : contragents.slice()
    base.sort((a, b) => {
      if (a.id === defaultId) return -1
      if (b.id === defaultId) return 1
      return (a.name || '').localeCompare(b.name || '', 'ru')
    })
    return base.slice(0, 100)
  }, [contragents, q, defaultId])

  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 7, border: '1.5px solid #e6e2dc', fontFamily: 'inherit', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

  // Позиция выпадашки — фикс от кнопки; пересчёт при скролле/ресайзе. Ширина ≥280 (шире ячейки).
  function place() {
    const r = btnRef.current?.getBoundingClientRect(); if (!r) return
    const width = Math.max(r.width, 280)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    setPos({ top: r.bottom + 4, left, width })
  }
  useLayoutEffect(() => {
    if (!open) return
    place()
    const h = () => place()
    window.addEventListener('scroll', h, true); window.addEventListener('resize', h)
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function pick(c: any) { onPick(c); setOpen(false); setQ('') }

  return (
    <div style={{ position: 'relative', ...style }}>
      <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)} style={{ ...inp, textAlign: 'left', cursor: 'pointer', background: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? COLORS.text : '#9a938a' }}>{selected ? selected.name : placeholder}</span>
        <span style={{ marginLeft: 'auto', color: '#9a938a', fontSize: 11 }}>▾</span>
      </button>
      {open && pos && createPortal(
        <>
          <div onClick={() => { setOpen(false); setQ('') }} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.2)', border: '1.5px solid #e6e2dc', display: 'flex', flexDirection: 'column', maxHeight: '60vh' }}>
            <div style={{ padding: 10, borderBottom: '1px solid #f1efec' }}>
              <input autoFocus style={inp} placeholder="Начните вводить имя…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {value && <div onClick={() => pick({ id: '', name: '' })} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: '#9a938a', borderBottom: '1px solid #f6f3f0' }}>× Очистить</div>}
              {list.length === 0 ? <div style={{ padding: 14, color: COLORS.textMuted, fontSize: 13, textAlign: 'center' }}>Ничего не найдено</div>
                : list.map(c => (
                  <div key={c.id} onClick={() => pick(c)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', borderTop: '1px solid #f6f3f0', background: c.id === value ? '#fff8f5' : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fff8f5')} onMouseLeave={e => (e.currentTarget.style.background = c.id === value ? '#fff8f5' : 'transparent')}>
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.id === defaultId && <span title="по умолчанию" style={{ color: COLORS.primary }}>★ </span>}{c.name}</span>
                    {c.priceType === 'opt' && <span style={{ fontSize: 10, color: '#4a5aaa', fontWeight: 700 }}>опт</span>}
                  </div>
                ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
