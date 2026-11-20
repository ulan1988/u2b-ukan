'use client'
// ВТОРОЙ ВИД КАБИНЕТА ЛОГИСТА — доска (прототип, 19.11.2026).
// Старый кабинет (LogistPortal) не трогаем: это отдельный экран по ссылке «🧪 Доска».
// ЧИТАЕТ и НИЧЕГО НЕ ПИШЕТ: все правки (кол-во, ✕, ＋ позиция, кнопки этапов) живут только
// в браузере — чтобы прототипом нельзя было сломать живые карточки и накладные.
// Правила экрана (от владельца): цен у логиста нет, только количество; колонка = поставщик;
// позиции простым списком с алиасами; пустые колонки не показываем; закуп и продажа —
// по своим колонкам («Закуплено» / «Продано · Доставлено»); колонка Нипы свёрнута.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { logistBoardData } from '@/lib/api/orders'
import { fetchRefs } from '@/lib/api/refs'
import { matchWords } from '@/lib/search'
import type { Session } from '@/lib/auth'

type Item = { n: string; q: number; u?: string; done?: boolean; got?: number | null }
type Card = { id: string; col: string; code: string; client: string; who: string; time: string; pay?: string
  k?: 'buy' | 'sell'; info?: boolean; badge?: string; wait?: boolean; items: Item[]; tail?: string }
type Col = { id: string; name: string; fold?: boolean; stage?: boolean }

const fact = (i: Item) => (i.got == null ? i.q : i.got)
const lack = (i: Item) => Math.max(0, i.q - fact(i))
const lackN = (c: Card) => c.items.filter(i => lack(i) > 0).length
const doneN = (c: Card) => c.items.filter(i => i.done).length

// Алиас: короткое имя для экрана, полное — в подсказке (экономим место в строке).
const SHORT: Array<[RegExp, string]> = [
  [/^H\s*-?\s*профиль/i, 'H-проф'], [/^J\s*-?\s*профиль/i, 'J-проф'], [/^J\s*фазка/i, 'J-фазка'],
  [/^H\s*-?\s*планка/i, 'H-планка'], [/^Нар\.?\s*угол\s*\(пр\)/i, 'Нар. угол'], [/^Внут\.?\s*угол\s*\(пр\)/i, 'Внут. угол'],
  [/^Евро\s*брус/i, 'Евробрус'], [/^Держатель\s+желоба/i, 'Держ. жёлоба'], [/^Держатель\s+трубы/i, 'Держ. трубы'],
  [/^Ветровая\s+планка/i, 'Ветровая'], [/^Ендовая\s+планка/i, 'Ендовая'], [/^Планка\s+торцевая/i, 'Торцевая'],
  [/^Профнастил/i, 'Профнастил'], [/^Лист\s+плоский/i, 'Лист пл.'], [/^Изделие/i, 'Изд.'],
]
function alias(name: string) {
  const s = String(name || '').replace(/\s+/g, ' ').trim()
  let head = s
  for (const [re, to] of SHORT) if (re.test(s)) { head = to; break }
  const ral = (/(?:RAL\s*)?([0-9]{4}(?:МАТ|М|M|В|B)?)(?![0-9])/i.exec(s) || [])[1] || (/дерев/i.test(s) ? 'дерево' : '')
  const th = (/(0[,.][0-9]+\s?мм)/i.exec(s) || [])[1] || ''
  const lm = /([0-9]+(?:[,.][0-9]+)?)\s?м(?![мc])(?=[\s.,)]|$)/i.exec(s)
  const len = lm ? lm[1] + 'м' : ((/([0-9]+\s?см)/i.exec(s) || [])[1] || '')
  return { short: [head, ral, [th, len].filter(Boolean).join(' ')].filter(Boolean).join(' '), full: s }
}
// Куда карточка едет дальше и как называется кнопка: закуп и продажа — разные колонки.
function nextStep(c: Card): { to: string; label: string } | null {
  const stage = /^(ready|deliv)$/.test(c.col) ? c.col : 'buy'
  // У поставщика жмём «Закуплено» → ПРИХОДНАЯ, карточка в «Готов к отправке (закуп)».
  if (stage === 'buy') return { to: 'ready', label: '✓ Закуплено · приходная' }
  // Оттуда «Доставлено / Продано» → РАСХОДНАЯ, карточка в последнюю колонку.
  if (stage === 'ready') return { to: 'deliv', label: '✓ Доставлено / Продано · расходная' }
  return null
}

export default function LogistBoard({ user, viewAs, backHref }: { user: Session; viewAs?: boolean; backHref: string }) {
  const [cols, setCols] = useState<Col[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [prods, setProds] = useState<Array<{ name: string; unit: string }>>([])
  const [loading, setLoading] = useState(true)
  const [fold, setFold] = useState<Record<string, boolean>>({})
  const [find, setFind] = useState('')
  const [open, setOpen] = useState('')
  const [ed, setEd] = useState('')
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [drag, setDrag] = useState('')

  useEffect(() => {
    (async () => {
      const uid = viewAs ? user.id : undefined
      const [b, r]: any[] = await Promise.all([logistBoardData(uid), fetchRefs()])
      setCols(b.cols || []); setCards(b.cards || [])
      setFold(Object.fromEntries((b.cols || []).filter((c: Col) => c.fold).map((c: Col) => [c.id, true])))
      setProds(((r.products || []) as any[]).filter(p => !p.archived).map(p => ({ name: p.name, unit: p.unit || 'шт' })))
      setLoading(false)
    })()
  }, [user.id, viewAs])

  const shown = useMemo(() => cards.filter(c => !find.trim() ||
    matchWords(find, c.client, c.code, c.who, ...c.items.map(i => i.n))), [cards, find])
  const found = useMemo(() => (q.trim() ? prods.filter(p => matchWords(q, p.name)).slice(0, 8) : []), [q, prods])

  const upd = (fn: (list: Card[]) => Card[]) => setCards(list => fn(list.map(c => ({ ...c, items: c.items.map(i => ({ ...i })) }))))
  const move = (id: string, col: string) => upd(list => list.map(c => (c.id === id ? { ...c, col, wait: /^(ask|nipa)$/.test(col) ? c.wait : undefined } : c)))

  function provesti(c: Card) {
    const nx = nextStep(c); if (!nx) return
    const miss = c.items.filter(i => lack(i) > 0)
    const tail = c.tail || 'reorder'
    upd(list => {
      const next = list.map(x => x.id !== c.id ? x : {
        ...x, col: nx.to, tail: undefined,
        items: x.items.map(i => ({ ...i, q: fact(i), got: null, done: true })).filter(i => i.q > 0),
      })
      if (miss.length && tail !== 'drop') next.push({
        id: 't' + Date.now(), col: tail === 'ask' ? 'ask' : c.col, code: c.code + '·хвост', client: c.client,
        who: 'хвост недовоза', time: 'сейчас', pay: c.pay, k: c.k,
        items: miss.map(i => ({ n: i.n, q: lack(i), u: i.u })),
      })
      return next
    })
    setOpen(''); setEd('')
  }

  // Пустые колонки прячем (правило владельца): показываем только те, где есть карточки,
  // а при перетаскивании ненадолго показываем все — иначе некуда положить карточку.
  const visible = cols.filter(c => drag || shown.some(x => x.col === c.id))

  if (loading) return <div style={{ padding: 30, color: '#fff' }}>Загрузка доски…</div>

  return (
    <div className="lb">
      <style>{CSS}</style>
      <header className="top">
        <Link href={backHref} className="tb" title="Вернуться в обычный кабинет">← кабинет</Link>
        <div className="who">Логист · {user.name}<small>{viewAs ? 'просмотр · ' : ''}прототип доски — ничего не сохраняется</small></div>
        <span className="sp" />
        <input className="find" value={find} onChange={e => setFind(e.target.value)} placeholder="поиск: заказчик, товар, №" />
        <button className="tb" onClick={() => {
          const any = cols.some(c => !fold[c.id])
          setFold(Object.fromEntries(cols.map(c => [c.id, any])))
        }}>{cols.some(c => !fold[c.id]) ? 'свернуть все' : 'развернуть все'}</button>
      </header>

      <div className="kpis">
        <span className="kpi">В работе <b>{shown.filter(c => !c.info).length}</b></span>
        <span className="kpi">Позиций <b>{shown.filter(c => !c.info).reduce((s, c) => s + c.items.length, 0)}</b></span>
        <span className="kpi">Недовоз <b>{shown.reduce((s, c) => s + lackN(c), 0)} поз.</b></span>
        <span className="kpi">Готов к отправке <b>{shown.filter(c => c.col === 'ready').length}</b></span>
        <span className="hint">прототип: правки видны только на этом экране, в базу ничего не уходит</span>
      </div>

      <main className="board">
        {visible.map(col => {
          const list = shown.filter(c => c.col === col.id)
          if (fold[col.id]) return (
            <div key={col.id} className="foldcol" title="Развернуть" onClick={() => setFold(f => ({ ...f, [col.id]: false }))}
              onDragOver={e => e.preventDefault()} onDrop={() => { if (drag) move(drag, col.id); setDrag('') }}>
              <span className="n">{list.length}</span><span className="v">{col.name}</span>
            </div>
          )
          return (
            <section key={col.id} className="col"
              onDragOver={e => e.preventDefault()} onDrop={() => { if (drag) move(drag, col.id); setDrag('') }}>
              <div className="ch">
                <div className="nm" title={col.name}>{col.name}</div>
                <span className="n">{list.length}</span>
              </div>
              {/* Свернуть — широкая кнопка по центру: пальцем в маленькую стрелку не попасть */}
              <button className="foldbtn" title="Свернуть колонку" onClick={() => setFold(f => ({ ...f, [col.id]: true }))}>⌄ свернуть</button>
              <div className="cards">
                {list.length === 0 && <div className="none">пусто — перетащи сюда</div>}
                {list.map(c => {
                  const isOpen = open === c.id, isEd = ed === c.id, miss = c.items.filter(i => lack(i) > 0)
                  const nx = nextStep(c)
                  return (
                    <article key={c.id} className={'card' + (isEd ? ' edit' : '') + (c.info ? ' info' : '')}
                      draggable onDragStart={() => setDrag(c.id)} onDragEnd={() => setDrag('')}>
                      <div onClick={() => { setOpen(isOpen ? '' : c.id); setEd(''); setAdding(false) }}>
                        <div className="c1">
                          <span className="code">{c.code}</span><span>· {c.time}</span>
                          {c.who && <span style={{ marginLeft: 'auto' }}>{c.who}</span>}
                          {isOpen && (
                            <button className="pen" aria-pressed={isEd} title={isEd ? 'Закончить правку' : 'Изменить карточку'}
                              onClick={e => { e.stopPropagation(); setEd(isEd ? '' : c.id); setAdding(false); setQ('') }}>{isEd ? '✓ готово' : '✎ изменить'}</button>
                          )}
                        </div>
                        <div className="c2">{!c.info && <span className="pre">от </span>}{c.client}</div>
                        <div className="c3">
                          <span>{c.items.length} поз.</span>
                          {c.badge && <span className={'tag ' + (c.badge === 'Выполнено' ? 'ok' : 'wait')}>{c.badge}</span>}
                          {c.wait && <span className="tag wait">ждёт админа</span>}
                          {miss.length > 0 && <span className="tag bad">недовоз {miss.length}</span>}
                          {c.pay && <span className="tag pay">{c.pay}</span>}
                          <span className="prog"><span className="pbar"><i style={{ width: Math.round(doneN(c) / Math.max(1, c.items.length) * 100) + '%' }} /></span>{doneN(c)}/{c.items.length}</span>
                        </div>
                      </div>

                      {isOpen && (
                        <div onClick={e => e.stopPropagation()}>
                          <div className="phead"><span>позиция</span><span className="r">кол-во{c.items.every(i => !i.u) ? ', шт' : ''}</span></div>
                          {c.items.map((it, idx) => {
                            const a = alias(it.n), l = lack(it)
                            return (
                              <div key={idx} className={'prow' + (it.done ? ' got' : '') + (l ? ' short' : '')}
                                onClick={() => { if (!isEd && !c.info) upd(list => list.map(x => x.id !== c.id ? x : { ...x, items: x.items.map((y, j) => j === idx ? { ...y, done: !y.done } : y) })) }}>
                                <span className="al" title={a.full}>{a.short}</span>
                                {l > 0 && <span className="was">из {it.q}</span>}
                                {it.u && <span className="un">{it.u}</span>}
                                {isEd ? (
                                  <>
                                    <input className="qty" inputMode="decimal" defaultValue={fact(it)}
                                      onBlur={e => { const v = parseFloat(e.target.value.replace(',', '.'))
                                        upd(list => list.map(x => x.id !== c.id ? x : { ...x, items: x.items.map((y, j) => j === idx ? { ...y, got: isNaN(v) ? 0 : v } : y) })) }} />
                                    <button className="x" title="убрать позицию"
                                      onClick={() => upd(list => list.map(x => x.id !== c.id ? x : { ...x, items: x.items.filter((_, j) => j !== idx) }))}>✕</button>
                                  </>
                                ) : <span className="qtxt">{fact(it)}</span>}
                              </div>
                            )
                          })}

                          {isEd && adding && (
                            <div className="srch">
                              <input autoFocus value={q} placeholder="евро мл 9003"
                                onChange={e => { setQ(e.target.value); setSel(0) }}
                                onKeyDown={e => {
                                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, found.length - 1)) }
                                  else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
                                  else if (e.key === 'Enter' && found[sel]) { e.preventDefault(); addPos(c, found[sel]) }
                                  else if (e.key === 'Escape') { setAdding(false); setQ('') }
                                }} />
                              <div className="res">
                                {!q.trim() && <div className="no">начни писать название…</div>}
                                {q.trim() && found.length === 0 && <div className="no">ничего не найдено</div>}
                                {found.map((p, i) => (
                                  <div key={p.name} className={i === sel ? 'sel' : ''} onMouseDown={e => { e.preventDefault(); addPos(c, p) }}>
                                    <span>{p.name}</span><span className="u">{p.unit}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="foot">
                            <span className="t">Позиций <b>{c.items.length}</b> · взято {doneN(c)}
                              {miss.length > 0 && <> · <b style={{ color: 'var(--bad)' }}>недовоз {miss.length}</b></>}</span>
                            {isEd && !adding && <button className="act" onClick={() => setAdding(true)}>＋ позиция</button>}
                            {!c.info && nx && <button className="act main" onClick={() => provesti(c)}>{nx.label}</button>}
                          </div>

                          {miss.length > 0 && !c.info && nx && (
                            <div className="dom">
                              🁢 <b>домино:</b> {nx.to === 'deliv'
                                ? <>расходная заказчику «{c.client}» встанет по факту ({miss.map(i => alias(i.n).short + ' ' + fact(i) + ' из ' + i.q).join(', ')}), склад и долг заказчика — только за отвезённое.</>
                                : <>приходная от «{(cols.find(x => x.id === c.col)?.name || '').replace(/^Заказ\s*/, '')}» встанет по факту ({miss.map(i => alias(i.n).short + ' ' + fact(i) + ' из ' + i.q).join(', ')}), склад, долг поставщику и себестоимость — только за принятое, заявка «{c.client}» останется недогружена.</>}
                              <div className="row">
                                {[['reorder', nx.to === 'deliv' ? '↻ Допоставка' : '↻ Дозаказ'], ['ask', '❓ На выяснение'], ['drop', '✕ Снять']].map(([k, t]) => (
                                  <button key={k} className="ch2" aria-pressed={(c.tail || 'reorder') === k}
                                    onClick={() => upd(list => list.map(x => x.id === c.id ? { ...x, tail: k } : x))}>{t}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </main>
    </div>
  )

  function addPos(c: Card, p: { name: string; unit: string }) {
    upd(list => list.map(x => x.id !== c.id ? x : { ...x, items: [...x.items, { n: p.name, q: 1, u: p.unit === 'шт' ? undefined : p.unit }] }))
    setQ(''); setSel(0)
  }
}

/* Цвета один в один Trello: синяя доска, светло-серая колонка, белая карточка. */
const CSS = `
.lb{--bg:#0079bf;--onbg:#fff;--head:#026aa7;--surface:#fff;--surface2:#f1f2f4;--text:#172b4d;--muted:#5e6c84;--faint:#8993a4;
  --line:#dfe1e6;--line2:#ebecf0;--accent:#0c66e4;--accent-soft:#e9f2ff;--ok:#1f845a;--ok-soft:#dcfff1;
  --warn:#946f00;--warn-soft:#fff7d6;--bad:#c9372c;--bad-soft:#ffeceb;
  min-height:100vh;background:var(--bg);color:var(--onbg);font-family:'Golos Text',system-ui,sans-serif;font-size:13.5px}
.lb *{box-sizing:border-box}
.lb .top{position:sticky;top:0;z-index:20;background:var(--head);color:#fff;padding:7px 12px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.lb .who{font-weight:700;font-size:13.5px;line-height:1.15}
.lb .who small{display:block;font-weight:500;font-size:11px;opacity:.85}
.lb .sp{flex:1}
.lb .tb{border:none;background:rgba(255,255,255,.22);color:#fff;border-radius:6px;padding:6px 10px;font-size:12.5px;font-weight:600;cursor:pointer;text-decoration:none;font-family:inherit}
.lb .tb:hover{background:rgba(255,255,255,.32)}
.lb .find{border:none;background:rgba(255,255,255,.22);color:#fff;border-radius:6px;padding:6px 10px;width:190px;font-size:12.5px;font-family:inherit}
.lb .find::placeholder{color:rgba(255,255,255,.75)}
.lb .kpis{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px 12px 6px;font-size:12.5px}
.lb .kpi{background:rgba(255,255,255,.2);border-radius:999px;padding:3px 10px}
.lb .hint{opacity:.85;margin-left:auto}
.lb .board{display:flex;gap:9px;align-items:flex-start;overflow-x:auto;padding:4px 12px 20px}
.lb .col{flex:0 0 288px;width:288px;background:var(--surface2);border-radius:12px;display:flex;flex-direction:column;max-height:calc(100vh - 150px);padding:8px}
.lb .ch{display:flex;align-items:center;gap:6px;padding:2px 4px 7px}
.lb .ch .nm{font-weight:800;font-size:13px;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb .ch .n,.lb .foldcol .n{background:var(--surface);color:var(--muted);border-radius:999px;padding:1px 8px;font-size:11.5px;font-weight:700}
.lb .foldbtn{width:100%;min-height:40px;border:none;background:#e4e6ea;color:var(--muted);border-radius:8px;padding:9px;margin-bottom:7px;
  font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.02em}
.lb .foldbtn:hover{background:#d8dbe0;color:var(--text)}
.lb .foldcol{justify-content:flex-start}
.lb .foldcol .v{padding:6px 0}
.lb .cards{display:flex;flex-direction:column;gap:7px;overflow-y:auto;padding:1px}
.lb .none{color:var(--faint);font-size:12px;text-align:center;padding:10px 4px}
.lb .foldcol{flex:0 0 44px;width:44px;background:var(--surface2);border-radius:12px;padding:8px 0;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer}
.lb .foldcol .v{writing-mode:vertical-rl;font-weight:800;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-height:70vh}
.lb .card{background:var(--surface);color:var(--text);border-radius:8px;padding:8px 9px;cursor:pointer;box-shadow:0 1px 1px rgba(9,30,66,.25),0 0 1px rgba(9,30,66,.31)}
.lb .card.edit{box-shadow:0 0 0 2px var(--accent)}
.lb .card.info{opacity:.9}
.lb .c1{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--faint)}
.lb .code{font-family:ui-monospace,Consolas,monospace;font-weight:700;font-size:11px;color:var(--accent)}
.lb .c2{font-weight:700;font-size:13.5px;margin-top:2px;line-height:1.25}
.lb .c2 .pre{color:var(--faint);font-weight:600}
.lb .c3{display:flex;align-items:center;gap:6px;margin-top:5px;font-size:11.5px;color:var(--muted);flex-wrap:wrap}
.lb .tag{border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700;background:var(--surface2);color:var(--muted)}
.lb .tag.ok{background:var(--ok-soft);color:var(--ok)}
.lb .tag.wait{background:var(--line2);color:var(--muted)}
.lb .tag.bad{background:var(--bad-soft);color:var(--bad)}
.lb .tag.pay{background:var(--warn-soft);color:var(--warn)}
.lb .prog{margin-left:auto;display:flex;align-items:center;gap:5px;font-weight:700;font-size:11px}
.lb .pbar{width:36px;height:4px;border-radius:3px;background:var(--line);overflow:hidden}
.lb .pbar i{display:block;height:100%;background:var(--ok)}
/* Карандаш правки — красный и заметный: мелкую серую иконку на телефоне не видно */
.lb .pen{border:none;background:var(--bad);color:#fff;border-radius:7px;padding:5px 10px;font-size:14px;font-weight:800;
  cursor:pointer;line-height:1;font-family:inherit;box-shadow:0 1px 2px rgba(9,30,66,.3)}
.lb .pen:hover{filter:brightness(1.08)}
.lb .pen[aria-pressed="true"]{background:var(--ok);color:#fff}
.lb .phead{display:flex;gap:6px;margin-top:8px;padding:0 2px 3px;border-bottom:1px solid var(--line);font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);font-weight:700}
.lb .phead .r{margin-left:auto}
.lb .prow{display:flex;align-items:center;gap:6px;padding:4px 3px;border-bottom:1px solid var(--line2)}
.lb .prow:last-of-type{border-bottom:none}
.lb .prow.got{background:var(--ok-soft)}
.lb .prow.short{background:var(--bad-soft)}
.lb .prow.got .al::before{content:"✓ ";color:var(--ok);font-weight:800}
.lb .al{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb .was{font-size:11px;color:var(--bad);white-space:nowrap}
.lb .un{font-size:10.5px;color:var(--faint)}
.lb .qtxt{min-width:44px;text-align:right;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
.lb .qty{width:54px;text-align:right;border:1px solid var(--line);background:var(--surface2);border-radius:6px;padding:3px 5px;font-size:13px;font-weight:700;font-family:inherit;color:var(--text)}
.lb .x{border:none;background:none;color:var(--faint);padding:0 2px;cursor:pointer;font-size:12px}
.lb .foot{display:flex;align-items:center;gap:6px;margin-top:7px;flex-wrap:wrap}
.lb .foot .t{font-size:11.5px;color:var(--muted);margin-right:auto}
.lb .act{border:1px solid var(--line);background:var(--surface2);border-radius:6px;padding:4px 8px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--text)}
.lb .act.main{background:var(--ok);border:none;color:#fff;padding:6px 11px;font-size:12.5px}
.lb .dom{margin-top:7px;border-left:3px solid var(--warn);background:var(--warn-soft);border-radius:6px;padding:6px 8px;font-size:11.5px;line-height:1.4;color:var(--text)}
.lb .dom b{color:var(--warn)}
.lb .dom .row{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
.lb .dom .ch2{border:1px solid var(--line);background:var(--surface);border-radius:5px;padding:3px 7px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;color:var(--text)}
.lb .dom .ch2[aria-pressed="true"]{background:var(--warn);border-color:var(--warn);color:#fff}
.lb .srch{margin-top:6px}
.lb .srch input{width:100%;border:2px solid var(--accent);background:var(--surface);border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;color:var(--text)}
.lb .res{margin-top:4px;background:var(--surface);border:1px solid var(--line);border-radius:6px;max-height:190px;overflow:auto}
.lb .res div{padding:5px 8px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--line2);display:flex;gap:6px;align-items:baseline}
.lb .res div.sel,.lb .res div:hover{background:var(--accent-soft)}
.lb .res .u{margin-left:auto;font-size:10.5px;color:var(--faint)}
.lb .res .no{color:var(--muted);cursor:default}
@media (max-width:620px){.lb .col{flex-basis:84vw;width:84vw;max-height:none}}
`
