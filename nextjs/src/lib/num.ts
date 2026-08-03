// Номер документа: раздельные счётчики по типу + дата. ЗП-0001-DDMMYY (закуп),
// ПР-0001-DDMMYY (продажа) и т.д. count передаётся снаружи (по своему типу).
const PREFIX: Record<string, string> = {
  purchase: 'ЗП', sale: 'ПР', production: 'ПРЗ', transfer: 'ПМ', act: 'АКТ', opening: 'НО',
  return_in: 'ВП', return_out: 'ВС',   // возврат от покупателя / поставщику
}

export function docNumber(type: string, count: number): string {
  const p = PREFIX[type] || 'ДК'
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${p}-${String(count + 1).padStart(4, '0')}-${dd}${mm}${yy}`
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
