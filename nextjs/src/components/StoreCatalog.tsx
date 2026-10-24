'use client'
// Единый каталог-пикер (как в кассе магазина): вкладки-папки · подпапки · цвет · поиск ·
// алиасы · ввод кол-ва · сборка изделия (цвет+см). Возвращает выбранные позиции (PickedPos[]).
// Заменяет старый NomPicker в кабинетах клиента/мастера и форме «Заказ».
import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { PickedPos } from '@/components/NomPicker'
import { itemName } from '@/lib/itemName'
import { isIzdelie } from '@/lib/lineAmount'
import { extractRal, ralOrdered } from '@/lib/ral'

const PRIMARY = '#d4613a', DARK = '#26231f'
const norm = (s: string) => (s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')
const num = (s: string) => Number((s || '').replace(',', '.')) || 0
const thickOf = (name: string) => { const m = (name || '').match(/(\d+(?:[.,]\d+)?)\s*мм/i); return m ? m[1].replace('.', ',') + 'мм' : '' }
const THICK_SET = ['0,35мм', '0,4мм', '0,45мм']
const KOMPLEKT_CHIPS = ['Изделие', 'J - профиль', 'H - профиль', 'Внут. угол (пр)', 'Нар. угол (пр)']
const FOLDERS = [
  { key: 'vodostok', label: 'Водосток', match: (p: any) => norm(p.group) === 'водосток', levels: ['cat', 'subgroup'] },
  { key: 'evrobrus', label: 'Евро брус', match: (p: any) => norm(p.cat) === 'евро брус', levels: ['subgroup'], thickness: true },
  { key: 'kompl', label: 'Комплект.', match: (p: any) => norm(p.cat).includes('комплект'), build: true, levels: ['subgroup'] },
  { key: 'cherep', label: 'Металлоч.', match: (p: any) => norm(p.cat) === 'металлочерепица', levels: ['subgroup'] },
]
const inp: CSSProperties = { padding: '9px 10px', borderRadius: 9, border: '1.5px solid #e6e2dc', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%', outline: 'none' }
const money = (n: number) => Math.round(n).toLocaleString('ru-RU')

export default function StoreCatalog({ onPick, onClose, orgId }: { onPick: (items: PickedPos[]) => void; onClose: () => void; orgId?: string }) {
  const [products, setProducts] = useState<any[]>([])
  const [folder, setFolder] = useState(FOLDERS[0].key)
  const [path, setPath] = useState<string[]>([])
  const [thick, setThick] = useState('')
  const [kfilter, setKfilter] = useState('')
  const [color, setColor] = useState('')
  const [allColors, setAllColors] = useState(false)
  const [q, setQ] = useState('')
  const [build, setBuild] = useState<any>(null)   // сборка изделия: { base, cm, qty }
  const [picked, setPicked] = useState<PickedPos[]>([])
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const u = orgId ? `/api/products?orgId=${orgId}` : '/api/products'
    fetch(u).then(r => r.ok ? r.json() : []).then((d: any[]) => setProducts(Array.isArray(d) ? d : [])).catch(() => {})
  }, [orgId])

  const byName = useMemo(() => { const m: Record<string, any> = {}; for (const p of products) m[norm(p.name)] = p; return m }, [products])

  // Недостающие папки (прочие категории) — добавляются справа.
  const extraFolders = useMemo(() => {
    const covered = new Set(['водосток', 'евро брус', 'комплектующие', 'металлочерепица'])
    const cats = new Set<string>()
    for (const p of products) {
      const g = norm(p.group); if (g === 'водосток' || g === 'материалы' || g === 'услуги') continue
      const c = (p.cat || '').trim(); if (c && !covered.has(norm(c))) cats.add(c)
    }
    return Array.from(cats).sort((a, b) => a.localeCompare(b, 'ru')).map(c => ({ key: 'cat:' + norm(c), label: c, match: (p: any) => norm(p.cat) === norm(c), levels: [] as string[] }))
  }, [products])
  const folders = useMemo(() => [...FOLDERS, ...extraFolders], [extraFolders])
  const activeFolder: any = folders.find(f => f.key === folder) || folders[0]
  const levels: string[] = (activeFolder as any).levels || []

  const subRows = useMemo(() => {
    const rows: { level: number; field: string; vals: string[] }[] = []
    let scope = products.filter(activeFolder.match)
    for (let i = 0; i < levels.length; i++) {
      const field = levels[i]
      const vals = Array.from(new Set(scope.map((p: any) => (p[field] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'))
      if (vals.length > 1) rows.push({ level: i, field, vals })
      if (path[i]) scope = scope.filter((p: any) => (p[field] || '').trim() === path[i]); else break
    }
    return rows
  }, [products, activeFolder, levels, path])

  const thicks = useMemo(() => {
    if (!(activeFolder as any).thickness) return []
    let scope = products.filter(activeFolder.match)
    for (let i = 0; i < levels.length; i++) if (path[i]) scope = scope.filter((p: any) => (p[levels[i]] || '').trim() === path[i])
    const present = new Set(scope.map((p: any) => thickOf(p.name)))
    return THICK_SET.filter(t => present.has(t))
  }, [products, activeFolder, levels, path])

  const list = useMemo(() => {
    const sQ = norm(q)
    if (sQ) return products.filter(p => `${norm(p.name)} ${norm(p.alias || '')}`.includes(sQ)).slice(0, 150)
    let base = products.filter(activeFolder.match)
    for (let i = 0; i < levels.length; i++) if (path[i]) base = base.filter((p: any) => (p[levels[i]] || '').trim() === path[i])
    if (thick) base = base.filter((p: any) => thickOf(p.name) === thick)
    if (activeFolder.build) {
      base = base.filter(p => !extractRal(p.name))
      if (kfilter) base = base.filter(p => norm(p.name) === norm(kfilter))
      base = [...base].sort((a, b) => (isIzdelie(b.name) ? 1 : 0) - (isIzdelie(a.name) ? 1 : 0))
    } else if (color) {
      base = base.filter(p => extractRal(p.name) === color)
    }
    return base.slice(0, 150)
  }, [products, activeFolder, levels, path, thick, kfilter, color, q])

  // добавить/изменить позицию в выбранном (ключ — финальное имя)
  function upsert(name1c: string, patch: Partial<PickedPos>) {
    setPicked(ps => {
      const i = ps.findIndex(x => x.name1c === name1c)
      if (i >= 0) { const next = [...ps]; next[i] = { ...next[i], ...patch }; if ((next[i].qty || 0) <= 0) next.splice(i, 1); return next }
      if ((patch.qty || 0) <= 0) return ps
      return [...ps, { name1c, oral: name1c, qty: 0, unit: 'шт', ...patch } as PickedPos]
    })
  }
  const qtyOf = (name1c: string) => picked.find(x => x.name1c === name1c)?.qty || 0

  function addBuilt() {
    const b = build; if (!b) return
    if (!color) return   // цвет обязателен — иначе имя без цвета
    if (isIzdelie(b.base.name) && !num(b.cm)) { return }
    const name = itemName({ name: b.base.name, color, cm: b.cm })
    const qty = Math.max(1, num(b.qty) || 1)
    const widthCm = num(b.cm) || undefined
    setBuild(null)
    setPicked(ps => [...ps, { name1c: name, oral: name, qty, unit: b.base.unit || 'шт', widthCm }])
  }

  function done() { onPick(picked); onClose() }

  const colorlessName = (p: any) => activeFolder.build ? itemName({ name: p.name, color }) : p.name

  if (!mounted) return null
  // Портал в body + высокий z-index — чтобы каталог покрывал ВСЁ (шапку, плавающие кнопки),
  // не завися от стекинг-контекста родителя (кабинеты/заказ).
  return createPortal((
    <div style={{ position: 'fixed', inset: 0, background: '#f1efec', zIndex: 100000, display: 'flex', flexDirection: 'column', fontFamily: "'Golos Text', system-ui, sans-serif" }}>
      {/* шапка */}
      <div style={{ background: '#211f1c', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, flex: 1 }}>📖 Каталог</span>
        <button onClick={onClose} style={{ border: '1px solid #444', background: 'none', color: '#ccc', fontSize: 13, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>Отмена</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: picked.length ? 78 : 12 }}>
        {/* папки */}
        <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #e6e2dc', overflowX: 'auto' }}>
          {folders.map(f => { const on = folder === f.key; return (
            <button key={f.key} onClick={() => { setFolder(f.key); setBuild(null); setPath([]); setThick(''); setKfilter('') }} style={{ flexShrink: 0, border: 'none', background: 'none', padding: '11px 14px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? PRIMARY : '#6b645b', borderBottom: `3px solid ${on ? PRIMARY : 'transparent'}`, whiteSpace: 'nowrap' }}>{f.label}</button>
          )})}
        </div>

        {/* подпапки */}
        {subRows.map(row => (
          <div key={row.level} style={{ display: 'flex', gap: 6, padding: '7px 10px', background: '#faf8f5', borderBottom: '1px solid #efeae3', overflowX: 'auto' }}>
            {row.vals.map(v => { const on = path[row.level] === v; return (
              <button key={v} onClick={() => { setThick(''); setPath(prev => { const next = prev.slice(0, row.level); if (prev[row.level] !== v) next[row.level] = v; return next }) }} style={{ flexShrink: 0, border: on ? 'none' : '1.5px solid #e2ddd5', background: on ? PRIMARY : '#fff', color: on ? '#fff' : '#5f5952', borderRadius: 20, padding: '6px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap' }}>{v}</button>
            )})}
          </div>
        ))}

        {/* толщина */}
        {thicks.length > 0 && (
          <div style={{ display: 'flex', gap: 6, padding: '7px 10px', background: '#f4f6f8', borderBottom: '1px solid #e6eaef', overflowX: 'auto', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, color: '#8a8377', fontWeight: 700, flexShrink: 0 }}>толщина:</span>
            <button onClick={() => setThick('')} style={{ flexShrink: 0, border: thick === '' ? 'none' : '1.5px solid #cfd6df', background: thick === '' ? DARK : '#fff', color: thick === '' ? '#fff' : '#5f5952', borderRadius: 20, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: thick === '' ? 800 : 600 }}>все</button>
            {thicks.map(tk => { const on = thick === tk; return <button key={tk} onClick={() => setThick(on ? '' : tk)} style={{ flexShrink: 0, border: on ? 'none' : '1.5px solid #cfd6df', background: on ? '#2a5aaa' : '#fff', color: on ? '#fff' : '#3a4a5f', borderRadius: 20, padding: '6px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap' }}>{tk}</button> })}
          </div>
        )}

        {/* чипы комплектующих */}
        {activeFolder.build && (
          <div style={{ display: 'flex', gap: 6, padding: '7px 10px', background: '#faf8f5', borderBottom: '1px solid #efeae3', overflowX: 'auto' }}>
            <button onClick={() => setKfilter('')} style={{ flexShrink: 0, border: kfilter === '' ? 'none' : '1.5px solid #e2ddd5', background: kfilter === '' ? DARK : '#fff', color: kfilter === '' ? '#fff' : '#5f5952', borderRadius: 20, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: kfilter === '' ? 800 : 600 }}>все</button>
            {KOMPLEKT_CHIPS.map(nm => { const on = kfilter === nm; return <button key={nm} onClick={() => setKfilter(on ? '' : nm)} style={{ flexShrink: 0, border: on ? 'none' : '1.5px solid #e2ddd5', background: on ? PRIMARY : '#fff', color: on ? '#fff' : '#5f5952', borderRadius: 20, padding: '6px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap' }}>{nm}</button> })}
          </div>
        )}

        {/* цвета */}
        <div style={{ background: '#fff', padding: '9px 10px 10px', borderBottom: '1px solid #e6e2dc', display: 'flex', gap: 9, overflowX: 'auto' }}>
          <button onClick={() => setColor('')} title="Без фильтра по цвету" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ width: 46, height: 46, borderRadius: 13, background: 'linear-gradient(45deg, transparent 44%, #c1121c 44%, #c1121c 56%, transparent 56%), #fff', boxShadow: color === '' ? `0 0 0 3px ${PRIMARY}, inset 0 0 0 1px #ddd8d0` : '0 0 0 1px #ddd8d0' }} />
            <span style={{ fontSize: 10.5, fontWeight: color === '' ? 800 : 600, color: color === '' ? DARK : '#6b645b', whiteSpace: 'nowrap' }}>без цвета</span>
          </button>
          {ralOrdered(allColors).map(c => { const on = color === c.code; return (
            <button key={c.code} onClick={() => setColor(on ? '' : c.code)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ width: 46, height: 46, borderRadius: 13, background: (c as any).hex || (c as any).bg, boxShadow: on ? `0 0 0 3px ${PRIMARY}, inset 0 0 0 1px #ddd8d0` : '0 0 0 1px #ddd8d0' }} />
              <span style={{ fontSize: 10.5, fontWeight: on ? 800 : 600, color: on ? DARK : '#6b645b' }}>{c.code === 'decor' ? 'дерево' : c.code}</span>
            </button>
          )})}
          <button onClick={() => setAllColors(v => !v)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ width: 46, height: 46, borderRadius: 13, background: '#f7f5f2', boxShadow: '0 0 0 1px #ddd8d0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>👁</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: '#8a8377' }}>{allColors ? 'меньше' : 'ещё'}</span>
          </button>
        </div>

        {/* поиск */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px 6px' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 поиск по названию" style={{ flex: 1, padding: '9px 11px', borderRadius: 10, border: '1.5px solid #e6e2dc', background: '#fff', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          <span style={{ fontSize: 11.5, color: '#a09889', whiteSpace: 'nowrap' }}>{list.length} поз.</span>
        </div>

        {/* сборка изделия: см + кол-во (цвет сверху) */}
        {build && (
          <div style={{ margin: '0 12px 8px', background: '#fff', borderRadius: 12, padding: 12, boxShadow: `0 0 0 2px ${PRIMARY}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{itemName({ name: build.base.name, color, cm: build.cm })}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <label style={{ flex: 1, fontSize: 11, color: '#5f5952' }}>Размер, см<input value={build.cm} inputMode="decimal" autoFocus onChange={e => setBuild((b: any) => ({ ...b, cm: e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder={isIzdelie(build.base.name) ? 'обязательно' : 'если нужен'} style={{ ...inp, marginTop: 3 }} /></label>
              <label style={{ width: 90, fontSize: 11, color: '#5f5952' }}>Кол-во<input value={build.qty} inputMode="decimal" onChange={e => setBuild((b: any) => ({ ...b, qty: e.target.value.replace(/[^0-9.,]/g, '') }))} style={{ ...inp, marginTop: 3 }} /></label>
              <button onClick={addBuilt} style={{ border: 'none', background: PRIMARY, color: '#fff', borderRadius: 10, padding: '11px 16px', cursor: 'pointer', fontSize: 15, fontWeight: 800, fontFamily: 'inherit' }}>Добавить</button>
              <button onClick={() => setBuild(null)} style={{ border: '1.5px solid #e6e2dc', background: '#fff', color: '#6b645b', borderRadius: 10, padding: '11px 12px', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>✕</button>
            </div>
          </div>
        )}

        {/* Комплектующие/изделия — ЦВЕТ ОБЯЗАТЕЛЕН: пока не выбран, список скрыт, показываем «выберите цвет». */}
        {activeFolder.build && !color ? (
          <div style={{ margin: '0 12px', background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1px #e6e2dc', padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🎨</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#c0532a', marginBottom: 6 }}>Сначала выберите цвет ↑</div>
            <div style={{ fontSize: 13, color: '#8a837a' }}>Для изделий и комплектующих цвет обязателен — тогда имя будет полным, напр. «Изделие 7004 26 см».</div>
          </div>
        ) : (
        <div style={{ margin: '0 12px', background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1px #e6e2dc', overflow: 'hidden' }}>
          {list.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: '#8a8377', fontSize: 13.5 }}>{color ? 'В этом цвете ничего нет' : 'Ничего не найдено'}</div>}
          {list.map(p => {
            const izd = activeFolder.build && isIzdelie(p.name)
            const name1c = colorlessName(p)
            const price = Number(p.priceRetail) || 0
            return (
              <div key={p.id} onClick={() => { if (izd && !build && color) setBuild({ base: p, cm: '', qty: '1' }) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #f4f1ed', background: (!izd && qtyOf(name1c) > 0) ? '#fdf6f2' : '#fff', cursor: izd ? 'pointer' : 'default', opacity: (activeFolder.build && !color) ? 0.5 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: DARK, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: '#a09889' }}>{izd ? 'выбор см и кол-ва →' : price > 0 ? `${money(price)} ₸/${p.unit || 'шт'}` : p.unit || 'шт'}</div>
                </div>
                {izd ? (
                  <span style={{ width: 40, height: 40, borderRadius: 11, background: PRIMARY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 700, flexShrink: 0 }}>+</span>
                ) : (
                  <input value={qtyOf(name1c) ? String(qtyOf(name1c)) : ''} inputMode="decimal" placeholder="кол-во" disabled={!!(activeFolder.build && !color)} onClick={e => e.stopPropagation()}
                    onChange={e => upsert(name1c, { qty: num(e.target.value.replace(/[^0-9.,]/g, '')), unit: p.unit || 'шт' })}
                    style={{ width: 74, padding: '9px 8px', borderRadius: 10, border: `1.5px solid ${qtyOf(name1c) > 0 ? PRIMARY : '#e6e2dc'}`, background: '#fff', fontSize: 15, fontWeight: 800, textAlign: 'center', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', flexShrink: 0 }} />
                )}
              </div>
            )
          })}
        </div>
        )}
      </div>

      {/* нижняя панель: выбрано + Готово */}
      {picked.length > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', borderTop: '1px solid #e6e2dc', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 -4px 16px rgba(0,0,0,.1)', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#5f5952', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Выбрано <b style={{ color: DARK }}>{picked.length}</b>: {picked.map(x => x.oral).join(', ')}</div>
          <button onClick={done} style={{ border: 'none', background: PRIMARY, color: '#fff', borderRadius: 11, padding: '12px 20px', cursor: 'pointer', fontSize: 15, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Готово · {picked.length}</button>
        </div>
      )}
    </div>
  ), document.body)
}
