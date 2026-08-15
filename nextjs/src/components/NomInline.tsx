'use client'
// Каталог-пикер товара с фильтром по группам/подгруппам и RAL-кругами (из Улкана).
// Выпадашка рендерится в ПОРТАЛ с фиксированным позиционированием — иначе её режет
// контейнер таблицы позиций (overflow-x:auto), и результаты не видно/не кликнуть.
import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { COLORS } from '@/lib/colors'
import { RalDot, extractRal, ralOrdered } from '@/lib/ral'

const norm = (s: string) => (s || '').trim().toLowerCase().replace(/ё/g, 'е')
// Комплектующее (база) — собирается на лету: база + цвет + см → имя.
const isCompl = (p: any) => `${p?.group || ''} ${p?.cat || ''} ${p?.subgroup || ''}`.toLowerCase().includes('комплект')

export default function NomInline({ products, value, name, onPick }: {
  products: any[]; value?: string; name?: string; onPick: (product: any) => void
}) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState('')
  const [q, setQ] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  // Компоновка комплектующего: выбранная база + цвет + см.
  const [comp, setComp] = useState<any>(null)
  const [cColor, setCColor] = useState(''); const [cCm, setCCm] = useState(''); const [cAll, setCAll] = useState(false)

  const selected = products.find(p => p.id === value)
  // Показываем товар по id ИЛИ по имени (name1c) — товар из каталога-модельки приходит по имени, без id (как в кабинете).
  const shownName = selected?.name || (name || '').trim()

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

  // Позиция выпадашки — фикс от кнопки; пересчёт при скролле/ресайзе.
  function place() {
    const r = btnRef.current?.getBoundingClientRect(); if (!r) return
    const width = Math.max(r.width, 300)
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

  function close() { setOpen(false); setComp(null); setQ(''); setCColor(''); setCCm('') }
  function pick(p: any) {
    if (isCompl(p)) { setComp(p); setCCm(p.stdWidthCm != null ? String(Number(p.stdWidthCm)) : ''); setCColor(''); return }
    onPick(p); close()
  }
  const compName = () => {
    if (!comp) return ''
    const colorLabel = cColor ? (cColor === 'decor' ? 'дерево' : cColor) : ''
    return [comp.name, colorLabel, cCm ? `${cCm}см` : ''].filter(Boolean).join(' ')
  }
  function commitComp() {
    onPick({ id: comp.id, productId: comp.id, name: compName(), widthCm: cCm ? Number(cCm) : undefined, color: cColor === 'decor' ? 'дерево' : cColor, specTypeId: comp.specTypeId, base: comp.name })
    close()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)} style={{ ...inp, width: '100%', textAlign: 'left', cursor: 'pointer', background: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
        {shownName ? <><RalDot code={extractRal(shownName)} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shownName}</span></> : <span style={{ color: '#9a938a' }}>— товар из каталога —</span>}
      </button>
      {open && pos && createPortal(
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.22)', border: '1.5px solid #e6e2dc', display: 'flex', flexDirection: 'column', maxHeight: '60vh' }}>
            {comp ? (
              // ── Компоновка комплектующего: база + цвет + см → имя ──
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <button type="button" onClick={() => setComp(null)} style={{ border: 'none', background: '#f1efec', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', fontSize: 14 }}>‹</button>
                  <b style={{ fontSize: 14 }}>{comp.name}</b>
                  {comp.stdWidthCm != null && <span style={{ fontSize: 11, color: '#7a3aaa', background: '#f3eeff', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>станд. {Number(comp.stdWidthCm)} см</span>}
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em', marginBottom: 6 }}>ЦВЕТ</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                  {ralOrdered(cAll).map((c: any) => {
                    const on = cColor === c.code
                    return <button key={c.code} type="button" onClick={() => setCColor(on ? '' : c.code)} title={`${c.code} · ${c.name}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, border: 'none', background: 'none', cursor: 'pointer', padding: 0, width: 34 }}>
                      <span style={{ width: on ? 28 : 22, height: on ? 28 : 22, borderRadius: '50%', background: c.bg || c.hex, boxShadow: on ? '0 0 0 3px rgba(212,97,58,.3), inset 0 0 0 1.5px rgba(0,0,0,.12)' : 'inset 0 0 0 1.5px rgba(0,0,0,.14)' }} />
                      <span style={{ fontSize: 8.5, fontWeight: on ? 800 : 500, color: on ? COLORS.primary : '#6b645b' }}>{c.code === 'decor' ? 'дерево' : c.code}</span>
                    </button>
                  })}
                  <button type="button" onClick={() => setCAll(v => !v)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, border: 'none', background: 'none', cursor: 'pointer', width: 34 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#f1efec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{cAll ? '🙈' : '👁'}</span>
                    <span style={{ fontSize: 8.5, color: '#6b645b' }}>{cAll ? 'скрыть' : 'ещё'}</span>
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: '#5f5952' }}>Ширина:</span>
                  <input style={{ ...inp, width: 90, textAlign: 'right' }} inputMode="decimal" value={cCm} onChange={e => setCCm(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="см" />
                  <span style={{ fontSize: 13, color: '#5f5952' }}>см</span>
                </div>
                <button type="button" onClick={commitComp} style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>＋ Добавить: «{compName()}»</button>
              </div>
            ) : (
              <>
                <div style={{ padding: 10, display: 'flex', gap: 6, borderBottom: '1px solid #f1efec' }}>
                  <select style={{ ...inp, flex: 1 }} value={group} onChange={e => setGroup(e.target.value)}>
                    <option value="">Все группы</option>{groups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <input style={{ ...inp, flex: 1 }} placeholder="Поиск…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {list.length === 0 ? <div style={{ padding: 14, color: COLORS.textMuted, fontSize: 13, textAlign: 'center' }}>Ничего не найдено</div>
                    : list.map(p => (
                      <div key={p.id} onClick={() => pick(p)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', borderTop: '1px solid #f6f3f0' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#fff8f5')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                        <RalDot code={extractRal(p.name)} />
                        <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        {isCompl(p) ? <span style={{ fontSize: 11, color: COLORS.primary }}>цвет+см ›</span> : <span style={{ fontSize: 11, color: COLORS.textLight }}>{p.group || ''}</span>}
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
