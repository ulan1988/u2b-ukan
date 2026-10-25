'use client'
// Реквизиты организации для печатных форм: название, БИН, директор, банки, логотип/печать/подпись, ГОСТ-шаблоны.
import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { accSettings, accSettingsSave } from '@/lib/api/accDocs'
import ModalShell from '@/components/admin/accDocs/ModalShell'

type Bank = { key: string; name: string; iik: string; bik: string; kbe?: string }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fff' }
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block' }

const TEMPLATES: Array<{ key: string; label: string; accept: string }> = [
  { key: 'invoiceTemplateB64', label: 'Счёт на оплату (.xlsx)', accept: '.xlsx' },
  { key: 'naklTemplateB64', label: 'Накладная З-2 (.xlsx)', accept: '.xlsx' },
  { key: 'aktTemplateB64', label: 'Акт Р-1 (.xlsx)', accept: '.xlsx' },
  { key: 'kpTemplateB64', label: 'КП (.docx)', accept: '.docx' },
]

export default function OrgSettingsModal({ orgId, orgName, onClose, toast }: { orgId: string; orgName: string; onClose: () => void; toast: (m: string) => void }) {
  const [o, setO] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const load = () => accSettings(orgId).then(s => setO({ ...s, banks: s.banks || [] }))
  useEffect(() => { load() }, [orgId]) // eslint-disable-line

  async function save() {
    setBusy(true)
    const r = await accSettingsSave(orgId, { companyName: o.companyName, companyFull: o.companyFull, bin: o.bin, address: o.address, phone: o.phone, directorName: o.directorName, banks: o.banks })
    setBusy(false)
    toast(r.ok ? '✅ Реквизиты сохранены' : '⚠ ' + (r.error || 'Не удалось'))
  }
  function upload(field: string, file: File | undefined, asImage: boolean) {
    if (!file) return
    const rd = new FileReader()
    rd.onload = async () => {
      const r = await accSettingsSave(orgId, { [field]: rd.result })
      toast(r.ok ? '✅ Файл загружен' : '⚠ ' + (r.error || 'Не удалось (файл слишком большой?)'))
      load()
    }
    rd.readAsDataURL(file)
  }
  async function clearField(field: string) { await accSettingsSave(orgId, { [field]: '' }); load() }
  const setBank = (i: number, patch: Partial<Bank>) => setO((s: any) => ({ ...s, banks: s.banks.map((b: Bank, j: number) => j === i ? { ...b, ...patch } : b) }))

  const imgBox = (title: string, field: string, w = 120) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: '#5f5952', marginBottom: 6, fontWeight: 600 }}>{title}</div>
      {o?.[field]
        ? <img src={o[field]} alt="" style={{ width: w, height: 100, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }} />
        : <div style={{ width: w, height: 100, border: '1.5px dashed #d8d3cc', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a09889', fontSize: 12 }}>нет</div>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6 }}>
        <label style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: '1.5px solid #e6e2dc', background: '#fff' }}>
          Загрузить<input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={e => upload(field, e.target.files?.[0], true)} />
        </label>
        {o?.[field] && <button onClick={() => clearField(field)} style={{ border: 'none', background: 'none', color: '#c1121c', cursor: 'pointer', fontSize: 13 }}>✕</button>}
      </div>
    </div>
  )

  return (
    <ModalShell onClose={onClose} width={760} title={<>⚙ Реквизиты для документов <span style={{ color: '#837c72', fontWeight: 600, fontSize: 14 }}>· {orgName}</span></>}>
        {!o ? <div style={{ padding: 30, color: COLORS.textMuted }}>Загрузка…</div> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <div><label style={lbl}>Название</label><input style={inp} value={o.companyName || ''} onChange={e => setO({ ...o, companyName: e.target.value })} /></div>
              <div><label style={lbl}>БИН</label><input style={inp} value={o.bin || ''} onChange={e => setO({ ...o, bin: e.target.value })} /></div>
              <div><label style={lbl}>Директор</label><input style={inp} value={o.directorName || ''} onChange={e => setO({ ...o, directorName: e.target.value })} /></div>
              <div><label style={lbl}>Телефон</label><input style={inp} value={o.phone || ''} onChange={e => setO({ ...o, phone: e.target.value })} /></div>
            </div>
            <div style={{ marginTop: 10 }}><label style={lbl}>Полное название</label><input style={inp} value={o.companyFull || ''} onChange={e => setO({ ...o, companyFull: e.target.value })} /></div>
            <div style={{ marginTop: 10 }}><label style={lbl}>Адрес</label><input style={inp} value={o.address || ''} onChange={e => setO({ ...o, address: e.target.value })} /></div>

            <div style={{ fontWeight: 800, fontSize: 14, margin: '18px 0 8px' }}>🏦 Банковские счета (для счёта на оплату)</div>
            {o.banks.map((b: Bank, i: number) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,.8fr) 1.2fr 1.6fr 1fr 70px 30px', gap: 6, marginBottom: 6 }}>
                <input style={inp} value={b.key} onChange={e => setBank(i, { key: e.target.value })} placeholder="код (kaspi)" title="Короткий код банка: kaspi, bck…" />
                <input style={inp} value={b.name} onChange={e => setBank(i, { name: e.target.value })} placeholder="Банк" />
                <input style={inp} value={b.iik} onChange={e => setBank(i, { iik: e.target.value })} placeholder="ИИК (IBAN)" />
                <input style={inp} value={b.bik} onChange={e => setBank(i, { bik: e.target.value })} placeholder="БИК" />
                <input style={inp} value={b.kbe || ''} onChange={e => setBank(i, { kbe: e.target.value })} placeholder="Кбе" />
                <button onClick={() => setO({ ...o, banks: o.banks.filter((_: any, j: number) => j !== i) })} style={{ border: 'none', background: 'none', color: '#c1121c', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>
            ))}
            <button onClick={() => setO({ ...o, banks: [...o.banks, { key: `bank${o.banks.length + 1}`, name: '', iik: '', bik: '', kbe: '19' }] })} style={{ border: '1.5px dashed #d8d3cc', background: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#5f5952' }}>＋ Банк</button>
            <div style={{ marginTop: 14 }}><button onClick={save} disabled={busy} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? .6 : 1 }}>{busy ? '…' : '💾 Сохранить реквизиты'}</button></div>

            <div style={{ fontWeight: 800, fontSize: 14, margin: '22px 0 8px' }}>🔵 Печать и подпись</div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>{imgBox('Логотип', 'logoB64')}{imgBox('Печать', 'stampB64')}{imgBox('Подпись', 'signB64', 150)}</div>
            <div style={{ fontSize: 12, color: '#837c72', marginTop: 8 }}>PNG с прозрачным фоном. Печать и подпись ставятся в документ, если в нём отмечены «Печать» / «Подпись».</div>

            <div style={{ fontWeight: 800, fontSize: 14, margin: '22px 0 4px' }}>📑 ГОСТ-шаблоны (необязательно)</div>
            <div style={{ fontSize: 12, color: '#837c72', marginBottom: 8 }}>Если загрузить ваш готовый бланк, документ печатается заполнением этого бланка 1-в-1. Без шаблона форма собирается автоматически.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
              {TEMPLATES.map(t => (
                <div key={t.key} style={{ border: '1.5px solid #e6e2dc', borderRadius: 10, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: o.templates?.[t.key] ? '#2e8a5e' : '#a09889' }}>{o.templates?.[t.key] ? '✓ загружен' : 'нет'}</div>
                  </div>
                  <label style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: '1.5px solid #e6e2dc' }}>
                    Файл<input type="file" accept={t.accept} style={{ display: 'none' }} onChange={e => upload(t.key, e.target.files?.[0], false)} />
                  </label>
                  {o.templates?.[t.key] && <button onClick={() => clearField(t.key)} style={{ border: 'none', background: 'none', color: '#c1121c', cursor: 'pointer', fontSize: 16 }}>✕</button>}
                </div>
              ))}
            </div>
          </>
        )}
    </ModalShell>
  )
}
