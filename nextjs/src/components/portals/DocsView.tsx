'use client'
// Просмотр документов филиала (кабинет): приходные / расходные / производство — список + карточка
// документа (шапка + строки). Read-only, как у головного. Данные — общие /api/documents,/api/sales,/api/production.
import { useState, useEffect, useCallback } from 'react'
import { listPurchases, listSales, listProduction, getDocument } from '@/lib/api/docs'
import { RalDot, extractRal } from '@/lib/ral'

const m = (n: any) => Math.round(Number(n) || 0).toLocaleString('ru-RU')
const fmtDate = (s: any) => { try { return new Date(s).toLocaleDateString('ru-RU') } catch { return s } }
const KINDS = [
  { k: 'in', label: '📥 Приходные', color: '#2e8a5e' },
  { k: 'out', label: '📤 Расходные', color: '#c0532a' },
  { k: 'prod', label: '🏭 Производство', color: '#7a3aaa' },
] as const

function DocDetail({ data, onClose }: { data: any; onClose: () => void }) {
  const d = data?.doc || {}
  const lines = data?.lines || []
  const total = lines.reduce((s: number, l: any) => s + Number(l.amount || Number(l.qty) * Number(l.price) || 0), 0)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.5)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 460, maxHeight: '92vh', borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1efec', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15 }}>{d.number}</div>
            <div style={{ fontSize: 12, color: '#837c72' }}>{fmtDate(d.date)}{data?.contragent?.name ? ` · ${data.contragent.name}` : ''}{data?.warehouse?.name ? ` · ${data.warehouse.name}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1efec', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 15, color: '#5f5952' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '10px 16px' }}>
          {lines.length === 0 ? <div style={{ color: '#837c72', fontSize: 14, padding: 8 }}>Нет строк</div>
            : lines.map((l: any, i: number) => {
              const nm = l.name || l.productName || l.product || '—'
              return (
                <div key={l.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid #f6f3f0' }}>
                  <RalDot code={extractRal(nm)} size={14} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{nm}</span>
                  <span style={{ fontSize: 12, color: '#5f5952', whiteSpace: 'nowrap' }}>{m(l.qty)} {l.unit || 'шт'} × {m(l.price)}</span>
                  <b style={{ fontSize: 13, whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' }}>{m(l.amount || Number(l.qty) * Number(l.price))}</b>
                </div>
              )
            })}
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f1efec', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#5f5952' }}>{lines.length} строк</span>
          <b style={{ marginLeft: 'auto', fontSize: 17 }}>{m(d.total || total)} ₸</b>
        </div>
      </div>
    </div>
  )
}

export default function DocsView({ orgId }: { orgId: string }) {
  const [kind, setKind] = useState<'in' | 'out' | 'prod'>('in')
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<any>(null)
  const load = useCallback(async () => {
    setLoading(true)
    const fn = kind === 'in' ? listPurchases : kind === 'out' ? listSales : listProduction
    try { setDocs(await fn(orgId) as any) } catch { setDocs([]) }
    setLoading(false)
  }, [kind, orgId])
  useEffect(() => { load() }, [load])
  async function openDoc(id: string) { try { setOpen(await getDocument(id)) } catch {} }

  return (
    <div className="anim-fade">
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>📄 Документы</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {KINDS.map(x => <button key={x.k} onClick={() => setKind(x.k)} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', background: kind === x.k ? x.color : '#fff', color: kind === x.k ? '#fff' : '#5f5952', boxShadow: kind === x.k ? 'none' : '0 0 0 1px #e6e2dc' }}>{x.label}</button>)}
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#5f5952' }}>Загрузка…</div>
        : docs.length === 0 ? <div style={{ background: '#fff', borderRadius: 12, padding: 28, textAlign: 'center', color: '#5f5952', boxShadow: '0 0 0 1px #e6e2dc' }}>Нет документов</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{docs.map((d: any) => (
            <button key={d.id} onClick={() => openDoc(d.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 10, padding: '11px 13px', boxShadow: '0 0 0 1px #e6e2dc', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', border: 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{d.number}</div>
                <div style={{ fontSize: 12, color: '#837c72', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtDate(d.date)}{d.contragent ? ` · ${d.contragent}` : ''}{d.items ? ` · ${d.items}` : ''}</div>
              </div>
              <b style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{m(d.total)} ₸</b>
            </button>
          ))}</div>}
      {open && <DocDetail data={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
