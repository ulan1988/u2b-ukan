'use client'
// Схема водостока в каталоге (серии «Модерн бюджет» и «Дёке»): сверху папки серии (RAL или класс),
// под ними 3D-схема (детали двигаются и собираются, подписи — наши алиасы), ниже — выбранная деталь
// с количеством и список всех деталей. Количество пишется в тот же «выбранный» список каталога,
// что и строки обычного списка (ключ — имя товара).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { GutterKind, GutterScene } from '@/lib/gutter3d'
import { gutterTheme, type GutterFolder, type GutterSystem } from '@/lib/gutterParts'
import { cursorSoon, isWideScreen } from '@/lib/smartCursor'

const PRIMARY = '#d4613a', DARK = '#26231f'
const money = (n: number) => Math.round(n).toLocaleString('ru-RU')
const num = (s: string) => Number((s || '').replace(',', '.')) || 0

export default function GutterScheme({ system, products, folder, folders, onFolder, onList, qtyOf, setQty, stockTag }: {
  system: GutterSystem; products: any[]; folder: GutterFolder; folders: GutterFolder[]
  onFolder: (key: string) => void; onList: () => void
  qtyOf: (name: string) => number; setQty: (p: any, qty: number) => void
  stockTag?: (p: any) => ReactNode
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<GutterScene | null>(null)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<GutterKind | null>(null)
  const [assembled, setAssembled] = useState(false)
  const [note, setNote] = useState('')
  const noteTimer = useRef<any>(null)
  const theme = useMemo(() => gutterTheme(folder.hex), [folder.hex])

  // деталь → товар выбранной папки (или его нет в номенклатуре)
  const rows = useMemo(() => system.parts.map(part => {
    const product = system.product(products, part, folder)
    return { part, product, label: system.label(part, product, folder) }
  }), [system, products, folder])
  const rowsRef = useRef(rows); rowsRef.current = rows

  useEffect(() => {
    let dead = false, made: GutterScene | null = null
    const host = hostRef.current; if (!host) return
    import('@/lib/gutter3d').then(m => m.createGutterScene(host, {
      system: system.id, hide: system.hidden,
      onPick: k => setSel(k),
      onSnap: k => {
        const r = rowsRef.current.find(x => x.part.id === k)
        setNote(`${r ? r.label : 'Деталь'} — на месте`)
        clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => setNote(''), 1800)
      },
    })).then(s => { if (dead) { s.dispose(); return } made = s; sceneRef.current = s; setReady(true) })
      .catch(() => { if (!dead) setErr('Схема не открылась на этом устройстве — количество можно вписать в списке ниже.') })
    return () => { dead = true; clearTimeout(noteTimer.current); if (made) made.dispose(); sceneRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system.id])

  useEffect(() => { if (ready) sceneRef.current?.setPalette(theme.palette) }, [ready, theme])
  const qtyKey = rows.map(r => r.product ? qtyOf(r.product.name) : 0).join(',')
  useEffect(() => {
    if (!ready) return
    const m: any = {}
    for (const r of rows) m[r.part.id] = { text: r.label, qty: r.product ? qtyOf(r.product.name) : 0, off: !r.product }
    sceneRef.current?.setLabels(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rows, qtyKey])

  const pick = (k: GutterKind | null) => { setSel(k); sceneRef.current?.select(k) }
  const cur = rows.find(r => r.part.id === sel)
  const curQty = cur?.product ? qtyOf(cur.product.name) : 0
  const total = rows.reduce((a, r) => a + (r.product && qtyOf(r.product.name) > 0 ? 1 : 0), 0)
  const tight = folders.length > 3   // четыре папки и больше — плашки компактнее, чтобы влезли в телефон

  const seg = (on: boolean): React.CSSProperties => ({ border: 'none', background: on ? '#fff' : 'transparent', color: on ? DARK : 'inherit', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800 })
  // Выбрали деталь — курсор в её количестве (только за компьютером: на телефоне клавиатура закрыла бы схему).
  useEffect(() => { if (sel && isWideScreen()) cursorSoon('input[data-pick-qty]') }, [sel])
  const qtyInput = (p: any, big?: boolean) => (
    <input data-pick-qty={big ? '' : undefined} value={qtyOf(p.name) ? String(qtyOf(p.name)) : ''} inputMode="decimal" placeholder="кол-во"
      onClick={e => e.stopPropagation()} onFocus={e => e.currentTarget.select()}
      onChange={e => setQty(p, num(e.target.value.replace(/[^0-9.,]/g, '')))}
      style={{ width: big ? 84 : 74, padding: big ? '11px 6px' : '9px 8px', borderRadius: 10, border: `1.5px solid ${qtyOf(p.name) > 0 ? PRIMARY : '#e6e2dc'}`, background: '#fff', fontSize: big ? 18 : 15, fontWeight: 800, textAlign: 'center', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', flexShrink: 0 }} />
  )
  const stepBtn: React.CSSProperties = { width: 44, height: 44, borderRadius: 11, border: '1.5px solid #cfc8be', background: '#f7f5f2', fontSize: 22, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, color: DARK }

  return (
    <div>
      {/* папки серии: RAL или класс */}
      <div style={{ display: 'flex', gap: tight ? 5 : 8, padding: '9px 12px 2px', alignItems: 'stretch' }}>
        {folders.map(x => { const on = x.key === folder.key; return (
          <button key={x.key} onClick={() => onFolder(x.key)} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: tight ? 'column' : 'row', alignItems: 'center', gap: tight ? 3 : 8, border: on ? `2px solid ${PRIMARY}` : '1.5px solid #e2ddd5', background: on ? '#fff7f3' : '#fff', borderRadius: 12, padding: tight ? '6px 3px' : '7px 8px', cursor: 'pointer', fontFamily: 'inherit', textAlign: tight ? 'center' : 'left' }}>
            <span style={{ width: tight ? 22 : 30, height: tight ? 22 : 30, borderRadius: tight ? 7 : 9, background: x.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.18)', flexShrink: 0 }} />
            <span style={{ minWidth: 0, maxWidth: '100%' }}>
              <b style={{ display: 'block', fontSize: tight ? 12 : 14.5, fontWeight: 800, color: DARK, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</b>
              <span style={{ display: 'block', fontSize: 10.5, color: '#6b645b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.note}</span>
            </span>
          </button>
        )})}
        <button onClick={onList} title="Показать списком" style={{ flexShrink: 0, border: '1.5px solid #e2ddd5', background: '#fff', borderRadius: 12, padding: tight ? '0 7px' : '0 11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: '#5f5952' }}>☰<br />список</button>
      </div>

      {/* выбранная деталь: товар + количество. Стоит НАД схемой (правило владельца 24.11.2026): внизу панель уезжала
          под нижнее меню кассы, и кнопок количества не было видно. */}
      <div style={{ margin: '8px 12px 0', background: '#fff', borderRadius: 14, boxShadow: cur ? `0 0 0 2px ${PRIMARY}` : '0 0 0 1px #e6e2dc', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, minHeight: 66 }}>
        {!cur ? (
          <div style={{ flex: 1, fontSize: 13.5, color: '#6b645b' }}><b style={{ color: DARK }}>Нажмите на деталь</b> на схеме — здесь впишете количество.</div>
        ) : !cur.product ? (
          <div style={{ flex: 1, fontSize: 13.5, color: '#6b645b' }}><b style={{ color: DARK }}>{cur.label}</b> — в номенклатуре «{system.title} {folder.title}» такого товара нет.</div>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: DARK, lineHeight: 1.2 }}>{cur.label}</div>
              <div style={{ fontSize: 11.5, color: '#8a8377', lineHeight: 1.3 }}>{cur.product.name}</div>
              <div style={{ fontSize: 11.5, color: '#a09889', display: 'flex', alignItems: 'center', gap: 7, marginTop: 1 }}>
                <span>{Number(cur.product.priceRetail) > 0 ? `${money(Number(cur.product.priceRetail))} ₸/${cur.product.unit || 'шт'}` : 'цена — впишите в чеке'}</span>
                {stockTag?.(cur.product)}
              </div>
            </div>
            <button aria-label="Меньше" onClick={() => setQty(cur.product, Math.max(0, curQty - 1))} style={stepBtn}>−</button>
            {qtyInput(cur.product, true)}
            <button aria-label="Больше" onClick={() => setQty(cur.product, curQty + 1)} style={stepBtn}>+</button>
          </>
        )}
      </div>


      {/* схема */}
      <div style={{ position: 'relative', margin: '8px 12px', borderRadius: 14, overflow: 'hidden', background: theme.bg, color: theme.ink, boxShadow: '0 0 0 1px rgba(0,0,0,.08)' }}>
        <div ref={hostRef} style={{ position: 'relative', height: 'clamp(340px, 54vh, 520px)', fontFamily: 'inherit' }} />
        {!ready && !err && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 700, opacity: 0.8 }}>Открываю схему…</div>}
        {err && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontSize: 13.5, fontWeight: 600 }}>{err}</div>}
        {ready && (
          <>
            <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 2, padding: 3, borderRadius: 11, background: 'rgba(0,0,0,.28)', color: '#fff' }}>
              <button onClick={() => { setAssembled(false); sceneRef.current?.arrange(false) }} style={seg(!assembled)}>Разобрать</button>
              <button onClick={() => { setAssembled(true); sceneRef.current?.arrange(true) }} style={seg(assembled)}>Собрать</button>
            </div>
            <button onClick={() => sceneRef.current?.resetView()} title="Вернуть вид" style={{ position: 'absolute', top: 8, right: 8, border: 'none', background: 'rgba(0,0,0,.28)', color: '#fff', borderRadius: 11, padding: '9px 11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800 }}>⟲ вид</button>
            <div style={{ position: 'absolute', left: 10, right: 10, bottom: 7, fontSize: 11, opacity: 0.75, pointerEvents: 'none', textAlign: 'center' }}>{note || 'Деталь — тянуть и нажимать · пустое место — поворот · два пальца — ближе'}</div>
          </>
        )}
      </div>

      {/* все детали серии строками */}
      <div style={{ padding: '2px 14px 5px', fontSize: 11.5, fontWeight: 700, color: '#8a8377', letterSpacing: '.04em', textTransform: 'uppercase', display: 'flex' }}>
        <span>Детали · {system.title} {folder.title}</span><span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>{total ? `выбрано ${total}` : ''}</span>
      </div>
      <div style={{ margin: '0 12px', background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1px #e6e2dc', overflow: 'hidden' }}>
        {rows.map(r => { const on = sel === r.part.id, p = r.product; return (
          <div key={r.part.id} onClick={() => pick(r.part.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid #f4f1ed', background: on ? '#fff3ed' : p && qtyOf(p.name) > 0 ? '#fdf6f2' : '#fff', cursor: 'pointer', opacity: p ? 1 : 0.55 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: DARK, lineHeight: 1.25 }}>{r.label}</div>
              <div style={{ fontSize: 11.5, color: '#a09889', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p ? p.name : 'нет в номенклатуре'}</div>
            </div>
            {p && qtyInput(p)}
          </div>
        )})}
      </div>
    </div>
  )
}
