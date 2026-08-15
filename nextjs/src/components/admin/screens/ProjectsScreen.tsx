'use client'
// Раздел «Проекты» — мастер-список заказа целиком, из которого выносим карточки
// по частям (call-off). Проект считает: кол-во / вынесено / остаток. Каждая вынесенная
// карточка едет своим маршрутом (склад / листогиб) и собирается в общий заказ.
import { useState, useEffect, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtDate } from '@/lib/adminFmt'
import { fetchRefs, listSpecProjects, specProjectDetail, createSpecProject, carveCard } from '@/lib/api/refs'
import NomInline from '@/components/NomInline'
import ContragentPicker from '@/components/ContragentPicker'

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
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [detail, setDetail] = useState<any>(null)          // { project, items, cards }
  const [toast, setToast] = useState('')
  const showMsg = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2800) }

  // Форма создания проекта
  const [creating, setCreating] = useState(false)
  const [pName, setPName] = useState(''); const [pClient, setPClient] = useState('')
  const [rows, setRows] = useState<ItemRow[]>([blankRow()])
  const setRow = (i: number, patch: Partial<ItemRow>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))

  // Форма выноса
  const [carveQty, setCarveQty] = useState<Record<string, string>>({})
  const [carveContact, setCarveContact] = useState(''); const [carveComment, setCarveComment] = useState('')
  const [busy, setBusy] = useState(false)

  const loadList = useCallback(async () => { setLoading(true); setProjects(await listSpecProjects(orgId)); setLoading(false) }, [orgId])
  useEffect(() => { loadList() }, [loadList])
  useEffect(() => { fetchRefs().then((r: any) => { setProducts(r.products || []); setCags((r.contragents || []).filter((c: any) => !c.archived)) }) }, [])

  async function openDetail(id: string) { const d: any = await specProjectDetail(id); if (d) { setDetail(d); setView('detail'); setCarveQty({}); setCarveComment('') } }

  async function saveProject() {
    if (!pName.trim()) { showMsg('Введите название проекта'); return }
    const items = rows.filter(r => r.name.trim()).map(r => ({ name: r.name, qty: num(r.qty), unit: r.unit || 'шт', productId: r.productId || undefined, widthCm: r.widthCm ? num(r.widthCm) : undefined, price: num(r.price), supplierId: r.supplierId || undefined }))
    if (!items.length) { showMsg('Добавьте хотя бы одну позицию'); return }
    setBusy(true)
    const r: any = await createSpecProject({ name: pName, clientId: pClient || undefined, items })
    setBusy(false)
    if (r?.id || r?.ok) { setCreating(false); setPName(''); setPClient(''); setRows([blankRow()]); showMsg('✅ Проект создан'); loadList() }
    else showMsg('⚠ ' + (r?.error || 'Не удалось создать'))
  }

  async function doCarve() {
    const lines = Object.entries(carveQty).map(([specItemId, q]) => ({ specItemId, qty: num(q) })).filter(l => l.qty > 0)
    if (!lines.length) { showMsg('Укажите количество для выноса'); return }
    setBusy(true)
    const r: any = await carveCard(detail.project.id, { lines, contactId: carveContact || undefined, comment: carveComment || undefined })
    setBusy(false)
    if (r?.ok || r?.id) { showMsg(`✅ Карточка ${r.id || ''} создана в Приёмке`); await onReload?.(); await openDetail(detail.project.id) }
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
        <button onClick={() => setCreating(v => !v)} style={{ padding: '9px 16px', borderRadius: 8, border: creating ? `1.5px solid ${COLORS.border}` : 'none', background: creating ? '#fff' : COLORS.primary, color: creating ? COLORS.textMuted : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>{creating ? '× Отмена' : '＋ Новый проект'}</button>
      </div>

      {creating && (
        <div style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, padding: 18, marginBottom: 18, maxWidth: 900 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}><label style={LBL}>НАЗВАНИЕ ПРОЕКТА</label><input style={INP} value={pName} onChange={e => setPName(e.target.value)} placeholder="напр. Дом Ахметова — кровля" /></div>
            <div style={{ flex: '1 1 240px' }}><label style={LBL}>ЗАКАЗЧИК</label><ContragentPicker contragents={cags} value={pClient} onPick={(c: any) => setPClient(c.id)} placeholder="— выбрать —" /></div>
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
                    <td style={{ padding: '4px 6px', minWidth: 200 }}><NomInline products={products} value={r.productId} name={r.name} onPick={(p: any) => setRow(i, { productId: p.id, name: p.name })} /></td>
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
              return (
                <div key={p.id} onClick={() => openDetail(p.id)} style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, padding: 16, cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: COLORS.text }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>{p.clientId ? '👤 ' + cagName(p.clientId) : 'без заказчика'} · {p.items.length} поз.</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: COLORS.border, borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), borderRadius: 3 }} /></div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: barColor(pct) }}>{pct}%</span>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 6 }}>вынесено {p.totalDrawn} / {p.totalQty} · остаток {p.remaining}</div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

function Toast({ msg }: { msg: string }) {
  return <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 9999 }}>{msg}</div>
}
