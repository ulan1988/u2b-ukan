'use client'
// СМЕНА ЛОГИСТА (суточный отчёт) в новом кабинете — тот же шаблон строки, что был в старом:
// от кого · товар · приход · кому · расход · № накладной. Строка приезжает САМА, когда логист
// отмечает позицию «Доставлено» (order.service.addDeliveryToShift), и ложится в смену ЗА ДЕНЬ
// ДОСТАВКИ (правило рабочей даты). Руками можно дописать свои строки.
// Движение отчёта: черновик → «Сдать смену» → бухгалтер видит «Новый» → «Принят».
import { useCallback, useEffect, useState } from 'react'
import { getDraft, addRow, updateRow, deleteRow, closeShift, pastDrafts } from '@/lib/api/reports'

type Row = { id: string; posId?: string | null; fromWho: string; name: string; qtyIn: any; commentIn: string
  toWho: string; qtyOut: any; commentOut: string; invoiceNum: string }
const todayYMD = () => { const d = new Date(); const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const dmy = (d: string) => String(d || '').slice(0, 10).split('-').reverse().join('.')

export default function LogistShift() {
  const [date, setDate] = useState(todayYMD())
  const [rows, setRows] = useState<Row[]>([])
  const [report, setReport] = useState<any>(null)
  const [past, setPast] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [draft, setDraft] = useState<any>({ fromWho: '', name: '', qtyIn: '', toWho: '', qtyOut: '', invoiceNum: '' })

  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 4000) }
  const load = useCallback(async () => {
    setLoading(true)
    const d: any = await getDraft(date)
    setRows((d.rows || []) as Row[]); setReport(d.report || null)
    setPast(await pastDrafts() as any); setLoading(false)
  }, [date])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!draft.name.trim()) { say('Впиши товар'); return }
    setBusy(true)
    await addRow({ ...draft, qtyIn: Number(String(draft.qtyIn).replace(',', '.')) || 0,
      qtyOut: Number(String(draft.qtyOut).replace(',', '.')) || 0 }, date)
    setDraft({ fromWho: '', name: '', qtyIn: '', toWho: '', qtyOut: '', invoiceNum: '' })
    await load(); setBusy(false); say('✓ Строка добавлена')
  }
  async function save(r: Row, patch: Partial<Row>) {
    setBusy(true); await updateRow(r.id, { ...r, ...patch }); await load(); setBusy(false)
  }
  async function del(r: Row) {
    if (!confirm('Убрать строку из отчёта?')) return
    setBusy(true); await deleteRow(r.id); await load(); setBusy(false)
  }
  async function send() {
    if (!rows.filter(r => r.name).length) { say('В отчёте нет строк'); return }
    if (!confirm(`Сдать смену за ${dmy(date)}? Бухгалтер увидит её как «Новый».`)) return
    setBusy(true); await closeShift(date); await load(); setBusy(false); say('✓ Смена сдана')
  }

  const sent = report?.status && report.status !== 'draft'
  const sum = (k: 'qtyIn' | 'qtyOut') => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)

  return (
    <div className="lsh">
      <style>{CSS}</style>
      <div className="bar">
        <label className="dt">🗓 <input type="date" value={date} max={todayYMD()} onChange={e => setDate(e.target.value || todayYMD())} /></label>
        <span className="kpi">Строк <b>{rows.length}</b></span>
        <span className="kpi">Взял <b>{sum('qtyIn')}</b></span>
        <span className="kpi">Отдал <b>{sum('qtyOut')}</b></span>
        {sent ? <span className="kpi done">смена сдана · {report.status === 'done' ? 'принята' : 'у бухгалтера'}</span>
          : <button className="go" disabled={busy} onClick={send}>📨 Сдать смену</button>}
        {msg && <span className="hint">{msg}</span>}
      </div>

      {loading ? <div className="empty">Загрузка…</div> : (
        <div className="tbl">
          <div className="hd">
            <span className="c1">от кого</span><span className="c2">товар</span>
            <span className="c3">взял</span><span className="c4">кому</span>
            <span className="c5">отдал</span><span className="c6">накладная</span><span className="c7" />
          </div>
          {rows.length === 0 && <div className="empty">Пока пусто. Строка появится сама, когда отметишь позицию «Доставлено».</div>}
          {rows.map(r => (
            <div className={'rw' + (r.posId ? ' auto' : '')} key={r.id}>
              <input className="c1" defaultValue={r.fromWho} disabled={sent} onBlur={e => e.target.value !== r.fromWho && save(r, { fromWho: e.target.value })} />
              <input className="c2" defaultValue={r.name} disabled={sent} onBlur={e => e.target.value !== r.name && save(r, { name: e.target.value })} />
              <input className="c3 num" defaultValue={r.qtyIn} disabled={sent} onBlur={e => save(r, { qtyIn: Number(e.target.value.replace(',', '.')) || 0 })} />
              <input className="c4" defaultValue={r.toWho} disabled={sent} onBlur={e => e.target.value !== r.toWho && save(r, { toWho: e.target.value })} />
              <input className="c5 num" defaultValue={r.qtyOut} disabled={sent} onBlur={e => save(r, { qtyOut: Number(e.target.value.replace(',', '.')) || 0 })} />
              <input className="c6" defaultValue={r.invoiceNum} disabled={sent} onBlur={e => e.target.value !== r.invoiceNum && save(r, { invoiceNum: e.target.value })} />
              <span className="c7">{!sent && <button className="x" onClick={() => del(r)} title="убрать строку">✕</button>}</span>
            </div>
          ))}
          {!sent && (
            <div className="rw new">
              <input className="c1" placeholder="от кого" value={draft.fromWho} onChange={e => setDraft({ ...draft, fromWho: e.target.value })} />
              <input className="c2" placeholder="товар" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
              <input className="c3 num" placeholder="0" value={draft.qtyIn} onChange={e => setDraft({ ...draft, qtyIn: e.target.value.replace(/[^0-9.,]/g, '') })} />
              <input className="c4" placeholder="кому" value={draft.toWho} onChange={e => setDraft({ ...draft, toWho: e.target.value })} />
              <input className="c5 num" placeholder="0" value={draft.qtyOut} onChange={e => setDraft({ ...draft, qtyOut: e.target.value.replace(/[^0-9.,]/g, '') })} />
              <input className="c6" placeholder="№" value={draft.invoiceNum} onChange={e => setDraft({ ...draft, invoiceNum: e.target.value })} />
              <span className="c7"><button className="add" disabled={busy} onClick={add}>＋</button></span>
            </div>
          )}
        </div>
      )}

      {past.length > 0 && (
        <div className="past">
          <div className="pt">Прошлые смены</div>
          {past.slice(0, 10).map((p: any) => (
            <button key={p.id} className={'pb' + (p.date === date ? ' on' : '')} onClick={() => setDate(String(p.date).slice(0, 10))}>
              {dmy(p.date)}{p.status && p.status !== 'draft' ? ' · сдана' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const CSS = `
.lsh{padding:4px 12px 40px}
.lsh .bar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:10px;color:#fff;font-size:12.5px}
.lsh .dt{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.22);border-radius:6px;padding:5px 9px}
.lsh .dt input{border:none;background:transparent;color:#fff;font-family:inherit;font-size:12.5px;color-scheme:dark;outline:none}
.lsh .kpi{background:rgba(255,255,255,.2);border-radius:999px;padding:3px 10px}
.lsh .kpi.done{background:var(--ok);color:#fff;font-weight:700}
.lsh .hint{opacity:.9}
.lsh .go{border:none;background:var(--ok);color:#fff;border-radius:7px;padding:7px 13px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit}
.lsh .empty{color:#fff;opacity:.85;padding:12px 2px}
.lsh .tbl{background:var(--surface);border-radius:12px;overflow:hidden;max-width:1000px}
.lsh .hd,.lsh .rw{display:flex;gap:6px;align-items:center;padding:7px 10px;border-bottom:1px solid var(--line2)}
.lsh .hd{font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);font-weight:700;background:var(--surface2)}
.lsh .rw.auto{background:var(--accent-soft)}
.lsh .rw.new{background:var(--surface2)}
.lsh .rw input{border:1px solid transparent;background:transparent;border-radius:6px;padding:5px 7px;font-size:13px;font-family:inherit;color:var(--text);min-width:0}
.lsh .rw input:focus{outline:none;border-color:var(--accent);background:var(--surface)}
.lsh .rw input:disabled{color:var(--muted)}
.lsh .c1{flex:1 1 130px} .lsh .c2{flex:2 1 220px} .lsh .c4{flex:1 1 130px} .lsh .c6{flex:0 1 110px}
.lsh .c3,.lsh .c5{flex:0 0 68px;text-align:right}
.lsh .c7{flex:0 0 28px;text-align:center}
.lsh .num{font-variant-numeric:tabular-nums;font-weight:700}
.lsh .x{border:none;background:none;color:var(--faint);cursor:pointer;font-size:12px}
.lsh .x:hover{color:var(--bad)}
.lsh .add{border:none;background:var(--accent);color:#fff;border-radius:6px;width:26px;height:26px;font-size:15px;font-weight:800;cursor:pointer}
.lsh .past{margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.lsh .pt{color:#fff;opacity:.85;font-size:12.5px;margin-right:4px}
.lsh .pb{border:none;background:rgba(255,255,255,.2);color:#fff;border-radius:999px;padding:4px 11px;font-size:12px;cursor:pointer;font-family:inherit}
.lsh .pb.on{background:#fff;color:#026aa7;font-weight:700}
`
