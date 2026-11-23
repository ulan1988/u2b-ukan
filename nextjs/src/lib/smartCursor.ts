'use client'
// УМНЫЙ КУРСОР (правило владельца 23.11.2026). Человек не должен щёлкать в поле, которое и так
// очевидно следующее: открыл окно — курсор уже в сумме; выбрал товар — курсор уже в количестве;
// нажал Enter — курсор в следующем поле. Значение при этом выделено, чтобы сразу печатать поверх.
// В любом новом окне/шторке/строке ввода ставить это сразу, а не «потом».
import type { KeyboardEvent } from 'react'

// Поставить курсор в поле (и выделить содержимое). Возвращает false, если поля нет.
export function cursorTo(el: Element | null | undefined, select = true): boolean {
  const i = el as HTMLInputElement | null | undefined
  if (!i || typeof i.focus !== 'function' || i.disabled) return false
  try { i.focus(); if (select && typeof i.select === 'function') i.select() } catch { /* поле недоступно */ }
  return true
}

// ref главного поля: окно/шторка открылась — курсор уже здесь.  <input ref={cursorHere} … />
export const cursorHere = (el: HTMLInputElement | null) => { if (el) setTimeout(() => cursorTo(el), 0) }

// Поле появится после перерисовки (добавили строку, выбрали товар) — ждём его по селектору.
export function cursorSoon(selector: string, root?: ParentNode | null, tries = 10) {
  const go = (n: number) => {
    const el = (root || document).querySelector(selector)
    if (el) cursorTo(el)
    else if (n > 0) setTimeout(() => go(n - 1), 40)
  }
  setTimeout(() => go(tries), 0)
}

// Щёлкнули по строке (товар в каталоге) — курсор в её поле ввода.
export function cursorInRow(row: Element | null | undefined, selector = 'input[data-qty-cell]') {
  if (row) cursorTo(row.querySelector(selector))
}

// Enter в поле → курсор в следующее.  onKeyDown={enterTo('input[data-x="…"]')}
export const enterTo = (selector: string, root?: ParentNode | null) => (e: KeyboardEvent) => {
  if (e.key !== 'Enter') return
  e.preventDefault()
  cursorSoon(selector, root)
}

// Широкий экран (компьютер): на телефоне курсор в поле сразу поднимает клавиатуру поверх списка,
// поэтому поиск и схему фокусируем сами только за компьютером.
export const isWideScreen = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1000px)').matches
