// Имя изделия = идентичность товара: «{вид} {цвет} {см} см» (напр. «Изделие 9003 15 см»).
// Единая формула для всей оперативки (кабинет мастера, спец-проект, прямой заказ):
// по этому имени создаётся товар в базе и считается рентабельность.
export function itemName({ name, color, cm }: { name?: string; color?: string; cm?: string | number }): string {
  let n = (name || 'Изделие').trim()
  if (color && !n.toLowerCase().includes(String(color).toLowerCase())) n += ' ' + color
  const cmStr = cm != null && String(cm).trim() !== '' ? String(cm).trim() : ''
  if (cmStr && !/\d+\s*см/i.test(n)) n += ` ${cmStr} см`
  return n
}
