'use client'
// Общие мелочи Приёмки: кнопка + стили полей + константы. Вынесено из ReceptionScreen,
// чтобы подкомпоненты (черновик закупа, стол приёмки, автозакуп) не тянули дубли.
import type { CSSProperties, ReactNode } from 'react'
import { COLORS } from '@/lib/colors'

export const INP: CSSProperties = { width: '100%', padding: '9px 13px', borderRadius: 7, fontSize: 14, border: '1.5px solid #e6e2dc', background: '#fff', outline: 'none', fontFamily: 'inherit', color: '#26231f' }
export const inpSm: CSSProperties = { ...INP, padding: '6px 8px', fontSize: 13 }
export const LBL: CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5f5952', marginBottom: 4, display: 'block', letterSpacing: '.04em' }
export const PAY = ['', 'Оплачено', 'Не оплачено', 'Частично']
export const purple = '#7a3aaa'

export function Btn({ onClick, children, variant, disabled, style }: { onClick: () => void; children: ReactNode; variant?: 'primary' | 'ghost'; disabled?: boolean; style?: CSSProperties }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
        background: variant === 'primary' ? (disabled ? '#e9e5e0' : COLORS.primary) : variant === 'ghost' ? 'transparent' : COLORS.white, color: variant === 'primary' ? (disabled ? '#a89f95' : '#fff') : COLORS.text,
        boxShadow: variant === 'primary' || variant === 'ghost' ? 'none' : '0 0 0 1.5px #d8d3cc', ...style }}>{children}</button>
  )
}
