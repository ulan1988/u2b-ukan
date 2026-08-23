// Имя изделия = идентичность товара: «{вид} {цвет} {см} см» (напр. «Изделие 9003 15 см»).
// Единая формула для всей оперативки (кабинет мастера, спец-проект, прямой заказ):
// по этому имени создаётся товар в базе и считается рентабельность.
// Нормализует: срезает уже присутствующий «N см» и пересобирает по актуальному размеру,
// цвет добавляет один раз («decor» → «дерево»).
export function itemName({ name, color, cm }: { name?: string; color?: string; cm?: string | number }): string {
  let n = (name || 'Изделие').trim()
  n = n.replace(/\s*\d+\s*см\s*$/i, '').trim() || 'Изделие'
  if (color) {
    const label = String(color) === 'decor' ? 'дерево' : String(color)
    const low = n.toLowerCase()
    if (!low.includes(label.toLowerCase()) && !low.includes(String(color).toLowerCase())) n += ' ' + label
  }
  const cmStr = cm != null && String(cm).trim() !== '' ? String(cm).trim() : ''
  if (cmStr) n += ` ${cmStr} см`
  return n
}
