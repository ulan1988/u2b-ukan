'use client'
// ОСТАТОК СКЛАДА В КАБИНЕТЕ ЛОГИСТА + РЕВИЗИЯ (правила владельца 20.11.2026).
// • Виден только Центр-Склад головного. • Один список, разбитый деревом номенклатуры.
// • У ревизии есть ДЕНЬ: логист считает остаток за выбранную дату, и сверка идёт с учётом
//   НА ЭТУ ДАТУ. • Ревизия отправляется ЦЕЛИКОМ и СКЛАД НЕ ТРОГАЕТ — админ читает её в
//   «Склад → Ревизии» и ищет, где потерялся товар.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { logistStock, sendStockCheck } from '@/lib/api/orders'
import { matchWords } from '@/lib/search'

type Row = { id: string; name: string; unit: string; grp: string; cat: string; sub: string; qty: number }
const n2 = (v: number) => (Math.round(v * 1000) / 1000).toLocaleString('ru-RU')
const todayYMD = () => { const d = new Date(); const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }

export default function LogistStock({ uid }: { uid?: string }) {
  const [date, setDate] = useState(todayYMD())
  const [rows, setRows] = useState<Row[]>([])
  const [wh, setWh] = useState('')
  const [loading, setLoading] = useState(true)
  const [find, setFind] = useState('')
  const [fold, setFold] = useState<Record<string, boolean>>({})
  const [rev, setRev] = useState(false)                       // режим ревизии
  const [fact, setFact] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r: any = await logistStock(date, uid)
    setRows(r.items || []); setWh(r.warehouse || ''); setLoading(false)
  }, [date, uid])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => rows.filter(r => !find.trim() || matchWords(find, r.name, r.grp, r.cat, r.sub)), [rows, find])
  const tree = useMemo(() => {
    const out: Array<{ name: string; qty: number; subs: Array<{ name: string; rows: Row[]; qty: number }> }> = []
    for (const r of shown) {
      const g = r.grp || 'Без группы'
      const key = (r.cat || 'Без категории') + (r.sub && r.sub !== r.cat ? ' · ' + r.sub : '')
      let G = out.find(x => x.name === g); if (!G) { G = { name: g, qty: 0, subs: [] }; out.push(G) }
      let S = G.subs.find(x => x.name === key); if (!S) { S = { name: key, rows: [], qty: 0 }; G.subs.push(S) }
      S.rows.push(r); S.qty += r.qty; G.qty += r.qty
    }
    return out
  }, [shown])

  const counted = Object.keys(fact).filter(k => fact[k] !== '' && fact[k] != null).length
  const diffs = rows.filter(r => fact[r.id] != null && fact[r.id] !== '' && Number(String(fact[r.id]).replace(',', '.')) !== r.qty).length
  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 5000) }

  async function send() {
    if (!counted) { say('Впиши хотя бы одну позицию'); return }
    if (!confirm(`Отправить ревизию за ${date.split('-').reverse().join('.')}?\nПересчитано ${counted} из ${rows.length}, расхождений ${diffs}.\nСклад при этом не меняется — админ разберёт.`)) return
    setBusy(true)
    const body = {
      date, uid,
      rows: rows.map(r => ({ productId: r.id,
        fact: fact[r.id] == null || fact[r.id] === '' ? null : Number(String(fact[r.id]).replace(',', '.')) })),
    }
    const r: any = await sendStockCheck(body as any)
    setBusy(false)
    if (r?.ok === false || r?.error) { say('⚠ ' + (r.error || 'не удалось отправить')); return }
    say(`✓ Ревизия отправлена: ${r.lines} поз., расхождений ${r.diffs}`)
    setRev(false); setFact({})
  }

  return (
    <div className="ls">
      <style>{CSS}</style>
      <div className="bar">
        <label className="dt">🗓 <input type="date" value={date} max={todayYMD()} onChange={e => setDate(e.target.value || todayYMD())} /></label>
        <input className="find" value={find} onChange={e => setFind(e.target.value)} placeholder="поиск: евро 7024, желоб, саморез" />
        <button className={'tb' + (rev ? ' on' : '')} onClick={() => { setRev(!rev); setFact({}) }}>
          {rev ? '✕ Выйти из ревизии' : '📋 Сделать ревизию'}
        </button>
        <button className="tb" onClick={() => setFold(f => Object.keys(f).length ? {} : Object.fromEntries(tree.map(g => ['g:' + g.name, true])))}>
          {Object.keys(fold).length ? 'развернуть всё' : 'свернуть всё'}
        </button>
      </div>

      <div className="kpis">
        <span className="kpi">{wh || 'Центр-Склад'} на <b>{date.split('-').reverse().join('.')}</b></span>
        <span className="kpi">Позиций <b>{shown.length}</b></span>
        <span className="kpi">Всего штук <b>{n2(shown.reduce((s, r) => s + r.qty, 0))}</b></span>
        {rev && <span className="kpi">Пересчитано <b>{counted}</b> · расхождений <b>{diffs}</b></span>}
        {msg && <span className="hint">{msg}</span>}
      </div>

      {rev && (
        <div className="note">
          📋 <b>Ревизия за {date.split('-').reverse().join('.')}.</b> Впиши, сколько реально лежит.
          Склад это <b>не меняет</b> — учётный остаток остаётся как был. Отправляешь админу: он увидит
          слева склад, справа твой факт, третьей колонкой разницу. Пустое поле = не считал.
        </div>
      )}

      {loading ? <div className="empty">Загрузка…</div> : tree.length === 0 ? <div className="empty">Ничего не найдено</div> : tree.map(G => (
        <section className="grp" key={G.name}>
          <div className="gh" onClick={() => setFold(f => ({ ...f, ['g:' + G.name]: !f['g:' + G.name] }))}>
            <span className="ar">{fold['g:' + G.name] ? '▸' : '▾'}</span>
            <span className="t">{G.name}</span>
            <span className="n">{G.subs.reduce((s, x) => s + x.rows.length, 0)} поз. · {n2(G.qty)}</span>
          </div>
          {!fold['g:' + G.name] && G.subs.map(S => (
            <div className="sub" key={S.name}>
              <div className="sh" onClick={() => setFold(f => ({ ...f, ['s:' + G.name + S.name]: !f['s:' + G.name + S.name] }))}>
                <span className="ar">{fold['s:' + G.name + S.name] ? '▸' : '▾'}</span>
                <span className="t">{S.name}</span>
                <span className="n">{S.rows.length} поз. · {n2(S.qty)}</span>
              </div>
              {!fold['s:' + G.name + S.name] && S.rows.map(r => {
                const f = fact[r.id], has = f != null && f !== ''
                const d = has ? Number(String(f).replace(',', '.')) - r.qty : 0
                return (
                  <div className={'row' + (r.qty < 0 ? ' minus' : '') + (rev && has ? (d === 0 ? ' ok' : ' diff') : '')} key={r.id}>
                    <span className="nm" title={r.name}>{r.name}</span>
                    <span className="q">{n2(r.qty)}</span>
                    <span className="u">{r.unit}</span>
                    {rev && (
                      <>
                        <input className="fact" inputMode="decimal" placeholder="факт" value={f ?? ''}
                          onChange={e => setFact(x => ({ ...x, [r.id]: e.target.value.replace(/[^0-9.,]/g, '') }))} />
                        <span className={'d' + (d > 0 ? ' p' : d < 0 ? ' m' : '')}>{has && d !== 0 ? (d > 0 ? '+' : '') + n2(d) : ''}</span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      ))}

      {rev && (
        <div className="send">
          <span className="t">Пересчитано <b>{counted}</b> из {rows.length} · расхождений <b style={{ color: 'var(--bad)' }}>{diffs}</b></span>
          <button className="go" disabled={busy} onClick={send}>{busy ? 'отправляю…' : '📨 Отправить админу'}</button>
        </div>
      )}
    </div>
  )
}

const CSS = `
.ls{padding:4px 12px 90px}
.ls .bar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
.ls .dt{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.22);border-radius:6px;padding:5px 9px;font-size:12.5px;color:#fff}
.ls .dt input{border:none;background:transparent;color:#fff;font-family:inherit;font-size:12.5px;color-scheme:dark;outline:none}
.ls .find{flex:1 1 200px;min-width:140px;border:none;background:rgba(255,255,255,.22);color:#fff;border-radius:6px;padding:7px 10px;font-size:12.5px;font-family:inherit}
.ls .find::placeholder{color:rgba(255,255,255,.75)}
.ls .tb{border:none;background:rgba(255,255,255,.22);color:#fff;border-radius:6px;padding:7px 11px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
.ls .tb:hover{background:rgba(255,255,255,.32)}
.ls .tb.on{background:#fff;color:#026aa7}
.ls .kpis{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12.5px;margin-bottom:8px;color:#fff}
.ls .kpi{background:rgba(255,255,255,.2);border-radius:999px;padding:3px 10px}
.ls .hint{opacity:.9}
.ls .note{background:var(--warn-soft,#fff7d6);color:var(--text,#172b4d);border-left:3px solid var(--warn,#946f00);border-radius:8px;padding:9px 11px;font-size:12.5px;line-height:1.5;margin-bottom:9px;max-width:860px}
.ls .empty{color:#fff;opacity:.85;padding:14px 2px}
.ls .grp{background:var(--surface2,#f1f2f4);border-radius:12px;margin-bottom:9px;overflow:hidden;max-width:860px}
.ls .gh{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer}
.ls .gh .t{font-weight:800;font-size:14px;color:var(--text,#172b4d);flex:1;min-width:0}
.ls .gh .n,.ls .sh .n{background:var(--surface,#fff);color:var(--muted,#5e6c84);border-radius:999px;padding:1px 9px;font-size:11.5px;font-weight:700}
.ls .ar{color:var(--faint,#8993a4);font-size:12px}
.ls .sub{background:var(--surface,#fff);margin:0 6px 6px;border-radius:10px;overflow:hidden}
.ls .sh{display:flex;align-items:center;gap:8px;padding:8px 11px;cursor:pointer;border-bottom:1px solid var(--line2,#ebecf0)}
.ls .sh .t{font-weight:700;font-size:12.5px;color:var(--accent,#0c66e4);flex:1;min-width:0}
.ls .row{display:flex;align-items:center;gap:8px;padding:7px 11px;border-bottom:1px solid var(--line2,#ebecf0);color:var(--text,#172b4d)}
.ls .row:last-child{border-bottom:none}
.ls .row .nm{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ls .row .q{font-weight:800;font-size:14px;min-width:64px;text-align:right;font-variant-numeric:tabular-nums}
.ls .row .u{font-size:11px;color:var(--faint,#8993a4);width:28px}
.ls .row.minus .q{color:var(--bad,#c9372c)}
.ls .row.ok{background:var(--ok-soft,#dcfff1)}
.ls .row.diff{background:var(--bad-soft,#ffeceb)}
.ls .fact{width:76px;text-align:right;border:1.5px solid var(--line,#dfe1e6);background:var(--surface2,#f1f2f4);border-radius:7px;padding:5px 7px;font-size:13.5px;font-weight:700;font-family:inherit;color:var(--text,#172b4d)}
.ls .fact:focus{outline:none;border-color:var(--accent,#0c66e4);background:var(--surface,#fff)}
.ls .d{font-size:11.5px;font-weight:800;min-width:52px;text-align:right}
.ls .d.p{color:var(--ok,#1f845a)} .ls .d.m{color:var(--bad,#c9372c)}
.ls .send{position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--surface,#fff);border-top:1.5px solid var(--line,#dfe1e6);
  padding:10px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--text,#172b4d)}
.ls .send .t{flex:1;min-width:150px;font-size:12.5px;color:var(--muted,#5e6c84)}
.ls .send .go{border:none;background:var(--ok,#1f845a);color:#fff;border-radius:9px;padding:11px 16px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit}
`
