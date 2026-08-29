'use client'
// Раздел «Проекты» — мастер-список заказа целиком, из которого выносим карточки
// по частям (call-off). Проект считает: кол-во / вынесено / остаток. Каждая вынесенная
// карточка едет своим маршрутом (склад / листогиб) и собирается в общий заказ.
import { useState, useEffect, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtDate } from '@/lib/adminFmt'
import { fetchRefs, listSpecProjects, specProjectDetail, createSpecProject, carveCard, reconcileProjects, addProjectAdvance, allocateProjectAdvance, setProjectStatus } from '@/lib/api/refs'
import NomInline from '@/components/NomInline'
import ContragentPicker from '@/components/ContragentPicker'

const money = (v: any) => (Number(v) || 0).toLocaleString('ru-RU')

const INP: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13, border: `1.5px solid ${COLORS.border}`, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: COLORS.textMuted, marginBottom: 6, display: 'block', letterSpacing: '.04em' }
const TH: React.CSSProperties = { padding: '7px 8px', fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textAlign: 'left', whiteSpace: 'nowrap' }
const barColor = (pct: number) => pct >= 100 ? COLORS.progress.high : pct >= 60 ? COLORS.progress.mid : COLORS.primary
const num = (v: any) => Number(v) || 0

interface ItemRow { productId?: string; name: string; qty: string; unit: string; widthCm: string; price: string; supplierId: string }
const blankRow = (): ItemRow => ({ name: '', qty: '1', unit: 'шт', widthCm: '', price: '', supplierId: '' })

export default function ProjectsScreen({ orgId, onOpen, onReload }: { orgId: string; onOpen: (o: any) => void; onReload: () => Promise<void> | void }) {
  const [projects, setProjects] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [cags, setCags] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [sel, setSel] = useState<Record<string, boolean>>({})   // выбранные проекты для акта сверки
  const [reconOpen, setReconOpen] = useState(false)
  const selIds = Object.keys(sel).filter(k => sel[k])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [detail, setDetail] = useState<any>(null)          // { project, items, cards }
  const [toast, setToast] = useState('')
  const showMsg = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2800) }

  // Форма создания проекта
  const [creating, setCreating] = useState(false)
  const [pName, setPName] = useState(''); const [pClient, setPClient] = useState(''); const [pTransit, setPTransit] = useState(false)
  const [rows, setRows] = useState<ItemRow[]>([blankRow()])
  const setRow = (i: number, patch: Partial<ItemRow>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))

  // Форма выноса
  const [carveQty, setCarveQty] = useState<Record<string, string>>({})
  const [carveContact, setCarveContact] = useState(''); const [carveComment, setCarveComment] = useState('')
  const [busy, setBusy] = useState(false)

  const loadList = useCallback(async () => { setLoading(true); setProjects(await listSpecProjects(orgId)); setLoading(false) }, [orgId])
  useEffect(() => { loadList() }, [loadList])
  useEffect(() => { fetchRefs(orgId).then((r: any) => { setProducts(r.products || []); setCags((r.contragents || []).filter((c: any) => !c.archived)); setAccounts((r.cashAccounts || []).filter((a: any) => a.orgId === orgId && !a.archived)) }) }, [orgId])

  async function openDetail(id: string) { const d: any = await specProjectDetail(id); if (d) { setDetail(d); setView('detail'); setCarveQty({}); setCarveComment('') } }

  async function saveProject() {
    if (!pName.trim()) { showMsg('Введите название проекта'); return }
    // Позиции необязательны — можно создать пустой проект (просто имя + заказчик), позиции добавить позже.
    const items = rows.filter(r => r.name.trim()).map(r => ({ name: r.name, qty: num(r.qty), unit: r.unit || 'шт', productId: r.productId || undefined, widthCm: r.widthCm ? num(r.widthCm) : undefined, price: num(r.price), supplierId: r.supplierId || undefined }))
    setBusy(true)
    const r: any = await createSpecProject({ name: pName, clientId: pClient || undefined, items, transit: pTransit })
    setBusy(false)
    if (r?.id || r?.ok) { setCreating(false); setPName(''); setPClient(''); setPTransit(false); setRows([blankRow()]); showMsg('✅ Проект создан'); loadList() }
    else showMsg('⚠ ' + (r?.error || 'Не удалось создать'))
  }

  async function doCarve() {
    const lines = Object.entries(carveQty).map(([specItemId, q]) => ({ specItemId, qty: num(q) })).filter(l => l.qty > 0)
    if (!lines.length) { showMsg('Укажите количество для выноса'); return }
    setBusy(true)
    const r: any = await carveCard(detail.project.id, { lines, contactId: carveContact || undefined, comment: carveComment || undefined })
    setBusy(false)
    if (r?.ok) { showMsg(`✅ Карточка ${r.data?.id || ''} создана в Приёмке`); await onReload?.(); await openDetail(detail.project.id) }
    else showMsg('⚠ ' + (r?.error || 'Не удалось вынести'))
  }

  const cagName = (id?: string) => cags.find(c => c.id === id)?.name || ''

  // ── ДЕТАЛЬ ПРОЕКТА ──
  if (view === 'detail' && detail) {
    const { project, items, cards } = detail
    const totalQty = items.reduce((a: number, i: any) => a + num(i.qty), 0)
    const totalDrawn = items.reduce((a: number, i: any) => a + num(i.drawn), 0)
    const pct = totalQty ? Math.round(totalDrawn / totalQty * 100) : 0
    const carveTotal = Object.values(carveQty).reduce((a, q) => a + num(q), 0)
    return (
      <div className="anim-fade">
        {toast && <Toast msg={toast} />}
        <button onClick={() => { setView('list'); setDetail(null); loadList() }} style={{ border: 'none', background: 'none', color: COLORS.primary, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', marginBottom: 12 }}>← К проектам</button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: COLORS.text }}>{project.name}</h2>
          {project.clientId && <span style={{ fontSize: 13, color: COLORS.textMuted }}>👤 {cagName(project.clientId)}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 460, marginBottom: 18 }}>
          <div style={{ flex: 1, height: 7, background: COLORS.border, borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), borderRadius: 4 }} /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: barColor(pct) }}>вынесено {totalDrawn} / {totalQty}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18, maxWidth: 900 }}>
          {/* Список позиций проекта + вынос */}
          <div style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Позиции проекта</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead><tr style={{ background: COLORS.bgCard }}>
                  <th style={{ ...TH, minWidth: 180 }}>НАИМЕНОВАНИЕ</th><th style={{ ...TH, textAlign: 'right' }}>КОЛ-ВО</th>
                  <th style={{ ...TH, textAlign: 'right' }}>ВЫНЕСЕНО</th><th style={{ ...TH, textAlign: 'right' }}>ОСТАТОК</th>
                  <th style={{ ...TH, textAlign: 'right', minWidth: 110 }}>ВЫНЕСТИ</th>
                </tr></thead>
                <tbody>
                  {items.map((it: any) => {
                    const rem = num(it.remaining)
                    const isProd = !!it.supplierId
                    return (
                      <tr key={it.id} style={{ borderTop: `1px solid ${COLORS.borderLight}` }}>
                        <td style={{ padding: '7px 8px', fontSize: 13 }}>
                          {it.name}
                          {it.widthCm != null && <span style={{ fontSize: 11, color: '#7a3aaa', fontWeight: 700, background: '#f3eeff', padding: '1px 6px', borderRadius: 10, marginLeft: 6 }}>{num(it.widthCm)} см</span>}
                          {isProd && <span style={{ fontSize: 11, color: '#2a5aaa', fontWeight: 700, marginLeft: 6 }}>🛠 {cagName(it.supplierId)}</span>}
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 13 }}>{num(it.qty)} {it.unit}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 13, color: COLORS.textMuted }}>{num(it.drawn)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: rem > 0 ? COLORS.text : COLORS.progress.high }}>{rem > 0 ? rem : '✓'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                          {rem > 0
                            ? <input value={carveQty[it.id] ?? ''} inputMode="decimal" placeholder="0"
                                onChange={e => { const v = e.target.value.replace(/[^0-9.,]/g, ''); setCarveQty(p => ({ ...p, [it.id]: v })) }}
                                style={{ width: 70, padding: '5px 7px', borderRadius: 6, border: `1.5px solid ${num(carveQty[it.id]) > rem ? '#e0a0a0' : COLORS.border}`, fontSize: 13, textAlign: 'right', fontFamily: 'inherit' }} />
                            : <span style={{ fontSize: 12, color: COLORS.textLight }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Панель выноса */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.borderLight}`, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 220, flex: '1 1 220px' }}>
                <label style={LBL}>ЗАКАЗЧИК КАРТОЧКИ</label>
                <ContragentPicker contragents={cags} value={carveContact} onPick={(c: any) => setCarveContact(c.id)} placeholder="— как у проекта / выбрать —" />
              </div>
              <div style={{ minWidth: 180, flex: '1 1 180px' }}>
                <label style={LBL}>КОММЕНТАРИЙ</label>
                <input style={INP} value={carveComment} onChange={e => setCarveComment(e.target.value)} placeholder="напр. 1-я партия" />
              </div>
              <button onClick={doCarve} disabled={busy || carveTotal <= 0} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: carveTotal > 0 ? COLORS.primary : COLORS.border, color: '#fff', cursor: carveTotal > 0 ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: busy ? .6 : 1 }}>{busy ? '...' : `Вынести в карточку${carveTotal > 0 ? ` (${carveTotal})` : ''} →`}</button>
            </div>
          </div>

          {/* Дочерние карточки — «сборка» */}
          <div style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Карточки проекта · {cards.length}</div>
            {cards.length === 0 ? <div style={{ fontSize: 13, color: COLORS.textMuted }}>Пока ничего не вынесено.</div>
              : cards.map((c: any) => (
                <div key={c.id} onClick={() => onOpen({ id: c.id })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${COLORS.borderLight}`, cursor: 'pointer' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: COLORS.primary }}>{c.id}</span>
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: COLORS.status.accepted.bg, color: COLORS.status.accepted.color }}>{c.status}</span>
                  <span style={{ fontSize: 12, color: COLORS.textMuted }}>{(c.positions || []).length} поз.</span>
                  <span style={{ fontSize: 12, color: COLORS.textLight, marginLeft: 'auto' }}>{fmtDate(c.createdAt)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    )
  }

  // ── СПИСОК ПРОЕКТОВ ──
  return (
    <div className="anim-fade">
      {toast && <Toast msg={toast} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: COLORS.text }}>Проекты</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selIds.length > 0 && <button onClick={() => setReconOpen(true)} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#2e8a5e', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>📋 Акт сверки ({selIds.length})</button>}
          {selIds.length > 0 && <button onClick={() => setSel({})} style={{ padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, background: '#fff', color: COLORS.textMuted, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>Снять</button>}
          <button onClick={() => setCreating(v => !v)} style={{ padding: '9px 16px', borderRadius: 8, border: creating ? `1.5px solid ${COLORS.border}` : 'none', background: creating ? '#fff' : COLORS.primary, color: creating ? COLORS.textMuted : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>{creating ? '× Отмена' : '＋ Новый проект'}</button>
        </div>
      </div>

      {creating && (
        <div style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, padding: 18, marginBottom: 18, maxWidth: 900 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}><label style={LBL}>НАЗВАНИЕ ПРОЕКТА</label><input style={INP} value={pName} onChange={e => setPName(e.target.value)} placeholder="напр. Дом Ахметова — кровля" /></div>
            <div style={{ flex: '1 1 240px' }}><label style={LBL}>ЗАКАЗЧИК</label><ContragentPicker contragents={cags} value={pClient} onPick={(c: any) => setPClient(c.id)} placeholder="— выбрать —" /></div>
            <div style={{ flex: '1 1 240px', display: 'flex', alignItems: 'flex-end' }}>
              <label title="Все вынесенные карточки проекта — сквозные (товар мимо склада, только деньги)" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: pTransit ? '#7a3aaa' : COLORS.textMuted, cursor: 'pointer', background: pTransit ? '#f3eeff' : '#fff', border: `1.5px solid ${pTransit ? '#d8c4ec' : COLORS.border}`, borderRadius: 8, padding: '8px 12px' }}>
                <input type="checkbox" checked={pTransit} onChange={e => setPTransit(e.target.checked)} /> 🔀 Сквозной проект (транзит)
              </label>
            </div>
          </div>
          <label style={LBL}>ПОЛНЫЙ СПИСОК ПОЗИЦИЙ</label>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead><tr style={{ background: COLORS.bgCard }}>
                <th style={{ ...TH, minWidth: 200 }}>НАИМЕНОВАНИЕ</th><th style={{ ...TH, width: 70, textAlign: 'right' }}>СМ</th><th style={{ ...TH, width: 70, textAlign: 'right' }}>КОЛ-ВО</th><th style={{ ...TH, width: 60 }}>ЕД</th><th style={{ ...TH, width: 90, textAlign: 'right' }}>ЦЕНА</th><th style={{ ...TH, minWidth: 150 }}>ПОСТАВЩИК (маршрут)</th><th style={TH}></th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${COLORS.borderLight}` }}>
                    <td style={{ padding: '4px 6px', minWidth: 200 }}><NomInline products={products} value={r.productId} name={r.name} onPick={(p: any) => setRow(i, { productId: p.id, name: p.name, ...(p.widthCm != null ? { widthCm: String(p.widthCm) } : {}) })} /></td>
                    <td style={{ padding: '4px 4px' }}><input style={{ ...INP, textAlign: 'right' }} inputMode="numeric" value={r.widthCm} onChange={e => setRow(i, { widthCm: e.target.value.replace(/\D/g, '') })} placeholder="см" /></td>
                    <td style={{ padding: '4px 4px' }}><input style={{ ...INP, textAlign: 'right' }} inputMode="decimal" value={r.qty} onChange={e => setRow(i, { qty: e.target.value.replace(/[^0-9.,]/g, '') })} /></td>
                    <td style={{ padding: '4px 4px' }}><input style={INP} value={r.unit} onChange={e => setRow(i, { unit: e.target.value })} /></td>
                    <td style={{ padding: '4px 4px' }}><input style={{ ...INP, textAlign: 'right' }} inputMode="decimal" value={r.price} onChange={e => setRow(i, { price: e.target.value.replace(/[^0-9.,]/g, '') })} placeholder="цена" /></td>
                    <td style={{ padding: '4px 4px' }}>
                      <select value={r.supplierId} onChange={e => setRow(i, { supplierId: e.target.value })} style={{ ...INP, cursor: 'pointer' }}>
                        <option value="">— со склада —</option>
                        {cags.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 4px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => setRows(rs => [...rs.slice(0, i + 1), { ...r, productId: undefined }, ...rs.slice(i + 1)])} title="Клон" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>📋</button>
                      <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} title="Удалить" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#c1121c' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <button onClick={() => setRows(rs => [...rs, blankRow()])} style={{ border: `1.5px dashed ${COLORS.border}`, borderRadius: 7, padding: '6px 14px', background: 'none', cursor: 'pointer', fontSize: 13, color: COLORS.textMuted, fontFamily: 'inherit' }}>＋ Строка</button>
            <button onClick={saveProject} disabled={busy} style={{ marginLeft: 'auto', padding: '9px 20px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: busy ? .6 : 1 }}>{busy ? '...' : 'Создать проект'}</button>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 8 }}>Поставщик-филиал (листогиб) → позиция пойдёт в производство. Пусто → со склада.</div>
        </div>
      )}

      {loading ? <div style={{ padding: 30, color: COLORS.textMuted }}>Загрузка…</div>
        : projects.length === 0 && !creating ? <div style={{ background: COLORS.white, borderRadius: 12, padding: 40, textAlign: 'center', boxShadow: `0 0 0 1px ${COLORS.border}` }}><div style={{ fontSize: 32, marginBottom: 10 }}>📁</div><div style={{ fontWeight: 600 }}>Проектов пока нет</div><div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>Создайте проект и внесите весь список — потом выносите карточками по частям.</div></div>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {projects.map(p => {
              const pct = p.totalQty ? Math.round(p.totalDrawn / p.totalQty * 100) : 0
              const on = !!sel[p.id]
              const closed = p.status === 'closed'
              return (
                <div key={p.id} style={{ position: 'relative', background: COLORS.white, borderRadius: 12, boxShadow: on ? `0 0 0 2px #2e8a5e` : `0 0 0 1px ${COLORS.border}`, padding: 16, opacity: closed ? .62 : 1 }}>
                  <div onClick={e => { e.stopPropagation(); setSel(s => ({ ...s, [p.id]: !s[p.id] })) }} title="Выбрать для акта сверки"
                    style={{ position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: 6, cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, color: '#fff', background: on ? '#2e8a5e' : '#fff', border: on ? 'none' : `1.5px solid ${COLORS.border}` }}>{on ? '✓' : ''}</div>
                  <div onClick={() => openDetail(p.id)} style={{ cursor: 'pointer' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: COLORS.text, paddingRight: 28 }}>{p.name} {closed && <span style={{ fontSize: 11, fontWeight: 700, color: '#6b655b', background: '#efece8', padding: '2px 8px', borderRadius: 20 }}>закрыт</span>}</div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 10 }}>{p.clientId ? '👤 ' + cagName(p.clientId) : 'без заказчика'} · {p.items.length} поз.</div>
                    {(() => { const f = p.fin || { sum: 0, paid: 0, debt: 0, remainder: 0 }; const mono = "'JetBrains Mono',monospace"
                      const tiles = [
                        ['Сумма', f.sum, COLORS.text, '#f4efe8'],
                        ['Оплата', f.paid, '#2e8a5e', '#e8f5ee'],
                        [f.debt >= 0 ? 'Долг' : 'Аванс', Math.abs(f.debt), f.debt > 0.01 ? '#c0392b' : '#2e8a5e', f.debt > 0.01 ? '#fbe9e4' : '#e8f5ee'],
                        ['Остаток', f.remainder, f.remainder > 0.01 ? '#b26a13' : '#2e8a5e', '#fbf3e2'],
                      ]
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                          {tiles.map(([l, v, c, bg]: any) => (
                            <div key={l} style={{ background: bg, borderRadius: 9, padding: '7px 10px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em', color: COLORS.textMuted, textTransform: 'uppercase', minWidth: 44 }}>{l}</span>
                              <span style={{ marginLeft: 'auto', fontFamily: mono, fontWeight: 800, fontSize: 14.5, color: c, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{money(v)}</span>
                            </div>
                          ))}
                        </div>
                      ) })()}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: COLORS.border, borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), borderRadius: 3 }} /></div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: barColor(pct) }}>{pct}%</span>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 6 }}>вынесено {p.totalDrawn} / {p.totalQty} · остаток {p.remaining}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {reconOpen && <ReconcileDrawer orgId={orgId} ids={selIds} accounts={accounts} onClose={() => setReconOpen(false)} onChanged={loadList} showMsg={showMsg} />}
    </div>
  )
}

// ─── Акт сверки по выбранным проектам: суммарно + по каждому, аванс, распределение, закрытие ───
function ReconcileDrawer({ orgId, ids, accounts, onClose, onChanged, showMsg }: {
  orgId: string; ids: string[]; accounts: any[]; onClose: () => void; onChanged: () => void; showMsg: (m: string) => void
}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [advAmount, setAdvAmount] = useState(''); const [advAcc, setAdvAcc] = useState('')
  const [alloc, setAlloc] = useState<Record<string, string>>({})
  const load = useCallback(async () => { setLoading(true); const d = await reconcileProjects(orgId, ids); setData(d); setLoading(false); if (d?.client) setAlloc(Object.fromEntries((d.client.allocations || []).map((a: any) => [a.projectId, String(a.amount)]))) }, [orgId, ids])
  useEffect(() => { load() }, [load])

  const client = data?.client
  const allocSum = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0)
  const freeAfter = client ? client.advances - allocSum : 0

  async function saveAdvance() {
    if (!client || !(Number(advAmount) > 0)) return
    setBusy(true)
    const r: any = await addProjectAdvance({ orgId, clientId: client.id, amount: Number(advAmount), accountId: advAcc || undefined })
    setBusy(false)
    if (r?.ok) { setAdvAmount(''); showMsg('💰 Аванс внесён'); load() } else showMsg('⚠ ' + (r?.error || 'Ошибка'))
  }
  async function saveAlloc() {
    if (!client) return
    const allocations = Object.entries(alloc).map(([projectId, amount]) => ({ projectId, amount: Number(amount) || 0 })).filter(a => a.amount > 0)
    setBusy(true)
    const r: any = await allocateProjectAdvance({ orgId, clientId: client.id, allocations })
    setBusy(false)
    if (r?.ok) { showMsg('✅ Аванс распределён'); load(); onChanged() } else showMsg('⚠ ' + (r?.error || 'Ошибка'))
  }
  async function closeProject(p: any) {
    const warn = Math.abs(p.balance) > 0.01 ? `Остаётся ${p.balance > 0 ? 'долг' : 'переплата'} ${money(Math.abs(p.balance))} ₸. Всё равно закрыть проект «${p.name}»?` : `Закрыть проект «${p.name}»?`
    if (!confirm(warn)) return
    await setProjectStatus(p.id, 'closed', orgId); showMsg('🔒 Проект закрыт'); load(); onChanged()
  }
  async function reopen(p: any) { await setProjectStatus(p.id, 'active', orgId); showMsg('Проект открыт'); load(); onChanged() }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(1120px,96vw)', height: '100%', background: '#faf8f6', overflowY: 'auto', padding: 28, boxShadow: '-8px 0 32px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>📋 Акт сверки</div>
          <span style={{ fontSize: 12, color: COLORS.textMuted }}>{ids.length} проект(а)</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#8a837a' }}>×</button>
        </div>

        {loading ? <div style={{ color: COLORS.textMuted, padding: 20 }}>Загрузка…</div> : !data ? <div>Нет данных</div> : (
          <>
            {/* Суммарно */}
            <div style={{ background: '#fff', borderRadius: 14, boxShadow: `0 0 0 1.5px ${COLORS.border}`, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: COLORS.textMuted, marginBottom: 10 }}>СУММАРНО ПО ВЫБРАННЫМ</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {[['Оборот', data.combined.total, COLORS.text], ['Оплачено', data.combined.paid, '#2e8a5e'], [data.combined.balance >= 0 ? 'Долг' : 'Переплата', Math.abs(data.combined.balance), data.combined.balance > 0.01 ? '#c0532a' : '#2e8a5e']].map(([l, v, c]: any) => (
                  <div key={l} style={{ flex: 1 }}><div style={{ fontSize: 11, color: COLORS.textMuted }}>{l}</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 17, color: c }}>{money(v)} ₸</div></div>
                ))}
              </div>
            </div>

            {/* По каждому проекту — сеткой на всю ширину */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 10, marginBottom: 14 }}>
            {data.projects.map((p: any) => (
              <div key={p.id} style={{ background: '#fff', borderRadius: 12, boxShadow: `0 0 0 1.5px ${COLORS.border}`, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <b style={{ fontSize: 14 }}>{p.name}</b>
                  {p.status === 'closed' && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6b655b', background: '#efece8', padding: '2px 8px', borderRadius: 20 }}>закрыт</span>}
                  {p.status === 'closed'
                    ? <button onClick={() => reopen(p)} style={{ marginLeft: 'auto', fontSize: 12, border: `1.5px solid ${COLORS.border}`, background: '#fff', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', color: COLORS.textMuted }}>Открыть</button>
                    : <button onClick={() => closeProject(p)} style={{ marginLeft: 'auto', fontSize: 12, border: '1.5px solid #e6c9b8', background: '#fff8f5', color: '#c0532a', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>🔒 Закрыть</button>}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
                  <span style={{ color: COLORS.textMuted }}>Оборот <b style={{ color: COLORS.text, fontFamily: "'JetBrains Mono',monospace" }}>{money(p.total)}</b></span>
                  <span style={{ color: COLORS.textMuted }}>· Оплачено <b style={{ color: '#2e8a5e', fontFamily: "'JetBrains Mono',monospace" }}>{money(p.paid)}</b></span>
                  <span style={{ marginLeft: 'auto', fontWeight: 700, color: p.balance > 0.01 ? '#c0532a' : '#2e8a5e', fontFamily: "'JetBrains Mono',monospace" }}>{p.balance >= 0 ? 'долг ' : 'аванс '}{money(Math.abs(p.balance))} ₸</span>
                </div>
                {p.allocated > 0 && <div style={{ fontSize: 11, color: '#7a45a8', marginTop: 4 }}>в т.ч. из аванса: {money(p.allocated)} ₸</div>}
                {/* Связанные фин-документы проекта (накладные) */}
                {(p.docs || []).length > 0 && (
                  <div style={{ marginTop: 10, borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: 8 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: COLORS.textMuted, marginBottom: 6 }}>ДОКУМЕНТЫ ({p.docs.length})</div>
                    {p.docs.map((d: any) => { const inc = d.type === 'sale' || d.type === 'return_out'; const tp: any = { sale: 'Расходная', purchase: 'Приходная', return_in: 'Возврат клиента', return_out: 'Возврат поставщику' }
                      return (
                        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12.5 }}>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: COLORS.primary }}>{d.number}</span>
                          <span style={{ color: COLORS.textMuted }}>{tp[d.type] || d.type}</span>
                          <span style={{ color: COLORS.textLight, fontSize: 11 }}>{fmtDate(d.date)}</span>
                          <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: inc ? '#2e8a5e' : '#c0532a' }}>{inc ? '+' : '−'}{money(d.total)} ₸</span>
                        </div>
                      ) })}
                  </div>
                )}
              </div>
            ))}
            </div>

            {/* Аванс клиента + распределение */}
            {data.multiClient ? <div style={{ fontSize: 12.5, color: '#8a6f00', background: '#fbf3d8', borderRadius: 10, padding: 12, marginTop: 6 }}>Выбраны проекты разных заказчиков — распределение аванса доступно, когда все проекты одного клиента.</div>
              : client && (
              <div style={{ background: '#fff', borderRadius: 14, boxShadow: `0 0 0 1.5px ${COLORS.border}`, padding: 16, marginTop: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: COLORS.textMuted, marginBottom: 10 }}>АВАНС · {client.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: COLORS.textMuted }}>Свободно к распределению</div>
                  <div style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 16, color: freeAfter < -0.01 ? '#c0532a' : '#2e8a5e' }}>{money(freeAfter)} ₸</div>
                </div>
                {/* внести аванс */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  <input value={advAmount} inputMode="decimal" onChange={e => setAdvAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="сумма аванса" style={{ ...INP, flex: 1 }} />
                  <select value={advAcc} onChange={e => setAdvAcc(e.target.value)} style={{ ...INP, width: 130, cursor: 'pointer' }}><option value="">счёт…</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                  <button onClick={saveAdvance} disabled={busy || !(Number(advAmount) > 0)} style={{ border: 'none', background: '#2e8a5e', color: '#fff', borderRadius: 8, padding: '0 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', opacity: busy ? .6 : 1 }}>＋ Внести</button>
                </div>
                {/* распределить по проектам */}
                <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted, marginBottom: 8 }}>РАСПРЕДЕЛИТЬ ПО ПРОЕКТАМ</div>
                {data.projects.map((p: any) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <button onClick={() => setAlloc(a => ({ ...a, [p.id]: String(Math.max(0, p.balance + (Number(a[p.id]) || 0))) }))} title="Погасить долг" style={{ fontSize: 11, border: `1.5px solid ${COLORS.border}`, background: '#fff', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: COLORS.textMuted, fontFamily: 'inherit' }}>= долг</button>
                    <input value={alloc[p.id] || ''} inputMode="decimal" onChange={e => setAlloc(a => ({ ...a, [p.id]: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder="0" style={{ ...INP, width: 110, textAlign: 'right' }} />
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <span style={{ fontSize: 12, color: freeAfter < -0.01 ? '#c0532a' : COLORS.textMuted }}>Распределено {money(allocSum)} из {money(client.advances)}</span>
                  <button onClick={saveAlloc} disabled={busy || freeAfter < -0.01} style={{ marginLeft: 'auto', border: 'none', background: freeAfter < -0.01 ? COLORS.border : COLORS.primary, color: '#fff', borderRadius: 8, padding: '9px 16px', cursor: freeAfter < -0.01 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>Сохранить распределение</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Toast({ msg }: { msg: string }) {
  return <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999 }}>{msg}</div>
}
