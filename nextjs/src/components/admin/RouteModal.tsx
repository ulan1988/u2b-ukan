'use client'
// Модалка «Связки». Две вкладки:
//  • Цепочка — Поставщик → Товар → Заказчик (как листы закуп-отчёта); клик по узлу
//    «разлетает» его цепочку (подсветка связанной компоненты). Много поставщиков/покупателей.
//  • Путь — движение документа по стадиям (граф-дерево из истории).
import { useEffect, useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { fmtMoney, fmtDateTime } from '@/lib/adminFmt'
import { RalDot, extractRal } from '@/lib/ral'
import { docChain } from '@/lib/api/docs'

const COLW = 240, ROWH = 92, NW = 190, NH = 54
// Компактная цепочка: узлы ниже и ближе друг к другу (граф «Путь» остаётся на своих размерах).
const CCOLW = 250, CROWH = 50, CNW = 176, CNH = 40
// Цвет цепочки = цвет товара: линии поставщик→товар→заказчик одного цвета, видно кто куда идёт.
const PALETTE = ['#e6194b', '#3b82f6', '#16a34a', '#f59e0b', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#b45309', '#475569', '#0d9488', '#dc2626']
const fmtDT = (s: any) => fmtDateTime(s) || '—'
const KIND: Record<string, { line: string; bg: string; ring: string }> = {
  supplier: { line: '#7a3aaa', bg: '#f3eeff', ring: '#d8c4ec' },
  product: { line: '#c0532a', bg: '#fff3ec', ring: '#f0d3c8' },
  buyer: { line: '#2e8a5e', bg: '#e8f5ee', ring: '#b7d9c6' },
}
const STATE: Record<string, { line: string; bg: string; ring: string }> = {
  done: { line: '#2e8a5e', bg: '#e8f5ee', ring: '#b7d9c6' },
  current: { line: '#3f6bb5', bg: '#e9f0fb', ring: '#3f6bb5' },
  returned: { line: '#b4574c', bg: '#f7ebe9', ring: '#e0c0bb' },
  pending: { line: '#8b94a0', bg: '#fff', ring: '#d3d8e0' },
  link: { line: '#7a3aaa', bg: '#f3eeff', ring: '#d8c4ec' },
  branch: { line: '#4a5aaa', bg: '#eef2ff', ring: '#c4ccec' },
}

export default function RouteModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null)
  const [tab, setTab] = useState<'chain' | 'path'>('chain')
  const [full, setFull] = useState(false)   // во весь экран
  const [selCh, setSelCh] = useState<string | null>(null)
  const [selP, setSelP] = useState<number | null>(null)

  useEffect(() => { docChain(docId).then((d: any) => { setData(d); const cur = (d?.nodes || []).find((n: any) => n.state === 'current'); setSelP(cur ? cur.id : (d?.nodes?.[0]?.id ?? null)); setSelCh(null); if (!(d?.chain?.nodes || []).length) setTab('path') }) }, [docId])
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (selCh) setSelCh(null); else if (full) setFull(false); else onClose() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose, selCh, full])

  const doc = data?.document
  // ── Цепочка ──
  const chNodes: any[] = data?.chain?.nodes || []
  const chEdges: any[] = data?.chain?.edges || []
  const chByCol: Record<number, any[]> = { 0: [], 1: [], 2: [] }
  chNodes.forEach(n => (chByCol[n.col] ||= []).push(n))
  const chPos = (n: any) => ({ x: 14 + n.col * CCOLW, y: 28 + chByCol[n.col].indexOf(n) * CROWH })
  const chW = Math.max(360, 14 + 3 * CCOLW)
  const chH = Math.max(120, 28 + Math.max(1, chByCol[0].length, chByCol[1].length, chByCol[2].length) * CROWH)
  const chAdj = useMemo(() => { const m: Record<string, string[]> = {}; for (const e of chEdges) { (m[e.from] ||= []).push(e.to); (m[e.to] ||= []).push(e.from) } return m }, [chEdges])
  // Путь выбранного узла (а не вся связная компонента): заказчик → его товары → их поставщики; поставщик → его товары → их
  // заказчики; товар → его поставщики и заказчики. Остальные линии серые — сразу видно путь одного узла.
  const { chComp, chEdgeOn } = useMemo(() => {
    const nodesOn = new Set<string>(), edgesOn = new Set<number>()
    if (!selCh) return { chComp: nodesOn, chEdgeOn: edgesOn }
    const kindOf: Record<string, string> = {}; for (const n of chNodes) kindOf[n.id] = n.kind
    const sel = selCh; nodesOn.add(sel)
    const nb = (id: string, kind?: string) => (chAdj[id] || []).filter(x => !kind || kindOf[x] === kind)
    const takeEdges = (a: string, b: string) => chEdges.forEach((e, i) => { if ((e.from === a && e.to === b) || (e.from === b && e.to === a)) edgesOn.add(i) })
    const k = kindOf[sel]
    if (k === 'product') { for (const x of nb(sel)) { nodesOn.add(x); takeEdges(sel, x) } }
    else {
      const far = k === 'buyer' ? 'supplier' : 'buyer'
      for (const p of nb(sel, 'product')) { nodesOn.add(p); takeEdges(sel, p); for (const f of nb(p, far)) { nodesOn.add(f); takeEdges(p, f) } }
    }
    return { chComp: nodesOn, chEdgeOn: edgesOn }
  }, [selCh, chNodes, chEdges, chAdj])
  const chSel = chNodes.find(n => n.id === selCh)
  // Порты линий: у узла с несколькими связями точки крепления разнесены по высоте (линии не сливаются в одну).
  const ports = useMemo(() => {
    const out: Record<string, number[]> = {}, inn: Record<string, number[]> = {}
    const yOf = (id: string) => { const n = chNodes.find(x => x.id === id); return n ? chByCol[n.col].indexOf(n) : 0 }
    chEdges.forEach((e, i) => { (out[e.from] ||= []).push(i); (inn[e.to] ||= []).push(i) })
    const rank: Record<string, { o: number; n: number; i: number; m: number }> = {}
    for (const id of Object.keys(out)) out[id].sort((a, b) => yOf(chEdges[a].to) - yOf(chEdges[b].to)).forEach((ei, k) => { rank[ei] = { ...(rank[ei] || { i: 0, m: 1 }), o: k, n: out[id].length } })
    for (const id of Object.keys(inn)) inn[id].sort((a, b) => yOf(chEdges[a].from) - yOf(chEdges[b].from)).forEach((ei, k) => { rank[ei] = { ...(rank[ei] || { o: 0, n: 1 }), i: k, m: inn[id].length } })
    return rank
  }, [chNodes, chEdges]) // eslint-disable-line
  const portY = (k: number, n: number) => CNH * (0.5 + (n > 1 ? (k / (n - 1) - 0.5) * 0.6 : 0))
  // Прямоугольные линии: из узла горизонтально → вертикально по своей дорожке → в узел. Поворот на 90° чуть скруглён.
  // Дорожки в промежутке между колонками подобраны так, чтобы линии не наезжали друг на друга и почти не пересекались.
  const chPaths = useMemo(() => {
    const geo = chEdges.map((e, i) => {
      const a = chNodes.find(n => n.id === e.from), b = chNodes.find(n => n.id === e.to)
      if (!a || !b) return null
      const pa = chPos(a), pb = chPos(b)
      return { i, col: a.col, x1: pa.x + CNW, y1: pa.y + portY(ports[i]?.o ?? 0, ports[i]?.n ?? 1), x2: pb.x, y2: pb.y + portY(ports[i]?.i ?? 0, ports[i]?.m ?? 1) }
    }).filter(Boolean) as Array<{ i: number; col: number; x1: number; y1: number; x2: number; y2: number }>
    const xl: Record<number, number> = {}
    const cols = Array.from(new Set(geo.map(g => g.col)))
    for (const c of cols) {
      const g = geo.filter(x => x.col === c && Math.abs(x.y2 - x.y1) > 1)
      const down = g.filter(x => x.y2 > x.y1).sort((p, q) => p.y1 - q.y1 || p.y2 - q.y2)   // вниз: чем выше старт, тем дальше дорожка от узла
      const up = g.filter(x => x.y2 < x.y1).sort((p, q) => q.y1 - p.y1 || q.y2 - p.y2)
      const n = down.length + up.length; if (!n) continue
      const x1 = g[0].x1, x2 = g[0].x2, step = Math.min(7, (x2 - x1 - 24) / n)
      const right = x2 - 12
      down.forEach((x, k) => { xl[x.i] = right - k * step })
      up.forEach((x, k) => { xl[x.i] = right - (down.length + k) * step })
    }
    const out: Record<number, string> = {}
    for (const g of geo) {
      const dy = g.y2 - g.y1
      if (Math.abs(dy) <= 1) { out[g.i] = `M${g.x1} ${g.y1} H${g.x2}`; continue }
      const x = xl[g.i] ?? (g.x1 + g.x2) / 2, sg = dy > 0 ? 1 : -1
      const r = Math.max(2, Math.min(9, Math.abs(dy) / 2, x - g.x1 - 1, g.x2 - x - 1))
      out[g.i] = `M${g.x1} ${g.y1} H${x - r} Q${x} ${g.y1} ${x} ${g.y1 + sg * r} V${g.y2 - sg * r} Q${x} ${g.y2} ${x + r} ${g.y2} H${g.x2}`
    }
    return out
  }, [chNodes, chEdges, ports]) // eslint-disable-line
  const prodColor: Record<string, string> = {}
  chNodes.filter(n => n.kind === 'product').forEach((n, i) => { prodColor[n.id] = PALETTE[i % PALETTE.length] })
  const colorsOf = (id: string) => (chAdj[id] || []).map(x => prodColor[x]).filter(Boolean)   // цвета товаров, связанных с узлом (для поставщика/заказчика)
  const warehouse: string = data?.chain?.warehouse || ''

  // ── Путь ──
  const nodes: any[] = data?.nodes || []
  const edges: any[] = data?.edges || []
  const minLane = Math.min(0, ...nodes.map(n => n.lane || 0))
  const vertical = nodes.some(n => (n.lane || 0) !== 0)
  const maxLevel = Math.max(0, ...nodes.map(n => n.level || 0))
  const maxLane = Math.max(0, ...nodes.map(n => (n.lane || 0) - minLane))
  const pPos = (n: any) => vertical ? { x: 24 + ((n.lane || 0) - minLane) * COLW, y: 24 + (n.level || 0) * ROWH } : { x: 24 + (n.level || 0) * COLW, y: 24 + ((n.lane || 0) - minLane) * ROWH }
  const pW = Math.max(400, 24 + ((vertical ? maxLane : maxLevel) + 1) * COLW)
  const pH = Math.max(200, 24 + ((vertical ? maxLevel : maxLane) + 1) * ROWH)
  const parents = useMemo(() => { const m: Record<number, number[]> = {}; for (const e of edges) (m[e.to] ||= []).push(e.from); return m }, [edges])
  const pPath = useMemo(() => { const set = new Set<number>(); if (selP == null) return set; const w = (id: number) => { if (set.has(id)) return; set.add(id); for (const p of (parents[id] || [])) w(p) }; w(selP); return set }, [selP, parents])
  const pSel = nodes.find(n => n.id === selP)

  // Линии прямые (волнистые сливались друг с другом): отрезок от порта к порту.
  const bez = (x1: number, y1: number, x2: number, y2: number, _vert: boolean) => `M ${x1} ${y1} L ${x2} ${y2}`

  const tabBtn = (k: 'chain' | 'path', l: string) => (
    <button onClick={() => setTab(k)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: tab === k ? COLORS.primary : '#fff', color: tab === k ? '#fff' : COLORS.textMuted, boxShadow: tab === k ? 'none' : '0 0 0 1.5px #e6e2dc' }}>{l}</button>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,40,.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: full ? 0 : 16 }}>
      <div onClick={e => e.stopPropagation()} className="anim-pop" style={{ width: full ? '100vw' : 'min(960px,96vw)', height: full ? '100vh' : 'min(640px,90vh)', background: '#fff', borderRadius: full ? 0 : 14, boxShadow: '0 20px 60px rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '9px 14px', borderBottom: '1px solid #eef0f3', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>🔗 Связки</span>
          {doc && <><span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.primary }}>{doc.no}</span>
            <span style={{ fontSize: 13, color: COLORS.textMuted }}>{doc.kind}</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtMoney(Number(doc.sum || 0))} ₸</span></>}
          <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>{tabBtn('chain', '🧩 Цепочка')}{tabBtn('path', '🛤 Путь')}</div>
          <button onClick={() => setFull(v => !v)} title={full ? 'Свернуть окно' : 'Развернуть во весь экран'} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, border: '1.5px solid #e6e2dc', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: COLORS.textMuted }}>{full ? '🗗 Свернуть' : '⛶ Во весь экран'}</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
        </div>
        {doc && (
          <div style={{ padding: '6px 14px', borderBottom: '1px solid #eef0f3', display: 'flex', alignItems: 'center', gap: 8, background: '#faf9fc', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: '#8b94a0', fontWeight: 600 }}>ОТКУДА</span>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#7a3aaa', background: '#f3eeff', padding: '4px 12px', borderRadius: 20 }}>🏭 {doc.supplier || '—'}</span>
            <span style={{ color: '#b0bccb', fontSize: 18, fontWeight: 700 }}>→</span>
            <span style={{ fontSize: 11.5, color: '#8b94a0', fontWeight: 600 }}>КОМУ</span>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#2e8a5e', background: '#e8f5ee', padding: '4px 12px', borderRadius: 20 }}>🧑 {doc.buyer || '—'}</span>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div onClick={() => tab === 'chain' && setSelCh(null)} title="Клик по пустому месту — снять выбор" style={{ flex: 1, overflow: 'auto', background: '#f7f8fa' }}>
            {!data ? <div style={{ padding: 40, color: COLORS.textMuted }}>Загрузка…</div>
              : tab === 'chain' ? (
                chNodes.length === 0 ? <div style={{ padding: 40, color: COLORS.textMuted }}>Нет данных цепочки</div> : (
                  <div style={{ position: 'relative', width: chW, height: chH, minWidth: '100%' }}>
                    <div style={{ display: 'flex', gap: 0, padding: '2px 14px', position: 'sticky', top: 0 }}>
                      {['🏭 Поставщики', warehouse ? `🏬 ${warehouse} · товары` : '📦 Товары', '🧑 Заказчики'].map((h, i) => <div key={i} style={{ width: CCOLW, fontSize: 12, fontWeight: 700, color: '#8b94a0' }}>{h}</div>)}
                    </div>
                    <svg width={chW} height={chH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                      {chEdges.map((e, i) => ({ e, i })).sort((x, y) => (selCh ? Number(chEdgeOn.has(x.i)) - Number(chEdgeOn.has(y.i)) : 0)).map(({ e, i }) => { const a = chNodes.find(n => n.id === e.from), b = chNodes.find(n => n.id === e.to); if (!a || !b) return null; const pa = chPos(a), pb = chPos(b); const on = !selCh || chEdgeOn.has(i); const col = !selCh ? (prodColor[a.kind === 'product' ? a.id : b.id] || '#7a3aaa') : on ? (prodColor[a.kind === 'product' ? a.id : b.id] || '#7a3aaa') : '#c9d0d8'; return <path key={i} d={chPaths[i] || ''} fill="none" stroke={col} strokeLinecap="round" strokeLinejoin="round" strokeWidth={selCh ? (on ? 3.4 : 1.2) : 2} opacity={on ? 0.95 : 0.6} style={{ transition: 'stroke .15s, opacity .15s' }} /> })}
                    </svg>
                    {chNodes.map(n => { const p = chPos(n), c = KIND[n.kind], on = chComp.has(n.id), isSel = n.id === selCh; return (
                      <div key={n.id} onClick={e => { e.stopPropagation(); setSelCh(selCh === n.id ? null : n.id) }} title={n.label} style={{ position: 'absolute', left: p.x, top: p.y, width: CNW, height: CNH, borderRadius: 10, background: c.bg, border: `${n.kind === 'product' ? 2 : 1.5}px solid ${n.kind === 'product' ? prodColor[n.id] : (isSel ? c.line : c.ring)}`, borderLeft: n.kind === 'product' ? `7px solid ${prodColor[n.id]}` : undefined, boxShadow: isSel ? '0 6px 18px -8px rgba(20,28,40,.45)' : 'none', opacity: !selCh || on ? 1 : 0.35, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', transition: 'opacity .15s, border-color .15s' }}>
                        {n.kind === 'product' && <RalDot code={extractRal(n.label)} size={12} />}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: c.line, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: CNW - 28, lineHeight: 1.2 }}>{n.label}</div>
                          {n.sub && <div style={{ fontSize: 10.5, color: '#8b94a0', lineHeight: 1.2 }}>{n.sub}</div>}
                          {n.kind !== 'product' && <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>{colorsOf(n.id).slice(0, 12).map((cl, k) => <span key={k} style={{ width: 7, height: 7, borderRadius: '50%', background: cl }} />)}</div>}
                        </div>
                      </div>
                    ) })}
                  </div>
                )
              ) : (
                <div style={{ position: 'relative', width: pW, height: pH, minWidth: '100%' }}>
                  <svg width={pW} height={pH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {edges.map((e, i) => { const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to); if (!a || !b) return null; const pa = pPos(a), pb = pPos(b); const on = pPath.has(e.from) && pPath.has(e.to); const ret = e.kind === 'return', link = e.kind === 'link'; const col = ret ? '#b4574c' : link ? '#7a3aaa' : on ? '#9aa8b8' : '#e0e4ea'; const d = vertical ? bez(pa.x + NW / 2, pa.y + NH, pb.x + NW / 2, pb.y, true) : bez(pa.x + NW, pa.y + NH / 2, pb.x, pb.y + NH / 2, false); return <path key={i} d={d} fill="none" stroke={col} strokeWidth={on ? 2.2 : 1.5} strokeDasharray={ret || link ? '5 5' : undefined} style={{ transition: 'stroke .15s' }} /> })}
                  </svg>
                  {nodes.map(n => { const p = pPos(n), c = STATE[n.key === 'link' ? 'link' : n.key === 'branch' ? 'branch' : (STATE[n.state] ? n.state : 'pending')], on = pPath.has(n.id), isSel = n.id === selP; return (
                    <div key={n.id} onClick={() => setSelP(n.id)} title={n.label} style={{ position: 'absolute', left: p.x, top: p.y, width: NW, height: NH, borderRadius: 27, background: c.bg, border: `1.5px ${n.state === 'pending' ? 'dashed' : 'solid'} ${isSel ? c.line : c.ring}`, boxShadow: isSel ? '0 6px 18px -8px rgba(20,28,40,.45)' : 'none', opacity: on ? 1 : 0.82, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', transition: 'opacity .15s' }}>
                      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: c.line, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{n.key === 'link' ? '↔' : n.state === 'done' ? '✓' : n.state === 'current' ? '●' : n.state === 'returned' ? '↩' : '·'}</span>
                      <div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: n.state === 'returned' ? '#b4574c' : '#2c3138', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</div><div style={{ fontSize: 10.5, color: '#8b94a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.at ? fmtDT(n.at) : (n.state === 'pending' ? 'впереди' : '')}{n.user ? ' · ' + n.user : ''}</div></div>
                    </div>
                  ) })}
                </div>
              )}
          </div>

          <div style={{ width: 230, borderLeft: '1px solid #eef0f3', padding: 12, overflowY: 'auto', flexShrink: 0 }}>
            {tab === 'chain' ? (chSel ? (
              <>
                <div style={{ fontSize: 11, color: '#8b94a0', marginBottom: 4 }}>{chSel.kind === 'supplier' ? 'ПОСТАВЩИК' : chSel.kind === 'buyer' ? 'ЗАКАЗЧИК' : 'ТОВАР'}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: KIND[chSel.kind].line, marginBottom: 4 }}>{chSel.label}</div>
                {chSel.sub && <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 10 }}>{chSel.sub}</div>}
                <div style={{ fontSize: 12.5, color: '#3a4048', marginTop: 8 }}>Связано узлов в цепочке: <b>{chComp.size}</b></div>
                <div style={{ fontSize: 12, color: '#8b94a0', marginTop: 12, lineHeight: 1.5 }}>Клик по любому узлу подсвечивает его цепочку: поставщик → товар → заказчик.</div>
              </>
            ) : <div style={{ color: COLORS.textMuted, fontSize: 14 }}>Выберите узел цепочки</div>)
              : (pSel ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{pSel.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div><div style={{ fontSize: 11, color: '#8b94a0' }}>Когда</div><div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDT(pSel.at)}</div></div>
                    <div><div style={{ fontSize: 11, color: '#8b94a0' }}>Кто</div><div style={{ fontSize: 13, fontWeight: 600 }}>{pSel.user || '—'}</div></div>
                  </div>
                  {pSel.detail && <div style={{ fontSize: 13, color: '#3a4048', background: '#f2f4f7', borderRadius: 8, padding: '8px 10px' }}>{pSel.detail}</div>}
                  {pSel.linkCardId && <div style={{ fontSize: 12.5, color: '#7a3aaa', marginTop: 10 }}>Связанная карточка: <b>{pSel.linkCardId}</b></div>}
                </>
              ) : <div style={{ color: COLORS.textMuted, fontSize: 14 }}>Выберите этап</div>)}
          </div>
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid #eef0f3', fontSize: 12.5, color: '#8b94a0' }}>{tab === 'chain' ? 'Цепочка: нажми на поставщика/товар/заказчика — подсветится связанный путь. Через Центр-Склад.' : 'Путь документа. Нажми на этап — подсветится путь до него.'}</div>
      </div>
    </div>
  )
}
