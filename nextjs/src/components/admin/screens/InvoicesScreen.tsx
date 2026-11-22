'use client'
import { useEffect, useState, useCallback } from 'react'
import OrderCard from '@/components/admin/OrderCard'
import InvoiceForm from '@/components/admin/InvoiceForm'

import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDMY, ymdKey } from '@/lib/adminFmt'
import { postInvoice } from '@/lib/adminApi'
import { useLiveData } from '@/lib/live'

// kind: 'in' = приходные (закуп/возврат), 'out' = расходные (продажа).
// Готовит карточки с экрана «К учёту» и превращает их в ERP-документы.
export default function InvoicesScreen({ kind, orders, orgId, onReload, onOpen }: {
  kind: 'in' | 'out'; orders: any[]; orgId: string; onReload: () => void; onOpen?: (o: any) => void
}) {
  const [docs, setDocs] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [openDocId, setOpenDocId] = useState<string | null>(null)
  // Выделенная строка: с неё делаем копию («+» = та же шапка) или «на основании» (+ строки).
  const [picked, setPicked] = useState<string | null>(null)
  const [copyFrom, setCopyFrom] = useState<{ id: string; lines: boolean } | null>(null)
  // «Продать этот приход»: новая расходная с теми же товарами, покупателя выбираем сами.
  const [sellFrom, setSellFrom] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // Фильтры проведённых накладных: по дате (с/по), поставщику и заказчику/покупателю.
  const [dFrom, setDFrom] = useState('')
  const [dTo, setDTo] = useState('')
  const [fSup, setFSup] = useState('')     // поставщик
  const [fParty, setFParty] = useState('') // заказчик (приход) / покупатель (расход)

  const wantKind = kind === 'in' ? 'purchase' : 'sale'
  const title = kind === 'in' ? 'Приходные накладные' : 'Расходные накладные'
  const endpoint = kind === 'in' ? '/api/documents' : '/api/sales'

  const loadDocs = useCallback(() => {
    fetch(`${endpoint}?orgId=${orgId}`).then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : [])).catch(() => {})
  }, [endpoint, orgId])
  // Живое обновление, как в Приёмке: сигнал об изменении (Pusher) + возврат на вкладку + редкая страховка.
  // Раньше список грузился один раз — новую накладную было видно только после ручного обновления страницы.
  useLiveData(loadDocs, [loadDocs])

  // Карточки «К учёту» нужного типа, ещё не проведённые в накладную.
  const pending = orders.filter(o => o.screen === 'accounting' && !o.isCancelled && o.kind === wantKind && !o.linkedDocId)

  // Поставщик и вторая сторона по типу накладной (приход: заказчик; расход: покупатель).
  const supplierOf = (d: any) => (kind === 'in' ? d.contragent : (d as any).supplier) || ''
  const partyOf = (d: any) => (kind === 'in' ? d.customer : d.contragent) || ''
  const partyLabel = kind === 'in' ? 'Заказчик' : 'Покупатель'
  // В накладной поставщиков может быть НЕСКОЛЬКО (строки от разных) — поле приходит склейкой
  // «А, Б, В». В фильтре нужен список отдельных имён, иначе в выпадашке висят все комбинации.
  const namesOf = (v: string) => String(v || '').split(',').map(x => x.trim()).filter(Boolean)
  const uniqNames = (vals: string[]) => Array.from(new Set(vals.flatMap(namesOf))).sort((a, b) => a.localeCompare(b, 'ru'))
  const suppliers = uniqNames(docs.map(supplierOf))
  const parties = uniqNames(docs.map(partyOf))
  const filteredDocs = docs.filter(d => {
    const k = ymdKey(d.date)
    // Выбрали только «с» → показываем ЭТОТ ДЕНЬ; добавили «по» → промежуток.
    const upTo = dTo || dFrom
    if (dFrom && k && k < dFrom) return false
    if (upTo && k && k > upTo) return false
    // Подходит, если выбранное имя есть СРЕДИ поставщиков/покупателей накладной.
    if (fSup && !namesOf(supplierOf(d)).includes(fSup)) return false
    if (fParty && !namesOf(partyOf(d)).includes(fParty)) return false
    return true
  })
  const hasFilter = !!(dFrom || dTo || fSup || fParty)
  const clearFilters = () => { setDFrom(''); setDTo(''); setFSup(''); setFParty('') }

  async function post(id: string) {
    setMsg('')
    const r = await postInvoice(id)
    if (!r.ok) { setMsg('⚠ ' + (r.error || 'Ошибка')); return }
    setMsg(`✅ Накладная ${r.number} проведена`)
    onReload(); loadDocs()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>{title}</div>
        {/* Выделили строку мышкой → делаем новую накладную с той же шапкой («копия»)
            или вместе со строками («на основании»), как в 1С. */}
        <button onClick={() => picked && setCopyFrom({ id: picked, lines: false })} disabled={!picked}
          title={picked ? 'Новая накладная с тем же поставщиком и складом' : 'Выделите строку в списке'}
          style={{ padding: '8px 14px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, background: picked ? COLORS.white : '#f7f5f2', color: picked ? COLORS.text : '#b3aca3', fontSize: 13.5, fontWeight: 600, cursor: picked ? 'pointer' : 'default', fontFamily: 'inherit' }}>⧉ Копия</button>
        <button onClick={() => picked && setCopyFrom({ id: picked, lines: true })} disabled={!picked}
          title={picked ? 'Новая накладная с той же шапкой И строками' : 'Выделите строку в списке'}
          style={{ padding: '8px 14px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, background: picked ? COLORS.white : '#f7f5f2', color: picked ? COLORS.text : '#b3aca3', fontSize: 13.5, fontWeight: 600, cursor: picked ? 'pointer' : 'default', fontFamily: 'inherit' }}>📄 На основании</button>
        {kind === 'in' && <button onClick={() => picked && setSellFrom(picked)} disabled={!picked}
          title={picked ? 'Создать расходную с товаром этого прихода — продать его дальше' : 'Выделите приходную в списке'}
          style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: picked ? '#2e8a5e' : '#cfe0d6', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: picked ? 'pointer' : 'default', fontFamily: 'inherit' }}>➡ Продать</button>}
        <button onClick={() => setCreating(true)} style={{ padding: '8px 16px', border: 'none', borderRadius: 9, background: COLORS.primary, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          + Создать {kind === 'in' ? 'приход' : 'расход'}
        </button>
      </div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 16 }}>
        Из экрана «К учёту»: {kind === 'in' ? 'закуп (ЗП) и возвраты → приход на склад' : 'продажи → списание со склада'}. Либо «+ Создать» — накладная напрямую.
      </div>
      {msg && <div style={{ fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>К ПРОВЕДЕНИЮ ({pending.length})</div>
      {pending.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc', color: COLORS.textMuted, fontSize: 14, marginBottom: 20 }}>Нет карточек к проведению</div>
        : <div style={{ marginBottom: 20 }}>{pending.map(o => (
          <OrderCard key={o.id} order={o} onOpen={onOpen} onAction={(id) => post(id)}
            actions={[{ action: 'invoice', label: kind === 'in' ? 'Провести приход' : 'Провести расход', variant: 'primary' }]} />
        ))}</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>ПРОВЕДЁННЫЕ НАКЛАДНЫЕ ({filteredDocs.length}{hasFilter ? ` из ${docs.length}` : ''})</div>

      {/* Фильтр: дата (с/по) · поставщик · заказчик/покупатель — тот же порядок на приходе и расходе */}
      {docs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', padding: '10px 14px', marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#5f5952', display: 'flex', flexDirection: 'column', gap: 3 }}>Дата с
            <input type="date" value={dFrom} max={dTo || undefined} onChange={e => setDFrom(e.target.value)} style={fInp} /></label>
          <label style={{ fontSize: 11, color: '#5f5952', display: 'flex', flexDirection: 'column', gap: 3 }}>по
            <input type="date" value={dTo} min={dFrom || undefined} onChange={e => setDTo(e.target.value)} style={fInp} /></label>
          <label style={{ fontSize: 11, color: '#5f5952', display: 'flex', flexDirection: 'column', gap: 3 }}>Поставщик
            <select value={fSup} onChange={e => setFSup(e.target.value)} style={{ ...fInp, minWidth: 180 }}>
              <option value="">— все —</option>
              {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select></label>
          <label style={{ fontSize: 11, color: '#5f5952', display: 'flex', flexDirection: 'column', gap: 3 }}>{partyLabel}
            <select value={fParty} onChange={e => setFParty(e.target.value)} style={{ ...fInp, minWidth: 180 }}>
              <option value="">— все —</option>
              {parties.map(s => <option key={s} value={s}>{s}</option>)}
            </select></label>
          {hasFilter && <button onClick={clearFilters} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#5f5952' }}>✕ Сбросить</button>}
        </div>
      )}

      {docs.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14, padding: 12 }}>Пока нет</div>
        : filteredDocs.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc', color: COLORS.textMuted, fontSize: 14 }}>По фильтру ничего не найдено. <button onClick={clearFilters} style={{ border: 'none', background: 'none', color: COLORS.primary, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, textDecoration: 'underline', padding: 0 }}>Сбросить</button></div>
        : (
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              {/* Расход: движение трёхстороннее — «Накладная на» (на кого выписана),
                  «Заказчик» (кому товар) и «Поставщик» (от кого он для заказчика). */}
              <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{(kind === 'in' ? ['Номер', 'Дата', 'Поставщик', 'Заказчик', 'Сумма', 'Статус'] : ['Номер', 'Дата', 'Накладная на', 'Заказчик', 'Поставщик', 'Себест.', 'Сумма', 'Статус']).map((h, i) => <th key={h} style={{ textAlign: (kind === 'in' ? i >= 4 : i >= 5) ? 'right' : 'left', padding: '8px 16px' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredDocs.map(d => {
                  const notReviewed = d.status !== 'cancelled' && !d.reviewed
                  // В накладной есть строки без цены (сумма 0): себестоимость по этому товару
                  // посчитать нечем — прибыль магазина по нему выходит завышенной.
                  const noPrice = d.status !== 'cancelled' && Number((d as any).noPrice || 0) > 0
                  return (
                  <tr key={d.id} onClick={() => setPicked(p => p === d.id ? null : d.id)} onDoubleClick={() => setOpenDocId(d.id)}
                    style={{ borderTop: '1px solid #f1efec', cursor: 'pointer', outline: picked === d.id ? `2px solid ${COLORS.primary}` : 'none', outlineOffset: '-2px', background: picked === d.id ? '#eef5ff' : noPrice ? '#fdeeea' : d.transit ? '#fff4ea' : notReviewed ? '#fff8e1' : 'transparent' }} title={noPrice ? 'В накладной есть строки без цены — впишите цену, иначе себестоимость и прибыль считаются неверно' : d.transit ? 'Сквозная — товар мимо склада' : notReviewed ? 'Не проверено — откройте и проверьте цены/кол-во' : ''}>
                    <td onClick={e => { e.stopPropagation(); setOpenDocId(d.id) }} title="Открыть накладную (по строке — выделить)" style={{ padding: '8px 16px', fontWeight: 600, color: COLORS.primary, textDecoration: 'underline' }}>{d.number} {d.transit && <span style={{ fontSize: 11, fontWeight: 700, color: '#c2570f', background: '#ffe8d6', padding: '1px 7px', borderRadius: 20 }}>🔀 сквозная</span>}
                      {noPrice && <span title={`${(d as any).noPrice} строк(и) без цены — откройте и впишите`} style={{ fontSize: 11, fontWeight: 800, color: '#b03020', background: '#ffe3dc', padding: '1px 7px', borderRadius: 20, marginLeft: 4, whiteSpace: 'nowrap' }}>⚠ без цены · {(d as any).noPrice}</span>}</td>
                    <td style={{ padding: '8px 16px', color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{fmtDMY(d.date)}</td>
                    <td style={{ padding: '8px 16px' }} title={kind === 'out' ? 'На кого выписана накладная: клиент (продали сами) или мост головного (в долг к нему)' : undefined}>{d.contragent || '—'}</td>
                    {kind === 'out' && <td style={{ padding: '8px 16px' }} title="Заказчик: кому назначен товар">{d.customer || d.contragent || '—'}</td>}
                    {/* Приход: заказчик (для кого закупали). Расход: поставщик (у кого этот товар куплен). */}
                    <td style={{ padding: '8px 16px' }} title={kind === 'in' ? 'Заказчик (конечный клиент) из карточки-основания — для кого / на кого долг' : 'Поставщик для заказчика: головной, если продано в долг к нему, иначе сам филиал'}>{(kind === 'in' ? d.customer : (d as any).supplier) || '—'}</td>
                    {kind === 'out' && <td style={{ padding: '8px 16px', textAlign: 'right', color: COLORS.textMuted }} title="Себестоимость = Σ(кол-во × приходная цена)">{fmtMoney(Number(d.cost || 0))} ₸</td>}
                    <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(Number(d.total))} ₸</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {d.status === 'cancelled' ? <span style={{ color: '#b03020' }}>отменён</span>
                        : notReviewed ? <span style={{ color: '#8a6f00', fontWeight: 700 }}>⚠ не проверено</span>
                        : <span style={{ color: '#2e8a5e' }}>✓ проверено</span>}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}

      {openDocId && <InvoiceForm id={openDocId} onClose={() => setOpenDocId(null)} onSaved={loadDocs} />}
      {creating && <InvoiceForm createKind={kind === 'in' ? 'purchase' : 'sale'} orgId={orgId} onClose={() => setCreating(false)} onSaved={() => { loadDocs(); setMsg('✅ Накладная создана') }} />}
      {sellFrom && <InvoiceForm createKind="sale" orgId={orgId} fromId={sellFrom} linesOnly
        onClose={() => setSellFrom(null)} onSaved={() => { setSellFrom(null); loadDocs(); setMsg('✅ Расходная создана на основании прихода') }} />}
      {copyFrom && <InvoiceForm createKind={kind === 'in' ? 'purchase' : 'sale'} orgId={orgId} fromId={copyFrom.id} withLines={copyFrom.lines}
        onClose={() => setCopyFrom(null)} onSaved={() => { setCopyFrom(null); loadDocs(); setMsg(copyFrom.lines ? '✅ Накладная создана на основании' : '✅ Копия создана') }} />}
    </div>
  )
}

const fInp: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: '#26231f', outline: 'none', boxSizing: 'border-box' }
