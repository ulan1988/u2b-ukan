// УМНЫЙ ПОИСК (правило 11.11.2026): ищем ПО СЛОВАМ, а не по подстроке целиком.
// «евро 7024» должно находить «Евро брус МП RAL7024 0,4мм», хотя подряд такой строки нет:
// каждое слово запроса просто обязано встретиться где-то в названии — в начале, в середине
// или в конце, в любом порядке. Регистр и ё/е не важны.
export const normSearch = (s?: string | null) =>
  (s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

// Слова запроса. Пустой запрос → пустой список (значит «ничего не фильтруем»).
export const searchWords = (q?: string | null) => normSearch(q).split(' ').filter(Boolean)

// Подходит ли строка под запрос: ВСЕ слова запроса есть в тексте.
// text можно передавать несколькими кусками — имя, алиас, группа и т.п.
export function matchWords(q: string | null | undefined, ...text: Array<string | null | undefined>): boolean {
  const words = searchWords(q)
  if (!words.length) return true
  const hay = normSearch(text.filter(Boolean).join(' '))
  return words.every(w => hay.includes(w))
}

// Фильтр списка по словам: pick достаёт из элемента текст для поиска.
export function filterByWords<T>(list: T[], q: string | null | undefined, pick: (x: T) => string): T[] {
  const words = searchWords(q)
  if (!words.length) return list
  return list.filter(x => { const hay = normSearch(pick(x)); return words.every(w => hay.includes(w)) })
}
