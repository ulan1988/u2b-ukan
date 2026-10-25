'use client'
// Предварительный просмотр документа (счёт / накладная / акт / КП) в виде печатного листа + печать.
// Берёт реквизиты, банки, печать и подпись из «⚙ Реквизиты»; работает и для готового документа, и для черновика в окне создания.
import { useEffect, useRef, useState } from 'react'
import { accSettings } from '@/lib/api/accDocs'
import { amountInWordsKzt } from '@/dto/accDocs.dto'
import ModalShell from '@/components/admin/accDocs/ModalShell'

export type PreviewDoc = {
  type: string; number?: number | string | null; docNo?: string | null; docDate?: string | null
  buyerName?: string | null; buyerBin?: string | null; buyerAddress?: string | null; bank?: string | null
  items: Array<{ name: string; qty: number | string; unit?: string | null; price: number | string }>
  withStamp?: boolean | null; withSign?: boolean | null
}

const TITLE: Record<string, string> = { invoice: 'Счёт на оплату', nakladnaya: 'Накладная на отпуск запасов', akt: 'Акт выполненных работ (оказанных услуг)', kp: 'Коммерческое предложение' }
const money = (n: number) => (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dmy = (d?: string | null) => { const p = String(d || '').slice(0, 10).split('-'); return p.length === 3 && p[0].length === 4 ? `${p[2]}.${p[1]}.${p[0]}` : '' }
const cell: React.CSSProperties = { border: '1px solid #222', padding: '4px 6px', fontSize: 12.5 }

export function DocSheet({ doc, org }: { doc: PreviewDoc; org: any }) {
  const rows = doc.items.filter(it => String(it.name || '').trim()).map(it => ({ ...it, qty: Number(it.qty) || 0, price: Number(it.price) || 0, sum: Math.round((Number(it.qty) || 0) * (Number(it.price) || 0) * 100) / 100 }))
  const total = Math.round(rows.reduce((s, r) => s + r.sum, 0) * 100) / 100
  const bank = (org?.banks || []).find((b: any) => b.key === doc.bank) || (org?.banks || [])[0]
  const no = doc.number ?? (doc.docNo || '').replace(/\D+/g, '')
  const head = `${TITLE[doc.type] || 'Документ'} № ${no || '___'} от ${dmy(doc.docDate) || '__.__.____'} г.`
  return (
    <div style={{ background: '#fff', color: '#111', width: '100%', maxWidth: 794, margin: '0 auto', padding: '28px 34px', fontFamily: "'Times New Roman', Times, serif", fontSize: 13.5, lineHeight: 1.35, boxShadow: '0 0 0 1px #d8d3cc' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 10 }}>
        {org?.logoB64 && <img src={org.logoB64} alt="" style={{ height: 56, maxWidth: 140, objectFit: 'contain' }} />}
        <div style={{ flex: 1, fontSize: 12.5 }}>
          <b style={{ fontSize: 14 }}>{org?.companyFull || org?.companyName || 'Наименование компании'}</b>
          <div>{[org?.bin && `БИН ${org.bin}`, org?.address, org?.phone && `тел. ${org.phone}`].filter(Boolean).join(', ') || 'Реквизиты не заполнены — «⚙ Реквизиты, печать и шаблоны»'}</div>
        </div>
      </div>

      {doc.type === 'invoice' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <tbody>
            <tr><td style={{ ...cell, width: '55%' }} rowSpan={2}><b>Бенефициар:</b><br />{org?.companyName || '—'}<br />БИН: {org?.bin || '—'}</td><td style={cell}><b>ИИК</b><br />{bank?.iik || '—'}</td><td style={{ ...cell, width: 60 }}><b>Кбе</b><br />{bank?.kbe || '—'}</td></tr>
            <tr><td style={cell} colSpan={2}><b>Банк:</b> {bank?.name || '—'} · <b>БИК:</b> {bank?.bik || '—'}</td></tr>
          </tbody>
        </table>
      )}

      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 17, margin: '12px 0 10px' }}>{head}</div>
      <div style={{ marginBottom: 10 }}>
        <b>{doc.type === 'akt' ? 'Заказчик' : doc.type === 'kp' ? 'Кому' : 'Покупатель'}:</b>{' '}
        {[doc.buyerBin && `БИН/ИИН ${doc.buyerBin}`, doc.buyerName, doc.buyerAddress].filter(Boolean).join(', ') || '—'}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#efefef' }}>
            <th style={{ ...cell, width: 30 }}>№</th><th style={cell}>Наименование</th><th style={{ ...cell, width: 64 }}>Кол-во</th><th style={{ ...cell, width: 50 }}>Ед.</th><th style={{ ...cell, width: 96 }}>Цена</th><th style={{ ...cell, width: 104 }}>Сумма</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td style={{ ...cell, textAlign: 'center', color: '#888' }} colSpan={6}>Позиции не добавлены</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td><td style={cell}>{r.name}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{r.qty}</td><td style={{ ...cell, textAlign: 'center' }}>{r.unit || 'шт'}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{money(r.price)}</td><td style={{ ...cell, textAlign: 'right' }}>{money(r.sum)}</td>
            </tr>
          ))}
          <tr><td style={{ ...cell, textAlign: 'right', fontWeight: 700 }} colSpan={5}>Итого:</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{money(total)}</td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 12.5 }}>Всего наименований {rows.length}, на сумму <b>{money(total)} ₸</b></div>
      <div style={{ fontWeight: 700, marginTop: 2 }}>{amountInWordsKzt(total)}</div>

      <div style={{ position: 'relative', marginTop: 44, display: 'flex', alignItems: 'flex-end', gap: 14, minHeight: 90 }}>
        <b>{doc.type === 'nakladnaya' ? 'Отпустил' : 'Исполнитель'}</b>
        <div style={{ position: 'relative', flex: '0 0 190px', borderBottom: '1px solid #111', height: 22 }}>
          {doc.withSign && org?.signB64 && <img src={org.signB64} alt="" style={{ position: 'absolute', left: 10, bottom: -4, height: 64, objectFit: 'contain' }} />}
        </div>
        <span>/ {org?.directorName || '______________'} /</span>
        {doc.withStamp && org?.stampB64 && <img src={org.stampB64} alt="" style={{ position: 'absolute', left: 190, bottom: -14, height: 110, objectFit: 'contain', opacity: .92 }} />}
      </div>
    </div>
  )
}

export default function DocPreviewModal({ doc, orgId, orgName, onClose }: { doc: PreviewDoc; orgId: string; orgName: string; onClose: () => void }) {
  const [org, setOrg] = useState<any>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  useEffect(() => { accSettings(orgId).then(setOrg) }, [orgId])

  // Печать: отдельное окно только с листом (без интерфейса).
  function print() {
    const html = sheetRef.current?.innerHTML; if (!html) return
    const w = window.open('', '_blank', 'width=900,height=1100'); if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${TITLE[doc.type] || 'Документ'}</title><style>@page{size:A4;margin:12mm}body{margin:0;font-family:'Times New Roman',serif}</style></head><body>${html}</body></html>`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 350)
  }
  return (
    <ModalShell onClose={onClose} width={900} title={<>👁 Предпросмотр · {TITLE[doc.type]} <span style={{ color: '#837c72', fontWeight: 600, fontSize: 14 }}>· {orgName}</span></>}>
      {!org ? <div style={{ padding: 40, textAlign: 'center', color: '#837c72' }}>Загрузка…</div> : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button onClick={print} style={{ padding: '8px 16px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>🖨 Печать</button>
          </div>
          <div style={{ background: '#e9e6e1', padding: 14, borderRadius: 10 }}>
            <div ref={sheetRef}><DocSheet doc={doc} org={org} /></div>
          </div>
          <div style={{ fontSize: 12, color: '#837c72', marginTop: 8 }}>Это экранный вид. Готовый файл (по вашему шаблону, если загружен) скачивается кнопками «⬇ Excel» и «⬇ Word» в журнале.</div>
        </>
      )}
    </ModalShell>
  )
}
