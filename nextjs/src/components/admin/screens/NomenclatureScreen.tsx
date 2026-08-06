'use client'
// Номенклатура — портирован из Улкана 1:1 (дерево групп/категорий/подгрупп,
// крошки, инлайн-правка, режим правки цен, модалка добавления). API → /api/products.
import { useState, useEffect, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { NOM_CATALOG_TREE as TREE } from '@/lib/nomCatalog'
import { listProducts, addProduct, editProduct, archiveProduct } from '@/lib/api/refs'

interface NomItem { id: string; name: string; unit: string; group: string; cat: string; subgroup: string; priceIn?: number; priceRetail?: number; priceOpt?: number }

const INP: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 7, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }

export default function NomenclatureScreen() {
  const [items, setItems] = useState<NomItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selGroup, setSelGroup] = useState<string | null>(null)
  const [selCat, setSelCat] = useState<string | null>(null)
  const [selSubgroup, setSelSubgroup] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [editItem, setEditItem] = useState<NomItem | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', unit: 'шт', group: '', cat: '', subgroup: '' })
  const [toast, setToast] = useState('')
  const [priceEdit, setPriceEdit] = useState(false)
  const [pricesDraft, setPricesDraft] = useState<Record<string, { priceIn: string; priceRetail: string; priceOpt: string }>>({})

  function showMsg(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  type PField = 'priceIn' | 'priceRetail' | 'priceOpt'
  const priceVal = (item: NomItem, f: PField) => pricesDraft[item.id]?.[f] ?? String(item[f] ?? 0)
  function setPrice(item: NomItem, f: PField, val: string) {
    const clean = val.replace(/[^0-9.,]/g, '')
    setPricesDraft(prev => ({ ...prev, [item.id]: {
      priceIn: prev[item.id]?.priceIn ?? String(item.priceIn ?? 0),
      priceRetail: prev[item.id]?.priceRetail ?? String(item.priceRetail ?? 0),
      priceOpt: prev[item.id]?.priceOpt ?? String(item.priceOpt ?? 0),
      [f]: clean,
    } }))
  }
  const num = (s: string) => Number((s || '0').replace(',', '.')) || 0
  async function savePrices() {
    const ids = Object.keys(pricesDraft)
    if (ids.length === 0) { setPriceEdit(false); return }
    for (const id of ids) {
      const d = pricesDraft[id]; const item = items.find(i => i.id === id); if (!item) continue
      await editProduct(id, { priceIn: num(d.priceIn), priceRetail: num(d.priceRetail), priceOpt: num(d.priceOpt) })
    }
    setPricesDraft({}); setPriceEdit(false); load(); showMsg('✓ Цены сохранены')
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listProducts(true)
      setItems((data as any[]).map(p => ({ ...p, priceIn: Number(p.priceIn), priceRetail: Number(p.priceRetail), priceOpt: Number(p.priceOpt) })))
    } catch { showMsg('Ошибка загрузки') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const norm = (s: string) => (s || '').trim().toLowerCase().replace(/ё/g, 'е')
  const inGroup = (i: NomItem, g: string) => norm(i.group) === norm(g) || norm(i.cat) === norm(g)
  const inCat = (i: NomItem, g: string, c: string) =>
    (norm(i.group) === norm(g) && norm(i.cat) === norm(c)) || (norm(i.group) === norm(c) && norm(i.cat) === norm(g))

  const filtered = items.filter(item => {
    if (search) return item.name.toLowerCase().includes(search.toLowerCase())
    if (selSubgroup) return inCat(item, selGroup!, selCat!) && norm(item.subgroup) === norm(selSubgroup)
    if (selCat) return inCat(item, selGroup!, selCat!)
    if (selGroup) return inGroup(item, selGroup)
    return true
  })

  const countGroup = (g: string) => items.filter(i => inGroup(i, g)).length
  const countCat = (g: string, c: string) => items.filter(i => inCat(i, g, c)).length
  const countSubgroup = (g: string, c: string, s: string) => items.filter(i => inCat(i, g, c) && norm(i.subgroup) === norm(s)).length

  async function handleSave(item: NomItem) {
    await editProduct(item.id, { name: item.name, unit: item.unit, group: item.group, cat: item.cat, subgroup: item.subgroup })
    setEditItem(null); load(); showMsg('✓ Сохранено')
  }
  async function handleCreate() {
    if (!newItem.name) { showMsg('Введите название'); return }
    const r = await addProduct(newItem)
    if (!r.ok) { showMsg('Ошибка'); return }
    setShowAdd(false)
    setNewItem({ name: '', unit: 'шт', group: selGroup || '', cat: selCat || '', subgroup: selSubgroup || '' })
    load(); showMsg('✓ Добавлено')
  }
  async function handleDelete(id: string) {
    if (!confirm('Удалить (в архив)?')) return
    await archiveProduct(id); load(); showMsg('✓ В архив')
  }
  function openAdd() {
    setNewItem({ name: '', unit: 'шт', group: selGroup || '', cat: selCat || '', subgroup: selSubgroup || '' })
    setShowAdd(true)
  }

  const groups = Object.keys(TREE)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', overflow: 'hidden' }}>
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999 }}>{toast}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>📦 Номенклатура</div>
        <span style={{ fontSize: 14, color: '#5f5952' }}>{items.length} позиций</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...INP, width: 240 }} placeholder="🔍 Поиск по названию..." value={search} onChange={e => { setSearch(e.target.value); if (e.target.value) { setSelGroup(null); setSelCat(null); setSelSubgroup(null) } }} />
          <button onClick={load} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>⟳</button>
          {priceEdit ? (
            <>
              <button onClick={savePrices} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2e8a5e', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>💾 Сохранить цены</button>
              <button onClick={() => { setPriceEdit(false); setPricesDraft({}) }} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Отмена</button>
            </>
          ) : (
            <button onClick={() => setPriceEdit(true)} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e6c9b8', background: '#fff8f5', color: '#c0532a', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>💰 Редактировать цены</button>
          )}
          <button onClick={openAdd} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>+ Добавить</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>
        {/* Дерево групп */}
        <div style={{ width: 240, flexShrink: 0, background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', background: '#f8f6f3', borderBottom: '1px solid #e6e2dc', fontSize: 12, fontWeight: 700, color: '#5f5952', letterSpacing: '.04em' }}>ГРУППЫ</div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div onClick={() => { setSelGroup(null); setSelCat(null); setSelSubgroup(null); setSearch('') }}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 14, fontWeight: !selGroup && !search ? 700 : 400, color: !selGroup && !search ? COLORS.primary : '#26231f', background: !selGroup && !search ? '#fff8f5' : '#fff', borderLeft: `3px solid ${!selGroup && !search ? COLORS.primary : 'transparent'}`, display: 'flex', justifyContent: 'space-between' }}>
              <span>Все</span><span style={{ fontSize: 12, color: '#5f5952' }}>{items.length}</span>
            </div>
            {groups.map(g => {
              const cats = Object.keys(TREE[g]); const isOpen = openGroups[g]; const isSelG = selGroup === g && !selCat
              return (
                <div key={g}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', cursor: 'pointer', background: isSelG ? '#fff8f5' : '#fff', borderLeft: `3px solid ${isSelG ? COLORS.primary : 'transparent'}` }}
                    onClick={() => { setSelGroup(g); setSelCat(null); setSelSubgroup(null); setSearch('') }}>
                    <span onClick={e => { e.stopPropagation(); setOpenGroups(p => ({ ...p, [g]: !p[g] })) }} style={{ marginRight: 6, fontSize: 12, color: '#5f5952', width: 14, textAlign: 'center', flexShrink: 0 }}>{cats.length > 0 ? (isOpen ? '▼' : '▶') : ''}</span>
                    <span style={{ fontSize: 14, marginRight: 6 }}>📁</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: isSelG ? 700 : 400, color: isSelG ? COLORS.primary : '#26231f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g}</span>
                    <span style={{ fontSize: 12, color: '#5f5952', flexShrink: 0 }}>{countGroup(g)}</span>
                  </div>
                  {isOpen && cats.map(cat => {
                    const subgroups = TREE[g][cat]; const isCatOpen = openCats[`${g}/${cat}`]; const isSelC = selGroup === g && selCat === cat && !selSubgroup
                    return (
                      <div key={cat}>
                        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px 8px 28px', cursor: 'pointer', background: isSelC ? '#fff8f5' : '#fff', borderLeft: `3px solid ${isSelC ? COLORS.primary : 'transparent'}` }}
                          onClick={() => { setSelGroup(g); setSelCat(cat); setSelSubgroup(null); setSearch('') }}>
                          <span onClick={e => { e.stopPropagation(); setOpenCats(p => ({ ...p, [`${g}/${cat}`]: !p[`${g}/${cat}`] })) }} style={{ marginRight: 6, fontSize: 12, color: '#5f5952', width: 12, textAlign: 'center', flexShrink: 0 }}>{subgroups.length > 0 ? (isCatOpen ? '▼' : '▶') : ''}</span>
                          <span style={{ fontSize: 14, marginRight: 6 }}>📂</span>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: isSelC ? 700 : 400, color: isSelC ? COLORS.primary : '#4a4640', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
                          <span style={{ fontSize: 12, color: '#5f5952', flexShrink: 0 }}>{countCat(g, cat)}</span>
                        </div>
                        {isCatOpen && subgroups.map(sub => {
                          const isSelS = selGroup === g && selCat === cat && selSubgroup === sub
                          return (
                            <div key={sub} onClick={() => { setSelGroup(g); setSelCat(cat); setSelSubgroup(sub); setSearch('') }}
                              style={{ display: 'flex', alignItems: 'center', padding: '7px 14px 7px 46px', cursor: 'pointer', background: isSelS ? '#fff8f5' : '#fff', borderLeft: `3px solid ${isSelS ? COLORS.primary : 'transparent'}` }}>
                              <span style={{ fontSize: 13, marginRight: 6 }}>📄</span>
                              <span style={{ flex: 1, fontSize: 13, fontWeight: isSelS ? 700 : 400, color: isSelS ? COLORS.primary : '#6b655b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
                              <span style={{ fontSize: 12, color: '#5f5952', flexShrink: 0 }}>{countSubgroup(g, cat, sub)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* Таблица товаров */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 13, color: '#5f5952', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ cursor: 'pointer', color: COLORS.primary }} onClick={() => { setSelGroup(null); setSelCat(null); setSelSubgroup(null) }}>Все</span>
            {selGroup && <><span>›</span><span style={{ cursor: 'pointer', color: COLORS.primary }} onClick={() => { setSelCat(null); setSelSubgroup(null) }}>{selGroup}</span></>}
            {selCat && <><span>›</span><span style={{ cursor: 'pointer', color: COLORS.primary }} onClick={() => setSelSubgroup(null)}>{selCat}</span></>}
            {selSubgroup && <><span>›</span><span style={{ color: '#26231f', fontWeight: 600 }}>{selSubgroup}</span></>}
            {search && <span style={{ color: '#26231f', fontWeight: 600 }}>Поиск: «{search}»</span>}
            <span style={{ marginLeft: 'auto', color: '#5f5952' }}>{filtered.length} позиций</span>
          </div>

          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f8f6f3' }}>
                {['НАИМЕНОВАНИЕ', 'ЕД.', 'ГРУППА', 'КАТЕГОРИЯ', 'ПОДГРУППА', 'ПРИХОД', 'РОЗН.', 'ОПТ', ''].map(h => <th key={h} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}
              </tr></thead>
            </table>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loading ? <div style={{ padding: 30, textAlign: 'center', color: '#5f5952' }}>Загрузка...</div>
                : filtered.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: '#5f5952' }}>{search ? 'Ничего не найдено' : 'Нет позиций в этой группе'}<div style={{ marginTop: 12 }}><button onClick={openAdd} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>+ Добавить позицию</button></div></div>
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {filtered.map(item => (
                        <tr key={item.id} style={{ borderTop: '1px solid #f1efec' }}>
                          <td style={{ padding: '9px 14px', fontSize: 14, fontWeight: 500 }}>{editItem?.id === item.id ? <input style={{ ...INP, fontSize: 13 }} value={editItem.name} onChange={e => setEditItem(p => p ? { ...p, name: e.target.value } : p)} autoFocus /> : item.name}</td>
                          <td style={{ padding: '9px 14px', width: 70 }}>{editItem?.id === item.id ? <input style={{ ...INP, fontSize: 13, width: 55 }} value={editItem.unit} onChange={e => setEditItem(p => p ? { ...p, unit: e.target.value } : p)} /> : <span style={{ fontSize: 13, color: '#5f5952' }}>{item.unit}</span>}</td>
                          <td style={{ padding: '9px 14px', width: 130 }}>{editItem?.id === item.id ? <select style={{ ...INP, fontSize: 13 }} value={editItem.group} onChange={e => setEditItem(p => p ? { ...p, group: e.target.value, cat: '', subgroup: '' } : p)}><option value="">—</option>{Object.keys(TREE).map(g => <option key={g} value={g}>{g}</option>)}</select> : <span style={{ fontSize: 13, color: '#5f5952' }}>{item.group || '—'}</span>}</td>
                          <td style={{ padding: '9px 14px', width: 160 }}>{editItem?.id === item.id ? <select style={{ ...INP, fontSize: 13 }} value={editItem.cat} onChange={e => setEditItem(p => p ? { ...p, cat: e.target.value, subgroup: '' } : p)}><option value="">—</option>{editItem.group && Object.keys(TREE[editItem.group] || {}).map(c => <option key={c} value={c}>{c}</option>)}</select> : <span style={{ fontSize: 13, color: '#5f5952' }}>{item.cat || '—'}</span>}</td>
                          <td style={{ padding: '9px 14px', width: 140 }}>{editItem?.id === item.id ? <select style={{ ...INP, fontSize: 13 }} value={editItem.subgroup} onChange={e => setEditItem(p => p ? { ...p, subgroup: e.target.value } : p)}><option value="">—</option>{editItem.cat && (TREE[editItem.group]?.[editItem.cat] || []).map(s => <option key={s} value={s}>{s}</option>)}</select> : <span style={{ fontSize: 13, color: '#5f5952' }}>{item.subgroup || '—'}</span>}</td>
                          {(['priceIn', 'priceRetail', 'priceOpt'] as const).map(f => (
                            <td key={f} style={{ padding: '9px 8px', width: 84 }}>{priceEdit ? <input value={priceVal(item, f)} inputMode="decimal" onChange={e => setPrice(item, f, e.target.value)} style={{ ...INP, fontSize: 13, padding: '5px 6px', textAlign: 'right', border: `1.5px solid ${pricesDraft[item.id]?.[f] !== undefined ? COLORS.primary : '#e6e2dc'}` }} /> : <span style={{ fontSize: 13, color: (item[f] ?? 0) > 0 ? '#26231f' : '#837c72' }}>{(item[f] ?? 0) > 0 ? (item[f] as number).toLocaleString('ru-RU') : '—'}</span>}</td>
                          ))}
                          <td style={{ padding: '9px 14px', width: 120 }}>{editItem?.id === item.id ? <div style={{ display: 'flex', gap: 4 }}><button onClick={() => handleSave(editItem)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }}>✓</button><button onClick={() => setEditItem(null)} style={{ padding: '4px 8px', borderRadius: 6, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>✕</button></div> : <div style={{ display: 'flex', gap: 4 }}><button onClick={() => setEditItem({ ...item })} style={{ padding: '4px 8px', borderRadius: 6, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>✏️</button><button onClick={() => handleDelete(item.id)} style={{ padding: '4px 8px', borderRadius: 6, border: '1.5px solid #faeaea', background: '#fff', cursor: 'pointer', fontSize: 13 }}>🗑</button></div>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </div>
        </div>
      </div>

      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>+ Добавить позицию</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={LBL}>НАИМЕНОВАНИЕ *</label><input style={INP} value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} placeholder="Название товара..." autoFocus /></div>
              <div><label style={LBL}>ЕД. ИЗМЕРЕНИЯ</label><input style={INP} value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))} placeholder="шт" /></div>
              <div><label style={LBL}>ГРУППА</label><select style={INP} value={newItem.group} onChange={e => setNewItem(p => ({ ...p, group: e.target.value, cat: '', subgroup: '' }))}><option value="">— без группы —</option>{Object.keys(TREE).map(g => <option key={g} value={g}>{g}</option>)}</select></div>
              {newItem.group && Object.keys(TREE[newItem.group] || {}).length > 0 && <div><label style={LBL}>КАТЕГОРИЯ</label><select style={INP} value={newItem.cat} onChange={e => setNewItem(p => ({ ...p, cat: e.target.value, subgroup: '' }))}><option value="">—</option>{Object.keys(TREE[newItem.group]).map(c => <option key={c} value={c}>{c}</option>)}</select></div>}
              {newItem.cat && (TREE[newItem.group]?.[newItem.cat] || []).length > 0 && <div><label style={LBL}>ПОДГРУППА</label><select style={INP} value={newItem.subgroup} onChange={e => setNewItem(p => ({ ...p, subgroup: e.target.value }))}><option value="">—</option>{(TREE[newItem.group][newItem.cat] || []).map(s => <option key={s} value={s}>{s}</option>)}</select></div>}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>Отмена</button>
              <button onClick={handleCreate} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>Добавить →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
