'use client'
// Шаг 1 сборки заказа — выбор заказчика МОДЕЛЬКОЙ (как каталог): большой список на весь
// экран, поиск сверху, избранные и дефолтный контрагент вверху. Открывается сразу по
// «Создать заказ», после выбора сам уступает место каталогу.
import { useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'

const norm = (s: any) => String(s ?? '').toLowerCase().replace(/ё/g, 'е')

export default function ClientPickModal({ contragents, defaultId, onPick, onClose }: {
  contragents: any[]; defaultId?: string; onPick: (c: any) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const s = norm(q).trim()
    const base = s ? contragents.filter(c => norm(c.name).includes(s)) : contragents.slice()
    return base.sort((a, b) => {
      if (a.id === defaultId) return -1
      if (b.id === defaultId) return 1
      const af = a.favorite ? 1 : 0, bf = b.favorite ? 1 : 0
      if (af !== bf) return bf - af
      return String(a.name || '').localeCompare(String(b.name || ''), 'ru')
    })
  }, [contragents, q, defaultId])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 1200, display: 'flex', flexDirection: 'column', fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      {/* Шапка — как у каталога: тёмная полоса с названием и выходом */}
      <div style={{ background: '#211f1c', color: '#fff', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 800 }}>👤 Заказчик</span>
        <span style={{ fontSize: 12.5, color: '#b7b0a6' }}>шаг 1 из 4 — дальше откроется каталог</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', border: '1.5px solid #4a443c', background: 'transparent', color: '#fff', borderRadius: 9, padding: '7px 16px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700 }}>Отмена</button>
      </div>

      <div style={{ padding: '12px 18px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 поиск по имени"
          style={{ flex: 1, padding: '12px 14px', borderRadius: 11, border: `1.5px solid ${COLORS.border}`, fontSize: 15, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        <span style={{ fontSize: 12.5, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{list.length} конт.</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 18px' }}>
        {list.length === 0
          ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted, fontSize: 14 }}>Никого не нашли</div>
          : (
            <div style={{ border: `1px solid ${COLORS.borderLight}`, borderRadius: 14, overflow: 'hidden' }}>
              {list.map(c => (
                <button key={c.id} onClick={() => onPick(c)}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: 'none', borderBottom: `1px solid ${COLORS.borderLight}`, background: c.id === defaultId ? '#fdf6f2' : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15 }}>
                  <span style={{ fontSize: 15 }}>{c.favorite ? '⭐' : '👤'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  {c.priceType && c.priceType !== 'retail' && <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted }}>{c.priceType === 'opt' ? 'опт' : 'спец'}</span>}
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}
