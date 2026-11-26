'use client'
// ВТОРОЙ ВИД КАБИНЕТА ЛОГИСТА — доска (прототип, 19.11.2026).
// Старый кабинет (LogistPortal) не трогаем: это отдельный экран по ссылке «🧪 Доска».
// ЧИТАЕТ и НИЧЕГО НЕ ПИШЕТ: все правки (кол-во, ✕, ＋ позиция, кнопки этапов) живут только
// в браузере — чтобы прототипом нельзя было сломать живые карточки и накладные.
// Правила экрана (от владельца): цен у логиста нет, только количество; колонка = поставщик;
// позиции простым списком с алиасами; пустые колонки не показываем; закуп и продажа —
// по своим колонкам («Закуплено» / «Продано · Доставлено»); колонка Нипы свёрнута.
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { logistBoardData, logistBoardAll, setPosStatus, updatePosition, deletePosition, addPosition, orderAction, deferPositions } from '@/lib/api/orders'
import { fetchRefs } from '@/lib/api/refs'
import { matchWords } from '@/lib/search'
import { useLiveData } from '@/lib/live'
import LogistStock from './LogistStock'
import LogistShift from './LogistShift'
import InstallApp from './InstallApp'
import type { Session } from '@/lib/auth'

// done — позиция уже проведена (с сервера). Отметка «⏸ отложено» живёт отдельно (состояние hold по id позиции,
// запоминается на устройстве): живое обновление доски перезаписывает карточки и стёрло бы её.
type Item = { p?: string; n: string; q: number; u?: string; done?: boolean; got?: number | null; wait?: string }
type Card = { id: string; col: string; code: string; client: string; who: string; time: string; pay?: string
  k?: 'buy' | 'sell'; info?: boolean; badge?: string; wait?: boolean; items: Item[]; tail?: string; note?: string }
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
  // У поставщика проводит только КАРТОЧКУ ЗАКУПА: это приходная. Заявку клиента, которая
  // ждёт закупа, логист не «закупает» — её оформляет админ (так же, как в старом кабинете).
  if (stage === 'buy') return c.k === 'buy' ? { to: 'ready', label: '✓ Закуплено' } : null
  // Оттуда «Доставлено / Продано» → РАСХОДНАЯ, карточка в последнюю колонку.
  if (stage === 'ready') return { to: 'deliv', label: '✓ Продано / Доставлено' }
  return null
}

// adminOrgId — ДОСКА В АДМИНКЕ (правило владельца 26.11.2026): та же доска, но позиции ВСЕХ логистов орг.
// По умолчанию «👁 Режим просмотра»: всё видно, карточки открываются, копирование работает, а кнопок,
// которые что-то проводят или правят (Закуплено, Продано / Доставлено, ↩ назад, ✎ изменить, отметка «взято»,
// перетаскивание), нет. «🚚 Режим логиста» включает их — те же роуты, что у логиста. У самого логиста
// (без adminOrgId) ничего не меняется.
export default function LogistBoard({ user, viewAs, backHref, adminOrgId }: { user: Session; viewAs?: boolean; backHref: string; adminOrgId?: string }) {
  const admin = !!adminOrgId
  const [mode, setMode] = useState<'view' | 'logist'>('view')
  const ro = admin && mode === 'view'
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
  const [tab, setTab] = useState<'board' | 'stock' | 'shift'>('board')
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  // ⏸ ОТЛОЖЕНО (правило владельца 26.11.2026): отмеченная позиция не проводится и остаётся в колонке.
  const HOLD_KEY = 'u2b_lb_hold'
  const [hold, setHold] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(HOLD_KEY) || '{}') || {} } catch { return {} } })
  const saveHold = (h: Record<string, boolean>) => { setHold(h); try { localStorage.setItem(HOLD_KEY, JSON.stringify(h)) } catch {} }
  const isH = (i: Item) => !!(i.p && !i.done && hold[i.p])
  const holdN = (c: Card) => c.items.filter(isH).length
  const toggleHold = (i: Item) => { if (!i.p) return; const h = { ...hold }; if (h[i.p]) delete h[i.p]; else h[i.p] = true; saveHold(h) }
  const [msg, setMsg] = useState('')
  const uid = viewAs ? user.id : undefined
  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 4000) }
  const boardData = () => (admin ? logistBoardAll(adminOrgId) : logistBoardData(uid))
  async function reload() { const b: any = await boardData(); setCols(b.cols || []); setCards(b.cards || []) }
  // Все действия идут в ТЕ ЖЕ роуты, что у обычного кабинета логиста — своей логики тут нет.
  async function act(what: string, fn: () => Promise<any>) {
    if (busy) return
    setBusy(true); busyRef.current = true
    try { await fn(); await reload(); say('✓ ' + what) }
    catch (e: any) { say('⚠ не удалось: ' + what + (e?.message ? ' — ' + e.message : '')); console.error(what, e) }
    finally { setBusy(false); busyRef.current = false }
  }

  // Живое обновление: тот же сигнал, что у админских экранов (Pusher + страховка опросом).
  // Чужое действие видно сразу, свою правку не перебиваем — пока идёт сохранение, обновление ждёт.
  const busyRef = useRef(false)
  const firstRef = useRef(true)
  useLiveData(() => {
    if (busyRef.current) return
    ;(async () => {
      const [b, r]: any[] = await Promise.all([boardData(), firstRef.current ? fetchRefs() : Promise.resolve(null)])
      setCols(b.cols || []); setCards(b.cards || [])
      if (firstRef.current) {
        setFold(Object.fromEntries((b.cols || []).filter((c: Col) => c.fold).map((c: Col) => [c.id, true])))
        setProds(((r?.products || []) as any[]).filter((p: any) => !p.archived).map((p: any) => ({ name: p.name, unit: p.unit || 'шт' })))
        firstRef.current = false
      }
      setLoading(false)
    })()
  }, [user.id, viewAs, adminOrgId])

  const shown = useMemo(() => cards.filter(c => !find.trim() ||
    matchWords(find, c.client, c.code, c.who, ...c.items.map(i => i.n))), [cards, find])
  const found = useMemo(() => (q.trim() ? prods.filter(p => matchWords(q, p.name)).slice(0, 8) : []), [q, prods])

  // КОПИРОВАНИЕ (просьба владельца 20.11.2026): 📋 рядом с датой — вся карточка с позициями и
  // штуками; двойной тап ИЛИ долгое нажатие на строке — одна позиция. Шлём в WhatsApp как есть.
  // clipboard API работает не везде (http, старый webview) — отсюда запасной путь через textarea.
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text) }
    catch {
      try {
        const t = document.createElement('textarea'); t.value = text
        t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t)
        t.select(); document.execCommand('copy'); document.body.removeChild(t)
      } catch { say('⚠ не удалось скопировать'); return }
    }
    say('📋 скопировано: ' + what)
  }
  const posLine = (it: Item) => it.n + ' — ' + fact(it) + ' ' + (it.u || 'шт')
  const cardText = (c: Card) => [
    c.code + ' · ' + c.time,
    (c.info ? '' : 'от ') + c.client,
    ...c.items.map((it, i) => (i + 1) + '. ' + posLine(it)),
    'Всего позиций: ' + c.items.length,
  ].filter(Boolean).join('\n')

  // Долгое нажатие на позиции: по отпусканию подавляем обычный клик (он помечает «взято»).
  const pressRef = useRef<any>(null)
  const heldRef = useRef(false)
  const holdStart = (it: Item) => {
    heldRef.current = false
    pressRef.current = setTimeout(() => { heldRef.current = true; copy(posLine(it), 'позиция') }, 500)
  }
  const holdEnd = () => { if (pressRef.current) clearTimeout(pressRef.current); pressRef.current = null }

  const upd = (fn: (list: Card[]) => Card[]) => setCards(list => fn(list.map(c => ({ ...c, items: c.items.map(i => ({ ...i })) }))))
  // Перетаскивание пока НЕ меняет поставщика в базе (это право админа) — двигаем только на экране.
  const move = (id: string, col: string) => { say('поставщика ставит админ — на доске это только вид')
    upd(list => list.map(c => (c.id === id ? { ...c, col } : c))) }

  // Проводка: сначала правим кол-во до фактического, потом помечаем позиции «Доставлено».
  // Дальше всё делает система: у закупа — приходная, у продажи — расходная (как в кабинете).
  function provesti(c: Card) {
    if (ro) return
    const nx = nextStep(c); if (!nx) return
    // ОТЛОЖЕННОЕ ОСТАЁТСЯ (правило владельца 26.11.2026): отмеченные оранжевым «⏸ отложено» не проводим —
    // они остаются в этой колонке, дальше идут только неотмеченные.
    const live = c.items.filter(i => i.p && !i.done && !isH(i))
    const held = c.items.filter(i => i.p && !i.done && isH(i))
    if (!live.length) { say(held.length ? 'все позиции отложены — проводить нечего' : 'нечего проводить'); return }
    const miss = live.filter(i => lack(i) > 0)
    const what = nx.to === 'ready' ? 'Закуплено' : 'Продано / Доставлено'
    const q = miss.length
      ? 'По ' + miss.length + ' поз. факт меньше заказанного — кол-во в карточке станет фактическим, остаток просто уйдёт. Проводим «' + what + '»?'
      : 'Провести «' + what + '» по ' + live.length + ' поз.?'
    const q2 = held.length ? q + '\n\n⏸ Отложено ' + held.length + ' поз. (' + held.map(i => alias(i.n).short).join(', ') + ') — уйдут в карточку-продолжение ' + c.code + '-2 и останутся в этой колонке, накладная на них — когда довезёте.' : q
    if (!confirm(q2)) return
    act(what, async () => {
      // Сначала отложенное — в карточку-продолжение, иначе накладная не выпишется (она ждёт всю карточку).
      if (held.length) { const d = await deferPositions(c.code, held.map(i => i.p as string)); if (!d.ok) throw new Error(d.error || 'не удалось отложить')
        // в карточке-продолжении эти позиции уже не отложены — их повезут следующим рейсом
        const h = { ...hold }; for (const i of held) delete h[i.p as string]; saveHold(h) }
      for (const i of live) {
        if (fact(i) !== i.q) await updatePosition(c.code, i.p as string, { qty: fact(i) })
        await setPosStatus(c.code, 'Доставлено', i.p as string)
      }
    })
    setOpen(''); setEd('')
  }

  // ↩ ШАГ НАЗАД (правило владельца 23.11.2026): ошибочно нажали «Закуплено» или «Продано / Доставлено» —
  // возвращаем карточку на предыдущий этап. Что именно сторнируется, решает сервер (order.service.stepBack);
  // здесь только честно называем последствия до нажатия.
  const backStep = (c: Card): { label: string; ask: string } | null => {
    if (c.info || ro) return null
    if (c.col === 'deliv') return c.k === 'buy'
      ? { label: '↩ вернуть назад', ask: 'Вернуть закуп ' + c.code + ' назад к поставщику?\n\nПриходная будет сторнирована: товар уйдёт со склада, долг поставщику снимется. Карточка снова встанет в колонку поставщика.' }
      : { label: '↩ вернуть назад', ask: 'Вернуть ' + c.code + ' назад в «Готов к отправке»?\n\nРасходная будет сторнирована: товар вернётся на склад, долг заказчика «' + c.client + '» снимется (у филиала уйдёт и его приходная).' }
    if (c.col === 'ready' && c.k === 'sell') return { label: '↩ назад', ask: 'Вернуть ' + c.code + ' назад к поставщику?\n\nПриходная по её закупу будет сторнирована: товар уйдёт со склада, долг поставщику снимется, карточка продажи исчезнет, закуп снова встанет в колонку поставщика.' }
    return null
  }
  async function goBack(c: Card) {
    const b = backStep(c); if (!b || busy) return
    if (!confirm(b.ask)) return
    setBusy(true); busyRef.current = true
    try {
      const r = await orderAction(c.code, 'stepBack')
      await reload()
      say(r.ok ? '✓ возвращено назад' : '⚠ ' + (r.error || 'не удалось вернуть'))
    } catch (e: any) { say('⚠ не удалось вернуть'); console.error('stepBack', e) }
    finally { setBusy(false); busyRef.current = false }
    setOpen(''); setEd('')
  }

  // Пустые колонки прячем (правило владельца): показываем только те, где есть карточки,
  // а при перетаскивании ненадолго показываем все — иначе некуда положить карточку.
  // ИСКЛЮЧЕНИЕ — колонки-этапы «Готов к отправке» и «Продано / Доставлено» (`stage`):
  // они стоят ВСЕГДА, даже пустые. Иначе логисту некуда вести карточку и не видно, что
  // закрыто за день (правило владельца 21.11.2026).
  const visible = cols.filter(c => c.stage || drag || shown.some(x => x.col === c.id))

  if (loading) return <div style={{ padding: 30, color: '#fff' }}>Загрузка доски…</div>

  return (
    <div className={'lb' + (admin ? ' adm' : '')}>
      <style>{CSS}</style>
      <header className="top">
        {admin ? (
          <>
            <div className="who">Доска логиста<small>{busy ? 'сохраняю…' : ro ? 'просмотр · все логисты, ничего не проводится' : 'режим логиста · действия идут в базу'}</small></div>
            <button className={'tb mode' + (mode === 'view' ? ' on' : '')} data-mode="view" onClick={() => { setMode('view'); setEd(''); setAdding(false) }}>👁 Режим просмотра</button>
            <button className={'tb mode' + (mode === 'logist' ? ' on' : '')} data-mode="logist" onClick={() => setMode('logist')}>🚚 Режим логиста</button>
          </>
        ) : <>
        <div className="who">Логист · {user.name}<small>{viewAs ? 'просмотр · ' : ''}{busy ? 'сохраняю…' : 'доска · действия идут в базу'}</small></div>
        <div className="menu">
          <button className="tb" onClick={() => setMenu(!menu)}>☰ {tab === 'stock' ? 'Остаток' : tab === 'shift' ? 'Смена' : 'Доска'}</button>
          {menu && (
            <div className="drop" onClick={() => setMenu(false)}>
              <button className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}>📋 Доска</button>
              <button className={tab === 'stock' ? 'on' : ''} onClick={() => setTab('stock')}>📦 Остаток склада</button>
              <button className={tab === 'shift' ? 'on' : ''} onClick={() => setTab('shift')}>📊 Смена · отчёт дня</button>
              <div className="sep" />
              <InstallApp compact />
              <a href={backHref + '?tab=changes'}>⚡ Правки</a>
              <a href={backHref + '?tab=new'}>➕ Новая заявка</a>
              <a href={backHref}>↩ Старый кабинет</a>
            </div>
          )}
        </div>
        </>}
        <span className="sp" />
        {tab === 'board' && <input className="find" value={find} onChange={e => setFind(e.target.value)} placeholder="поиск: заказчик, товар, №" />}
        {tab === 'board' && <button className="tb" onClick={() => {
          const any = cols.some(c => !fold[c.id])
          setFold(Object.fromEntries(cols.map(c => [c.id, any])))
        }}>{cols.some(c => !fold[c.id]) ? 'свернуть все' : 'развернуть все'}</button>}
      </header>

      {!admin && <InstallApp />}
      {tab === 'stock' && <LogistStock uid={uid} />}
      {tab === 'shift' && <LogistShift />}
      {tab === 'board' && <div className="kpis">
        <span className="kpi">В работе <b>{shown.filter(c => !c.info).length}</b></span>
        <span className="kpi">Позиций <b>{shown.filter(c => !c.info).reduce((s, c) => s + c.items.length, 0)}</b></span>
        <span className="kpi">Недовоз <b>{shown.reduce((s, c) => s + lackN(c), 0)} поз.</b></span>
        <span className="kpi">Готов к отправке <b>{shown.filter(c => c.col === 'ready').length}</b></span>
        <span className="hint">{msg || (ro ? 'режим просмотра: карточки открываются, проводить — «🚚 Режим логиста»' : 'кнопки работают: кол-во, позиции и проводка уходят в базу')}</span>
      </div>}

      {tab === 'board' && <main className="board">
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
                      draggable={!ro} onDragStart={() => { if (!ro) setDrag(c.id) }} onDragEnd={() => setDrag('')}>
                      <div onClick={() => { setOpen(isOpen ? '' : c.id); setEd(''); setAdding(false) }}>
                        <div className="c1">
                          <span className="code">{c.code}</span><span>· {c.time}</span>
                          <button className="cp" title="Скопировать карточку с позициями"
                            onClick={e => { e.stopPropagation(); copy(cardText(c), c.code) }}>📋</button>
                          {c.note && !isOpen && <span className="hasnote" title={c.note}>💬</span>}
                          {c.who && <span style={{ marginLeft: 'auto' }}>{c.who}</span>}
                          {isOpen && !ro && (
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
                          <span className="prog"><span className="pbar"><i style={{ width: Math.round(doneN(c) / Math.max(1, c.items.length) * 100) + '%' }} /></span>{doneN(c)}/{c.items.length}{holdN(c) > 0 && <b style={{ color: 'var(--hold)' }}> · ⏸{holdN(c)}</b>}</span>
                        </div>
                      </div>

                      {isOpen && (
                        <div onClick={e => e.stopPropagation()}>
                          {c.note && <div className="note">💬 {c.note}</div>}
                          <div className="phead"><span>позиция</span><span className="r">кол-во{c.items.every(i => !i.u) ? ', шт' : ''}</span></div>
                          {c.items.map((it, idx) => {
                            const a = alias(it.n), l = lack(it)
                            return (
                              <div key={idx} className={'prow' + (it.done ? ' got' : '') + (isH(it) ? ' hold' : '') + (l ? ' short' : '')}
                                title="Нажать — отложить (останется в колонке) · двойной тап или долгое нажатие — скопировать"
                                onPointerDown={() => holdStart(it)} onPointerUp={holdEnd}
                                onPointerLeave={holdEnd} onPointerCancel={holdEnd}
                                onContextMenu={e => { if (heldRef.current) e.preventDefault() }}
                                onDoubleClick={e => { e.stopPropagation(); copy(posLine(it), 'позиция') }}
                                onClick={() => {
                                  if (heldRef.current) { heldRef.current = false; return }   // это было долгое нажатие — копия, не отметка
                                  if (!isEd && !c.info && !ro && !it.done) toggleHold(it) }}>
                                <span className="al" title={a.full}>{a.short}</span>
                                {l > 0 && <span className="was">из {it.q}</span>}
                                {it.u && <span className="un">{it.u}</span>}
                                {isEd ? (
                                  <>
                                    <input className="qty" inputMode="decimal" defaultValue={fact(it)} disabled={busy}
                                      onBlur={e => { const v = parseFloat(e.target.value.replace(',', '.'))
                                        if (isNaN(v) || v === it.q || !it.p) return
                                        act('кол-во ' + v, () => updatePosition(c.code, it.p as string, { qty: v })) }} />
                                    <button className="x" title="убрать позицию" disabled={busy}
                                      onClick={() => { if (!it.p) return
                                        if (confirm('Убрать позицию «' + it.n + '» из карточки ' + c.code + '?'))
                                          act('позиция убрана', () => deletePosition(c.code, it.p as string)) }}>✕</button>
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
                            {backStep(c) && <button className="act back" disabled={busy} title="Отыграть последний шаг — если кнопку нажали по ошибке" onClick={() => goBack(c)}>{backStep(c)!.label}</button>}
                            <span className="t">Позиций <b>{c.items.length}</b>{holdN(c) > 0 && <> · <b style={{ color: 'var(--hold)' }}>отложено {holdN(c)}</b></>}{doneN(c) > 0 && <> · проведено {doneN(c)}</>}
                              {miss.length > 0 && <> · <b style={{ color: 'var(--bad)' }}>недовоз {miss.length}</b></>}</span>
                            {isEd && !adding && <button className="act" onClick={() => setAdding(true)}>＋ позиция</button>}
                            {!c.info && nx && !ro && <button className="act main" onClick={() => provesti(c)}>{nx.label}{holdN(c) > 0 ? ' · ' + (c.items.filter(i => i.p && !i.done).length - holdN(c)) + ' поз.' : ''}</button>}
                          </div>

                          {miss.length > 0 && !c.info && nx && !ro && (
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
      </main>}
    </div>
  )

  function addPos(c: Card, p: { name: string; unit: string }) {
    setQ(''); setSel(0)
    act('позиция добавлена', () => addPosition(c.code, { name1c: p.name, oral: p.name, qty: 1, unit: p.unit || 'шт', respUserId: user.id }))
  }
}

/* Цвета один в один Trello: синяя доска, светло-серая колонка, белая карточка. */
const CSS = `
.lb{--bg:#0079bf;--onbg:#fff;--head:#026aa7;--surface:#fff;--surface2:#f1f2f4;--text:#172b4d;--muted:#5e6c84;--faint:#8993a4;
  --line:#dfe1e6;--line2:#ebecf0;--accent:#0c66e4;--accent-soft:#e9f2ff;--ok:#1f845a;--ok-soft:#dcfff1;
  --warn:#946f00;--hold:#d9640b;--hold-soft:#fff0e2;--warn-soft:#fff7d6;--bad:#c9372c;--bad-soft:#ffeceb;
  min-height:100vh;background:var(--bg);color:var(--onbg);font-family:'Golos Text',system-ui,sans-serif;font-size:13.5px}
.lb *{box-sizing:border-box}
.lb .top{position:sticky;top:0;z-index:20;background:var(--head);color:#fff;padding:7px 12px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.lb .who{font-weight:700;font-size:13.5px;line-height:1.15}
.lb .who small{display:block;font-weight:500;font-size:11px;opacity:.85}
.lb .sp{flex:1}
.lb .tb{border:none;background:rgba(255,255,255,.22);color:#fff;border-radius:6px;padding:6px 10px;font-size:12.5px;font-weight:600;cursor:pointer;text-decoration:none;font-family:inherit}
.lb .tb:hover{background:rgba(255,255,255,.32)}
.lb .tb.mode{background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35)}
.lb .tb.mode.on{background:#fff;color:var(--head);box-shadow:none}
.lb.adm{min-height:100%}
.lb.adm .top{padding-right:64px}
.lb .find{border:none;background:rgba(255,255,255,.22);color:#fff;border-radius:6px;padding:6px 10px;width:190px;font-size:12.5px;font-family:inherit}
.lb .find::placeholder{color:rgba(255,255,255,.75)}
.lb .menu{position:relative}
.lb .drop{position:absolute;top:calc(100% + 6px);left:0;z-index:50;background:var(--surface);border-radius:10px;min-width:210px;padding:6px;display:flex;flex-direction:column;gap:2px;box-shadow:0 8px 24px rgba(9,30,66,.25)}
.lb .drop button,.lb .drop a{border:none;background:none;color:var(--text);text-align:left;padding:9px 11px;border-radius:7px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none;display:block}
.lb .drop button:hover,.lb .drop a:hover{background:var(--surface2)}
.lb .drop button.on{background:var(--accent);color:#fff}
.lb .drop .sep{height:1px;background:var(--line);margin:4px 2px}
.lb .sgb{border:none;background:none;color:#fff;border-radius:6px;padding:6px 11px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;opacity:.8}
.lb .sgb.on{background:#fff;color:#026aa7;opacity:1}
.lb .kpis{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px 12px 6px;font-size:12.5px}
.lb .kpi{background:rgba(255,255,255,.2);border-radius:999px;padding:3px 10px}
.lb .hint{opacity:.85;margin-left:auto}
.lb .board{display:flex;gap:9px;align-items:flex-start;overflow-x:auto;padding:4px 12px 20px}
/* Колонка растёт по содержимому: прокручивается ВСЯ страница, а не внутренность колонки —
   иначе низ доски упирался в невидимую границу и карточки было не достать. */
.lb .col{flex:0 0 288px;width:288px;background:var(--surface2);border-radius:12px;display:flex;flex-direction:column;padding:8px}
.lb .ch{display:flex;align-items:center;gap:6px;padding:2px 4px 7px}
.lb .ch .nm{font-weight:800;font-size:13px;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb .ch .n,.lb .foldcol .n{background:var(--surface);color:var(--muted);border-radius:999px;padding:1px 8px;font-size:11.5px;font-weight:700}
.lb .foldbtn{width:100%;min-height:40px;border:none;background:#e4e6ea;color:var(--muted);border-radius:8px;padding:9px;margin-bottom:7px;
  font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.02em}
.lb .foldbtn:hover{background:#d8dbe0;color:var(--text)}
.lb .foldcol{justify-content:flex-start}
.lb .foldcol .v{padding:6px 0}
.lb .cards{display:flex;flex-direction:column;gap:7px;padding:1px}
.lb .none{color:var(--faint);font-size:12px;text-align:center;padding:10px 4px}
.lb .foldcol{flex:0 0 44px;width:44px;background:var(--surface2);border-radius:12px;padding:8px 0;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer}
.lb .foldcol .v{writing-mode:vertical-rl;font-weight:800;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-height:70vh}
.lb .card{background:var(--surface);color:var(--text);border-radius:8px;padding:8px 9px;cursor:pointer;box-shadow:0 1px 1px rgba(9,30,66,.25),0 0 1px rgba(9,30,66,.31)}
.lb .card.edit{box-shadow:0 0 0 2px var(--accent)}
.lb .card.info{opacity:.9}
.lb .c1{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--faint)}
.lb .cp{border:none;background:none;color:var(--faint);cursor:pointer;font-size:13px;line-height:1;padding:2px 3px;border-radius:5px}
.lb .cp:hover{background:var(--surface2);color:var(--text)}
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
.lb .hasnote{font-size:10px;opacity:.75;cursor:default}
/* Комментарий заявки — мелким шрифтом, виден при раскрытии карточки. */
.lb .note{margin-top:7px;border-left:3px solid var(--line);background:var(--surface2);border-radius:6px;padding:5px 7px;font-size:10.5px;line-height:1.4;color:var(--faint);white-space:pre-wrap;word-break:break-word}
.lb .phead{display:flex;gap:6px;margin-top:8px;padding:0 2px 3px;border-bottom:1px solid var(--line);font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);font-weight:700}
.lb .phead .r{margin-left:auto}
.lb .prow{display:flex;align-items:center;gap:6px;padding:4px 3px;border-bottom:1px solid var(--line2);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.lb .prow:last-of-type{border-bottom:none}
.lb .prow.got{background:var(--ok-soft)}
.lb .prow.short{background:var(--bad-soft)}
.lb .prow.got .al::before{content:"✓ ";color:var(--ok);font-weight:800}
.lb .prow.hold{background:var(--hold-soft);box-shadow:inset 3px 0 0 var(--hold)}
.lb .prow.hold .al{color:var(--hold)}
.lb .prow.hold .al::before{content:"⏸ ";font-weight:800}
.lb .prow.hold .qtxt{color:var(--hold)}
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
.lb .act.back{background:#fff;border:1.5px solid #c7873a;color:#8a4b00;padding:5px 10px;font-size:12px}
.lb .act.back:disabled{opacity:.5;cursor:default}
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
@media (max-width:620px){.lb .col{flex-basis:84vw;width:84vw}}
`
