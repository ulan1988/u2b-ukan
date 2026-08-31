'use client'
// Черновик закупа (накопитель): назначить закупщика/поставщика всем позициям и оформить.
import ContragentPicker from '@/components/ContragentPicker'
import { fmtMoney } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'
import { updatePosition } from '@/lib/adminApi'
import { lineAmount, isIzdelie } from '@/lib/lineAmount'
import { Btn, inpSm } from './ui'

export default function PurchaseDraft({ draft, logists, contragents, defaultCagId, onAction, onReload }: { draft: any; logists: any[]; contragents: any[]; defaultCagId: string; onAction: (id: string, a: string) => void; onReload: () => void }) {
  const ps = draft.positions || []
  const ready = ps.length > 0 && ps.every((p: any) => p.respUserId && p.supplierId)
  // Сумма строки: изделие = кол-во × см × цена (цена — за 1 см), обычный товар = кол-во × цена.
  const amt = (p: any) => lineAmount({ name: p.name1c || p.oral, qty: Number(p.qty) || 0, price: Number(p.price) || 0, widthCm: p.widthCm })
  const total = ps.reduce((s: number, p: any) => s + amt(p), 0)
  async function upd(posId: string, patch: any) { await updatePosition(draft.id, posId, patch); onReload() }
  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 0 0 1.5px #e3d4f0', borderLeft: '4px solid #7a3aaa', overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#faf7fd', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: '#7a3aaa' }}>{draft.id}</span>
        <span style={{ fontSize: 12, fontWeight: 700, background: '#f3eeff', color: '#7a3aaa', padding: '2px 9px', borderRadius: 20 }}>🛒 ЧЕРНОВИК ЗАКУПА · {ps.length} поз.</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...inpSm, width: 150 }} value="" onChange={e => { if (e.target.value) ps.forEach((p: any) => upd(p.id, { respUserId: e.target.value })) }}><option value="">Закупщик → всем</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <div style={{ width: 170 }}><ContragentPicker contragents={contragents} value="" defaultId={defaultCagId} onPick={c => c?.id && ps.forEach((p: any) => upd(p.id, { supplierId: c.id }))} placeholder="Поставщик → всем" /></div>
          <Btn variant="primary" disabled={!ready} onClick={() => onAction(draft.id, 'finalizePurchase')}>✓ Оформить закуп →</Btn>
        </div>
      </div>
      <div style={{ padding: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr style={{ background: '#f1efec' }}>{['🔀 НАИМЕНОВАНИЕ', 'СМ (ширина)', 'КОЛ-ВО (шт)', 'ЦЕНА (ПРИХОД)', 'СУММА', 'ЗАКУПЩИК', 'ПОСТАВЩИК'].map(h => <th key={h} style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700, color: '#5f5952', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>
            {ps.map((pos: any) => (
              <tr key={pos.id} style={{ borderBottom: '1px solid #f1efec', background: pos.transit ? '#faf7ff' : undefined }}>
                <td style={{ padding: '6px 8px', fontSize: 13, fontWeight: 500 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <label title="Сквозная строка — товар мимо склада (drop-ship), прямо заказчику" style={{ cursor: 'pointer', display: 'inline-flex' }}><input type="checkbox" checked={!!pos.transit} onChange={e => upd(pos.id, { transit: e.target.checked })} /></label>
                  <RalDot code={extractRal(pos.name1c || pos.oral || '')} size={12} />{pos.name1c || pos.oral}{pos.transit && <span style={{ fontSize: 11, fontWeight: 700, color: '#7a3aaa', background: '#f3eeff', borderRadius: 6, padding: '1px 6px' }}>🔀 сквозная</span>}</span></td>
                <td style={{ padding: '6px 8px', width: 80 }}><input key={`${pos.id}-w-${pos.widthCm}`} type="number" defaultValue={pos.widthCm != null ? Number(pos.widthCm) : ''} placeholder="см" style={{ ...inpSm, width: 64, textAlign: 'right' }} onBlur={e => { const cur = pos.widthCm != null ? Number(pos.widthCm) : null; const w = e.target.value === '' ? null : Number(e.target.value); if (w !== cur) upd(pos.id, { widthCm: w }) }} /></td>
                <td style={{ padding: '6px 8px', width: 90 }}><input key={`${pos.id}-q-${pos.qty}`} type="number" defaultValue={Number(pos.qty)} style={{ ...inpSm, width: 70, textAlign: 'right' }} onBlur={e => { const q = Number(e.target.value) || 0; if (q !== Number(pos.qty)) upd(pos.id, { qty: q }) }} /> <span style={{ fontSize: 12, color: '#837c72' }}>{pos.unit}</span></td>
                <td style={{ padding: '6px 8px', width: 110 }}><input key={`${pos.id}-p-${pos.price}`} type="number" defaultValue={Number(pos.price) || ''} placeholder="0" title={isIzdelie(pos.name1c || pos.oral) ? 'цена за 1 см (сумма = кол-во × см × цена)' : 'цена за единицу'} style={{ ...inpSm, width: 96, textAlign: 'right', fontWeight: 600 }} onBlur={e => { const pr = Number(e.target.value) || 0; if (pr !== Number(pos.price)) upd(pos.id, { price: pr }) }} />{isIzdelie(pos.name1c || pos.oral) && <div style={{ fontSize: 9.5, color: '#7a3aaa', textAlign: 'right' }}>за см</div>}</td>
                <td style={{ padding: '6px 8px', width: 100, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: '#7a3aaa' }}>{Number(pos.price) > 0 ? fmtMoney(amt(pos)) : '—'}</td>
                <td style={{ padding: '6px 8px', width: 150 }}><select style={inpSm} value={pos.respUserId || ''} onChange={e => upd(pos.id, { respUserId: e.target.value })}><option value="">—</option>{logists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></td>
                <td style={{ padding: '6px 8px', width: 160 }}><ContragentPicker contragents={contragents} value={pos.supplierId || ''} defaultId={defaultCagId} onPick={c => upd(pos.id, { supplierId: c.id })} placeholder="— поставщик —" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, fontSize: 13 }}>
          <span style={{ color: '#5f5952' }}>Итого приход:&nbsp;</span><span style={{ fontWeight: 800, color: '#7a3aaa' }}>{fmtMoney(total)}</span>
        </div>
        {!ready && <div style={{ fontSize: 12, color: '#8a6f00', marginTop: 8 }}>Назначь логиста и поставщика всем позициям — тогда откроется «Оформить».</div>}
      </div>
    </div>
  )
}
