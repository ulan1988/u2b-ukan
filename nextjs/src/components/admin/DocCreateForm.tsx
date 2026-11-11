'use client'
import { useEffect, useMemo, useState } from 'react'
import ContragentPicker from '@/components/ContragentPicker'
import { COLORS } from '@/lib/colors'

import { fetchRefs, listProducts, autoPrices } from '@/lib/api/refs'
import { createPurchase, createSale } from '@/lib/api/docs'
import { matchWords } from '@/lib/search'
import StoreCatalog from '@/components/StoreCatalog'
import type { PickedPos } from '@/components/NomPicker'
import { itemName } from '@/lib/itemName'
import { extractRal } from '@/lib/ral'
import { isIzdelie } from '@/lib/lineAmount'

// Прямое создание накладной в разделе документов (без карточки-заявки).
// kind 'in' = приходная (createPurchase, контрагент = поставщик, цена по умолчанию = закуп),
// kind 'out' = расходная (createSale, контрагент = покупатель, цена по умолчанию = розница).
const norm = (x?: string | null) => (x || '').trim().toLowerCase().replace(/ё/g, 'е')

// amount — сумма строки. По умолчанию кол-во×цена, но её можно вписать РУКАМИ (накладная
// завода даётся суммами) — тогда цена пересчитывается обратно, а в документ уходит ровно
// эта сумма, до копейки. Деньги показываем и считаем с 2 знаками.
type Line = { productId: string; name: string; unit: string; qty: number; price: number; amount: number }

export default function DocCreateForm({ kind, orgId, onClose, onSaved }: {
  kind: 'in' | 'out'; orgId: string; onClose: () => void; onSaved: () => void
}) {
  const isIn = kind === 'in'
  const [contragents, setContragents] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [cagId, setCagId] = useState('')
  const [showCatalog, setShowCatalog] = useState(false)   // единый каталог (как у кассы)
  const [recId, setRecId] = useState('')          // получатель прихода (товар сразу уходит ему)
  const [recPrices, setRecPrices] = useState<Record<string, number>>({})   // его цены продажи
  const [whId, setWhId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<Line[]>([])
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetchRefs(orgId).then((r: any) => {
      setContragents(Array.isArray(r?.contragents) ? r.contragents : [])
      const whs = (Array.isArray(r?.warehouses) ? r.warehouses : []).filter((w: any) => w.orgId === orgId)
      setWarehouses(whs)
      const central = whs.find((w: any) => w.isCentral) || whs[0]
      if (central) setWhId(central.id)
    }).catch(() => {})
    listProducts(orgId).then((p: any) => setProducts(Array.isArray(p) ? p : [])).catch(() => {})
  }, [orgId])

  // Поставщик — мост на НАШУ другую орг (например филиал покупает у «Адал Строй 2»)?
  // Тогда цена прихода берётся из прайса ТОЙ орг (опт, иначе розница), а не из общего закупа:
  // по этой же цене пройдёт её зеркальная расходная, и обе книги сходятся.
  const cag = contragents.find((c: any) => c.id === cagId)
  const refOrg = (cag as any)?.orgRefId as string | undefined
  const [refPrices, setRefPrices] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!refOrg) { setRefPrices({}); return }
    listProducts(refOrg).then((ps: any) => {
      const m: Record<string, number> = {}
      for (const x of (Array.isArray(ps) ? ps : [])) { const v = Number(x.priceOpt) || Number(x.priceRetail) || 0; if (v > 0) m[x.id] = v }
      setRefPrices(m)
    }).catch(() => setRefPrices({}))
  }, [refOrg])

  const priceOf = (p: any) => isIn
    ? (refPrices[p.id] || Number(p.priceIn) || 0)
    : (Number(p.priceRetail) || Number(p.priceIn) || 0)

  // Сменили поставщика — пересчитываем цены уже набранных строк по его прайсу.
  useEffect(() => {
    setLines(ls => ls.map(l => { const pr = products.find((x: any) => x.id === l.productId); if (!pr) return l; const price = priceOf(pr); return { ...l, price, amount: Math.round((Number(l.qty) || 0) * price * 100) / 100 } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refPrices, cagId])

  // Цены ПОЛУЧАТЕЛЯ (спец/опт/розница — как при обычной продаже): показываем, на какую
  // сумму уйдёт отгрузка этой же датой. Пересчитываем при смене получателя и состава.
  useEffect(() => {
    const ids = lines.map(l => l.productId).filter(Boolean)
    if (!isIn || !recId || !ids.length) { setRecPrices({}); return }
    autoPrices(ids, recId).then((m: any) => setRecPrices(m && typeof m === 'object' ? m : {})).catch(() => setRecPrices({}))
  }, [isIn, recId, lines.map(l => l.productId).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const shipTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (recPrices[l.productId] || Number(l.price) || 0), 0)

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    // Поиск по СЛОВАМ: «евро 7024» находит «Евро брус МП RAL7024 0,4мм».
    return products.filter((p: any) => matchWords(q, p.name, p.alias)).slice(0, 30)
  }, [q, products])

  // Единый каталог магазина (StoreCatalog): тот же экран, что у кассы — папки, цвет, см,
  // кол-во. Возвращает выбранные позиции, кладём их строками накладной.
  function addFromCatalog(items: PickedPos[]) {
    const skipped: string[] = []
    setLines(ls => {
      const next = [...ls]
      for (const it of items) {
        const raw = it.name1c || it.oral || ''
        const nm = isIzdelie(raw) ? itemName({ name: raw, color: extractRal(raw), cm: it.widthCm != null ? String(it.widthCm) : '' }) : raw
        const prod = products.find((p: any) => norm(p.name) === norm(nm)) || ((it as any).productId ? products.find((p: any) => p.id === (it as any).productId) : null)
        if (!prod) { skipped.push(nm); continue }   // свободной строки в накладной нет — товар обязан быть в номенклатуре
        const i = next.findIndex(l => l.productId === prod.id)
        if (i >= 0) { const q = Number(next[i].qty) + Number(it.qty || 1); next[i] = { ...next[i], qty: q, amount: Math.round(q * Number(next[i].price) * 100) / 100 } }
        else { const q = Number(it.qty) || 1, pr = priceOf(prod); next.push({ productId: prod.id, name: prod.name, unit: prod.unit || it.unit || 'шт', qty: q, price: pr, amount: Math.round(q * pr * 100) / 100 }) }
      }
      return next
    })
    // Товара нет в номенклатуре — строку накладной из него не сделать (нужен product_id).
    // Молча не теряем: говорим, что именно не добавилось.
    setMsg(skipped.length ? `⚠ Нет в номенклатуре, не добавлено: ${skipped.join(', ')}` : '')
    setShowCatalog(false)
  }

  function addLine(p: any) {
    setLines(ls => ls.some(l => l.productId === p.id)
      ? ls.map(l => l.productId === p.id ? { ...l, qty: l.qty + 1, amount: Math.round((l.qty + 1) * l.price * 100) / 100 } : l)
      : [...ls, { productId: p.id, name: p.name, unit: p.unit || 'шт', qty: 1, price: priceOf(p), amount: Math.round(priceOf(p) * 100) / 100 }])
    setQ('')
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  const rr2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100
  // Меняем кол-во или цену — сумма пересчитывается. Вписали СУММУ — обратно считаем цену
  // (сумма ÷ кол-во), а в документ уходит именно вписанная сумма, до копейки.
  const setQty = (i: number, qty: number) => setLines(ls => ls.map((l, j) => j === i ? { ...l, qty, amount: rr2(qty * Number(l.price)) } : l))
  const setPrice = (i: number, price: number) => setLines(ls => ls.map((l, j) => j === i ? { ...l, price, amount: rr2(Number(l.qty) * price) } : l))
  const setAmount = (i: number, amount: number) => setLines(ls => ls.map((l, j) => j === i ? { ...l, amount: rr2(amount), price: Number(l.qty) > 0 ? rr2(amount / Number(l.qty)) : l.price } : l))
  const delLine = (i: number) => setLines(ls => ls.filter((_, j) => j !== i))

  const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100
  const amountOf = (l: Line) => (l.amount != null ? Number(l.amount) : r2((Number(l.qty) || 0) * (Number(l.price) || 0)))
  const total = r2(lines.reduce((s, l) => s + amountOf(l), 0))
  // Деньги в форме — всегда с двумя знаками, как в накладной завода (ххх,00).
  const m2 = (v: number) => (Number(v) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  async function submit() {
    setMsg('')
    if (!cagId) { setMsg('⚠ Выберите контрагента'); return }
    if (!whId) { setMsg('⚠ Нет склада'); return }
    const good = lines.filter(l => (Number(l.qty) || 0) > 0)
    if (!good.length) { setMsg('⚠ Добавьте хотя бы одну позицию'); return }
    setSaving(true)
    const body: any = { orgId, contragentId: cagId, warehouseId: whId, date, lines: good.map(l => ({ productId: l.productId, qty: Number(l.qty), price: Number(l.price) || 0, amount: amountOf(l) })) }
    if (isIn && recId) body.recipientId = recId   // приход сразу уходит получателю (расходная той же датой)
    const r: any = isIn ? await createPurchase(body) : await createSale(body)
    setSaving(false)
    if (r?.error || r?.ok === false) { setMsg('⚠ ' + (r.error || 'Ошибка сохранения')); return }
    onSaved(); onClose()
  }

  const title = isIn ? 'Новая приходная накладная' : 'Новая расходная накладная'
  const cagLabel = isIn ? 'Поставщик' : 'Покупатель'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '4vh 16px', zIndex: 1000, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{title}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer', color: '#999' }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>{cagLabel}</div>
              <ContragentPicker contragents={contragents} value={cagId} onPick={(c: any) => setCagId(c?.id || '')} placeholder={`— выберите (${cagLabel.toLowerCase()}) —`} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Склад</div>
                <select value={whId} onChange={e => setWhId(e.target.value)} style={inp}>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div style={{ width: 150 }}>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Дата</div>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
              </div>
            </div>
          </div>

          {/* ПОЛУЧАТЕЛЬ прихода: товар не лежит на складе — этой же датой уходит ему
              расходной по ЕГО цене (спец/опт/розница). Филиалу его приходная придёт зеркалом. */}
          {isIn && (
            <div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Получатель <span style={{ color: '#a09889' }}>(необязательно — товар сразу уйдёт ему этой же датой)</span></div>
              <ContragentPicker contragents={contragents.filter((c: any) => c.id !== cagId)} value={recId} onPick={(c: any) => setRecId(c?.id || '')} placeholder="— остаётся на складе —" />
              {recId && (
                <div style={{ marginTop: 6, fontSize: 12.5, color: '#2e8a5e', background: '#f2fbf6', border: '1px solid #cfe6d8', borderRadius: 8, padding: '7px 10px' }}>
                  📦 После проведения: приход на склад → расходная на «{contragents.find((c: any) => c.id === recId)?.name}» той же датой
                  {shipTotal > 0 ? ` на ${m2(shipTotal)} ₸ (его цены)` : ''}
                  {(contragents.find((c: any) => c.id === recId) as any)?.orgRefId ? ' → у него приходная тем же днём' : ''}
                </div>
              )}
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Добавить товар{isIn && refOrg && cag ? ` · цены от «${cag.name}»` : ''}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 поиск по словам: «евро 7024»…" style={{ ...inp, flex: 1 }} />
              {/* Тот же каталог, что у кассы магазина: папки → цвет → см → кол-во. */}
              <button onClick={() => setShowCatalog(true)} style={{ border: 'none', borderRadius: 10, padding: '0 16px', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>📖 Каталог</button>
            </div>
            {showCatalog && <StoreCatalog orgId={orgId} onPick={addFromCatalog} onClose={() => setShowCatalog(false)} />}
            {hits.length > 0 && (
              <div style={{ marginTop: 4, border: '1px solid #e6e2dc', borderRadius: 10, maxHeight: 240, overflowY: 'auto', background: '#fff' }}>
                {hits.map(p => (
                  <div key={p.id} onClick={() => addLine(p)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f1ee', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{p.name}</span>
                    <span style={{ color: COLORS.textMuted, fontSize: 12, whiteSpace: 'nowrap' }}>{m2(priceOf(p))} ₸</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div style={{ border: '1px solid #e6e2dc', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#faf8f6', color: COLORS.textMuted, fontSize: 11 }}>
                  {['Товар', 'Кол-во', 'Цена', 'Сумма', ''].map((h, i) => <th key={h || i} style={{ textAlign: i === 0 ? 'left' : i === 4 ? 'center' : 'right', padding: '8px 12px' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.productId} style={{ borderTop: '1px solid #f1efec' }}>
                      <td style={{ padding: '6px 12px' }}>{l.name}<span style={{ color: COLORS.textMuted }}> · {l.unit}</span></td>
                      <td style={{ padding: '6px 12px', textAlign: 'right' }}><NumCell value={l.qty} onChange={n => setQty(i, n)} decimals={0} col="qty" row={i} /></td>
                      <td style={{ padding: '6px 12px', textAlign: 'right' }}><NumCell value={l.price} onChange={n => setPrice(i, n)} decimals={2} width={100} col="price" row={i} /></td>
                      {/* СУММУ вписываем сами (как в накладной завода) — цена считается обратно. */}
                      <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                        <NumCell value={amountOf(l)} onChange={n => setAmount(i, n)} decimals={2} width={120} bold col="amount" row={i}
                          title="Сумма строки из накладной поставщика — цена пересчитается сама" />
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'center' }}><button onClick={() => delLine(i)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#b03020' }}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ borderTop: '2px solid #e6e2dc', background: '#faf8f6' }}>
                  <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Итого</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{m2(total)} ₸</td>
                  <td></td>
                </tr></tfoot>
              </table>
            </div>
          )}

          {msg && <div style={{ fontSize: 13, color: msg.startsWith('⚠') ? '#b03020' : COLORS.text }}>{msg}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={onClose} style={{ ...btn, background: '#f1efec', color: COLORS.text }}>Отмена</button>
            <button onClick={submit} disabled={saving} style={{ ...btn, background: COLORS.primary, color: '#fff', opacity: saving ? .6 : 1 }}>{saving ? 'Сохранение…' : (isIn ? 'Создать приход' : 'Создать расход')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Числовая ячейка накладной. type=text (а не number) — НЕТ стрелок-степпера; деньги
// показываем читаемо «681 148,51», пока не правишь (в фокусе — голое число, чтобы каретка
// не прыгала). Между ячейками СТОЛБЦА ходим стрелками ↑/↓ и Enter (как в каталоге).
function NumCell({ value, onChange, decimals, width, bold, col, row, title }: {
  value: number; onChange: (n: number) => void; decimals: number
  width?: number; bold?: boolean; col: string; row: number; title?: string
}) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  const fmt = (v: number) => (Number(v) || 0).toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals === 0 ? 3 : decimals })
  const shown = focused ? draft : (value ? fmt(value) : '')
  function key(e: React.KeyboardEvent<HTMLInputElement>) {
    const k = e.key
    if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'Enter') return
    e.preventDefault()
    const dir = k === 'ArrowUp' ? -1 : 1
    const next = document.querySelector<HTMLInputElement>(`input[data-col="${col}"][data-row="${row + dir}"]`)
    if (next) { next.focus(); next.select() }
  }
  return (
    <input type="text" inputMode="decimal" data-col={col} data-row={row} value={shown} placeholder="0" title={title}
      onFocus={e => { setFocused(true); setDraft(value ? String(value).replace('.', ',') : ''); e.currentTarget.select() }}
      onBlur={() => setFocused(false)}
      onKeyDown={key}
      onChange={e => { const t = e.target.value.replace(/[^0-9.,]/g, ''); setDraft(t); onChange(Number(t.replace(/\s/g, '').replace(',', '.')) || 0) }}
      style={{ ...numInp, ...(width ? { width } : {}), ...(bold ? { fontWeight: 700 } : {}) }} />
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #e6e2dc', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }
const numInp: React.CSSProperties = { width: 70, padding: '4px 6px', border: '1px solid #e6e2dc', borderRadius: 6, fontSize: 13, textAlign: 'right' }
const btn: React.CSSProperties = { padding: '9px 18px', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
