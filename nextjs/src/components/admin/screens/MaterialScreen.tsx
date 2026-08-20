'use client'
// Раздел «Материал» (Ф1): Типы изделий (спецификация: стандартный см), Склад материала
// (куски листы/обрезь по цветам), Привязка типа к цветным изделиям.
import { useState, useEffect, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { extractRal, RalDot, ralOrdered } from '@/lib/ral'
import { SHEET_WIDTH_CM, SHEET_LENGTH_CM, MIN_REMNANT_CM } from '@/lib/production'
import { fetchRefs, listProducts, editProduct, listSpecTypes, createSpecType, editSpecType, materialStock, reviseSheet, addProduct, archiveProduct, materialReport } from '@/lib/api/refs'

const INP: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13, border: `1.5px solid ${COLORS.border}`, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: COLORS.textMuted, marginBottom: 5, display: 'block', letterSpacing: '.04em' }
const TH: React.CSSProperties = { padding: '7px 8px', fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textAlign: 'left', whiteSpace: 'nowrap' }
const num = (v: any) => Number(v) || 0
const TABS = [{ key: 'types', label: '📐 Типы изделий' }, { key: 'sheets', label: '📄 Листы' }, { key: 'stock', label: '🧱 Склад материала' }, { key: 'report', label: '📊 Расчёт (месяц)' }, { key: 'bind', label: '🔗 Привязка' }] as const
// покрытие: по умолчанию глянец; матовые изделие НЕ берёт
const THICKS = ['0,35', '0,4', '0,45']
type TabKey = typeof TABS[number]['key']

export default function MaterialScreen({ orgId }: { orgId: string }) {
  const [tab, setTab] = useState<TabKey>('types')
  const [types, setTypes] = useState<any[]>([])
  const [stock, setStock] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [toast, setToast] = useState('')
  const showMsg = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }
  const [report, setReport] = useState<any>(null)
  const [ym, setYm] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const loadReport = useCallback(async () => {
    const [y, m] = ym.split('-').map(Number)
    const from = `${y}-${String(m).padStart(2, '0')}-01`
    const nx = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }
    const to = `${nx.y}-${String(nx.m).padStart(2, '0')}-01`
    setReport(await materialReport(orgId, from, to))
  }, [orgId, ym])
  useEffect(() => { if (tab === 'report') loadReport() }, [tab, loadReport])

  const loadTypes = useCallback(async () => setTypes(await listSpecTypes(orgId)), [orgId])
  const loadStock = useCallback(async () => setStock(await materialStock(orgId)), [orgId])
  const loadProducts = useCallback(async () => { const all = await listProducts(true); setProducts(all); setMaterials(all.filter((p: any) => p.category === 'material')) }, [])
  useEffect(() => { loadTypes(); loadStock(); loadProducts() }, [loadTypes, loadStock, loadProducts])

  // ── Типы изделий ──
  const [tName, setTName] = useState(''); const [tWidth, setTWidth] = useState(''); const [tLen, setTLen] = useState(String(SHEET_LENGTH_CM)); const [tRate, setTRate] = useState('')
  async function saveType() {
    if (!tName.trim() || !num(tWidth)) { showMsg('Название и ширина обязательны'); return }
    const r: any = await createSpecType({ orgId, name: tName, widthCm: num(tWidth), lengthCm: num(tLen) || SHEET_LENGTH_CM, workRate: num(tRate) })
    if (r.ok) { setTName(''); setTWidth(''); setTRate(''); showMsg('✅ Тип создан'); loadTypes() } else showMsg('⚠ ' + (r.error || 'Не удалось'))
  }
  async function archiveType(id: string) { await editSpecType(id, { archived: true }); loadTypes(); showMsg('🗃 В архив') }

  // ── Склад материала: РЕВИЗИЯ (факт кол-ва). Обычный приход — из приходной накладной. ──
  const [mProd, setMProd] = useState(''); const [mQty, setMQty] = useState('')
  async function reviseLists() {
    if (!mProd) { showMsg('Выберите лист'); return }
    if (mQty === '') { showMsg('Укажите фактическое кол-во'); return }
    const p = materials.find(x => x.id === mProd)
    const r: any = await reviseSheet({ orgId, productId: mProd, color: extractRal(p?.name) || (p?.name || '').slice(0, 12), widthCm: SHEET_WIDTH_CM, lengthCm: SHEET_LENGTH_CM, qty: num(mQty) })
    if (r.ok) { setMQty(''); showMsg(`✅ Ревизия: ${num(mQty)} листов`); loadStock() } else showMsg('⚠ ' + (r.error || 'Не удалось'))
  }
  // группировка склада по цвету
  const stockByColor: Record<string, any[]> = {}
  for (const p of stock) (stockByColor[p.color || '—'] ||= []).push(p)

  // ── Листы (спецификация материала): цвет + толщина + покрытие (глян по умолч., мат — опция) ──
  const [shColor, setShColor] = useState(''); const [shThick, setShThick] = useState('0,4'); const [shMat, setShMat] = useState(false); const [shAll, setShAll] = useState(false)
  const sheets = materials.filter((p: any) => !p.archived && /лист/i.test(p.name))
  const parseThick = (n: string) => (n.match(/(\d+[.,]\d+)/) || [])[1] || ''   // первое дробное число = толщина
  const isMat = (n: string) => /(^|\s)мат(овый)?(\s|$)/i.test(n)               // \b не работает с кириллицей
  async function addSheet() {
    if (!shColor) { showMsg('Выберите цвет'); return }
    const th = (shThick || '').trim().replace('.', ',')
    const colorLabel = shColor === 'decor' ? 'дерево' : shColor
    const name = `Лист плоский ${colorLabel}${th ? ` ${th}` : ''} ${shMat ? 'мат' : 'глян'}`
    if (sheets.some((s: any) => s.name.toLowerCase().trim() === name.toLowerCase().trim())) { showMsg('Такой лист уже есть'); return }
    const r: any = await addProduct({ name, unit: 'лист', category: 'material', group: 'Материалы', cat: '', subgroup: colorLabel })
    if (r.ok) { showMsg('✅ Лист заведён'); loadProducts() } else showMsg('⚠ ' + (r.error || 'Не удалось'))
  }
  async function removeSheet(id: string) { await archiveProduct(id); loadProducts(); showMsg('🗃 В архив') }
  const sheetsByColor: Record<string, any[]> = {}
  for (const s of sheets) (sheetsByColor[extractRal(s.name) || '—'] ||= []).push(s)

  // ── Привязка типа к изделиям (только папка «Комплектующие» — их режем из листа) ──
  const [bindSearch, setBindSearch] = useState('')
  const inCompl = (p: any) => `${p.group || ''} ${p.cat || ''} ${p.subgroup || ''}`.toLowerCase().includes('комплект')
  const goods = products.filter((p: any) => p.category === 'goods' && !p.archived && inCompl(p))
  // Базовые комплектующие (для выбора типа) — записи «Без цвета»; если их нет — все комплектующие.
  const baseCompl = goods.filter((p: any) => /без\s*цвет/i.test(p.subgroup || ''))
  const typeOptions = baseCompl.length ? baseCompl : goods
  const q = bindSearch.trim().toLowerCase()
  const bindList = (q ? goods.filter((p: any) => p.name.toLowerCase().includes(q)) : goods).slice(0, 60)
  async function bindType(productId: string, specTypeId: string) {
    await editProduct(productId, { specTypeId: specTypeId || null })
    setProducts(prev => prev.map((p: any) => p.id === productId ? { ...p, specTypeId: specTypeId || null } : p))
    showMsg('🔗 Тип привязан')
  }

  return (
    <div className="anim-fade">
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{toast}</div>}
      <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: COLORS.text }}>Материал и спецификации</h2>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 16 }}>Лист {SHEET_WIDTH_CM}×{SHEET_LENGTH_CM} см, режем по ширине. Обрезь &lt; {MIN_REMNANT_CM} см — в расход.</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', background: tab === t.key ? COLORS.primary : '#fff', color: tab === t.key ? '#fff' : COLORS.textMuted, boxShadow: tab === t.key ? 'none' : `0 0 0 1px ${COLORS.border}` }}>{t.label}</button>)}
      </div>

      {/* ── ТИПЫ ИЗДЕЛИЙ ── */}
      {tab === 'types' && (
        <div style={{ maxWidth: 760 }}>
          <div style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}>
                <label style={LBL}>ТИП ИЗ НОМЕНКЛАТУРЫ (Комплектующие)</label>
                <select value={tName} onChange={e => setTName(e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                  <option value="">— выберите комплектующее —</option>
                  {typeOptions.map((p: any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ width: 90 }}><label style={LBL}>ШИРИНА СМ</label><input style={INP} inputMode="decimal" value={tWidth} onChange={e => setTWidth(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="18" /></div>
              <div style={{ width: 90 }}><label style={LBL}>ДЛИНА СМ</label><input style={INP} inputMode="decimal" value={tLen} onChange={e => setTLen(e.target.value.replace(/[^0-9.,]/g, ''))} /></div>
              <div style={{ width: 100 }}><label style={LBL}>СТАВКА/ШТ</label><input style={INP} inputMode="decimal" value={tRate} onChange={e => setTRate(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" /></div>
              <button onClick={saveType} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>＋ Тип</button>
            </div>
          </div>
          {types.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14 }}>Типов пока нет. Заведите Н-профиль (18), Ж-профиль (8), угол простой (11), угол сложный (25).</div>
            : <div style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: COLORS.bgCard }}><th style={TH}>ТИП</th><th style={{ ...TH, textAlign: 'right' }}>ШИРИНА</th><th style={{ ...TH, textAlign: 'right' }}>ДЛИНА</th><th style={{ ...TH, textAlign: 'right' }}>СТАВКА/ШТ</th><th style={TH}></th></tr></thead>
                  <tbody>{types.map(t => (
                    <tr key={t.id} style={{ borderTop: `1px solid ${COLORS.borderLight}` }}>
                      <td style={{ padding: '8px', fontSize: 14, fontWeight: 600 }}>{t.name}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: 14 }}>{num(t.widthCm)} см</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: 14, color: COLORS.textMuted }}>{num(t.lengthCm)} см</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: 14 }}>{num(t.workRate) || '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}><button onClick={() => archiveType(t.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: COLORS.textLight }}>🗃</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
        </div>
      )}

      {/* ── ЛИСТЫ (спецификация материала) ── */}
      {tab === 'sheets' && (
        <div style={{ maxWidth: 760 }}>
          <div style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, padding: 16, marginBottom: 16 }}>
            <label style={LBL}>НОВЫЙ ЛИСТ · «Лист плоский {shColor === 'decor' ? 'дерево' : shColor || '____'} {shThick} {shMat ? 'мат' : 'глян'}»</label>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#6b645b', letterSpacing: '.04em', margin: '4px 0 6px' }}>ЦВЕТ</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {ralOrdered(shAll).map((c: any) => {
                const on = shColor === c.code
                return <button key={c.code} type="button" onClick={() => setShColor(on ? '' : c.code)} title={`${c.code} · ${c.name}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, border: 'none', background: 'none', cursor: 'pointer', padding: 0, width: 36 }}>
                  <span style={{ width: on ? 30 : 24, height: on ? 30 : 24, borderRadius: '50%', background: c.bg || c.hex, boxShadow: on ? `0 0 0 3px rgba(212,97,58,.3), inset 0 0 0 1.5px rgba(0,0,0,.12)` : 'inset 0 0 0 1.5px rgba(0,0,0,.14)' }} />
                  <span style={{ fontSize: 9, fontWeight: on ? 800 : 500, color: on ? COLORS.primary : '#6b645b' }}>{c.code === 'decor' ? 'дерево' : c.code}</span>
                </button>
              })}
              <button type="button" onClick={() => setShAll(v => !v)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, border: 'none', background: 'none', cursor: 'pointer', width: 36 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#f1efec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{shAll ? '🙈' : '👁'}</span>
                <span style={{ fontSize: 9, color: '#6b645b' }}>{shAll ? 'скрыть' : 'ещё'}</span>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={LBL}>ТОЛЩИНА, мм</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {THICKS.map(t => <button key={t} type="button" onClick={() => setShThick(t)} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: shThick === t ? 700 : 500, fontFamily: 'inherit', background: shThick === t ? COLORS.primary : '#f1efec', color: shThick === t ? '#fff' : '#4a4640' }}>{t}</button>)}
                  <input style={{ ...INP, width: 70 }} value={shThick} onChange={e => setShThick(e.target.value.replace(/[^0-9.,]/g, ''))} />
                </div>
              </div>
              <div>
                <label style={LBL}>ПОКРЫТИЕ</label>
                <button type="button" onClick={() => setShMat(v => !v)} style={{ padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${shMat ? '#b03020' : '#cfeadd'}`, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', background: shMat ? '#fbecea' : '#eef7f1', color: shMat ? '#b03020' : '#2e8a5e' }}>{shMat ? '● Матовый' : '○ Глянец (по умолч.)'}</button>
              </div>
              <button onClick={addSheet} style={{ marginLeft: 'auto', padding: '9px 18px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>＋ Завести лист</button>
            </div>
            <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 8 }}>Подбор под изделие: по цвету, только НЕ матовый. Толщина в имени, на подбор не влияет.</div>
          </div>
          {Object.keys(sheetsByColor).length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14 }}>Листов пока нет.</div>
            : Object.entries(sheetsByColor).map(([color, list]) => (
              <div key={color} style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><RalDot code={extractRal(color) || color} /><b style={{ fontSize: 15 }}>{color}</b></div>
                {list.map((s: any) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: `1px solid ${COLORS.borderLight}` }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{s.name}</span>
                    {parseThick(s.name) && <span style={{ fontSize: 11, color: COLORS.textMuted }}>{parseThick(s.name)} мм</span>}
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: isMat(s.name) ? '#fbecea' : '#eef7f1', color: isMat(s.name) ? '#b03020' : '#2e8a5e' }}>{isMat(s.name) ? 'мат' : 'глян'}</span>
                    <button onClick={() => removeSheet(s.id)} title="В архив" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: COLORS.textLight }}>🗃</button>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}

      {/* ── СКЛАД МАТЕРИАЛА ── */}
      {tab === 'stock' && (
        <div style={{ maxWidth: 760 }}>
          <div style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, padding: 16, marginBottom: 16 }}>
            <label style={LBL}>РЕВИЗИЯ ЛИСТОВ ({SHEET_WIDTH_CM}×{SHEET_LENGTH_CM}) — выставить факт</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px' }}>
                <select value={mProd} onChange={e => setMProd(e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                  <option value="">— выберите лист (материал) —</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div style={{ width: 130 }}><input style={INP} inputMode="numeric" value={mQty} onChange={e => setMQty(e.target.value.replace(/\D/g, ''))} placeholder="факт, листов" /></div>
              <button onClick={reviseLists} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>Провести ревизию</button>
            </div>
            <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 8 }}>Обычный приход листов идёт из приходной накладной. Здесь — только ревизия (списание/недостачи).</div>
          </div>
          {Object.keys(stockByColor).length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14 }}>Склад материала пуст. Оприходуйте листы.</div>
            : Object.entries(stockByColor).map(([color, pieces]) => (
              <div key={color} style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, padding: 14, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><RalDot code={extractRal(color) || color} /><b style={{ fontSize: 15 }}>{color}</b></div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {pieces.sort((a, b) => (a.kind === 'sheet' ? -1 : 1)).map((p: any) => (
                    <span key={p.id} style={{ fontSize: 13, padding: '5px 10px', borderRadius: 8, fontWeight: 600, background: p.kind === 'sheet' ? '#e8f5ee' : '#fff6e8', color: p.kind === 'sheet' ? '#2e8a5e' : '#a56a00', border: `1px solid ${p.kind === 'sheet' ? '#cfeadd' : '#efdcb8'}` }}>
                      {p.kind === 'sheet' ? '📄 лист' : '✂️ обрезь'} {num(p.widthCm)}×{num(p.lengthCm)} · <b>{num(p.qty)} шт</b>
                    </span>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── ПРИВЯЗКА ТИПА ── */}
      {/* ── РАСЧЁТ (ЗАКРЫТИЕ МЕСЯЦА) ── */}
      {tab === 'report' && (
        <div style={{ maxWidth: 760 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div><label style={LBL}>МЕСЯЦ</label><input type="month" value={ym} onChange={e => setYm(e.target.value)} style={{ ...INP, width: 180 }} /></div>
            <button onClick={loadReport} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>Пересчитать</button>
          </div>
          {!report ? <div style={{ color: COLORS.textMuted, fontSize: 14 }}>Загрузка…</div> : (() => {
            const cm = (v: number) => `${(v / 100).toFixed(1)} м` + ` (${Math.round(v)} см)`
            const rows = [
              { k: 'Листов отработано', v: `${report.takenSheets} шт`, hint: `= ${report.materialCm} см материала (× ${SHEET_WIDTH_CM})`, c: COLORS.text },
              { k: 'Изделий продано', v: cm(report.soldCm), hint: `${report.soldPcs} шт (по карточкам)`, c: '#2e8a5e' },
              { k: 'Изделий в запас', v: cm(report.stockCm), hint: `${report.stockPcs} шт (собственное произв.)`, c: '#2a5aaa' },
              { k: 'Сделано всего', v: cm(report.madeCm), hint: 'продано + запас', c: COLORS.text },
              { k: 'Потери реза (обрезь+мусор)', v: cm(report.lossCm), hint: `${report.lossPct}% от материала`, c: report.lossPct > 12 ? '#b03020' : '#a56a00' },
            ]
            return (
              <div style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, padding: 18 }}>
                <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 14 }}>Сверка материала: сколько целых листов отработано → во что превратилось (продажи + запас) → потери реза.</div>
                {rows.map(r => (
                  <div key={r.k} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '11px 0', borderBottom: `1px solid ${COLORS.borderLight}` }}>
                    <div><div style={{ fontSize: 14, fontWeight: 600 }}>{r.k}</div><div style={{ fontSize: 12, color: COLORS.textLight }}>{r.hint}</div></div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: r.c, whiteSpace: 'nowrap' }}>{r.v}</div>
                  </div>
                ))}
                {report.byColor.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, marginBottom: 8 }}>ЛИСТЫ ОТРАБОТАНО ПО ЦВЕТАМ</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {report.byColor.map((b: any) => (
                        <span key={b.color} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, background: COLORS.bgCard, padding: '5px 10px', borderRadius: 20 }}>
                          <RalDot code={extractRal(b.color) || b.color} size={13} /><b>{b.color}</b> · {b.sheets} шт
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {tab === 'bind' && (
        <div style={{ maxWidth: 760 }}>
          <input style={{ ...INP, marginBottom: 12, maxWidth: 340 }} value={bindSearch} onChange={e => setBindSearch(e.target.value)} placeholder="🔍 поиск изделия (H-профиль, угол…)" />
          {types.length === 0 && <div style={{ fontSize: 13, color: '#b03020', marginBottom: 10 }}>Сначала заведите типы во вкладке «Типы изделий».</div>}
          <div style={{ background: COLORS.white, borderRadius: 12, boxShadow: `0 0 0 1px ${COLORS.border}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: COLORS.bgCard }}><th style={TH}>ИЗДЕЛИЕ</th><th style={{ ...TH, width: 220 }}>ТИП (спецификация)</th></tr></thead>
              <tbody>{bindList.map((p: any) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${COLORS.borderLight}` }}>
                  <td style={{ padding: '7px 8px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><RalDot code={extractRal(p.name)} size={12} />{p.name}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <select value={p.specTypeId || ''} onChange={e => bindType(p.id, e.target.value)} style={{ ...INP, cursor: 'pointer', padding: '5px 8px', background: p.specTypeId ? '#eef7f1' : '#fff' }}>
                      <option value="">— не задан —</option>
                      {types.map(t => <option key={t.id} value={t.id}>{t.name} ({num(t.widthCm)}см)</option>)}
                    </select>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 8 }}>Только папка «Комплектующие» (режутся из листа){goods.length > 60 ? ` · показаны первые 60 из ${goods.length}, уточните поиском` : ''}. Тип даёт стандартный см и материал (лист по цвету).</div>
        </div>
      )}
    </div>
  )
}
