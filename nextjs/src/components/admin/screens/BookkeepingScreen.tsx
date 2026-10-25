'use client'
// Бухгалтерия — печатные документы (перенос из u2b-vertex-erp): счёт на оплату, накладная З-2, акт Р-1, КП.
// Создание из номенклатуры/контрагентов, выгрузка в Excel и Word, реквизиты организации (банки, печать, подпись, ГОСТ-шаблоны).
import { useCallback, useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { useLiveData } from '@/lib/live'
import { fmtDate } from '@/lib/adminFmt'
import { accDocsList, accDocDelete, accDocFileUrl } from '@/lib/api/accDocs'
import { useAdmin } from '@/components/admin/AdminChrome'
import DocCreateModal, { DOC_TYPES } from '@/components/admin/accDocs/DocCreateModal'
import OrgSettingsModal from '@/components/admin/accDocs/OrgSettingsModal'
import InvoicePicker from '@/components/admin/accDocs/InvoicePicker'
import DocPreviewModal from '@/components/admin/accDocs/DocPreview'

const TLABEL: Record<string, string> = { invoice: '🧾 Счёт', nakladnaya: '📦 Накладная', akt: '📝 Акт', kp: '📄 КП' }
const fmt = (n: any) => (Number(n) || 0).toLocaleString('ru-RU') + ' ₸'

export default function BookkeepingScreen({ orgId }: { orders?: any[]; orgId: string; onAction?: (id: string, a: string) => void; onReload?: () => void; onOpen?: (o: any) => void }) {
  const orgName = (useAdmin() as any)?.orgName || ''
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [create, setCreate] = useState<{ type: string; fromDocId?: string } | null>(null)
  const [settings, setSettings] = useState(false)
  const [preview, setPreview] = useState<any>(null)   // документ журнала, открытый на просмотр
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [flash, setFlash] = useState('')
  const toast = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 2400) }

  const load = useCallback(async () => { setDocs(await accDocsList(orgId)); setLoading(false) }, [orgId])
  useEffect(() => { setLoading(true); load() }, [load])
  useLiveData(load, [orgId])

  async function del(d: any) {
    if (!confirm(`Удалить документ «${d.docNo}»?`)) return
    const r = await accDocDelete(d.id); toast(r.ok ? '🗑 Удалено' : '⚠ ' + (r.error || 'Не удалось')); load()
  }
  const words = q.trim().toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean)
  const list = docs.filter(d => (filter === 'all' || d.type === filter) && words.every(w => `${d.docNo} ${d.buyerName} ${d.buyerBin || ''} ${d.total} ${d.createdByName || ''} ${(d.items || []).map((i: any) => i.name).join(' ')}`.toLowerCase().replace(/ё/g, 'е').includes(w)))

  return (
    <div className="anim-fade">
      {flash && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: COLORS.dark, color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 14, zIndex: 9999 }}>{flash}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 22 }}>📒 Бухгалтерия</div>
        <span style={{ fontSize: 13, color: COLORS.textMuted }}>Счета, накладные, акты и КП по шаблонам компании{orgName ? ` · ${orgName}` : ''}</span>
        <button onClick={() => setSettings(true)} style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>⚙ Реквизиты, печать и шаблоны</button>
      </div>

      <div style={{ margin: '14px 0 0' }}><InvoicePicker orgId={orgId} onCreate={(docId, type) => setCreate({ type, fromDocId: docId })} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 18px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 600 }}>Или создать с нуля:</span>
        {DOC_TYPES.map(t => <button key={t.key} onClick={() => setCreate({ type: t.key })} style={{ padding: '8px 14px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{t.icon} {t.label}</button>)}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        {([['all', 'Все'], ...DOC_TYPES.map(t => [t.key, TLABEL[t.key]])] as [string, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: filter === k ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', background: filter === k ? COLORS.primary : '#fff', color: filter === k ? '#fff' : '#6b655b', boxShadow: filter === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{l}</button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Поиск по созданным документам…" style={{ marginLeft: 'auto', flex: '1 1 240px', maxWidth: 380, padding: '9px 14px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', fontSize: 14 }} />
      </div>

      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e6e2dc', overflowX: 'auto' }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>Загрузка…</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>{docs.length ? 'Ничего не найдено' : 'Пока нет документов. Нажмите на карточку выше.'}</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
              <thead><tr style={{ background: '#faf8f6', color: COLORS.textMuted, fontSize: 12, textAlign: 'left' }}>
                <th style={{ padding: '9px 14px' }}>Тип</th><th style={{ padding: '9px 8px' }}>Номер</th><th style={{ padding: '9px 8px' }}>Дата</th><th style={{ padding: '9px 8px' }}>Покупатель</th>
                <th style={{ padding: '9px 8px', textAlign: 'right' }}>Сумма</th><th style={{ padding: '9px 8px' }}>Автор</th><th style={{ padding: '9px 14px', textAlign: 'right' }}>Файл</th>
              </tr></thead>
              <tbody>
                {list.map(d => (
                  <tr key={d.id} style={{ borderTop: '1px solid #f1efec' }}>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{TLABEL[d.type] || d.type}</td>
                    <td style={{ padding: '9px 8px', fontSize: 12.5, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{d.docNo}</td>
                    <td style={{ padding: '9px 8px', fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDate(d.docDate)}</td>
                    <td style={{ padding: '9px 8px', fontWeight: 600 }}>{d.buyerName}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(d.total)}</td>
                    <td style={{ padding: '9px 8px', fontSize: 12.5, color: COLORS.textMuted }}>{d.createdByName || '—'}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => setPreview(d)} title="Предварительный просмотр" style={{ ...fileBtn, cursor: 'pointer', fontFamily: 'inherit' }}>👁 Просмотр</button>
                      <a href={accDocFileUrl(d.id, 'excel')} title="Скачать Excel" style={{ ...fileBtn }}>⬇ Excel</a>
                      <a href={accDocFileUrl(d.id, 'word')} title="Скачать Word" style={{ ...fileBtn }}>⬇ Word</a>
                      <button onClick={() => del(d)} title="Удалить" style={{ border: 'none', background: 'none', color: '#c1121c', cursor: 'pointer', fontSize: 16, marginLeft: 4 }}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {create && <DocCreateModal type={create.type} fromDocId={create.fromDocId} orgId={orgId} orgName={orgName} onClose={() => setCreate(null)} onCreated={() => { toast('✅ Документ создан'); load() }} />}
      {preview && <DocPreviewModal orgId={orgId} orgName={orgName} onClose={() => setPreview(null)} doc={{ type: preview.type, number: preview.number, docNo: preview.docNo, docDate: preview.docDate, buyerName: preview.buyerName, buyerBin: preview.buyerBin, buyerAddress: preview.buyerAddress, bank: preview.bank, items: preview.items || [], withStamp: preview.withStamp, withSign: preview.withSign }} />}
      {settings && <OrgSettingsModal orgId={orgId} orgName={orgName} onClose={() => setSettings(false)} toast={toast} />}
    </div>
  )
}

const fileBtn: React.CSSProperties = { display: 'inline-block', padding: '5px 10px', marginLeft: 4, borderRadius: 7, border: '1.5px solid #e6e2dc', background: '#fff', color: '#26231f', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }
