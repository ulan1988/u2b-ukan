'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useLiveData } from '@/lib/live'
import { listMessages, sendMessage } from '@/lib/api/orders'

interface Msg { id: string; userId: string; userName: string; role: string; text: string; createdAt: string }

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Админ', admin: 'Админ', bookkeeper: 'Бухгалтер', logist: 'Логист',
  branch: 'Филиал', client: 'Клиент', supplier_client: 'Клиент', warehouse: 'Склад',
}
const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  super_admin: { bg: '#211f1c', color: '#fff' }, admin: { bg: '#211f1c', color: '#fff' },
  bookkeeper: { bg: '#e8f5ee', color: '#2e8a5e' }, logist: { bg: '#eef2ff', color: '#4a5aaa' },
  branch: { bg: '#fff0ea', color: '#c0532a' }, client: { bg: '#fdf8e1', color: '#8a6f00' },
  supplier_client: { bg: '#fdf8e1', color: '#8a6f00' },
}
const PRIMARY = '#d4613a'

function fmtTime(iso: string) {
  const d = new Date(iso), now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0')
  if (sameDay) return `${hh}:${mm}`
  const dd = String(d.getDate()).padStart(2, '0'), mo = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mo} ${hh}:${mm}`
}

// Общая лента чата карточки. Используется в модалке карточки и в глобальном чат-виджете.
// myId — свои сообщения справа/акцентом. onCount — число сообщений родителю (бейдж вкладки).
export default function CardChat({ cardId, myId, height = 300, onCount }: {
  cardId: string; myId: string; height?: number | string; onCount?: (n: number) => void
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const onCountRef = useRef(onCount); onCountRef.current = onCount
  const lastCountRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const arr = await listMessages(cardId) as Msg[]
      setMsgs(Array.isArray(arr) ? arr : [])
      if (lastCountRef.current !== arr.length) { lastCountRef.current = arr.length; onCountRef.current?.(arr.length) }
    } finally { setLoaded(true) }
  }, [cardId])
  useLiveData(load, [cardId])

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight }, [msgs.length])

  async function send() {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try { const r: any = await sendMessage(cardId, t); if (r.ok !== false) { setText(''); await load() } } finally { setSending(false) }
  }
  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 2px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!loaded ? <div style={{ color: '#5f5952', fontSize: 14, textAlign: 'center', padding: 20 }}>Загрузка…</div>
          : msgs.length === 0 ? <div style={{ color: '#5f5952', fontSize: 14, textAlign: 'center', padding: 20 }}>Сообщений пока нет. Напишите первым.</div>
          : msgs.map(m => {
            const mine = m.userId === myId
            const rs = ROLE_STYLE[m.role] || { bg: '#efece8', color: '#6b655b' }
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3, flexDirection: mine ? 'row-reverse' : 'row' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{m.userName}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: rs.bg, color: rs.color }}>{ROLE_LABEL[m.role] || m.role}</span>
                  <span style={{ fontSize: 12, color: '#6b645b' }}>{fmtTime(m.createdAt)}</span>
                </div>
                <div style={{ maxWidth: '85%', padding: '7px 11px', borderRadius: 12, fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: mine ? PRIMARY : '#f1efec', color: mine ? '#fff' : '#26231f' }}>{m.text}</div>
              </div>
            )
          })}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', paddingTop: 8, borderTop: '1px solid #f1efec', marginTop: 6 }}>
        <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} placeholder="Сообщение по заказу..." rows={1}
          style={{ flex: 1, resize: 'none', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e6e2dc', fontSize: 14, fontFamily: 'inherit', maxHeight: 90, outline: 'none', boxSizing: 'border-box' }} />
        <button onClick={send} disabled={sending || !text.trim()} title="Отправить (Enter)"
          style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: 14, cursor: sending || !text.trim() ? 'not-allowed' : 'pointer', opacity: sending || !text.trim() ? 0.5 : 1, fontFamily: 'inherit', flexShrink: 0 }}>➤</button>
      </div>
    </div>
  )
}
