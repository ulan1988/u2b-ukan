'use client'
import { useEffect, useState, useCallback } from 'react'
import OrderCard from '@/components/admin/OrderCard'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDate } from '@/lib/adminFmt'
import { postInvoice } from '@/lib/adminApi'

// kind: 'in' = приходные (закуп/возврат), 'out' = расходные (продажа).
// Готовит карточки с экрана «К учёту» и превращает их в ERP-документы.
export default function InvoicesScreen({ kind, orders, orgId, onReload, onOpen }: {
  kind: 'in' | 'out'; orders: any[]; orgId: string; onReload: () => void; onOpen?: (o: any) => void
}) {
  const [docs, setDocs] = useState<any[]>([])
  const [msg, setMsg] = useState('')

  const wantKind = kind === 'in' ? 'purchase' : 'sale'
  const title = kind === 'in' ? 'Приходные накладные' : 'Расходные накладные'
  const endpoint = kind === 'in' ? '/api/documents' : '/api/sales'

  const loadDocs = useCallback(() => {
    fetch(`${endpoint}?orgId=${orgId}`).then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : [])).catch(() => {})
  }, [endpoint, orgId])
  useEffect(() => { loadDocs() }, [loadDocs])

  // Карточки «К учёту» нужного типа, ещё не проведённые в накладную.
  const pending = orders.filter(o => o.screen === 'accounting' && !o.isCancelled && o.kind === wantKind && !o.linkedDocId)

  async function post(id: string) {
    setMsg('')
    const r = await postInvoice(id)
    if (!r.ok) { setMsg('⚠ ' + (r.error || 'Ошибка')); return }
    setMsg(`✅ Накладная ${r.number} проведена`)
    onReload(); loadDocs()
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 16 }}>
        Из экрана «К учёту»: {kind === 'in' ? 'закуп (ЗП) и возвраты → приход на склад' : 'продажи → списание со склада'}.
      </div>
      {msg && <div style={{ fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>К ПРОВЕДЕНИЮ ({pending.length})</div>
      {pending.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 0 0 1.5px #e6e2dc', color: COLORS.textMuted, fontSize: 14, marginBottom: 20 }}>Нет карточек к проведению</div>
        : <div style={{ marginBottom: 20 }}>{pending.map(o => (
          <OrderCard key={o.id} order={o} onOpen={onOpen} onAction={(id) => post(id)}
            actions={[{ action: 'invoice', label: kind === 'in' ? 'Провести приход' : 'Провести расход', variant: 'primary' }]} />
        ))}</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 8 }}>ПРОВЕДЁННЫЕ НАКЛАДНЫЕ ({docs.length})</div>
      {docs.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 14, padding: 12 }}>Пока нет</div>
        : (
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ color: COLORS.textMuted, fontSize: 11, background: '#faf8f6' }}>{['Номер', 'Дата', 'Сумма', 'Статус'].map((h, i) => <th key={h} style={{ textAlign: i >= 2 ? 'right' : 'left', padding: '8px 16px' }}>{h}</th>)}</tr></thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id} style={{ borderTop: '1px solid #f1efec' }}>
                    <td style={{ padding: '8px 16px', fontWeight: 600 }}>{d.number}</td>
                    <td style={{ padding: '8px 16px', color: COLORS.textMuted }}>{fmtDate(d.date)}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(Number(d.total))} ₸</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', color: d.status === 'cancelled' ? '#b03020' : '#2e8a5e' }}>{d.status === 'cancelled' ? 'отменён' : 'проведён'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
