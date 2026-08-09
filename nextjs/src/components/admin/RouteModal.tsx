'use client'
// Модалка «Связки» — путь накладной/карточки графом-деревом. Клик по узлу подсвечивает
// путь до него и показывает детали справа. Данные: GET /api/documents/{id}/chain.
import { useEffect, useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney } from '@/lib/adminFmt'
import { docChain } from '@/lib/api/docs'

const COLW = 210, ROWH = 92, NW = 172, NH = 52
const STATE: Record<string, { line: string; bg: string; ring: string }> = {
  done: { line: '#2e8a5e', bg: '#e8f5ee', ring: '#b7d9c6' },
  current: { line: '#3f6bb5', bg: '#e9f0fb', ring: '#3f6bb5' },
  returned: { line: '#b4574c', bg: '#f7ebe9', ring: '#e0c0bb' },
  pending: { line: '#8b94a0', bg: '#fff', ring: '#d3d8e0' },
  link: { line: '#7a3aaa', bg: '#f3eeff', ring: '#d8c4ec' },
  branch: { line: '#4a5aaa', bg: '#eef2ff', ring: '#c4ccec' },
}
const stkey = (n: any) => n.key === 'link' ? 'link' : n.key === 'branch' ? 'branch' : (STATE[n.state] ? n.state : 'pending')
const fmtDT = (s: any) => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export default function RouteModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null)
  const [sel, setSel] = useState<number | null>(null)

  useEffect(() => { docChain(docId).then((d: any) => { setData(d); const cur = (d?.nodes || []).find((n: any) => n.state === 'current'); setSel(cur ? cur.id : (d?.nodes?.[0]?.id ?? null)) }) }, [docId])
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])

  const nodes: any[] = data?.nodes || []
  const edges: any[] = data?.edges || []
  const minLane = Math.min(0, ...nodes.map(n => n.lane || 0))
  // Есть ветки (несколько дорожек) → вертикальная раскладка (влезает по ширине экрана);
  // линейный путь → горизонтальная (читается как таймлайн слева-направо).
  const vertical = nodes.some(n => (n.lane || 0) !== 0)
  const maxLevel = Math.max(0, ...nodes.map(n => n.level || 0))
  const maxLane = Math.max(0, ...nodes.map(n => (n.lane || 0) - minLane))
  const pos = (n: any) => vertical
    ? { x: 24 + ((n.lane || 0) - minLane) * COLW, y: 24 + (n.level || 0) * ROWH }
    : { x: 24 + (n.level || 0) * COLW, y: 24 + ((n.lane || 0) - minLane) * ROWH }
  const W = Math.max(600, 24 + ((vertical ? maxLane : maxLevel) + 1) * COLW)
  const H = Math.max(240, 48 + ((vertical ? maxLevel : maxLane) + 1) * ROWH)

  // Путь: выбранный узел + все предки (по рёбрам to←from).
  const parents = useMemo(() => { const m: Record<number, number[]> = {}; for (const e of edges) (m[e.to] ||= []).push(e.from); return m }, [edges])
  const onPath = useMemo(() => {
    const set = new Set<number>(); if (sel == null) return set
    const walk = (id: number) => { if (set.has(id)) return; set.add(id); for (const p of (parents[id] || [])) walk(p) }
    walk(sel); return set
  }, [sel, parents])
  const selNode = nodes.find(n => n.id === sel)
  const pathChips = useMemo(() => nodes.filter(n => onPath.has(n.id)).sort((a, b) => (a.level - b.level) || (a.lane - b.lane)).map(n => n.label), [nodes, onPath])

  const doc = data?.document
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,40,.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="anim-pop" style={{ width: 'min(1240px,96vw)', height: 'min(820px,92vh)', background: '#fff', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Шапка */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef0f3', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>🔗 Связки</span>
          {doc && <><span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.primary }}>{doc.no}</span>
            <span style={{ fontSize: 13, color: COLORS.textMuted }}>{doc.kind} · {doc.contragent}</span>
            {doc.title && <span style={{ fontSize: 13, color: '#8b94a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{doc.title}</span>}
            <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtMoney(Number(doc.sum || 0))} ₸</span></>}
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
        </div>

        {/* Суть: откуда (поставщик) → кому (покупатель) */}
        {doc && (
          <div style={{ padding: '9px 18px', borderBottom: '1px solid #eef0f3', display: 'flex', alignItems: 'center', gap: 10, background: '#faf9fc', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: '#8b94a0', fontWeight: 600 }}>ОТКУДА</span>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#7a3aaa', background: '#f3eeff', padding: '4px 12px', borderRadius: 20 }}>🏭 {doc.supplier || '—'}</span>
            <span style={{ color: '#b0bccb', fontSize: 18, fontWeight: 700 }}>→</span>
            <span style={{ fontSize: 11.5, color: '#8b94a0', fontWeight: 600 }}>КОМУ</span>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#2e8a5e', background: '#e8f5ee', padding: '4px 12px', borderRadius: 20 }}>🧑 {doc.buyer || '—'}</span>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Холст графа */}
          <div style={{ flex: 1, overflow: 'auto', background: '#f7f8fa', position: 'relative' }}>
            {!data ? <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div> : (
              <div style={{ position: 'relative', width: W, height: H }}>
                <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  {edges.map((e, i) => {
                    const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to); if (!a || !b) return null
                    const pa = pos(a), pb = pos(b)
                    const active = onPath.has(e.from) && onPath.has(e.to)
                    const ret = e.kind === 'return', link = e.kind === 'link'
                    const col = ret ? '#b4574c' : link ? '#7a3aaa' : active ? '#9aa8b8' : '#e0e4ea'
                    let d: string
                    if (vertical) {
                      const x1 = pa.x + NW / 2, y1 = pa.y + NH, x2 = pb.x + NW / 2, y2 = pb.y
                      const k = Math.max(20, Math.abs(y2 - y1) / 2)
                      d = `M ${x1} ${y1} C ${x1} ${y1 + k}, ${x2} ${y2 - k}, ${x2} ${y2}`
                    } else {
                      const x1 = pa.x + NW, y1 = pa.y + NH / 2, x2 = pb.x, y2 = pb.y + NH / 2
                      const k = Math.max(20, Math.abs(x2 - x1) / 2)
                      d = `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`
                    }
                    return <path key={i} d={d} fill="none" stroke={col} strokeWidth={active ? 2.2 : 1.5} strokeDasharray={ret || link ? '5 5' : undefined} style={{ transition: 'stroke .15s' }} />
                  })}
                </svg>
                {nodes.map(n => {
                  const p = pos(n), c = STATE[stkey(n)], active = onPath.has(n.id), isSel = n.id === sel
                  return (
                    <div key={n.id} onClick={() => setSel(n.id)} title={n.label} style={{ position: 'absolute', left: p.x, top: p.y, width: NW, height: NH, borderRadius: 27, background: c.bg, border: `1.5px ${n.state === 'pending' ? 'dashed' : 'solid'} ${isSel ? c.line : c.ring}`, boxShadow: isSel ? `0 6px 18px -8px rgba(20,28,40,.45)` : 'none', opacity: active ? 1 : 0.82, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', transition: 'opacity .15s, border-color .15s' }}>
                      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: c.line, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{n.key === 'link' ? '↔' : n.state === 'done' ? '✓' : n.state === 'current' ? '●' : n.state === 'returned' ? '↩' : '·'}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: n.state === 'returned' ? '#b4574c' : '#2c3138', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</div>
                        <div style={{ fontSize: 10.5, color: '#8b94a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.at ? fmtDT(n.at) : (n.state === 'pending' ? 'впереди' : '')}{n.user ? ' · ' + n.user : ''}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Панель этапа */}
          <div style={{ width: 320, borderLeft: '1px solid #eef0f3', padding: 18, overflowY: 'auto', flexShrink: 0 }}>
            {selNode ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: STATE[stkey(selNode)].line, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{selNode.state === 'done' ? '✓' : selNode.state === 'current' ? '●' : selNode.state === 'returned' ? '↩' : '·'}</span>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{selNode.label}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div><div style={{ fontSize: 11, color: '#8b94a0' }}>Когда</div><div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDT(selNode.at)}</div></div>
                  <div><div style={{ fontSize: 11, color: '#8b94a0' }}>Кто</div><div style={{ fontSize: 13, fontWeight: 600 }}>{selNode.user || '—'}</div></div>
                </div>
                {selNode.detail && <div style={{ fontSize: 13, color: '#3a4048', background: '#f2f4f7', borderRadius: 8, padding: '8px 10px', marginBottom: 14 }}>{selNode.detail}</div>}
                {selNode.linkCardId && <div style={{ fontSize: 12.5, color: '#7a3aaa', marginBottom: 14 }}>Связанная карточка: <b>{selNode.linkCardId}</b></div>}
                <div style={{ fontSize: 11, color: '#8b94a0', marginBottom: 6 }}>ПУТЬ ДО ЭТОГО ЭТАПА</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{pathChips.map((c, i) => <span key={i} style={{ fontSize: 11.5, background: '#eef0f3', borderRadius: 20, padding: '3px 9px', color: '#3a4048' }}>{c}</span>)}</div>
              </>
            ) : <div style={{ color: COLORS.textMuted, fontSize: 14 }}>Выберите этап на графе</div>}
          </div>
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid #eef0f3', fontSize: 12.5, color: '#8b94a0' }}>Нажмите на этап — подсветится путь документа до него. Легенда: ✓ пройдено · ● сейчас · ↩ возврат · · впереди · ↔ связь</div>
      </div>
    </div>
  )
}
