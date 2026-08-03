'use client'
import { useEffect, useState } from 'react'
import { pickOrg, forOrg } from '@/lib/org'

const SCREENS = [
  { k: 'incoming', l: 'Входящие' }, { k: 'reception', l: 'Приёмка' }, { k: 'outgoing', l: 'Исходящие' },
  { k: 'accounting', l: 'Учёт' }, { k: 'bookkeeping', l: 'Бухгалтерия' }, { k: 'archive', l: 'Архив' },
]
const ACTIONS: Record<string, { a: string; l: string }[]> = {
  incoming: [{ a: 'accept', l: 'Принять' }],
  reception: [{ a: 'take', l: 'В обработку' }, { a: 'process', l: 'В работу' }],
  outgoing: [{ a: 'sendAcc', l: 'В учёт' }],
  accounting: [{ a: 'postAcc', l: 'В бухгалтерию' }],
  bookkeeping: [{ a: 'sendArchive', l: 'В архив' }],
  archive: [{ a: 'unarchive', l: 'Из архива' }],
}
const inp = 'border border-neutral-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-orange-500'

export default function BoardPage() {
  const [orgId, setOrgId] = useState('')
  const [refs, setRefs] = useState<any>(null)
  const [board, setBoard] = useState<Record<string, any[]>>({})
  const [msg, setMsg] = useState('')
  const [showNew, setShowNew] = useState(false)

  async function loadBoard(org: string) {
    const entries = await Promise.all(SCREENS.map(async s => {
      const list = await fetch(`/api/orders?orgId=${org}&screen=${s.k}`).then(r => r.json()).catch(() => [])
      return [s.k, Array.isArray(list) ? list : []] as const
    }))
    setBoard(Object.fromEntries(entries))
  }
  async function init() {
    const r = await fetch('/api/refs').then(x => x.json())
    setRefs(r)
    const org = pickOrg<{ id: string }>(r.organizations)
    if (org) { setOrgId(org.id); await loadBoard(org.id) }
  }
  useEffect(() => { init() }, [])

  async function act(id: string, action: string) {
    setMsg('')
    const reason = action === 'cancel' ? (prompt('Причина отмены?') ?? '') : undefined
    const res = await fetch(`/api/orders/${id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload: reason !== undefined ? { reason } : {} }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg('⚠ ' + (data.error || 'Ошибка')); return }
    await loadBoard(orgId)
  }

  if (!refs) return <div className="p-8 text-neutral-500">Загрузка…</div>

  return (
    <main className="max-w-[1400px] mx-auto p-6">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold">🗂 Заявки</h1>
        <button onClick={() => setShowNew(v => !v)} className="bg-orange-600 text-white text-sm font-bold rounded-lg px-4 py-1.5">{showNew ? '× Закрыть' : '+ Новая заявка'}</button>
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>

      {showNew && <NewOrder orgId={orgId} products={refs.products} clients={forOrg(refs.contragents, orgId).filter((c: any) => c.kind !== 'supplier')}
        onDone={async () => { setShowNew(false); await loadBoard(orgId) }} />}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {SCREENS.map(s => (
          <div key={s.k} className="min-w-[240px] flex-1">
            <div className="text-xs font-bold text-neutral-500 mb-2 px-1">{s.l.toUpperCase()} ({board[s.k]?.length || 0})</div>
            <div className="flex flex-col gap-2">
              {(board[s.k] || []).map(o => <Card key={o.id} o={o} actions={ACTIONS[s.k] || []} onAct={act} />)}
              {!board[s.k]?.length && <div className="text-xs text-neutral-300 px-1 py-4">пусто</div>}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

function Card({ o, actions, onAct }: { o: any; actions: { a: string; l: string }[]; onAct: (id: string, a: string) => void }) {
  const purchase = o.kind === 'purchase'
  return (
    <div className={`bg-white rounded-xl ring-1 ring-neutral-200 p-3 text-sm ${o.isCancelled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-bold text-xs">{o.id}</span>
        <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${purchase ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{purchase ? 'ЗАКУП' : 'ПРОДАЖА'}</span>
      </div>
      <div className="text-neutral-600">{o.fromName || '—'}</div>
      <div className="text-xs text-neutral-400 mb-2">{o.status}{o.comment ? ` · ${o.comment}` : ''}</div>
      <div className="flex flex-wrap gap-1">
        {!o.isCancelled && actions.map(x => (
          <button key={x.a} onClick={() => onAct(o.id, x.a)} className="text-xs font-semibold bg-neutral-900 text-white rounded px-2 py-1">{x.l}</button>
        ))}
        {!o.isCancelled
          ? <button onClick={() => onAct(o.id, 'cancel')} className="text-xs text-red-600 rounded px-1 py-1">Отмена</button>
          : <button onClick={() => onAct(o.id, 'restore')} className="text-xs text-neutral-500 rounded px-1 py-1">Восстановить</button>}
      </div>
    </div>
  )
}

function NewOrder({ orgId, products, clients, onDone }: { orgId: string; products: any[]; clients: any[]; onDone: () => void }) {
  const [kind, setKind] = useState<'sale' | 'purchase'>('sale')
  const [contactId, setContactId] = useState('')
  const [comment, setComment] = useState('')
  const [rows, setRows] = useState<{ productId: string; qty: string; price: string }[]>([{ productId: '', qty: '1', price: '' }])
  const [busy, setBusy] = useState(false)

  function setRow(i: number, patch: any) { setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r)) }
  function pickProduct(i: number, pid: string) {
    const p = products.find(x => x.id === pid)
    setRow(i, { productId: pid, price: p ? String(p.priceRetail) : '' })
  }

  async function submit() {
    setBusy(true)
    const client = clients.find(c => c.id === contactId)
    const positions = rows.filter(r => r.productId).map(r => {
      const p = products.find(x => x.id === r.productId)
      return { productId: r.productId, name1c: p?.name || '', oral: p?.name || '', qty: Number(r.qty) || 0, unit: p?.unit || 'шт', price: Number(r.price) || 0 }
    })
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, kind, contactId: contactId || undefined, fromName: client?.name || '', comment, positions }) })
    setBusy(false)
    if (res.ok) onDone()
  }

  return (
    <div className="bg-white rounded-2xl ring-1 ring-neutral-200 p-5 mb-5">
      <div className="grid grid-cols-3 gap-2 mb-3">
        <select className={inp} value={kind} onChange={e => setKind(e.target.value as any)}>
          <option value="sale">Продажа</option><option value="purchase">Закуп</option>
        </select>
        <select className={inp} value={contactId} onChange={e => setContactId(e.target.value)}>
          <option value="">— заказчик —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className={inp} placeholder="Комментарий" value={comment} onChange={e => setComment(e.target.value)} />
      </div>
      <div className="text-xs font-bold text-neutral-500 mb-2">ПОЗИЦИИ</div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_90px_110px_32px] gap-2 mb-2">
          <select className={inp} value={r.productId} onChange={e => pickProduct(i, e.target.value)}>
            <option value="">— товар —</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className={inp} type="number" placeholder="кол-во" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} />
          <input className={inp} type="number" placeholder="цена" value={r.price} onChange={e => setRow(i, { price: e.target.value })} />
          <button className="text-neutral-400 text-lg" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="text-sm text-orange-600 font-semibold mb-3" onClick={() => setRows(rs => [...rs, { productId: '', qty: '1', price: '' }])}>+ позиция</button>
      <div>
        <button className="bg-orange-600 text-white font-bold text-sm rounded-lg px-5 py-2 disabled:opacity-50" disabled={busy || !orgId} onClick={submit}>Создать заявку</button>
      </div>
    </div>
  )
}
