'use client'
// «Табель» (смена) — посещаемость сотрудников по дням месяца: клик по ячейке = бар / Жоқ / пусто.
// ИТОГО (кол-во «бар»), АВАНС, ШТРАФ — редактируются. Сотрудники — из списка сотрудников орг.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { listEmployees, attendanceGet, attendanceSave } from '@/lib/api/refs'

const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const num = (v: any) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0 }
const fmt = (n: number) => !n ? '' : Number(n).toLocaleString('ru-RU')
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
// Циклично: пусто → бар → жок → пусто.
const nextVal = (v: string) => v === 'бар' ? 'жок' : v === 'жок' ? '' : 'бар'

export default function ShiftSheetScreen({ orgId }: { orgId: string }) {
  const [month, setMonth] = useState(curMonth())
  const [emps, setEmps] = useState<any[]>([])
  const [data, setData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(true)
  const t = useRef<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [e, a] = await Promise.all([listEmployees(orgId), attendanceGet(orgId, month)])
    setEmps((e as any[]) || []); setData((a?.data as any) || {}); setLoading(false)
  }, [orgId, month])
  useEffect(() => { load() }, [load])

  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth])
  const isWeekend = (d: number) => { const w = new Date(y, m - 1, d).getDay(); return w === 0 || w === 6 }
  const today = new Date()
  const todayDay = (today.getFullYear() === y && today.getMonth() + 1 === m) ? today.getDate() : 0

  function commit(next: Record<string, any>) {
    setData(next); setSaved(false); clearTimeout(t.current)
    t.current = setTimeout(async () => { await attendanceSave(orgId, month, next); setSaved(true) }, 700)
  }
  const rec = (id: string) => data[id] || { days: {}, avans: 0, shtraf: 0 }
  const setCell = (id: string, day: number) => { const r = rec(id); const nd = { ...r.days, [day]: nextVal(r.days?.[day] || '') }; commit({ ...data, [id]: { ...r, days: nd } }) }
  const setNum = (id: string, field: 'avans' | 'shtraf', v: any) => { const r = rec(id); commit({ ...data, [id]: { ...r, [field]: num(v) } }) }
  const total = (id: string) => Object.values(rec(id).days || {}).filter(v => v === 'бар').length
  // «весь месяц бар» по сотруднику (быстрая отметка рабочих дней).
  const fillBar = (id: string) => { const r = rec(id); const nd: Record<string, string> = { ...r.days }; for (const d of days) if (!nd[String(d)]) nd[String(d)] = 'бар'; commit({ ...data, [id]: { ...r, days: nd } }) }

  const changeMonth = (delta: number) => { const d = new Date(y, m - 1 + delta, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }

  const th: React.CSSProperties = { padding: '6px 4px', fontSize: 11.5, fontWeight: 700, border: `1px solid ${COLORS.border}`, background: '#eef0f3', whiteSpace: 'nowrap', textAlign: 'center' }
  const td: React.CSSProperties = { border: `1px solid ${COLORS.border}`, padding: 0, fontSize: 12.5, textAlign: 'center' }
  const nameCell: React.CSSProperties = { border: `1px solid ${COLORS.border}`, padding: '5px 10px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }

  if (loading) return <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontWeight: 800 }}>🗓 Табель</span>
        <button onClick={() => changeMonth(-1)} style={navBtn}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 16, minWidth: 150, textAlign: 'center' }}>{MONTHS[m - 1]} {y}</span>
        <button onClick={() => changeMonth(1)} style={navBtn}>›</button>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit' }} />
        <span style={{ fontSize: 12.5, color: saved ? '#2e8a5e' : COLORS.textMuted }}>{saved ? '✓ сохранено' : '… сохраняю'}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: COLORS.textMuted }}>Клик по дню: бар → Жоқ → пусто</span>
      </div>

      {emps.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, padding: 30, textAlign: 'center', color: COLORS.textMuted, boxShadow: `0 0 0 1.5px ${COLORS.border}` }}>Нет сотрудников — добавьте в разделе «👥 Сотрудники» (орг в шапке).</div> : (
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, boxShadow: `0 0 0 1.5px ${COLORS.border}` }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: 'inherit' }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, zIndex: 2, minWidth: 170, textAlign: 'left', paddingLeft: 10 }}>ФИО</th>
                {days.map(d => <th key={d} style={{ ...th, width: 30, color: d === todayDay ? COLORS.primary : isWeekend(d) ? '#b3261e' : undefined }}>{d}</th>)}
                <th style={{ ...th, width: 54 }}>ИТОГО</th>
                <th style={{ ...th, width: 84 }}>АВАНС</th>
                <th style={{ ...th, width: 84 }}>ШТРАФ</th>
              </tr>
            </thead>
            <tbody>
              {emps.map((e, i) => { const r = rec(e.id); return (
                <tr key={e.id} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                  <td style={{ ...nameCell, background: i % 2 ? '#fafafa' : '#fff' }}>
                    {e.name}{e.position ? <span style={{ color: COLORS.textLight, fontWeight: 400, fontSize: 11 }}> · {e.position}</span> : ''}
                    <button onClick={() => fillBar(e.id)} title="Отметить все дни «бар»" style={{ marginLeft: 8, border: 'none', background: '#e8f5ee', color: '#2e8a5e', borderRadius: 5, fontSize: 10.5, fontWeight: 700, padding: '1px 6px', cursor: 'pointer', fontFamily: 'inherit' }}>всё бар</button>
                  </td>
                  {days.map(d => { const v = r.days?.[d] || ''; const bg = v === 'бар' ? '#e3f4e8' : v === 'жок' ? '#fdf3b0' : (isWeekend(d) ? '#f7f4f4' : '#fff')
                    return <td key={d} style={{ ...td, background: bg, cursor: 'pointer', color: v === 'бар' ? '#2e8a5e' : v === 'жок' ? '#8a6d00' : '#c9c3b8', fontWeight: v ? 700 : 400, outline: d === todayDay ? `2px solid ${COLORS.primary}55` : 'none' }} onClick={() => setCell(e.id, d)}>{v === 'бар' ? 'бар' : v === 'жок' ? 'Жоқ' : '·'}</td> })}
                  <td style={{ ...td, fontWeight: 800, fontFamily: 'Consolas, monospace', background: '#eef6f0' }}>{total(e.id)}</td>
                  <td style={{ ...td, background: '#fff' }}><input value={r.avans ? String(r.avans) : ''} inputMode="decimal" onChange={ev => setNum(e.id, 'avans', ev.target.value)} placeholder="0" style={cellInp} /></td>
                  <td style={{ ...td, background: '#fff' }}><input value={r.shtraf ? String(r.shtraf) : ''} inputMode="decimal" onChange={ev => setNum(e.id, 'shtraf', ev.target.value)} placeholder="0" style={cellInp} /></td>
                </tr>
              )})}
              {/* Итоги по колонкам (кол-во «бар» за день) */}
              <tr style={{ background: '#f4f5f7', fontWeight: 700 }}>
                <td style={{ ...nameCell, background: '#f4f5f7', fontWeight: 800 }}>Явка (чел.)</td>
                {days.map(d => { const cnt = emps.filter(e => rec(e.id).days?.[d] === 'бар').length; return <td key={d} style={{ ...td, fontSize: 11.5, color: COLORS.textMuted, fontFamily: 'Consolas, monospace' }}>{cnt || ''}</td> })}
                <td style={td}></td>
                <td style={{ ...td, fontFamily: 'Consolas, monospace' }}>{fmt(emps.reduce((s, e) => s + num(rec(e.id).avans), 0))}</td>
                <td style={{ ...td, fontFamily: 'Consolas, monospace' }}>{fmt(emps.reduce((s, e) => s + num(rec(e.id).shtraf), 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 12, color: COLORS.textMuted }}>ИТОГО = количество дней «бар». Выходные подсвечены, сегодня — рамкой. Сохраняется автоматически.</div>
    </div>
  )
}

const navBtn: React.CSSProperties = { border: `1.5px solid ${COLORS.border}`, background: '#fff', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, fontWeight: 700, fontFamily: 'inherit', color: COLORS.textMuted }
const cellInp: React.CSSProperties = { width: '100%', border: 'none', borderRadius: 0, padding: '6px 6px', textAlign: 'right', fontFamily: 'Consolas, monospace', fontSize: 12.5, fontWeight: 700, background: 'transparent', outline: 'none', boxSizing: 'border-box' }
