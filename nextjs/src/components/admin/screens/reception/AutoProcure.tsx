'use client'
// Автозакуп: сводка потребности новых продаж по товару → в черновик закупа одной кнопкой.
import { Fragment, useEffect, useState } from 'react'
import { RalDot, extractRal } from '@/lib/ral'
import { demandSummary, stage, dropDemand } from '@/lib/api/procurement'

export default function AutoProcure({ orgId, onReload, toast }: { orgId: string; onReload: () => void; toast: (m: string) => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [openBlk, setOpenBlk] = useState(true)
  // ДВЕ ЦЕНЫ (правило владельца 27.11.2026): у товара — ЗАКУП (из карточки товара, уйдёт в приходную),
  // у каждой заявки — ПРОДАЖА её заказчику (цена строки заявки, пусто → по типу цены заказчика: розн/опт/спец).
  // Правки держим здесь до «В закуп»; ключ продажи — товар + заявка.
  const [buy, setBuy] = useState<Record<string, string>>({})
  const [sale, setSale] = useState<Record<string, string>>({})
  const buyOf = (r: any) => (buy[r.name] ?? (r.priceIn > 0 ? String(r.priceIn) : ''))
  const saleKey = (r: any, x: any) => r.name + '::' + x.cardId
  const saleOf = (r: any, x: any) => (sale[saleKey(r, x)] ?? (x.price > 0 ? String(x.price) : x.auto > 0 ? String(x.auto) : ''))
  const PT: Record<string, string> = { retail: 'розн.', opt: 'опт', spec: 'спец' }
  const noPrice = rows.reduce((n, r: any) => n + (r.rows || []).filter((x: any) => !(Number(saleOf(r, x)) > 0)).length, 0)

  async function load() { if (orgId) setRows(await demandSummary(orgId) as any) }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line

  const chosen = rows.filter(r => checked[r.name])
  const needCards = new Set(rows.flatMap((r: any) => (r.rows || []).map((x: any) => x.cardId ?? x.from))).size
  async function toBuy() {
    const src = chosen.length ? chosen : rows
    if (!src.length) { toast('Нет товаров для закупа'); return }
    setBusy(true)
    const r: any = await stage(src.map((it: any) => ({
      ...it, price: Number(buyOf(it)) || 0,
      rows: (it.rows || []).map((x: any) => ({ ...x, salePrice: Number(saleOf(it, x)) || 0 })),
    })))
    setBusy(false)
    if (r.ok) { toast(`В закуп: ${r.data?.added ?? src.length}`); setChecked({}); setBuy({}); setSale({}); load(); onReload() }
    else toast('⚠ ' + (r.error || 'Ошибка'))
  }

  // 🗑 Убрать строку: позиция удаляется В САМИХ ЗАЯВКАХ (решение владельца 20.11.2026) —
  // её не повезёт и логист. Домино называем прямо в подтверждении, вместе со списком заявок.
  async function drop(r: any) {
    const who = (r.rows || []).map((x: any) => `${x.from}: ${x.qty} ${r.unit}`).join('\n')
    if (!confirm(`Убрать «${r.name}» из автозакупа?\n\nПозиция будет УДАЛЕНА из заявок:\n${who}\n\nЛогист её не повезёт. Вернуть можно только руками, в карточке.`)) return
    setBusy(true)
    const res: any = await dropDemand([r.name])
    setBusy(false)
    if (res.ok) {
      const kept: string[] = res.data?.kept || []
      toast(kept.length ? `Убрано. Осталось в ${kept.join(', ')} — там это последняя позиция, отмените карточку целиком` : '🗑 Убрано из заявок')
      load(); onReload()
    } else toast('⚠ ' + (res.error || 'Ошибка'))
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
            {rows.map((r, idx) => {
              const newFolder = idx === 0 || rows[idx - 1].folder !== r.folder
              const inFolder = rows.filter((x: any) => x.folder === r.folder)
              const allOn = inFolder.every((x: any) => checked[x.name])
              const on = !!checked[r.name]
              return (
                <Fragment key={r.name}>
                {newFolder && (
                  <div onClick={() => setChecked(c => { const n = { ...c }; for (const x of inFolder) n[x.name] = !allOn; return n })} title="Нажмите — выбрать/снять всю папку" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', margin: idx === 0 ? '0 0 2px' : '10px 0 2px', cursor: 'pointer' }}>
                    <span style={{ flex: 1, height: 1, background: '#e3d4f0' }} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#7a3aaa', letterSpacing: '.04em', textTransform: 'uppercase' }}>📁 {r.folder} <span style={{ fontWeight: 600, color: '#9a8aaa' }}>· {inFolder.length}</span></span>
                    <span style={{ flex: 1, height: 1, background: '#e3d4f0' }} />
                  </div>
                )}
                <div style={{ border: `1.5px solid ${on ? '#7a3aaa' : '#f0eaf6'}`, borderRadius: 10, padding: '10px 12px', background: on ? '#faf7fd' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={on} onChange={e => setChecked(c => ({ ...c, [r.name]: e.target.checked }))} style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#7a3aaa' }} />
                    <RalDot code={extractRal(r.name)} size={13} />
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#7a3aaa', whiteSpace: 'nowrap' }}>{r.total} {r.unit}</span>
                    <label title="цена ЗАКУПА — по ней пойдёт приходная (из карточки товара, можно поправить)" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#7a3aaa' }}>закуп
                      <input type="number" value={buyOf(r)} onChange={e => setBuy(b => ({ ...b, [r.name]: e.target.value }))} onFocus={e => e.target.select()} placeholder="закуп"
                        style={{ width: 92, padding: '5px 7px', border: '1.5px solid #e3d4f0', borderRadius: 7, fontSize: 13, fontWeight: 700, textAlign: 'right', color: '#7a3aaa', fontFamily: 'inherit' }} /></label>
                    <button onClick={() => drop(r)} disabled={busy} title="Убрать из автозакупа — позиция удалится и из заявки" style={{ border: '1.5px solid #f3d6d6', background: '#fff', color: '#c1121c', borderRadius: 8, width: 30, height: 30, fontSize: 14, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>🗑</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 44 }}>
                    {(r.rows || []).map((x: any, ri: number) => { const v = saleOf(r, x); const none = !(Number(v) > 0)
                      const auto = sale[saleKey(r, x)] == null && !(x.price > 0) && x.auto > 0
                      return (
                        <span key={ri} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: none ? '#fdecec' : '#f6f3f0', color: '#5f5952', padding: '2px 4px 2px 9px', borderRadius: 20 }}>
                          {x.from}: <b style={{ color: '#211f1c' }}>{x.qty} {r.unit}</b>
                          <span title={'тип цены заказчика: ' + (PT[x.priceType] || x.priceType)} style={{ color: '#2e8a5e', fontWeight: 700 }}>· {PT[x.priceType] || 'розн.'}</span>
                          <input type="number" value={v} onChange={e => setSale(m => ({ ...m, [saleKey(r, x)]: e.target.value }))} onFocus={e => e.target.select()} placeholder="продажа"
                            title={none ? 'в прайсе нет цены этого типа — впишите, иначе расходная заказчику выйдет на 0' : auto ? 'подставлено из прайса по типу цены заказчика' : 'цена продажи заказчику — по ней пойдёт расходная'}
                            style={{ width: 84, padding: '3px 6px', border: '1.5px solid ' + (none ? '#e8a3a3' : '#cfe8da'), borderRadius: 14, fontSize: 12, fontWeight: 700, textAlign: 'right', color: '#2e8a5e', background: '#fff', fontFamily: 'inherit' }} />
                        </span>
                      ) })}
                  </div>
                </div>
                </Fragment>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={toBuy} disabled={busy} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: '#7a3aaa', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>🛒 В закуп {chosen.length ? `(${chosen.length})` : 'по всем'} →</button>
            {chosen.length > 0 && <button onClick={() => setChecked({})} style={{ padding: '10px 14px', borderRadius: 9, border: '1.5px solid #e6e2dc', background: '#fff', color: '#5f5952', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Сбросить</button>}
            <span style={{ fontSize: 12, color: '#837c72' }}>Товары уйдут в черновик закупа ниже по цене «закуп»; цена «продажа» ляжет в заявку заказчика — по ней пойдёт его расходная.</span>
            {noPrice > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#c1121c' }}>⚠ без цены продажи: {noPrice} — расходная выйдет на 0</span>}
          </div>
        </div>
      )}
    </div>
  )
}
