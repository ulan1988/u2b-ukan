'use client'
// «Деньги» — универсальный дневной кассовый лист (порт макета Финансы_модель.html).
// Всё в БД: строки/суммы по счетам/избранные. «Провести» создаёт payments → акт сверки.
import { useCallback, useEffect, useRef, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { listContragents } from '@/lib/api/refs'
import ContragentPicker from '@/components/ContragentPicker'
import { finDay, finSaveRow, finDeleteRow, finReorder, finPost, finFavSave, finFavApply, finDds, finOpenInvoices, finJournal, finEditDoc, finDeleteDoc } from '@/lib/api/finmoney'

const TYPES: Record<string, string> = { in: 'Поступление', out: 'Платёж', mv: 'Перемещение', service: 'Служебное' }
const typeName = (t: string) => TYPES[t] || `⚠ ${t}`   // неизвестный тип показываем громко, не прячем
const TYPE_COLOR: Record<string, { bg: string; c: string }> = {
  in: { bg: '#e8f5ec', c: '#0f7b3d' }, out: { bg: '#fbeae9', c: '#b3261e' }, both: { bg: '#fff3d6', c: '#8a6d00' },
  mv: { bg: '#e9f0fb', c: '#1a56b0' }, service: { bg: '#eceff2', c: '#6b7686' },
}
const todayStr = () => new Date().toISOString().slice(0, 10)
const fmt = (n: number) => !n ? '0' : n.toLocaleString('ru-RU', { minimumFractionDigits: Math.abs(n % 1) > 1e-9 ? 2 : 0, maximumFractionDigits: 2 })
const nextDay = (d: string) => { const dt = new Date(d); dt.setDate(dt.getDate() + 1); return dt.toISOString().slice(0, 10) }

// Калькулятор в ячейке: "4500+5500" -> 10000
function calc(v: any): number | null {
  if (v == null || v === '') return 0
  let s = String(v).replace(/\s/g, '').replace(/,/g, '.').replace(/х|x|×/gi, '*').replace(/÷/g, '/')
  if (!/^[-+*/().\d]+$/.test(s)) return null
  if (/[+\-*/.(]$/.test(s)) return null
  try { const n = Function('"use strict";return(' + s + ')')(); return (typeof n === 'number' && isFinite(n)) ? Math.round(n * 100) / 100 : null } catch { return null }
}
const parseCell = (v: any) => { const n = calc(v); return n == null ? 0 : n }

function mapRow(r: any) {
  const amt: Record<string, number> = {}
  for (const a of (r.amounts || [])) amt[a.accountId] = Number(a.amount) || 0
  return { id: r.id, type: r.type, code: r.code, article: r.article, who: r.who, comment: r.comment || '', status: r.status, contragentId: r.contragentId, docId: r.docId, contragent: r.contragent, docNumber: r.docNumber, docType: r.docType, expenseArticleId: r.expenseArticleId, expCode: r.expCode, expName: r.expName, alloc: r.alloc || [], amt }
}

export default function FinanceMoneyScreen({ orgId }: { orgId: string }) {
  const [date, setDate] = useState(todayStr())
  const [data, setData] = useState<any>(null)
  const [rows, setRows] = useState<any[]>([])
  const [cags, setCags] = useState<any[]>([])
  const [favs, setFavs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [modalRow, setModalRow] = useState<any | null>(null)
  const [favOpen, setFavOpen] = useState(false)
  const [view, setView] = useState<'sheet' | 'dds' | 'journal'>('sheet')
  const [showComment, setShowComment] = useState(false)   // колонка «Комментарий» со шторкой
  const timers = useRef<Record<string, any>>({})
  const didInit = useRef(false)

  const load = useCallback(async () => {
    if (!didInit.current) setLoading(true)   // «Загрузка…» только при первом открытии — без мигания на каждом обновлении
    let d = await finDay(date)
    // Пустой день + есть избранное → сразу подставляем статьи из избранного («первым откроется избранное»).
    if ((d?.rows || []).length === 0 && (d?.favorites || []).length > 0) { await finFavApply(date); d = await finDay(date) }
    setData(d); setRows((d?.rows || []).map(mapRow)); setFavs(d?.favorites || [])
    didInit.current = true; setLoading(false)
  }, [date])
  useEffect(() => { load() }, [load])
  useEffect(() => { listContragents(true).then(r => setCags((r as any[]).filter(c => !c.archived))) }, [])

  const accounts: any[] = data?.accounts || []
  const opening: Record<string, number> = data?.opening || {}
  const show = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200) }
  const rowTotal = (r: any) => accounts.reduce((s, a) => s + (r.amt[a.id] || 0), 0)
  const hasAmt = (r: any) => accounts.some(a => (r.amt[a.id] || 0) !== 0)
  const closing: Record<string, number> = {}
  for (const a of accounts) { closing[a.id] = opening[a.id] || 0; for (const r of rows) closing[a.id] += r.amt[a.id] || 0 }
  const drafts = rows.filter(r => r.status !== 'posted' && hasAmt(r)).length
  const posted = rows.filter(r => r.status === 'posted').length

  function payload(r: any) {
    return { id: r.id, date, type: r.type, code: r.code || null, article: r.article, who: r.who, comment: r.comment || '', contragentId: r.contragentId || null, docId: r.docId || null, expenseArticleId: r.expenseArticleId || null, alloc: r.alloc || [], amounts: accounts.map(a => ({ accountId: a.id, amount: r.amt[a.id] || 0 })) }
  }
  async function persist(r: any) { const res: any = await finSaveRow(payload(r)); if (res?.data?.id && !r.id) setRows(p => p.map(x => x === r ? { ...x, id: res.data.id } : x)); return res?.data?.id || r.id }
  function scheduleSave(r: any) { const k = r.id || 'new'; clearTimeout(timers.current[k]); timers.current[k] = setTimeout(() => persist(r), 500) }

  async function addRow() { const r = { id: '', type: 'out', code: 'ПЛ-13', article: 'Прочие платежи', who: '', status: 'draft', contragentId: null, docId: null, amt: {} }; setRows(p => [...p, r]); await persist(r); await load() }
  async function cloneRow(i: number) {
    const src = rows[i]; const cp = { ...src, id: '', status: 'draft', amt: { ...src.amt } }
    const id = await persist(cp); const ids = rows.map(r => r.id); ids.splice(i + 1, 0, id); await finReorder(ids); await load()
  }
  async function insertRow(i: number) {
    const src = rows[i]; const nr = { id: '', type: src.type, article: src.article, who: '', status: 'draft', contragentId: null, docId: null, amt: {} }
    const id = await persist(nr); const ids = rows.map(r => r.id); ids.splice(i + 1, 0, id); await finReorder(ids); await load()
  }
  async function removeRow(i: number) { const r = rows[i]; if (r.id) await finDeleteRow(r.id); await load() }
  // Поменять местами строки (вверх/вниз) + сохранить порядок.
  async function moveRow(i: number, dir: number) {
    const j = i + dir; if (j < 0 || j >= rows.length) return
    const nr = [...rows];[nr[i], nr[j]] = [nr[j], nr[i]]; setRows(nr)
    const ids = nr.map(r => r.id).filter(Boolean); if (ids.length) await finReorder(ids)
  }
  async function revertRow(r: any) { r.status = 'draft'; setRows(p => [...p]); await persist(r); await load() }
  async function postAll() {
    // Досохраняем все суммы (снимаем debounce), чтобы сервер увидел их до проведения — иначе гонка.
    Object.values(timers.current).forEach((t: any) => clearTimeout(t)); timers.current = {}
    await Promise.all(rows.filter(r => hasAmt(r)).map(r => persist(r)))
    const res: any = await finPost(date); show(`✓ Проведено строк: ${res?.data?.posted || 0}, платежей: ${res?.data?.payments || 0}`); await load()
  }
  async function newDay() { const nd = nextDay(date); await finFavApply(nd); setDate(nd) }
  async function applyFavs() { await finFavApply(date); setFavOpen(false); await load() }
  // Сохранить текущие строки листа как избранное (шаблон), без сумм.
  // Пропускаем пустые/«Новая статья» и дубли (по коду или названию).
  async function saveAsFavorites() {
    const seen = new Set<string>()
    const favs = rows
      .filter((r: any) => (r.article || '').trim() && r.article !== 'Новая статья' && r.article !== 'Прочие')
      .filter((r: any) => { const k = r.code || r.article; if (seen.has(k)) return false; seen.add(k); return true })
      .map((r: any) => { const ex = (data?.favorites || []).find((f: any) => f.code === r.code); return { code: r.code || null, label: r.article, type: r.type, activity: ex?.activity || 'operating', contragentId: r.contragentId || null, defaultAccountId: ex?.defaultAccountId || null } })
    const res: any = await finFavSave(favs)
    show(res?.ok ? `★ Сохранено в избранное: ${favs.length} статей` : '⚠ Ошибка сохранения')
  }
  async function setType(r: any, t: string) { r.type = t; setRows(p => [...p]); await persist(r) }
  async function applyStatia(r: any, fav: any) {
    r.type = fav.type; r.code = fav.code || null; r.article = fav.label || ''
    if (fav.contragentId && !r.contragentId) { r.contragentId = fav.contragentId; const c = cags.find((x: any) => x.id === fav.contragentId); if (c && !r.who) r.who = c.name }
    setRows(p => [...p]); await persist(r)
  }

  // Перемещение: счёт «от» = минус, «к» = плюс. Итог по строке = 0.
  function setMv(r: any, accId: string, dir: string, absVal: number) {
    const n = dir === 'from' ? -Math.abs(absVal) : dir === 'to' ? Math.abs(absVal) : 0
    if (!n) delete r.amt[accId]; else r.amt[accId] = n
    setRows(p => [...p]); scheduleSave(r)
  }
  function setCell(r: any, accId: string, val: string) {
    const n = calc(val); if (n == null) return
    if (n === 0) delete r.amt[accId]; else r.amt[accId] = n
    setRows(p => [...p]); scheduleSave(r)
  }

  const th: React.CSSProperties = { background: '#eef0f3', fontWeight: 600, textAlign: 'center', padding: '5px 6px', border: '1px solid #d0d5db', fontSize: 12 }
  const thNum = { ...th, textAlign: 'right' as const }
  const td: React.CSSProperties = { border: '1px solid #d0d5db', padding: '1px 6px', fontSize: 13 }
  const tdNum = { ...td, textAlign: 'right' as const, fontFamily: 'Consolas, monospace', fontSize: 15.5, fontWeight: 700 }

  const tabBtn = (v: 'sheet' | 'dds' | 'journal', label: string) => (
    <button onClick={() => setView(v)} style={{ padding: '6px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: view === v ? COLORS.primary : '#fff', color: view === v ? '#fff' : COLORS.textMuted, boxShadow: view === v ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{label}</button>
  )
  const dayIn = rows.reduce((s, r) => { const t = rowTotal(r); return s + (t > 0 ? t : 0) }, 0)
  const dayOut = rows.reduce((s, r) => { const t = rowTotal(r); return s + (t < 0 ? -t : 0) }, 0)
  const headerBar = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
      {tabBtn('sheet', '💵 Операции')}{tabBtn('dds', '📊 Отчёт ДДС')}{tabBtn('journal', '📋 Документы')}
      {view === 'sheet' && <>
        <div style={{ flex: 1 }} />
        <select value={date} onChange={e => setDate(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #8f99a6', borderRadius: 6, fontWeight: 600, fontFamily: 'inherit', fontSize: 13 }}>
          {(data?.dates || [date]).map((d: string) => <option key={d} value={d}>{d.split('-').reverse().join('.')}</option>)}
        </select>
        <button onClick={newDay} style={{ padding: '6px 12px', border: '1px solid #8f99a6', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Новый день →</button>
        <button onClick={saveAsFavorites} title="Сохранить статьи текущего листа как избранное (без сумм)" style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#8a6d00', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>★ В избранное</button>
        <button onClick={postAll} disabled={!drafts} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: drafts ? '#0f7b3d' : '#a9c9b5', color: '#fff', fontWeight: 700, cursor: drafts ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: 13 }}>✓ Провести{drafts ? ` (${drafts})` : ''}</button>
      </>}
    </div>
  )

  if (view === 'dds') return <div style={{ marginTop: -12 }}>{headerBar}<DdsReport /></div>
  if (view === 'journal') return <div style={{ marginTop: -12 }}>{headerBar}<JournalMode cags={cags} favs={data?.favorites || []} /></div>

  return (
    <div style={{ marginTop: -12 }}>
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{toast}</div>}
      {headerBar}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, fontSize: 12.5 }}>
        <span style={{ borderRadius: 12, padding: '2px 10px', fontWeight: 600, background: '#fff3d6', color: '#8a6d00' }}>Черновик {drafts}</span>
        <span style={{ borderRadius: 12, padding: '2px 10px', fontWeight: 600, background: '#e8f5ec', color: '#0f7b3d' }}>Проведено {posted}</span>
        <span style={{ fontWeight: 700, color: '#0f7b3d' }}>↑ Приход {fmt(dayIn)}</span>
        <span style={{ fontWeight: 700, color: '#b3261e' }}>↓ Расход {fmt(dayOut)}</span>
        <span style={{ fontWeight: 700 }}>Чистый {fmt(dayIn - dayOut)}</span>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', minWidth: 720 }}>
            <thead><tr>
              <th style={{ ...th, width: '3%' }}>№</th>
              <th style={{ ...th, width: '10%' }}>Тип</th>
              <th style={{ ...th, width: '15%' }}>Статья</th>
              <th style={{ ...th, width: '17%' }}>Контрагент / документ</th>
              {accounts.map(a => <th key={a.id} style={thNum}>{a.name}</th>)}
              <th style={thNum}>Общий</th>
              {showComment && <th style={{ ...th, textAlign: 'left', minWidth: 150 }}>Комментарий</th>}
              <th style={{ ...th, width: '8%' }}><button onClick={() => setShowComment(v => !v)} title={showComment ? 'Скрыть «Комментарий»' : 'Показать «Комментарий»'} style={{ border: showComment ? '1px solid #8f99a6' : '1px solid #d0d5db', background: showComment ? '#dfe4ea' : '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 14, padding: '2px 7px', lineHeight: 1 }}>👁</button></th>
            </tr></thead>
            <tbody>
              <tr style={{ background: '#f4f5f7', fontWeight: 700 }}>
                <td style={td}></td><td style={td} colSpan={2}>На начало дня</td><td style={td}></td>
                {accounts.map(a => <td key={a.id} style={tdNum}>{fmt(opening[a.id] || 0)}</td>)}
                <td style={tdNum}>{fmt(accounts.reduce((s, a) => s + (opening[a.id] || 0), 0))}</td>{showComment && <td style={td}></td>}<td style={td}></td>
              </tr>
              {rows.map((r, i) => {
                // Неизвестный тип не роняет рендер, но подсвечивается красным (аномалия видна).
                const isPosted = r.status === 'posted'; const tot = rowTotal(r); const tc = TYPE_COLOR[r.type] || { bg: '#fbeae9', c: '#b3261e' }
                return (
                  <tr key={r.id || i} style={{ background: isPosted ? '#fff' : '#fffdf2' }}>
                    <td style={tdNum}>{i + 1}</td>
                    <td style={td}>{isPosted
                      ? <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 5px', background: tc.bg, color: tc.c }}>{typeName(r.type)} ✓</span>
                      : <select value={r.type} onChange={e => setType(r, e.target.value)} style={{ border: `1px solid ${tc.c}33`, borderRadius: 4, padding: '1px 3px', fontSize: 11, fontWeight: 700, background: tc.bg, color: tc.c, fontFamily: 'inherit', cursor: 'pointer' }}>{Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
                    </td>
                    <td style={td}>{isPosted
                      ? <span>{r.code && <span style={{ color: '#6b7686', fontFamily: 'Consolas, monospace', fontSize: 11, marginRight: 4 }}>{r.code}</span>}{r.article}</span>
                      : <StatiaPicker favs={data?.favorites || []} type={r.type} code={r.code} label={r.article} onPick={(fav: any) => applyStatia(r, fav)} />}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {isPosted
                          ? <span style={{ flex: 1 }}>{r.contragent || r.who || ''}</span>
                          : <WhoInput row={r} cags={cags} onText={(t: string) => { r.who = t; setRows(p => [...p]); scheduleSave(r) }} onPick={(c: any) => { r.contragentId = c.id; r.who = c.name; setRows(p => [...p]); persist(r) }} />}
                        {r.docNumber && <span style={{ fontSize: 11, color: '#1a56b0', whiteSpace: 'nowrap' }} title={r.docNumber}>📄</span>}
                        {r.contragentId && <span style={{ fontSize: 11 }} title={r.contragent}>🏷</span>}
                        {!isPosted && <button onClick={() => setModalRow(r)} title="Распределить / документ / контрагент" style={{ border: '1px solid #d0d5db', borderRadius: 4, background: '#fff', color: '#6b7686', fontWeight: 700, padding: '2px 6px', cursor: 'pointer' }}>⋯</button>}
                      </div>
                    </td>
                    {accounts.map(a => {
                      const v = r.amt[a.id]
                      if (isPosted) return <td key={a.id} style={{ ...tdNum, color: v > 0 ? '#0f7b3d' : v < 0 ? '#b3261e' : undefined }}>{v ? fmt(v) : ''}</td>
                      // Перемещение: выбор «от/к» + сумма прямо в колонке счёта.
                      if (r.type === 'mv') {
                        const dir = (v || 0) < 0 ? 'from' : (v || 0) > 0 ? 'to' : ''
                        return <td key={a.id} style={td}><div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                          <select value={dir} onChange={e => setMv(r, a.id, e.target.value, Math.abs(v || 0))} style={{ border: `1px solid ${dir === 'from' ? '#b3261e' : dir === 'to' ? '#0f7b3d' : '#d0d5db'}`, borderRadius: 4, fontSize: 11, fontWeight: 700, padding: '3px 2px', color: dir === 'from' ? '#b3261e' : dir === 'to' ? '#0f7b3d' : '#9a938a', fontFamily: 'inherit', cursor: 'pointer' }}>
                            <option value="">—</option><option value="from">от</option><option value="to">к</option>
                          </select>
                          <input value={v ? String(Math.abs(v)) : ''} inputMode="decimal" placeholder="0" onChange={e => setMv(r, a.id, dir || 'to', parseCell(e.target.value))}
                            style={{ width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '2px 4px', textAlign: 'right', fontFamily: 'Consolas, monospace', fontSize: 15, fontWeight: 700, background: 'transparent' }} />
                        </div></td>
                      }
                      return <td key={a.id} style={td}><input defaultValue={v != null && v !== 0 ? v : ''} key={(r.id || i) + a.id + (v || 0)} inputMode="decimal"
                        onBlur={e => setCell(r, a.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
                        style={{ width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '2px 6px', textAlign: 'right', fontFamily: 'Consolas, monospace', fontSize: 15.5, fontWeight: 700, background: 'transparent' }} /></td>
                    })}
                    <td style={{ ...tdNum, color: tot > 0 ? '#0f7b3d' : tot < 0 ? '#b3261e' : undefined, fontWeight: 600 }}>{tot ? fmt(tot) : '0'}</td>
                    {showComment && <td style={td}>{isPosted
                      ? <span style={{ fontSize: 12.5 }}>{r.comment}</span>
                      : <input value={r.comment || ''} onChange={e => { r.comment = e.target.value; setRows(p => [...p]); scheduleSave(r) }} placeholder="…" style={{ width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '2px 6px', fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />}
                    </td>}
                    <td style={td}><div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                        <button onClick={() => moveRow(i, -1)} title="Вверх" style={arrowBtn}>▲</button>
                        <button onClick={() => moveRow(i, 1)} title="Вниз" style={arrowBtn}>▼</button>
                      </div>
                      {isPosted ? <button onClick={() => revertRow(r)} title="Вернуть в черновик" style={actBtn}>✎</button>
                        : <>
                          <button onClick={() => cloneRow(i)} title="Клонировать" style={actBtn}>⧉</button>
                          <button onClick={() => insertRow(i)} title="Вставить под этой" style={actBtn}>＋</button>
                          <button onClick={() => removeRow(i)} title="Убрать" style={{ ...actBtn, color: '#b3261e' }}>✕</button>
                        </>}
                    </div></td>
                  </tr>
                )
              })}
              <tr style={{ background: '#ffe94d', fontWeight: 700 }}>
                <td style={td}></td><td style={td} colSpan={2}>На конец дня (расчёт)</td><td style={td}></td>
                {accounts.map(a => <td key={a.id} style={tdNum}>{fmt(closing[a.id] || 0)}</td>)}
                <td style={tdNum}>{fmt(accounts.reduce((s, a) => s + (closing[a.id] || 0), 0))}</td>{showComment && <td style={td}></td>}<td style={td}></td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button onClick={addRow} style={{ padding: '6px 12px', border: '1px solid #8f99a6', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>+ Добавить строку</button>
          </div>
          <p style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 6 }}>Калькулятор в ячейке (4500+5500 → Enter). ⧉ клон · ＋ вставить · ✕ убрать · ✎ вернуть в черновик.</p>
        </div>
      )}

      {modalRow && <RowModal row={modalRow} accounts={accounts} cags={cags} orgId={orgId} date={date} defAcc={(data?.favorites || []).find((f: any) => f.code === modalRow.code)?.defaultAccountId || ''} onClose={() => setModalRow(null)} onSaved={async () => { setModalRow(null); await load() }} persist={persist} />}
      {favOpen && <FavModal favs={favs} setFavs={setFavs} cags={cags} onApply={applyFavs} onClose={async () => { await finFavSave(favs); setFavOpen(false); await load() }} />}
    </div>
  )
}

const actBtn: React.CSSProperties = { border: 0, background: 'none', color: '#b7bfc9', fontSize: 13, padding: '1px 3px', cursor: 'pointer' }
const arrowBtn: React.CSSProperties = { border: 0, background: 'none', color: '#9aa3ad', fontSize: 8, padding: 0, cursor: 'pointer', lineHeight: 0.9, height: 10 }
const ov: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(20,26,34,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 14px', overflow: 'auto', zIndex: 1300 }
const modalBox: React.CSSProperties = { background: '#fff', borderRadius: 10, maxWidth: 600, width: '100%', padding: 18 }

// ─── Поле «Контрагент» с автоподсказкой прямо в строке ─────────────────────────
function WhoInput({ row, cags, onText, onPick }: { row: any; cags: any[]; onText: (t: string) => void; onPick: (c: any) => void }) {
  const [focus, setFocus] = useState(false)
  const s = (row.who || '').trim().toLowerCase()
  const matches = focus && s.length >= 1 ? cags.filter(c => (c.name || '').toLowerCase().includes(s)).slice(0, 8) : []
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 40 }}>
      <input value={row.who || ''} onChange={e => onText(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} placeholder="контрагент…"
        style={{ width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '2px 6px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', background: row.contragentId ? '#f0f8f2' : 'transparent' }} />
      {matches.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 70, minWidth: 200, maxHeight: 220, overflowY: 'auto', background: '#fff', border: '1px solid #d0d5db', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', marginTop: 2 }}>
          {matches.map(c => <div key={c.id} onMouseDown={() => onPick(c)} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }} onMouseEnter={e => (e.currentTarget.style.background = '#eef4ff')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>{c.name}</div>)}
        </div>
      )}
    </div>
  )
}

// ─── Выбор статьи ДДС прямо в строке (сгруппировано, с поиском) ────────────────
const STAT_ICON = (t: string) => t === 'in' ? { i: '↑', c: '#0f7b3d' } : t === 'out' ? { i: '↓', c: '#b3261e' } : t === 'both' ? { i: '↕', c: '#8a6d00' } : t === 'mv' ? { i: '⇄', c: '#1a56b0' } : { i: '•', c: '#6b7686' }
const ACT_TITLES: Record<string, string> = { operating: 'Операционная', financial: 'Финансовая', investing: 'Инвестиционная', transfer: 'Перемещения', service: 'Служебные' }
const ACT_ORDER = ['operating', 'financial', 'investing', 'transfer', 'service']

function StatiaPicker({ favs, type, code, label, onPick }: { favs: any[]; type?: string; code?: string; label?: string; onPick: (f: any) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) } document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const s = q.trim().toLowerCase()
  // Фильтр по выбранному типу строки: Расход → только расходные статьи (+оба) и т.д.
  const byType = favs.filter(f => !type || f.type === type)
  const filtered = byType.filter(f => !s || (f.code || '').toLowerCase().includes(s) || (f.label || '').toLowerCase().includes(s))
  const groups = ACT_ORDER.map(a => ({ a, title: ACT_TITLES[a], items: filtered.filter(f => (f.activity || 'operating') === a) })).filter(g => g.items.length)
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid transparent', borderRadius: 4, padding: '1px 5px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, width: '100%', textAlign: 'left', lineHeight: 1.15 }}>
        {code || label ? <>{code && <span style={{ color: '#6b7686', fontFamily: 'Consolas, monospace', fontSize: 11 }}>{code}</span>} <span>{label}</span></> : <span style={{ color: '#9a938a' }}>— выбрать статью —</span>}
        <span style={{ marginLeft: 'auto', color: '#9a938a', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 60, width: 330, maxHeight: 340, overflowY: 'auto', background: '#fff', border: '1px solid #d0d5db', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', marginTop: 2 }}>
          <div style={{ padding: 6, position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid #eee' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск статьи…" style={{ width: '100%', border: '1px solid #d0d5db', borderRadius: 6, padding: '6px 8px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {groups.length === 0 ? <div style={{ padding: 12, color: '#9a938a', fontSize: 13, textAlign: 'center' }}>Не найдено</div> : groups.map(g => (
            <div key={g.a}>
              <div style={{ padding: '5px 10px', background: '#f4f5f7', fontWeight: 700, fontSize: 11, color: '#6b7686' }}>{g.title}</div>
              {g.items.map((f, k) => { const ic = STAT_ICON(f.type); return (
                <div key={(f.code || '') + f.label + k} onClick={() => { onPick(f); setOpen(false); setQ('') }} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 10px', cursor: 'pointer', fontSize: 13 }} onMouseEnter={e => (e.currentTarget.style.background = '#eef4ff')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                  <span style={{ color: ic.c, fontWeight: 800, width: 12 }}>{ic.i}</span>
                  {f.code && <span style={{ color: '#6b7686', fontFamily: 'Consolas, monospace', fontSize: 11 }}>{f.code}</span>}
                  <span>{f.label}</span>
                </div>
              ) })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Моделька строки: распределить по счетам / контрагент / документ ──────────
function RowModal({ row, accounts, cags, orgId, defAcc, date, onClose, onSaved, persist }: any) {
  const sign = row.type === 'out' ? -1 : 1
  const [vals, setVals] = useState<Record<string, string>>(() => { const v: any = {}; accounts.forEach((a: any) => { const x = row.amt[a.id]; v[a.id] = x ? String(Math.abs(x)) : '' }); return v })
  const [cid, setCid] = useState<string | null>(row.contragentId || null)
  const [inv, setInv] = useState<any[]>([])
  const [alloc, setAlloc] = useState<Record<string, string>>(() => { const a: any = {}; (row.alloc || []).forEach((x: any) => a[x.docId] = String(x.amount)); return a })
  const target = accounts.reduce((s: number, a: any) => s + parseCell(vals[a.id]), 0)
  const allocTotal = Object.values(alloc).reduce((s: number, v: any) => s + parseCell(v), 0)
  const cName = cags.find((c: any) => c.id === cid)?.name || row.contragent || row.who
  const canPay = !!cid && row.type !== 'mv' && row.type !== 'service'

  useEffect(() => { if (cid) finOpenInvoices(cid, row.type).then((r: any) => setInv(r?.data || [])); else setInv([]) }, [cid]) // eslint-disable-line react-hooks/exhaustive-deps

  function autoFill() { const a: any = {}; let leftAmt = target; for (const d of inv) { if (leftAmt <= 0.001) break; const out = Number(d.outstanding) || 0; const take = Math.min(out, leftAmt); if (take > 0) { a[d.id] = String(Math.round(take * 100) / 100); leftAmt -= take } } setAlloc(a) }
  function toggleInv(d: any) {
    setAlloc(a => {
      const n: any = { ...a }
      if (n[d.id]) { delete n[d.id]; return n }
      let used = 0; for (const v of Object.values(n)) used += parseCell(v)
      const take = target > 0 ? Math.min(Number(d.outstanding) || 0, Math.max(0, target - used)) : (Number(d.outstanding) || 0)
      if (take > 0) n[d.id] = String(Math.round(take * 100) / 100)
      return n
    })
  }
  async function apply(alsoPost: boolean) {
    row.amt = {}; accounts.forEach((a: any) => { const v = parseCell(vals[a.id]); if (v > 0) row.amt[a.id] = sign * v })
    row.contragentId = cid || null
    if (cid && !row.who) { const c = cags.find((x: any) => x.id === cid); if (c) row.who = c.name }
    row.alloc = inv.filter((d: any) => parseCell(alloc[d.id]) > 0).map((d: any) => ({ docId: d.id, number: d.number, amount: parseCell(alloc[d.id]) }))
    await persist(row)
    if (alsoPost) await finPost(date)
    onSaved()
  }

  return (
    <div style={ov} onClick={onClose}>
      <div style={{ ...modalBox, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 2 }}>{row.article}{cName ? ' — ' + cName : ''}</h2>
        <div style={{ fontSize: 12, color: '#6b7686', marginBottom: 12 }}>Тип: {typeName(row.type)} · суммы по счетам{canPay ? ' + погашение накладных (необязательно)' : ''}</div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <label style={{ fontWeight: 600, fontSize: 13, width: 88 }}>Контрагент</label>
          <div style={{ flex: 1, maxWidth: 300 }}><ContragentPicker contragents={cags} value={cid} onPick={(c: any) => setCid(c.id)} placeholder="— без контрагента —" /></div>
          {cid && <button onClick={() => setCid(null)} style={{ ...btn, fontSize: 12, padding: '4px 8px' }}>убрать</button>}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7686', marginBottom: 6 }}>СУММЫ ПО СЧЕТАМ{sign < 0 ? ' · расход (минус)' : ''}</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${accounts.length || 1}, 1fr)`, gap: 8, marginBottom: 8 }}>
          {accounts.map((a: any) => (
            <div key={a.id}>
              <label style={{ fontSize: 12, color: '#6b7686', display: 'block', marginBottom: 2 }}>{a.name}</label>
              <input value={vals[a.id] || ''} onChange={e => setVals(v => ({ ...v, [a.id]: e.target.value }))} inputMode="decimal" placeholder="0" style={{ border: '1.5px solid #8f99a6', borderRadius: 6, padding: '7px 9px', textAlign: 'right', fontFamily: 'Consolas, monospace', width: '100%', fontSize: 14, fontWeight: 700, boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #eee' }}><span>Сумма всего</span><span style={{ fontFamily: 'Consolas, monospace' }}>{fmt(target)}</span></div>

        {canPay && (inv.length === 0
          ? <div style={{ fontSize: 13, color: '#6b7686' }}>У контрагента нет неоплаченных накладных — будет предоплата (аванс).</div>
          : <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, color: '#6b7686' }}>Кликните накладную для погашения (сумма подставится):</span>
              <button onClick={autoFill} style={{ ...btnDark, marginLeft: 'auto', fontSize: 12, padding: '6px 10px' }}>↕ Распределить авто</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr>{['', 'Накладная', 'Дата', 'Остаток', 'Погасить'].map((h, i) => <th key={i} style={{ border: '1px solid #d0d5db', padding: '5px 8px', background: '#eef0f3', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {inv.map((d: any) => { const sel = !!alloc[d.id]; return (
                  <tr key={d.id} onClick={() => toggleInv(d)} style={{ cursor: 'pointer', background: sel ? '#eef4ff' : '#fff' }}>
                    <td style={{ border: '1px solid #d0d5db', padding: '4px 8px', textAlign: 'center' }}><input type="checkbox" checked={sel} readOnly style={{ cursor: 'pointer', width: 15, height: 15 }} /></td>
                    <td style={{ border: '1px solid #d0d5db', padding: '4px 8px', fontFamily: 'Consolas, monospace' }}>{d.number}</td>
                    <td style={{ border: '1px solid #d0d5db', padding: '4px 8px' }}>{(d.date || '').split('-').reverse().join('.')}</td>
                    <td style={{ border: '1px solid #d0d5db', padding: '4px 8px', textAlign: 'right', fontFamily: 'Consolas, monospace' }}>{fmt(d.outstanding)}</td>
                    <td style={{ border: '1px solid #d0d5db', padding: '4px 8px', textAlign: 'right', fontFamily: 'Consolas, monospace', fontWeight: 700, color: sel ? '#0f7b3d' : '#c9cdd2' }}>{sel ? fmt(parseCell(alloc[d.id])) : '—'}</td>
                  </tr>
                ) })}
              </tbody>
            </table>
            <div style={{ marginTop: 6, fontSize: 13 }}>Распределено: <b style={{ color: allocTotal > 0 && Math.abs(allocTotal - target) < 1e-9 ? '#0f7b3d' : '#8a6d00' }}>{fmt(allocTotal)}</b> из {fmt(target)}</div>
          </>)}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btn}>Отмена</button>
          <button onClick={() => apply(false)} style={btn}>Применить</button>
          <button onClick={() => apply(true)} style={btnDark}>Применить и провести</button>
        </div>
      </div>
    </div>
  )
}

// ─── ★ Избранные ──────────────────────────────────────────────────────────────
function FavModal({ favs, setFavs, cags, onApply, onClose }: any) {
  return (
    <div style={ov} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 2 }}>★ Избранные строки</h2>
        <div style={{ fontSize: 12, color: '#6b7686', marginBottom: 12 }}>Этот набор появляется в каждом новом дне — ваш шаблон.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '52vh', overflow: 'auto', marginBottom: 12 }}>
          {favs.map((f: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid #d0d5db', borderRadius: 6, padding: '4px 6px' }}>
              <button onClick={() => { if (i > 0) { const n = [...favs];[n[i - 1], n[i]] = [n[i], n[i - 1]]; setFavs(n) } }} style={miniBtn}>▲</button>
              <button onClick={() => { if (i < favs.length - 1) { const n = [...favs];[n[i + 1], n[i]] = [n[i], n[i + 1]]; setFavs(n) } }} style={miniBtn}>▼</button>
              <input value={f.label} onChange={e => { const n = [...favs]; n[i] = { ...f, label: e.target.value }; setFavs(n) }} style={{ flex: 1, border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', fontFamily: 'inherit' }} />
              <select value={f.type} onChange={e => { const n = [...favs]; n[i] = { ...f, type: e.target.value }; setFavs(n) }} style={{ border: '1px solid #d0d5db', borderRadius: 4, padding: '3px 5px', fontSize: 12 }}>
                {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button onClick={() => setFavs(favs.filter((_: any, j: number) => j !== i))} style={{ ...miniBtn, color: '#b3261e' }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setFavs([...favs, { label: 'Новая статья', type: 'etc' }])} style={btn}>+ Добавить строку</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onApply} style={btn}>Добавить недостающие в день</button>
            <button onClick={onClose} style={btnDark}>Готово</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = { padding: '7px 13px', border: '1px solid #8f99a6', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
const btnDark: React.CSSProperties = { padding: '7px 13px', border: '1px solid #1c2430', borderRadius: 6, background: '#1c2430', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const miniBtn: React.CSSProperties = { border: 0, background: 'none', color: '#6b7686', padding: '2px 4px', fontSize: 13, cursor: 'pointer' }
const splitInp: React.CSSProperties = { border: '1px solid #8f99a6', borderRadius: 6, padding: '7px 9px', textAlign: 'right', fontFamily: 'Consolas, monospace', width: '100%' }
const dInpJ: React.CSSProperties = { padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }
const jth: React.CSSProperties = { textAlign: 'left', padding: '7px 10px', whiteSpace: 'nowrap', borderBottom: '1px solid #d0d5db' }
const jtd: React.CSSProperties = { textAlign: 'left', padding: '6px 10px' }
const jtdNum: React.CSSProperties = { textAlign: 'right', padding: '6px 10px', fontFamily: 'Consolas, monospace', whiteSpace: 'nowrap' }
const fInp: React.CSSProperties = { padding: '7px 9px', borderRadius: 7, border: '1.5px solid #e6e2dc', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

// ─── Вкладка «Документы»: журнал операций + поиск по всем параметрам ──────────
function JournalMode({ cags, favs }: { cags: any[]; favs: any[] }) {
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [openDoc, setOpenDoc] = useState<any | null>(null)
  const load = useCallback(async () => { setLoading(true); const r: any = await finJournal(from || '2000-01-01', to || '2100-01-01'); setData(r?.data || { rows: [], accounts: [] }); setLoading(false) }, [from, to])
  useEffect(() => { load() }, [load])
  const accounts: any[] = data?.accounts || []
  const rows: any[] = data?.rows || []
  const rowTotal = (r: any) => (r.amounts || []).reduce((s: number, a: any) => s + Number(a.amount || 0), 0)
  const amtOf = (r: any, accId: string) => { const a = (r.amounts || []).find((x: any) => x.accountId === accId); return a ? Number(a.amount) : 0 }
  const s = q.trim().toLowerCase()
  const filtered = s ? rows.filter((r: any) => `${r.date} ${typeName(r.type)} ${r.code || ''} ${r.article} ${r.contragent || ''} ${r.who || ''} ${r.comment || ''} ${rowTotal(r)}`.toLowerCase().includes(s)) : rows
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 18 }}>📋 Документы</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Поиск: статья, контрагент, комментарий, сумма, дата…" style={{ flex: '1 1 300px', minWidth: 220, maxWidth: 480, padding: '8px 12px', border: '1.5px solid #e6e2dc', borderRadius: 8, outline: 'none', fontFamily: 'inherit', fontSize: 14 }} />
        <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>от</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dInpJ} />
        <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>до</span><input type="date" value={to} onChange={e => setTo(e.target.value)} style={dInpJ} />
        <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>{filtered.length} док.</span>
      </div>
      {loading ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</div> : (
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 780 }}>
            <thead><tr style={{ background: '#eef0f3', color: COLORS.textMuted, fontSize: 11 }}>
              <th style={jth}>Дата</th><th style={jth}>Тип</th><th style={jth}>Статья</th><th style={jth}>Контрагент</th>
              {accounts.map((a: any) => <th key={a.id} style={{ ...jth, textAlign: 'right' }}>{a.name}</th>)}
              <th style={{ ...jth, textAlign: 'right' }}>Общий</th><th style={jth}>Комментарий</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={6 + accounts.length} style={{ padding: 20, textAlign: 'center', color: '#9a938a' }}>Нет документов</td></tr>
                : filtered.map((r: any) => { const tot = rowTotal(r); const tc = TYPE_COLOR[r.type] || { bg: '#eceff2', c: '#6b7686' }; return (
                  <tr key={r.id} onClick={() => setOpenDoc(r)} style={{ borderTop: '1px solid #f4f5f7', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                    <td style={jtd}>{(r.date || '').split('-').reverse().join('.')}</td>
                    <td style={jtd}><span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 5px', background: tc.bg, color: tc.c }}>{typeName(r.type)}</span></td>
                    <td style={jtd}>{r.code && <span style={{ color: '#6b7686', fontFamily: 'Consolas, monospace', fontSize: 11, marginRight: 4 }}>{r.code}</span>}{r.article}</td>
                    <td style={jtd}>{r.contragent || r.who || ''}</td>
                    {accounts.map((a: any) => { const v = amtOf(r, a.id); return <td key={a.id} style={{ ...jtdNum, color: v > 0 ? '#0f7b3d' : v < 0 ? '#b3261e' : undefined }}>{v ? fmt(v) : ''}</td> })}
                    <td style={{ ...jtdNum, fontWeight: 700 }}>{fmt(tot)}</td>
                    <td style={{ ...jtd, color: '#6b7686', fontSize: 12 }}>{r.comment || ''}</td>
                  </tr>
                ) })}
            </tbody>
          </table>
        </div>
      )}
      {openDoc && <DocEditModal doc={openDoc} accounts={accounts} cags={cags} favs={favs} onClose={() => setOpenDoc(null)} onDone={async () => { setOpenDoc(null); await load() }} />}
    </div>
  )
}

function DocEditModal({ doc, accounts, cags, favs, onClose, onDone }: any) {
  const [d, setD] = useState<any>(() => ({ date: doc.date, type: doc.type, code: doc.code, article: doc.article, contragentId: doc.contragentId, who: doc.who, comment: doc.comment || '', amt: Object.fromEntries((doc.amounts || []).map((a: any) => [a.accountId, Number(a.amount)])) }))
  const [busy, setBusy] = useState(false)
  const total = accounts.reduce((s: number, a: any) => s + (Number(d.amt[a.id]) || 0), 0)
  async function save() {
    setBusy(true)
    const row = { date: d.date, type: d.type, code: d.code || null, article: d.article, who: d.who || '', comment: d.comment || '', contragentId: d.contragentId || null, amounts: accounts.map((a: any) => ({ accountId: a.id, amount: Number(d.amt[a.id]) || 0 })) }
    const r: any = await finEditDoc(doc.id, row); setBusy(false)
    if (r?.ok) onDone(); else alert(r?.error || 'Ошибка')
  }
  async function del() { if (!confirm('Удалить документ безвозвратно?')) return; setBusy(true); await finDeleteDoc(doc.id); setBusy(false); onDone() }
  return (
    <div style={ov} onClick={onClose}>
      <div style={{ ...modalBox, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Документ · {(doc.date || '').split('-').reverse().join('.')} <span style={{ fontSize: 12, color: '#6b7686', fontWeight: 400 }}>исправьте счёт/сумму/статью</span></h2>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontWeight: 600 }}>Дата</label><input type="date" value={d.date} onChange={e => setD({ ...d, date: e.target.value })} style={fInp} />
          <label style={{ fontWeight: 600 }}>Тип</label><select value={d.type} onChange={e => setD({ ...d, type: e.target.value })} style={fInp}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <label style={{ fontWeight: 600 }}>Статья</label><div style={{ border: '1.5px solid #e6e2dc', borderRadius: 7, padding: '2px 4px' }}><StatiaPicker favs={favs} type={d.type} code={d.code} label={d.article} onPick={(f: any) => setD({ ...d, type: f.type, code: f.code, article: f.label })} /></div>
          <label style={{ fontWeight: 600 }}>Контрагент</label><ContragentPicker contragents={cags} value={d.contragentId} onPick={(c: any) => setD({ ...d, contragentId: c.id, who: d.who || c.name })} placeholder="— без контрагента —" />
          <label style={{ fontWeight: 600 }}>Комментарий</label><input value={d.comment} onChange={e => setD({ ...d, comment: e.target.value })} style={fInp} placeholder="…" />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7686', marginBottom: 6 }}>СУММЫ ПО СЧЕТАМ (расход — с минусом)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {accounts.map((a: any) => <div key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ flex: 1, fontSize: 13 }}>{a.name}</label>
            <input value={d.amt[a.id] ?? ''} inputMode="decimal" onChange={e => { const v = parseCell(e.target.value); setD((s: any) => ({ ...s, amt: { ...s.amt, [a.id]: v } })) }} style={{ ...fInp, width: 130, textAlign: 'right', fontFamily: 'Consolas, monospace' }} />
          </div>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700 }}>Общий: {fmt(total)}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={del} disabled={busy} style={{ ...btn, color: '#b3261e', borderColor: '#e6c4bf' }}>Удалить</button>
            <button onClick={onClose} style={btn}>Отмена</button>
            <button onClick={save} disabled={busy} style={btnDark}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Отчёт ДДС: свод по деятельностям (Поступления/Платежи) за период ──────────
function DdsReport() {
  const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayStr())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { setLoading(true); finDds(from, to).then(setData).finally(() => setLoading(false)) }, [from, to])
  const accs: any[] = data?.accounts || []
  const dInp: React.CSSProperties = { padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 13, fontFamily: 'inherit', outline: 'none' }
  const line = (code: string | null, label: string, sum: number, color: string) => (
    <div key={(code || '') + label} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 10px 5px 28px', borderTop: '1px solid #f4f5f7', fontSize: 13 }}>
      {code && <span style={{ color: '#6b7686', fontFamily: 'Consolas, monospace', fontSize: 11 }}>{code}</span>}
      <span>{label}</span><span style={{ marginLeft: 'auto', fontFamily: 'Consolas, monospace', fontWeight: 600, color }}>{fmt(sum)}</span>
    </div>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 18 }}>📊 Отчёт ДДС</span>
        <span style={{ fontSize: 12.5, color: COLORS.textMuted, marginLeft: 6 }}>период:</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dInp} />
        <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>—</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dInp} />
        <button onClick={() => { setFrom(monthStart()); setTo(todayStr()) }} style={{ ...dInp, cursor: 'pointer', fontWeight: 600 }}>Текущий месяц</button>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</div> : !data ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>Нет данных</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Остатки по счетам */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
            <div style={{ padding: '9px 14px', background: '#eef0f3', fontWeight: 700, fontSize: 13 }}>Остаток денег по счетам</div>
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
              <thead><tr style={{ color: COLORS.textMuted, fontSize: 11 }}><th style={{ textAlign: 'left', padding: '6px 12px' }}>Счёт</th><th style={{ textAlign: 'right', padding: '6px 12px' }}>На начало</th><th style={{ textAlign: 'right', padding: '6px 12px' }}>На конец</th></tr></thead>
              <tbody>
                {accs.map(a => <tr key={a.id} style={{ borderTop: '1px solid #f4f5f7' }}><td style={{ padding: '6px 12px' }}>{a.name}</td><td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'Consolas, monospace' }}>{fmt(data.opening[a.id] || 0)}</td><td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'Consolas, monospace', fontWeight: 700 }}>{fmt(data.closing[a.id] || 0)}</td></tr>)}
                <tr style={{ borderTop: '2px solid #d0d5db', fontWeight: 800, background: '#fbf7ff' }}><td style={{ padding: '7px 12px' }}>Итого</td><td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'Consolas, monospace' }}>{fmt(accs.reduce((s, a) => s + (data.opening[a.id] || 0), 0))}</td><td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'Consolas, monospace' }}>{fmt(accs.reduce((s, a) => s + (data.closing[a.id] || 0), 0))}</td></tr>
              </tbody>
            </table></div>
          </div>

          {/* Деятельности */}
          {data.activities.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMuted, background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc' }}>За период движений нет</div>
            : data.activities.map((act: any) => (
              <div key={act.key} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
                <div style={{ padding: '9px 14px', background: '#1c2430', color: '#fff', fontWeight: 700, fontSize: 14 }}>{act.title}</div>
                {act.inflows.length > 0 && <>
                  <div style={{ padding: '6px 14px', fontWeight: 700, fontSize: 12.5, color: '#0f7b3d', background: '#f4faf6' }}>📁 Поступления</div>
                  {act.inflows.map((x: any) => line(x.code, x.label, x.sum, '#0f7b3d'))}
                  <div style={{ display: 'flex', padding: '6px 14px', fontWeight: 700, fontSize: 13, borderTop: '1px solid #eee' }}><span>Итого поступления</span><span style={{ marginLeft: 'auto', color: '#0f7b3d', fontFamily: 'Consolas, monospace' }}>{fmt(act.inTotal)}</span></div>
                </>}
                {act.outflows.length > 0 && <>
                  <div style={{ padding: '6px 14px', fontWeight: 700, fontSize: 12.5, color: '#b3261e', background: '#fdf5f4' }}>📁 Платежи</div>
                  {act.outflows.map((x: any) => line(x.code, x.label, x.sum, '#b3261e'))}
                  <div style={{ display: 'flex', padding: '6px 14px', fontWeight: 700, fontSize: 13, borderTop: '1px solid #eee' }}><span>Итого платежи</span><span style={{ marginLeft: 'auto', color: '#b3261e', fontFamily: 'Consolas, monospace' }}>{fmt(act.outTotal)}</span></div>
                </>}
              </div>
            ))}

          {/* Итоги */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', padding: '14px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#0f7b3d' }}>↑ Итого поступления: {fmt(data.totalIn)}</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#b3261e' }}>↓ Итого платежи: {fmt(data.totalOut)}</span>
            <span style={{ fontWeight: 800, fontSize: 15, marginLeft: 'auto', color: data.netFlow >= 0 ? '#0f7b3d' : '#b3261e' }}>Чистый денежный поток: {fmt(data.netFlow)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
