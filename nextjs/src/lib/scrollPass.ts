'use client'
// КОЛЕСО МЫШИ НЕ ДОЛЖНО УПИРАТЬСЯ В ВЫПАДАШКУ (правило владельца 23.11.2026). У выпадающих списков (товар,
// контрагент) под списком лежит прозрачная подложка на весь экран — по клику она закрывает список. Но она же
// «съедала» колесо: страница админки крутится не у окна, а у внутреннего блока (.adm-main), до которого событие
// с подложки не доходит. Человеку приходилось закрывать список, чтобы прокрутить экран. Подложка теперь сама
// передаёт прокрутку странице, а список переезжает вслед за своим полем (у него пересчёт позиции на scroll).
import type { WheelEvent } from 'react'

// Ближайший прокручиваемый предок поля (в админке — .adm-main), иначе сама страница.
export function pageScroller(from?: Element | null): Element | null {
  let el: Element | null = from || null
  while (el && el !== document.body) {
    const st = getComputedStyle(el)
    if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el
    el = el.parentElement
  }
  return document.scrollingElement
}

// onWheel для подложки: крутим страницу так же, как если бы подложки не было.
export const wheelToPage = (anchor: () => Element | null | undefined) => (e: WheelEvent) => {
  const s = pageScroller(anchor() || null)
  if (s) s.scrollBy({ top: e.deltaY, left: e.deltaX })
}
