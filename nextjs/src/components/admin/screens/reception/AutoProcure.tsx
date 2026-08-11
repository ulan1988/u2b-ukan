'use client'
// Автозакуп: сводка потребности новых продаж по товару → в черновик закупа одной кнопкой.
import { useEffect, useState } from 'react'
import { RalDot, extractRal } from '@/lib/ral'
import { demandSummary, stage } from '@/lib/api/procurement'

export default function AutoProcure({ orgId, onReload, toast }: { orgId: string; onReload: () => void; toast: (m: string) => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [openBlk, setOpenBlk] = useState(true)

  async function load() { if (orgId) setRows(await demandSummary(orgId) as any) }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line

  const chosen = rows.filter(r => checked[r.name])
  const needCards = new Set(rows.flatMap((r: any) => (r.rows || []).map((x: any) => x.cardId ?? x.from))).size
  async function toBuy() {
    const src = chosen.length ? chosen : rows
    if (!src.length) { toast('Нет товаров для закупа'); return }
    setBusy(true)
    const r: any = await stage(src)
    setBusy(false)
    if (r.ok) { toast(`В закуп: ${r.data?.added ?? src.length}`); setChecked({}); load(); onReload() }
    else toast('⚠ ' + (r.error || 'Ошибка'))
  }

  if (rows.length === 0) return null
  return (
    <div style={{ background: '#fff', borderRadius: 14, marginBottom: 20, boxShadow: '0 0 0 1.5px #e3d4f0', overflow: 'hidden' }}>
      <div onClick={() => setOpenBlk(v => !v)} style={{ padding: '13px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: '#faf7fd', borderBottom: openBlk ? '1px solid #f0eaf6' : 'none' }}>
        <span style={{ fontSize: 16 }}>🛒</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#7a3aaa' }}>Автозакуп</span>
        <span style={{ fontSize: 12, background: '#f3eeff', color: '#7a3aaa', padding: '2px 9px', borderRadius: 20, fontWeight: 700 }}>{rows.length} товаров · из {needCards} заявок</span>
        <span style={{ marginLeft: 'auto', fontSize: 16, color: '#7a3aaa', transform: openBlk ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>▸</span>
      </div>
      {openBlk && (
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {rows.map(r => {
              const on = !!checked[r.name]
              return (
                <div key={r.name} style={{ border: `1.5px solid ${on ? '#7a3aaa' : '#f0eaf6'}`, borderRadius: 10, padding: '10px 12px', background: on ? '#faf7fd' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={on} onChange={e => setChecked(c => ({ ...c, [r.name]: e.target.checked }))} style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#7a3aaa' }} />
                    <RalDot code={extractRal(r.name)} size={13} />
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#7a3aaa', whiteSpace: 'nowrap' }}>{r.total} {r.unit}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 44 }}>
                    {(r.rows || []).map((x: any, ri: number) => <span key={ri} style={{ fontSize: 12, background: '#f6f3f0', color: '#5f5952', padding: '2px 9px', borderRadius: 20 }}>{x.from}: <b style={{ color: '#211f1c' }}>{x.qty} {r.unit}</b></span>)}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={toBuy} disabled={busy} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: '#7a3aaa', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>🛒 В закуп {chosen.length ? `(${chosen.length})` : 'по всем'} →</button>
            {chosen.length > 0 && <button onClick={() => setChecked({})} style={{ padding: '10px 14px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', color: '#5f5952', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Сбросить</button>}
            <span style={{ fontSize: 12, color: '#837c72' }}>Товары уйдут в черновик закупа ниже. Оформишь его одной кнопкой.</span>
          </div>
        </div>
      )}
    </div>
  )
}
