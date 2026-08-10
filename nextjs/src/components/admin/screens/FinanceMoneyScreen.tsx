'use client'
// «Деньги» — универсальный дневной кассовый лист (порт макета Финансы_модель.html).
// Всё в БД: строки/суммы по счетам/избранные. «Провести» создаёт payments → акт сверки.
import { useCallback, useEffect, useRef, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { listContragents } from '@/lib/api/refs'
import ContragentPicker from '@/components/ContragentPicker'
import { finDay, finSaveRow, finDeleteRow, finReorder, finPost, finFavSave, finFavApply, finDocSearch } from '@/lib/api/finmoney'

const TYPES: Record<string, string> = { in: 'Поступление', out: 'Платёж', both: 'Приход/Расход', mv: 'Перемещение', service: 'Служебное' }
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
  return { id: r.id, type: r.type, code: r.code, article: r.article, who: r.who, status: r.status, contragentId: r.contragentId, docId: r.docId, contragent: r.contragent, docNumber: r.docNumber, docType: r.docType, amt }
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
  const timers = useRef<Record<string, any>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const d = await finDay(date)
    setData(d); setRows((d?.rows || []).map(mapRow)); setFavs(d?.favorites || [])
    setLoading(false)
  }, [date])
  useEffect(() => { load() }, [load])
  useEffect(() => { listContragents(true).then(r => setCags(r as any[])) }, [])

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
    return { id: r.id, date, type: r.type, code: r.code || null, article: r.article, who: r.who, contragentId: r.contragentId || null, docId: r.docId || null, amounts: accounts.map(a => ({ accountId: a.id, amount: r.amt[a.id] || 0 })) }
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
  async function revertRow(r: any) { r.status = 'draft'; setRows(p => [...p]); await persist(r); await load() }
  async function postAll() { const res: any = await finPost(date); show(`✓ Проведено строк: ${res?.data?.posted || 0}, платежей: ${res?.data?.payments || 0}`); await load() }
  async function newDay() { const nd = nextDay(date); await finFavApply(nd); setDate(nd) }
  async function applyFavs() { await finFavApply(date); setFavOpen(false); await load() }

  function setCell(r: any, accId: string, val: string) {
    const n = calc(val); if (n == null) return
    if (n === 0) delete r.amt[accId]; else r.amt[accId] = n
    setRows(p => [...p]); scheduleSave(r)
  }

  const th: React.CSSProperties = { background: '#eef0f3', fontWeight: 600, textAlign: 'center', padding: 7, border: '1px solid #d0d5db', fontSize: 12.5 }
  const thNum = { ...th, textAlign: 'right' as const }
  const td: React.CSSProperties = { border: '1px solid #d0d5db', padding: '4px 6px', fontSize: 13 }
  const tdNum = { ...td, textAlign: 'right' as const, fontFamily: 'Consolas, monospace' }

  return (
    <div>
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#211f1c', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{toast}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 19, fontWeight: 800 }}>💵 Деньги <span style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 400 }}>· калькулятор → «Провести платежи»</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setFavOpen(true)} style={{ padding: '7px 13px', border: '1px solid #8a6d00', borderRadius: 6, background: '#fff3d6', color: '#8a6d00', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>★ Избранные</button>
          <select value={date} onChange={e => setDate(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #8f99a6', borderRadius: 6, fontWeight: 600, fontFamily: 'inherit' }}>
            {(data?.dates || [date]).map((d: string) => <option key={d} value={d}>{d.split('-').reverse().join('.')}</option>)}
          </select>
          <button onClick={newDay} style={{ padding: '7px 13px', border: '1px solid #8f99a6', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Новый день →</button>
          <button onClick={postAll} disabled={!drafts} style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: drafts ? '#0f7b3d' : '#a9c9b5', color: '#fff', fontWeight: 700, cursor: drafts ? 'pointer' : 'default', fontFamily: 'inherit' }}>✓ Провести платежи{drafts ? ` (${drafts})` : ''}</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12.5, color: COLORS.textMuted, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ borderRadius: 12, padding: '2px 10px', fontWeight: 600, background: '#fff3d6', color: '#8a6d00' }}>Черновик: {drafts} стр.</span>
        <span style={{ borderRadius: 12, padding: '2px 10px', fontWeight: 600, background: '#e8f5ec', color: '#0f7b3d' }}>Проведено: {posted} стр.</span>
        <span>Итоги внизу — расчётные (с черновиком): сверьте с реальными остатками и проводите.</span>
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
              <th style={{ ...th, width: '8%' }}></th>
            </tr></thead>
            <tbody>
              <tr style={{ background: '#f4f5f7', fontWeight: 700 }}>
                <td style={td}></td><td style={td} colSpan={2}>На начало дня</td><td style={td}></td>
                {accounts.map(a => <td key={a.id} style={tdNum}>{fmt(opening[a.id] || 0)}</td>)}
                <td style={tdNum}>{fmt(accounts.reduce((s, a) => s + (opening[a.id] || 0), 0))}</td><td style={td}></td>
              </tr>
              {rows.map((r, i) => {
                // Неизвестный тип не роняет рендер, но подсвечивается красным (аномалия видна).
                const isPosted = r.status === 'posted'; const tot = rowTotal(r); const tc = TYPE_COLOR[r.type] || { bg: '#fbeae9', c: '#b3261e' }
                return (
                  <tr key={r.id || i} style={{ background: isPosted ? '#fff' : '#fffdf2' }}>
                    <td style={tdNum}>{i + 1}</td>
                    <td style={td}><span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 5px', background: tc.bg, color: tc.c }}>{typeName(r.type)}</span>{isPosted && <span style={{ color: '#0f7b3d', fontWeight: 700, marginLeft: 4 }}>✓</span>}</td>
                    <td style={td}>{r.code && <span style={{ color: '#6b7686', fontFamily: 'Consolas, monospace', fontSize: 11, marginRight: 4 }}>{r.code}</span>}{r.article}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {isPosted
                          ? <span style={{ flex: 1 }}>{r.contragent || r.who || ''}</span>
                          : <input value={r.who || ''} onChange={e => { r.who = e.target.value; setRows(p => [...p]); scheduleSave(r) }} placeholder="…" style={{ flex: 1, border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', fontSize: 13, minWidth: 40, fontFamily: 'inherit' }} />}
                        {r.docNumber && <span style={{ fontSize: 11, color: '#1a56b0', whiteSpace: 'nowrap' }} title={r.docNumber}>📄</span>}
                        {r.contragentId && <span style={{ fontSize: 11 }} title={r.contragent}>🏷</span>}
                        {!isPosted && <button onClick={() => setModalRow(r)} title="Распределить / документ / контрагент" style={{ border: '1px solid #d0d5db', borderRadius: 4, background: '#fff', color: '#6b7686', fontWeight: 700, padding: '2px 6px', cursor: 'pointer' }}>⋯</button>}
                      </div>
                    </td>
                    {accounts.map(a => {
                      const v = r.amt[a.id]
                      if (isPosted) return <td key={a.id} style={{ ...tdNum, color: v > 0 ? '#0f7b3d' : v < 0 ? '#b3261e' : undefined }}>{v ? fmt(v) : ''}</td>
                      return <td key={a.id} style={td}><input defaultValue={v != null && v !== 0 ? v : ''} key={(r.id || i) + a.id + (v || 0)} inputMode="decimal"
                        onBlur={e => setCell(r, a.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
                        style={{ width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '5px 6px', textAlign: 'right', fontFamily: 'Consolas, monospace', fontSize: 13, background: 'transparent' }} /></td>
                    })}
                    <td style={{ ...tdNum, color: tot > 0 ? '#0f7b3d' : tot < 0 ? '#b3261e' : undefined, fontWeight: 600 }}>{tot ? fmt(tot) : '0'}</td>
                    <td style={td}><div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
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
                <td style={tdNum}>{fmt(accounts.reduce((s, a) => s + (closing[a.id] || 0), 0))}</td><td style={td}></td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={addRow} style={{ padding: '7px 13px', border: '1px solid #8f99a6', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>+ Добавить строку в конец</button>
            <button onClick={applyFavs} style={{ padding: '7px 13px', border: '1px solid #8a6d00', borderRadius: 6, background: '#fff3d6', color: '#8a6d00', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>★ Заполнить статьями дня</button>
          </div>
          <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 8, maxWidth: 780 }}>В ячейке работает калькулятор: <b>4500+5500+1000</b> → Enter = <b>11 000</b> (и −, ×, ÷). <b>⧉</b> клонировать, <b>＋</b> вставить под строкой, <b>✕</b> убрать. Пока строки в черновике (кремовые) — ничего не проведено: сверьте жёлтые итоги и нажмите <b>✓ Провести платежи</b> — строки с контрагентом создадут оплату (акт сверки). Проведённую строку вернёте карандашом ✎.</p>
        </div>
      )}

      {modalRow && <RowModal row={modalRow} accounts={accounts} cags={cags} orgId={orgId} defAcc={(data?.favorites || []).find((f: any) => f.code === modalRow.code)?.defaultAccountId || ''} onClose={() => setModalRow(null)} onSaved={async () => { setModalRow(null); await load() }} persist={persist} />}
      {favOpen && <FavModal favs={favs} setFavs={setFavs} cags={cags} onApply={applyFavs} onClose={async () => { await finFavSave(favs); setFavOpen(false); await load() }} />}
    </div>
  )
}

const actBtn: React.CSSProperties = { border: 0, background: 'none', color: '#b7bfc9', fontSize: 13, padding: '1px 3px', cursor: 'pointer' }
const ov: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(20,26,34,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 14px', overflow: 'auto', zIndex: 1300 }
const modalBox: React.CSSProperties = { background: '#fff', borderRadius: 10, maxWidth: 600, width: '100%', padding: 18 }

// ─── Моделька строки: распределить по счетам / контрагент / документ ──────────
function RowModal({ row, accounts, cags, orgId, defAcc, onClose, onSaved, persist }: any) {
  const [tab, setTab] = useState<'split' | 'cag' | 'doc'>('split')
  const [vals, setVals] = useState<Record<string, string>>(() => { const v: any = {}; accounts.forEach((a: any) => { const x = row.amt[a.id]; v[a.id] = x ? String(Math.abs(x)) : '' }); return v })
  const [total, setTotal] = useState(() => { const t = accounts.reduce((s: number, a: any) => s + Math.abs(row.amt[a.id] || 0), 0); return t ? String(t) : '' })
  const [q, setQ] = useState(''); const [docs, setDocs] = useState<any[]>([])
  const sign = row.type === 'out' ? -1 : 1
  const done = accounts.reduce((s: number, a: any) => s + parseCell(vals[a.id]), 0)
  const left = parseCell(total) - done

  useEffect(() => { if (tab === 'doc') finDocSearch(q).then((r: any) => setDocs(r?.data || r || [])) }, [tab, q])
  // Автоподстановка: если у статьи есть счёт по умолчанию и вручную ничего не распределено —
  // введённая «Сумма всего» кладётся на этот счёт автоматически.
  useEffect(() => {
    const t = parseCell(total); const any = accounts.some((a: any) => parseCell(vals[a.id]) !== 0)
    if (t > 0 && !any && defAcc) setVals(v => ({ ...v, [defAcc]: String(t) }))
  }, [total, defAcc]) // eslint-disable-line react-hooks/exhaustive-deps

  async function okSplit() {
    if (row.type === 'mv') { onClose(); return }
    const t = parseCell(total); if (t > 0 && Math.abs(left) > 1e-9) return
    row.amt = {}; accounts.forEach((a: any) => { const v = parseCell(vals[a.id]); if (v > 0) row.amt[a.id] = sign * v })
    await persist(row); onSaved()
  }
  async function pickCag(c: any) { row.contragentId = c.id; if (!row.who) row.who = c.name; await persist(row); onSaved() }
  async function pickDoc(d: any) { row.docId = d.id; row.who = d.contragent || d.number; if (d.contragentId || d.contragent) { /* привяжем контрагента если найден по имени */ } await persist(row); onSaved() }

  return (
    <div style={ov} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 2 }}>{row.article}{row.who ? ' — ' + row.who : ''}</h2>
        <div style={{ fontSize: 12, color: '#6b7686', marginBottom: 12 }}>Тип: {typeName(row.type)} · распределите сумму, привяжите контрагента или документ</div>
        <div style={{ display: 'flex', borderBottom: '2px solid #d0d5db', marginBottom: 12 }}>
          {([['split', 'Распределить по счетам'], ['cag', 'Контрагент'], ['doc', 'Документ']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ border: 0, background: 'none', padding: '8px 14px', fontWeight: 600, color: tab === k ? '#1c2430' : '#6b7686', borderBottom: `2px solid ${tab === k ? '#1c2430' : 'transparent'}`, marginBottom: -2, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
          ))}
        </div>

        {tab === 'split' && (row.type === 'mv'
          ? <div style={{ fontSize: 13, color: '#6b7686', padding: '10px 0' }}>Перемещение между счетами: введите суммы прямо в ячейках со знаком (минус — откуда, плюс — куда). <div style={{ marginTop: 12, textAlign: 'right' }}><button onClick={onClose} style={btnDark}>Понятно</button></div></div>
          : <>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontWeight: 600 }}>Сумма всего</label><input value={total} onChange={e => setTotal(e.target.value)} inputMode="decimal" placeholder="0" style={splitInp} /><span></span>
              {accounts.map((a: any) => <>
                <label key={a.id + 'l'} style={{ fontWeight: 600 }}>{a.name}</label>
                <input key={a.id + 'i'} value={vals[a.id]} onChange={e => setVals(v => ({ ...v, [a.id]: e.target.value }))} inputMode="decimal" placeholder="0" style={splitInp} />
                <button key={a.id + 'b'} onClick={() => { const t = parseCell(total); const nv: any = {}; accounts.forEach((x: any) => nv[x.id] = ''); if (t > 0) nv[a.id] = String(t); setVals(nv) }} style={{ ...btn, fontSize: 12, padding: '4px 8px' }}>всё сюда</button>
              </>)}
            </div>
            <div style={{ borderTop: '1px solid #d0d5db', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 12 }}>
              <div style={{ color: Math.abs(left) < 1e-9 ? '#0f7b3d' : '#b3261e' }}>Осталось распределить: {fmt(left)}</div>
              <div>Распределено: {fmt(done)}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#6b7686' }}>{sign < 0 ? `Тип «${typeName(row.type)}» — запишется с минусом` : 'Запишется с плюсом'}</span>
              <div style={{ display: 'flex', gap: 8 }}><button onClick={onClose} style={btn}>Отмена</button><button onClick={okSplit} style={btnDark}>ОК — записать</button></div>
            </div>
          </>)}

        {tab === 'cag' && <div>
          <div style={{ fontSize: 13, color: '#6b7686', marginBottom: 8 }}>Привяжите контрагента — при проведении создастся оплата в его акте сверки.</div>
          <ContragentPicker contragents={cags} value={row.contragentId} onPick={pickCag} />
          {row.contragentId && <div style={{ marginTop: 10, fontSize: 13 }}>Текущий: <b>{row.contragent || cags.find((c: any) => c.id === row.contragentId)?.name}</b> <button onClick={async () => { row.contragentId = null; await persist(row); onSaved() }} style={{ ...btn, marginLeft: 8, fontSize: 12 }}>убрать</button></div>}
        </div>}

        {tab === 'doc' && <div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск: номер, контрагент…" style={{ width: '100%', border: '1px solid #8f99a6', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }} />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{['Номер', 'Дата', 'Контрагент', 'Сумма'].map(h => <th key={h} style={{ border: '1px solid #d0d5db', padding: '5px 8px', background: '#eef0f3', textAlign: h === 'Сумма' ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {docs.length === 0 ? <tr><td colSpan={4} style={{ padding: 10, textAlign: 'center', color: '#6b7686' }}>Ничего не найдено</td></tr>
                : docs.map(d => <tr key={d.id} onClick={() => pickDoc(d)} style={{ cursor: 'pointer' }}>
                  <td style={{ border: '1px solid #d0d5db', padding: '5px 8px' }}>{d.number}</td>
                  <td style={{ border: '1px solid #d0d5db', padding: '5px 8px' }}>{(d.date || '').split('-').reverse().join('.')}</td>
                  <td style={{ border: '1px solid #d0d5db', padding: '5px 8px' }}>{d.contragent || '—'}</td>
                  <td style={{ border: '1px solid #d0d5db', padding: '5px 8px', textAlign: 'right', fontFamily: 'Consolas, monospace' }}>{fmt(Number(d.total))}</td>
                </tr>)}
            </tbody>
          </table>
        </div>}
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
