'use client'
// Поле поиска с подсказками: печатаешь → выпадает список → выбираешь точное значение (оно становится чипом).
// Два таких поля работают совместно (У-Канбан → Накладные): товар + контрагент.
import { useState } from 'react'

export const normSearch = (v: any) => String(v ?? '').toLowerCase().replace(/ё/g, 'е')
export const searchWords = (v: string) => normSearch(v).split(/\s+/).filter(Boolean)

export default function PickSearch({ icon, placeholder, text, onText, picked, onPick, options }: {
  icon: string; placeholder: string; text: string; onText: (v: string) => void
  picked: string; onPick: (v: string) => void; options: { name: string; n: number }[]
}) {
  const [open, setOpen] = useState(false)
  const words = searchWords(text)
  const shown = options.filter(o => words.every(w => normSearch(o.name).includes(w))).slice(0, 14)

  if (picked) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 280px', minWidth: 240, padding: '8px 12px', borderRadius: 9, border: '1.5px solid #7a3aaa', background: '#faf7fd', fontSize: 14, fontWeight: 600 }}>
      <span>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picked}</span>
      <button onClick={() => { onPick(''); onText('') }} title="Сбросить" style={{ border: 'none', background: 'none', color: '#c1121c', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>
  )

  return (
    <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 240 }}>
      <input value={text} onChange={e => { onText(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={icon + ' ' + placeholder}
        style={{ width: '100%', padding: '9px 14px', borderRadius: 9, border: `1.5px solid ${text ? '#7a3aaa' : '#e6e2dc'}`, background: '#fff', outline: 'none', fontFamily: 'inherit', fontSize: 14 }} />
      {open && shown.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,.16)', border: '1.5px solid #e6e2dc', maxHeight: 320, overflowY: 'auto', zIndex: 60 }}>
          {shown.map(o => (
            <div key={o.name} onMouseDown={e => { e.preventDefault(); onPick(o.name); onText(''); setOpen(false) }}
              style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 12px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f4f1ed' }}>
              <span style={{ flex: 1, minWidth: 0 }}>{o.name}</span>
              <span style={{ fontSize: 12, color: '#837c72', whiteSpace: 'nowrap' }}>{o.n} накл.</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
