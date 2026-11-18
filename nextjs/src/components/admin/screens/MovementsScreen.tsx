'use client'
// «Документ движений» — одна страница-воронка: сверху заказы клиентов, ниже заказы
// поставщикам, ниже приходные и расходные. Документ спускается полосой ниже по мере
// обработки. Экран ТОЛЬКО ПОКАЗЫВАЕТ: ни одного нового документа и движения склада он
// не создаёт, журналы «Приходные/Расходные накладные» остаются на месте.
// Открытое видно всегда, закрытое — за выбранный день (правило владельца 18.11.2026).
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { movementBoard } from '@/lib/api/docs'
import { today } from '@/lib/num'
import { matchWords } from '@/lib/search'
import InvoiceForm from '@/components/admin/InvoiceForm'

const m0 = (n: number) => Math.round(Number(n) || 0).toLocaleString('ru-RU')

const BANDS = [
  { key: 'orders', n: 1, label: 'ЗАКАЗЫ', hint: 'магазин · кабинет · интернет · филиал', bg: '#faece7', fg: '#993c1d', line: '#f0997b' },
  { key: 'supplierOrders', n: 2, label: 'ЗАКАЗЫ ПОСТАВЩИКАМ', hint: 'склад и деньги не двигает', bg: '#eeedfe', fg: '#3c3489', line: '#afa9ec' },
  { key: 'purchases', n: 3, label: 'ПРИХОДНЫЕ', hint: 'склад плюс', bg: '#e6f1fb', fg: '#0c447c', line: '#85b7eb' },
  { key: 'sales', n: 4, label: 'РАСХОДНЫЕ', hint: 'склад минус, долг', bg: '#e1f5ee', fg: '#0f6e56', line: '#5dcaa5' },
] as const

const STEP_NOTE: Record<string, string> = {
  orders: 'админ: чем обеспечить — закупом или со склада',
  supplierOrders: 'админ: принял товар — приходная',
  purchases: 'логист: доставил — расходная и долг',
}

export default function MovementsScreen({ orgId, onOpenCard }: { orgId: string; onOpenCard?: (id: string) => void }) {
  const [day, setDay] = useState(today())
  const [data, setData] = useState<any>(null)
  const [q, setQ] = useState('')
  const [docId, setDocId] = useState<string | null>(null)

  const load = () => movementBoard(orgId, day).then(setData)
  useEffect(() => { load() }, [orgId, day]) // eslint-disable-line

  const rows = (key: string): any[] => {
    const list: any[] = (data?.[key] || [])
    return q.trim() ? list.filter(r => matchWords(q, r.number, r.title, r.root, r.state)) : list
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Документ движений</div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 2 }}>
            Новое падает сверху, обработанное спускается ниже. Открытое видно всегда, закрытое — за выбранный день.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 поиск по словам: «улыкбек 0021»…"
            style={{ padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontSize: 13.5, fontFamily: 'inherit', width: 260, background: '#fff' }} />
          <button onClick={() => setDay(today())} style={{ padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Сегодня</button>
          <input type="date" value={day} onChange={e => setDay(e.target.value || today())}
            style={{ padding: '7px 10px', borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontSize: 13.5, fontFamily: 'inherit', background: '#fff' }} />
        </div>
      </div>

      {!data ? <div style={{ color: COLORS.textMuted, fontSize: 14, padding: 20 }}>Загрузка…</div> : (
        <div style={{ marginTop: 14 }}>
          {BANDS.map((b, i) => {
            const list = rows(b.key)
            const openCnt = list.filter(r => r.open).length
            return (
              <div key={b.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: b.fg, background: b.bg, borderRadius: 8, padding: '4px 11px' }}>
                    {b.n} · {b.label} · {list.length}
                  </span>
                  {openCnt > 0 && <span style={{ fontSize: 12, color: COLORS.textMuted }}>открытых {openCnt}</span>}
                  <span style={{ fontSize: 12, color: '#b3aca3' }}>{b.hint}</span>
                </div>

                {list.length === 0
                  ? <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1.5px #e6e2dc', padding: '14px 16px', color: COLORS.textMuted, fontSize: 13 }}>Пусто</div>
                  : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 10 }}>
                      {list.map(r => (
                        <div key={r.id} onClick={() => (b.key === 'orders' || b.key === 'supplierOrders') ? onOpenCard?.(r.id) : setDocId(r.id)}
                          title={r.root ? `основание ${r.root}` : ''}
                          style={{ background: '#fff', borderRadius: 11, cursor: 'pointer', padding: '10px 12px', borderLeft: `3px solid ${r.open ? b.line : '#e6e2dc'}`, boxShadow: '0 0 0 1.5px #e6e2dc' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                            <span style={{ fontFamily: 'Consolas, monospace', fontSize: 12.5, color: b.fg }}>{r.number}</span>
                            {/* Цену в заявке часто ставят позже — пустую сумму не показываем нулём. */}
                            <span style={{ fontSize: 13, fontWeight: 700, color: r.sum > 0 ? COLORS.text : '#b3aca3' }}>{r.sum > 0 ? `${m0(r.sum)} ₸` : 'без цены'}</span>
                          </div>
                          <div style={{ fontSize: 13.5, marginTop: 2 }}>{r.title}</div>
                          <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {r.who && <span>{r.who}</span>}
                            {r.positions ? <span>· {r.positions} поз.</span> : null}
                            <span style={{ color: r.open ? b.fg : '#b3aca3' }}>· {r.state}</span>
                            {r.date && <span>· {r.date.slice(8, 10)}.{r.date.slice(5, 7)}</span>}
                          </div>
                          {r.root && r.root !== r.number && (
                            <div style={{ fontSize: 11.5, color: '#8a837b', marginTop: 4 }}>
                              основание <span style={{ fontFamily: 'Consolas, monospace' }}>{r.root}</span>{r.rootMore ? ` +${r.rootMore}` : ''}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                {i < BANDS.length - 1 && (
                  <div style={{ textAlign: 'center', color: '#b3aca3', fontSize: 12, padding: '10px 0' }}>
                    ↓ {STEP_NOTE[b.key]}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {docId && <InvoiceForm id={docId} onClose={() => setDocId(null)} onSaved={() => { setDocId(null); load() }} />}
    </div>
  )
}
