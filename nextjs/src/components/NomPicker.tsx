'use client'
// Каталог-модалка — портирована из Улкана 1:1 (RAL-круги, категории, производители,
// уровни-слова, длина, клавиатура количества). API → /api/products?all=1.
import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { overlayFor } from '@/lib/nomTree'
import { RAL_BY_CODE, RalDot, extractRal, ralOrdered } from '@/lib/ral'

const PRIMARY = '#d4613a'
const GLOW = '0 0 0 4px rgba(212,97,58,.25)'
export interface PickedPos { name1c: string; oral: string; qty: number; unit: string; widthCm?: number }
interface NomHit { id: string; name: string; unit: string }
interface NomFull { id: string; name: string; unit: string; group: string; cat: string; subgroup: string }
const NOCOLOR = '__none__'
const norm = (s: string) => (s || '').trim().toLowerCase().replace(/ё/g, 'е')

export default function NomPicker({ onPick, onClose }: { onPick: (items: PickedPos[]) => void; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [allItems, setAllItems] = useState<NomFull[]>([])
  const [loaded, setLoaded] = useState(false)
  const [color, setColor] = useState('')
  const [showAllColors, setShowAllColors] = useState(false)   // избранные / все цвета (глазок)
  const [selG, setSelG] = useState('')      // группа
  const [selC, setSelC] = useState('')      // папка (категория)
  const [selS, setSelS] = useState('')      // подпапка (подгруппа)
  const [folders, setFolders] = useState<{ grp: string; cat: string; sub: string }[]>([])
  const [sel, setSel] = useState<Record<string, string>>({})
  const [cm, setCm] = useState('')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<PickedPos[]>([])
  const [pad, setPad] = useState<null | { name1c: string; oral: string; unit: string; digits: string; widthCm?: number }>(null)
  const padRef = useRef(pad); padRef.current = pad

  const overlays = overlayFor(selC || selG)   // накладки-слова (толщина/покрытие) — по выбранной папке

  useEffect(() => {
    setMounted(true)
    fetch('/api/products?all=1').then(r => r.ok ? r.json() : []).then((d: any[]) => {
      setAllItems(Array.isArray(d) ? d.map(x => ({ id: x.id, name: x.name || '', unit: x.unit || 'шт', group: x.group || '', cat: x.cat || '', subgroup: x.subgroup || '' })) : [])
      setLoaded(true)
    }).catch(() => setLoaded(true))
    fetch('/api/folders').then(r => r.ok ? r.json() : []).then((f: any[]) => setFolders(Array.isArray(f) ? f : [])).catch(() => {})
  }, [])

  const cEntry = color && color !== NOCOLOR ? RAL_BY_CODE[color] : undefined
  const colorLabel = cEntry ? (cEntry.code === 'decor' ? 'дерево' : cEntry.code) : ''
  const selItems = overlays.map(lv => lv.items.find(i => i.key === sel[lv.key])).filter(Boolean) as { key: string; label: string; terms?: string[]; measure?: boolean; exclude?: string[] }[]
  // Изделие меряется в см (Длина). Показываем поле, когда выбрана папка «Изделие» (категория/подпапка).
  const needsCm = [selG, selC, selS].some(x => /издели/i.test(x || ''))

  const words: string[] = []; const excludes: string[] = []
  overlays.forEach(lv => {
    const it = lv.items.find(i => i.key === sel[lv.key])
    if (!it || lv.key === 'thick') return
    ;(it.terms ?? [it.label]).forEach(t => words.push(t))
    if (it.measure && cm) words.push(`№ ${cm}`)
    if (it.exclude) excludes.push(...it.exclude)
  })
  if (text.trim()) words.push(text.trim())

  const decorRe = /(^|[^0-9a-zа-яё])(дуб|дерево|3d)/i
  const colorPass = (name: string): boolean => {
    if (!color) return true
    if (color === NOCOLOR) return extractRal(name) === ''
    if (color === 'decor') return decorRe.test(name)
    return new RegExp('(^|[^0-9])' + color + '(?![0-9])').test(name)
  }
  const thickItem = overlays.find(lv => lv.key === 'thick')?.items.find(i => i.key === sel['thick'])
  const thickRe: RegExp | null = thickItem ? new RegExp('(^|[^0-9])' + thickItem.label.replace(/[.,]/g, '[.,]') + '(?![0-9])') : null

  function asIsName(): string {
    const parts: string[] = []
    if (selS) parts.push(selS)
    else if (needsCm && selC) parts.push(selC)
    else if (needsCm && selG) parts.push(selG)
    selItems.forEach(i => parts.push(i.label))
    if (colorLabel) parts.push(colorLabel)
    if (text.trim()) parts.push(text.trim())
    let n = parts.join(' ').trim()
    if (needsCm && cm) n += ` · ${cm} см`
    return n
  }

  const inGroup = (i: NomFull, g: string) => norm(i.group) === norm(g) || norm(i.cat) === norm(g)
  const inCat = (i: NomFull, g: string, c: string) => (norm(i.group) === norm(g) && norm(i.cat) === norm(c)) || (norm(i.group) === norm(c) && norm(i.cat) === norm(g))
  const countGroup = (g: string) => allItems.filter(i => inGroup(i, g)).length
  const countCat = (g: string, c: string) => allItems.filter(i => inCat(i, g, c)).length
  const countSub = (g: string, c: string, s: string) => allItems.filter(i => inCat(i, g, c) && norm(i.subgroup) === norm(s)).length

  // Дерево пикера: папки (nom_folders) + фактические пути товаров. Скрытые (hidden) папки и их
  // потомки в каталог НЕ попадают (в номенклатуре остаются). Показываем только непустые группы.
  const tree = useMemo(() => {
    const hidG = new Set<string>(), hidC = new Set<string>(), hidS = new Set<string>()
    for (const f of folders as any[]) {
      if (!f.hidden) continue
      if (f.sub) hidS.add(`${f.grp}||${f.cat}||${f.sub}`); else if (f.cat) hidC.add(`${f.grp}||${f.cat}`); else if (f.grp) hidG.add(f.grp)
    }
    const okG = (g: string) => !hidG.has(g)
    const okC = (g: string, c: string) => okG(g) && !hidC.has(`${g}||${c}`)
    const okS = (g: string, c: string, s: string) => okC(g, c) && !hidS.has(`${g}||${c}||${s}`)
    const t: Record<string, Record<string, string[]>> = {}
    const eG = (g: string) => { if (g && okG(g) && !t[g]) t[g] = {} }
    const eC = (g: string, c: string) => { eG(g); if (c && okC(g, c) && t[g] && !t[g][c]) t[g][c] = [] }
    const eS = (g: string, c: string, s: string) => { eC(g, c); if (s && okS(g, c, s) && t[g]?.[c] && !t[g][c].includes(s)) t[g][c].push(s) }
    for (const f of folders as any[]) { if (f.hidden) continue; if (f.sub) eS(f.grp, f.cat, f.sub); else if (f.cat) eC(f.grp, f.cat); else if (f.grp) eG(f.grp) }
    for (const i of allItems) { if (i.group) { eG(i.group); if (i.cat) { eC(i.group, i.cat); if (i.subgroup) eS(i.group, i.cat, i.subgroup) } } }
    return t
  }, [folders, allItems])
  const groups = Object.keys(tree).filter(g => countGroup(g) > 0)

  let base = allItems
  if (selS) base = base.filter(i => inCat(i, selG, selC) && norm(i.subgroup) === norm(selS))
  else if (selC) base = base.filter(i => inCat(i, selG, selC))
  else if (selG) base = base.filter(i => inGroup(i, selG))

  const mustWords = words.flatMap(t => t.toLowerCase().split(/[^а-яёa-z0-9]+/i)).filter(w => w.length >= 1)
  const anySelection = !!(selG || selC || selS || words.join(' ').trim() || color || thickItem)
  const loading = !loaded
  const shown: NomHit[] = !anySelection ? [] : base
    .filter(i => !excludes.some(w => i.name.toLowerCase().includes(w.toLowerCase())))
    .filter(i => colorPass(i.name))
    .filter(i => !thickRe || thickRe.test(i.name))
    .filter(i => mustWords.every(w => i.name.toLowerCase().includes(w)))
    .map(i => ({ i, score: mustWords.filter(w => i.name.toLowerCase().includes(w)).length }))
    .sort((a, b) => b.score - a.score || a.i.name.length - b.i.name.length)
    .map(x => ({ id: x.i.id, name: x.i.name, unit: x.i.unit }))

  function pickColor(c: string) { setColor(prev => prev === c ? '' : c) }
  function pickGroup(g: string) { setSelG(prev => prev === g ? '' : g); setSelC(''); setSelS(''); setSel({}); setCm('') }
  function pickCat(c: string) { setSelC(prev => prev === c ? '' : c); setSelS(''); setSel({}); setCm('') }
  function pickSub(s: string) { setSelS(prev => prev === s ? '' : s) }
  function pickItem(levelKey: string, itemKey: string, isMeasure: boolean) {
    setSel(prev => { const next = { ...prev }; if (next[levelKey] === itemKey) delete next[levelKey]; else next[levelKey] = itemKey; return next })
    if (!isMeasure) setCm('')
  }
  function commitPad() {
    const p = padRef.current; if (!p) return
    const qty = parseInt(p.digits || '0', 10) || 0; if (qty <= 0) return
    setRows(prev => [...prev, { name1c: p.name1c, oral: p.oral, qty, unit: p.unit, widthCm: p.widthCm }]); setPad(null)
  }
  useEffect(() => {
    if (!pad) return
    function onKey(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); setPad(p => p && p.digits.length < 6 ? { ...p, digits: (p.digits === '0' ? '' : p.digits) + e.key } : p) }
      else if (e.key === 'Backspace') { e.preventDefault(); setPad(p => p ? { ...p, digits: p.digits.slice(0, -1) } : p) }
      else if (e.key === 'Enter') { e.preventDefault(); commitPad() }
      else if (e.key === 'Escape') { e.preventDefault(); setPad(null) }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pad])

  function submit() { if (rows.length) { onPick(rows); onClose() } }
  const totalUnits = rows.reduce((s, r) => s + r.qty, 0)

  const crumbs: React.ReactNode[] = []
  if (selG) crumbs.push(<span key="p" style={{ fontWeight: 700 }}>{selG}</span>)
  if (selC) crumbs.push(<span key="c2">{selC}</span>)
  if (selS) crumbs.push(<span key="s2">{selS}</span>)
  selItems.forEach(it => crumbs.push(<span key={it.key}>«{it.label}»</span>))
  if (needsCm && cm) crumbs.push(<span key="cm"><b style={{ color: PRIMARY }}>{cm} см</b></span>)
  if (cEntry) crumbs.push(<span key="c"><b style={{ color: PRIMARY }}>{colorLabel}</b> ({cEntry.name.toLowerCase()})</span>)
  else if (color === NOCOLOR) crumbs.push(<span key="c">без цвета</span>)
  if (text.trim()) crumbs.push(<span key="t">«{text.trim()}»</span>)

  if (!mounted) return null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.55)', zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 432, maxHeight: '94vh', borderRadius: '18px 18px 0 0', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,.3)', fontFamily: "'Golos Text', system-ui, sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #f1efec', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>📖 Каталог</div>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: '#f1efec', width: 32, height: 32, borderRadius: '50%', fontSize: 16, cursor: 'pointer', color: '#5f5952' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div>
            <div style={LBL}>ЦВЕТ</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
              {ralOrdered(showAllColors).map(c => {
                const on = color === c.code
                return (
                  <button key={c.code} onClick={() => pickColor(c.code)} title={`${c.code} · ${c.name}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', width: 40 }}>
                    <span style={{ width: on ? 38 : 28, height: on ? 38 : 28, borderRadius: '50%', background: c.bg || c.hex, boxShadow: on ? `${GLOW}, inset 0 0 0 2px rgba(0,0,0,.12)` : 'inset 0 0 0 1.5px rgba(0,0,0,.14)', transition: 'all .12s' }} />
                    <span style={{ fontSize: 9.5, fontWeight: on ? 800 : 500, color: on ? PRIMARY : '#6b645b', textAlign: 'center', lineHeight: 1.1 }}>{c.code === 'decor' ? 'дерево' : c.code}</span>
                  </button>
                )
              })}
              <button key="more" onClick={() => setShowAllColors(v => !v)} title={showAllColors ? 'Скрыть' : 'Показать все цвета'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', width: 40 }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#f1efec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: 'inset 0 0 0 1.5px rgba(0,0,0,.1)' }}>{showAllColors ? '🙈' : '👁'}</span>
                <span style={{ fontSize: 9.5, color: '#6b645b', textAlign: 'center', lineHeight: 1.1 }}>{showAllColors ? 'скрыть' : 'ещё'}</span>
              </button>
              {(() => {
                const on = color === NOCOLOR
                return (
                  <button key="nocolor" onClick={() => pickColor(NOCOLOR)} title="Без цвета" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', width: 40 }}>
                    <span style={{ width: on ? 38 : 28, height: on ? 38 : 28, borderRadius: '50%', background: 'linear-gradient(45deg, transparent 45%, #c1121c 45%, #c1121c 55%, transparent 55%), #fff', boxShadow: on ? `${GLOW}, inset 0 0 0 2px rgba(0,0,0,.12)` : 'inset 0 0 0 1.5px rgba(0,0,0,.2)', transition: 'all .12s' }} />
                    <span style={{ fontSize: 9.5, fontWeight: on ? 800 : 500, color: on ? PRIMARY : '#6b645b', textAlign: 'center', lineHeight: 1.1 }}>нет</span>
                  </button>
                )
              })()}
            </div>
          </div>
          <div>
            <div style={LBL}>КАТЕГОРИЯ</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{groups.map(g => <button key={g} onClick={() => pickGroup(g)} style={pill(selG === g)}>{g}{loaded && <span style={cnt(selG === g)}>{countGroup(g)}</span>}</button>)}</div>
          </div>
          {selG && Object.keys(tree[selG] || {}).length > 0 && (
            <div>
              <div style={LBL}>ПАПКА</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{Object.keys(tree[selG]).map(c => <button key={c} onClick={() => pickCat(c)} style={pill(selC === c)}>{c}{loaded && <span style={cnt(selC === c)}>{countCat(selG, c)}</span>}</button>)}</div>
            </div>
          )}
          {selG && selC && (tree[selG]?.[selC] || []).length > 0 && (
            <div>
              <div style={LBL}>ПОДПАПКА</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{(tree[selG][selC]).map(s => <button key={s} onClick={() => pickSub(s)} style={pill(selS === s)}>{s}{loaded && <span style={cnt(selS === s)}>{countSub(selG, selC, s)}</span>}</button>)}</div>
            </div>
          )}
          {overlays.map(lv => (
            <div key={lv.key}>
              <div style={LBL}>{lv.label.toUpperCase()}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{lv.items.map(it => <button key={it.key} onClick={() => pickItem(lv.key, it.key, !!it.measure)} style={pill(sel[lv.key] === it.key)}>{it.label}</button>)}</div>
            </div>
          ))}
          {needsCm && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff8f5', border: '1.5px solid #f0d9cc', borderRadius: 10, padding: '8px 12px' }}>
              <span style={{ fontSize: 14, color: '#5f5952', fontWeight: 700 }}>📏 Длина изделия:</span>
              <input autoFocus value={cm} onChange={e => setCm(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="см" style={{ width: 90, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${cm ? PRIMARY : '#e6e2dc'}`, fontSize: 15, fontFamily: 'inherit', outline: 'none', textAlign: 'center', fontWeight: 700 }} />
              <span style={{ fontSize: 14, color: '#5f5952' }}>см</span>
            </div>
          )}
          <div>
            <div style={LBL}>УТОЧНИТЬ СЛОВАМИ</div>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="доп. слова поиска…" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${text ? PRIMARY : '#e6e2dc'}`, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            {crumbs.length > 0 && <div style={{ fontSize: 13, color: '#5f5952', marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}><span style={{ fontWeight: 700 }}>Фильтр:</span>{crumbs.map((c, i) => <span key={i} style={{ display: 'inline-flex', gap: 4 }}>{i > 0 && <span style={{ color: '#cfc9c0' }}>+</span>}{c}</span>)}</div>}
          </div>
          {anySelection && (
            <div>
              <div style={LBL}>НАЙДЕНО В БАЗЕ</div>
              {loading ? <div style={{ fontSize: 14, color: '#5f5952', padding: '8px 0' }}>Поиск…</div>
                : shown.length > 0 ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{shown.map(h => <button key={h.id} onClick={() => setPad({ name1c: h.name, oral: h.name, unit: h.unit, digits: '', widthCm: needsCm && cm ? Number(cm) : undefined })} style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', border: '1.5px solid #e6e2dc', background: '#fff', borderRadius: 9, padding: '9px 11px', cursor: 'pointer', fontFamily: 'inherit' }}><RalDot code={extractRal(h.name)} size={14} /><span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span><span style={{ fontSize: 12, color: '#5f5952', background: '#f1efec', padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>{h.unit}</span><span style={{ color: PRIMARY, fontWeight: 800, flexShrink: 0 }}>+</span></button>)}</div>
                  : <div style={{ fontSize: 14, color: '#5f5952', padding: '8px 0' }}>Не найдено в папке — можно добавить как есть ↓</div>}
              {asIsName() && <button onClick={() => { const n = asIsName(); if (n) setPad({ name1c: '', oral: n, unit: 'шт', digits: '', widthCm: needsCm && cm ? Number(cm) : undefined }) }} style={{ marginTop: 8, width: '100%', border: '1.5px dashed #d8d3cc', background: 'none', borderRadius: 9, padding: '9px', cursor: 'pointer', fontSize: 14, color: '#4a4640', fontFamily: 'inherit', fontWeight: 600 }}>＋ Добавить как есть: «{asIsName()}»</button>}
            </div>
          )}
          {rows.length > 0 && (
            <div>
              <div style={LBL}>ВЫБРАНО</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{rows.map((r, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8f6f3', borderRadius: 9, padding: '8px 10px' }}><RalDot code={extractRal(r.name1c || r.oral)} size={14} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name1c || r.oral}</div>{!r.name1c && <div style={{ fontSize: 12, color: '#6b645b' }}>со слов</div>}</div><span style={{ fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{r.qty} {r.unit}</span><button onClick={() => setRows(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#c1121c', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button></div>)}</div>
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 14, color: '#5f5952' }}>{rows.length} поз. · {totalUnits} шт</div>
          <button onClick={submit} disabled={rows.length === 0} style={{ marginLeft: 'auto', border: 'none', background: rows.length ? PRIMARY : '#e6e2dc', color: '#fff', borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 800, cursor: rows.length ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Добавить в заказ →</button>
        </div>
      </div>
      {pad && (
        <div onClick={() => setPad(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.5)', zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 18, width: '100%', maxWidth: 320 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><RalDot code={extractRal(pad.name1c || pad.oral)} size={20} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pad.name1c || pad.oral}</div><div style={{ fontSize: 12, color: '#5f5952' }}>количество, {pad.unit}</div></div></div>
            <div style={{ background: '#f8f6f3', borderRadius: 12, padding: '16px 18px', textAlign: 'right', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 34, fontWeight: 700, minHeight: 30, color: pad.digits ? '#26231f' : '#cfc9c0', marginBottom: 12 }}>{pad.digits || '0'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(d => <button key={d} onClick={() => setPad(p => p && p.digits.length < 6 ? { ...p, digits: (p.digits === '0' ? '' : p.digits) + d } : p)} style={keyBtn}>{d}</button>)}
              <button onClick={() => setPad(p => p && p.digits.length < 6 ? { ...p, digits: (p.digits === '0' ? '' : p.digits) + '0' } : p)} style={{ ...keyBtn, gridColumn: 'span 2' }}>0</button>
              <button onClick={() => setPad(p => p ? { ...p, digits: p.digits.slice(0, -1) } : p)} style={{ ...keyBtn, background: '#f1efec' }}>←</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button onClick={() => setPad(null)} style={{ flex: 1, border: '1.5px solid #e6e2dc', background: '#fff', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#5f5952' }}>Отмена</button><button onClick={commitPad} style={{ flex: 2, border: 'none', background: PRIMARY, color: '#fff', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Добавить</button></div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}

const LBL: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#6b645b', letterSpacing: '.05em', marginBottom: 8 }
const keyBtn: React.CSSProperties = { padding: '14px 0', borderRadius: 10, border: 'none', background: '#f8f6f3', fontSize: 20, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: '#26231f' }
function pill(on: boolean): React.CSSProperties { return { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 22, border: 'none', fontSize: 14, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', background: on ? PRIMARY : '#f1efec', color: on ? '#fff' : '#4a4640', boxShadow: on ? GLOW : 'none', transition: 'all .12s' } }
function cnt(on: boolean): React.CSSProperties { return { fontSize: 12, fontWeight: 700, color: on ? 'rgba(255,255,255,.8)' : '#6b645b' } }
