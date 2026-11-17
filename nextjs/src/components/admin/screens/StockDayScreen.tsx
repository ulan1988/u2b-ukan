'use client'
// ОСТАТОК ПО ДНЯМ (ревизия): остаток склада на конец выбранного дня + что пришло и ушло
// в этот день. Нужен, чтобы сверять склад на дату — как остатки в 1С на конец дня.
// Данные: /api/stock?orgId&onDate=YYYY-MM-DD → warehouse.service.stockOnDate (по слоям).
import { useCallback, useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { matchWords } from '@/lib/search'
import { stockOnDate, stockRevision } from '@/lib/api/refs'

const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const nq = (v: any) => Number(v) || 0
const fmt = (v: number) => (Math.round(v * 1000) / 1000).toLocaleString('ru-RU')

export default function StockDayScreen({ orgId }: { orgId: string }) {
  const [date, setDate] = useState(todayYMD())
  const [rows, setRows] = useState<any[]>([])
  const [wh, setWh] = useState('')
  const [q, setQ] = useState('')
  const [onlyMoved, setOnlyMoved] = useState(false)   // показать только то, что двигалось в этот день
  const [loading, setLoading] = useState(false)
  // РЕВИЗИЯ: правим «на конец дня» прямо здесь, разницу система проводит документом этой даты.
  const [rev, setRev] = useState(false)
  const [fact, setFact] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!orgId || !date) return
    setLoading(true)
    const r: any = await stockOnDate(orgId, date)
    setRows(r?.items || []); setWh(r?.warehouse || ''); setFact({})
    setLoading(false)
  }, [orgId, date])
  useEffect(() => { load() }, [load])

  // Что реально изменили: только строки с вписанным и отличным от учёта количеством.
  const diffs = rows.map(r => ({ r, f: fact[r.id] })).filter(x => x.f != null && x.f !== '')
    .map(x => ({ productId: x.r.id, name: x.r.name, qty: Number(String(x.f).replace(',', '.')) || 0, was: nq(x.r.end) }))
    .filter(x => Math.abs(x.qty - x.was) > 0.0001)
  async function saveRevision() {
    if (!diffs.length) { setMsg('⚠ Нечего проводить — количества не меняли'); setTimeout(() => setMsg(''), 3000); return }
    const list = diffs.slice(0, 6).map(d => `${d.name}: ${fmt(d.was)} → ${fmt(d.qty)}`).join('\n')
    if (!confirm(`Провести ревизию на ${date.split('-').reverse().join('.')}?\n\n${list}${diffs.length > 6 ? `\n…и ещё ${diffs.length - 6}` : ''}\n\nРазница ляжет на склад этим днём отдельным документом.`)) return
    setBusy(true)
    const r: any = await stockRevision(orgId, date, diffs.map(d => ({ productId: d.productId, qty: d.qty })))
    setBusy(false)
    if (r?.ok === false) { setMsg('⚠ ' + (r.error || 'Не удалось')); setTimeout(() => setMsg(''), 5000); return }
    setMsg(`✓ Ревизия проведена: ${r.number} · изменено ${r.changed} поз. (+${r.plus} / −${r.minus})`)
    setRev(false); await load(); setTimeout(() => setMsg(''), 6000)
  }

  const shown = rows.filter(r => matchWords(q, r.name) && (!onlyMoved || nq(r.in) !== 0 || nq(r.out) !== 0))
  const sum = (k: string) => shown.reduce((s, r) => s + nq(r[k]), 0)

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted, letterSpacing: '.04em', textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13.5, textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'Consolas, monospace' }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>📅 Остаток по дням</div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 2 }}>{wh || 'склад'} · остаток на конец выбранного дня</div>
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value || todayYMD())}
          style={{ padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }} />
        <button onClick={() => setDate(todayYMD())} style={{ padding: '8px 14px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, background: '#fff', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit' }}>Сегодня</button>
        <button onClick={load} style={{ padding: '8px 14px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, background: '#fff', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit' }}>⟳ Обновить</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.textMuted, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyMoved} onChange={e => setOnlyMoved(e.target.checked)} /> только движение за день
        </label>
        {!rev && <button onClick={() => setRev(true)}
          title="Вписать фактические остатки на выбранный день — разница проведётся документом этой даты"
          style={{ padding: '8px 16px', borderRadius: 9, border: '1.5px solid #cbb6e8', background: '#faf5ff', color: '#7a3aaa', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }}>✏️ Изменить остаток (ревизия)</button>}
        {rev && <>
          <button onClick={saveRevision} disabled={busy}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: diffs.length ? '#2e8a5e' : '#cfe0d6', color: '#fff', cursor: busy ? 'wait' : 'pointer', fontSize: 13.5, fontWeight: 800, fontFamily: 'inherit' }}>
            {busy ? '…' : `💾 Провести ревизию${diffs.length ? ` (${diffs.length})` : ''}`}</button>
          <button onClick={() => { setRev(false); setFact({}) }}
            style={{ padding: '8px 14px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, background: '#fff', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit' }}>✕ Отмена</button>
        </>}
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.startsWith('⚠') ? '#b03020' : '#2e8a5e' }}>{msg}</span>}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 поиск по словам…"
          style={{ marginLeft: 'auto', minWidth: 260, padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontFamily: 'inherit' }} />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: `0 0 0 1.5px ${COLORS.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8f6f3' }}>
              <th style={{ ...th, textAlign: 'left', width: '46%' }}>НОМЕНКЛАТУРА</th>
              <th style={{ ...th, textAlign: 'left', width: 60 }}>ЕД.</th>
              <th style={th}>НА НАЧАЛО</th>
              <th style={th}>ПРИХОД</th>
              <th style={th}>РАСХОД</th>
              <th style={th}>НА КОНЕЦ ДНЯ</th>
              {rev && <th style={{ ...th, color: '#7a3aaa' }}>ФАКТ (РЕВИЗИЯ)</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={rev ? 7 : 6} style={{ padding: 24, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={rev ? 7 : 6} style={{ padding: 24, textAlign: 'center', color: COLORS.textMuted }}>На эту дату остатков нет</td></tr>}
            {shown.map((r, i) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.borderLight}`, background: i % 2 ? '#fcfbfa' : '#fff' }}>
                <td style={{ padding: '8px 12px', fontSize: 13.5, fontWeight: 500 }}>{r.name}</td>
                <td style={{ padding: '8px 12px', fontSize: 12.5, color: COLORS.textMuted }}>{r.unit || 'шт'}</td>
                <td style={{ ...td, color: COLORS.textMuted }}>{fmt(nq(r.start))}</td>
                <td style={{ ...td, color: nq(r.in) ? '#2e8a5e' : COLORS.textLight }}>{nq(r.in) ? '+' + fmt(nq(r.in)) : '—'}</td>
                <td style={{ ...td, color: nq(r.out) ? '#b03020' : COLORS.textLight }}>{nq(r.out) ? '−' + fmt(nq(r.out)) : '—'}</td>
                <td style={{ ...td, fontWeight: 800, color: nq(r.end) < 0 ? '#b03020' : COLORS.text }}>{fmt(nq(r.end))}</td>
                {rev && (() => {
                  const v = fact[r.id]
                  const d = v != null && v !== '' ? (Number(String(v).replace(',', '.')) || 0) - nq(r.end) : 0
                  return (
                    <td style={{ padding: '4px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <input value={v ?? ''} inputMode="decimal" placeholder={String(fmt(nq(r.end)))}
                        onChange={e => setFact(x => ({ ...x, [r.id]: e.target.value.replace(/[^0-9.,-]/g, '') }))}
                        style={{ width: 110, padding: '6px 8px', borderRadius: 7, border: `1.5px solid ${d ? '#7a3aaa' : COLORS.border}`, fontSize: 13.5, fontWeight: 700, textAlign: 'right', fontFamily: 'inherit' }} />
                      {!!d && <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: d > 0 ? '#2e8a5e' : '#b03020' }}>{d > 0 ? '+' : '−'}{fmt(Math.abs(d))}</div>}
                    </td>
                  )
                })()}
              </tr>
            ))}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f4f5f7', fontWeight: 800 }}>
                <td style={{ padding: '10px 12px', fontSize: 13 }}>ИТОГО · {shown.length} поз.</td>
                <td />
                <td style={td}>{fmt(sum('start'))}</td>
                <td style={{ ...td, color: '#2e8a5e' }}>+{fmt(sum('in'))}</td>
                <td style={{ ...td, color: '#b03020' }}>−{fmt(sum('out'))}</td>
                <td style={{ ...td, fontSize: 15 }}>{fmt(sum('end'))}</td>
                {rev && <td style={{ ...td, color: '#7a3aaa' }}>{diffs.length ? `${diffs.length} правок` : ''}</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 8 }}>
        Остаток считается по движениям склада: «на начало» — всё до выбранного дня, «приход/расход» — за сам день, «на конец дня» — итог. Резервы не учитываются.{' '}
        В режиме ревизии впишите фактическое количество — система проведёт <b>разницу</b> отдельным документом этой же датой (плюс как приход, минус как списание), остальные дни пересчитаются сами.
      </p>
    </div>
  )
}
