// Номер документа: раздельные счётчики по типу + дата. ЗП-0001-DDMMYY (закуп),
// ПР-0001-DDMMYY (продажа) и т.д. count передаётся снаружи (по своему типу).
const PREFIX: Record<string, string> = {
  purchase: 'ЗП', sale: 'ПР', production: 'ПРЗ', transfer: 'ПМ', act: 'АКТ', opening: 'НО',
  return_in: 'ВП', return_out: 'ВС',   // возврат от покупателя / поставщику
}

// Код заказа мастера производства: ЗК-NN-DDMMYY. seq — продолжающийся номер (01, 02…),
// дата — сегодняшняя. Показываем как «ЗК 01 140826».
export function prodOrderNumber(seq: number): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `ЗК-${String(seq).padStart(2, '0')}-${dd}${mm}${yy}`
}

export function docNumber(type: string, count: number): string {
  const p = PREFIX[type] || 'ДК'
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  // Оригинальная система Улкана: 4-значный номер + дата. До 9999, дальше круг
  // с меткой [1], [2]… — «под-id» карточки: ЗП-0001-290726 [1]. Старые C-… не трогаем.
  const cycle = Math.floor(count / 9999)
  const pos = (count % 9999) + 1
  const seq = String(pos).padStart(4, '0')
  return `${p}-${seq}-${dd}${mm}${yy}${cycle > 0 ? ` [${cycle}]` : ''}`
}

// Транслит кириллицы → адрес личного портала (/rsp/{slug} и т.п.).
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
export function slugify(name: string, salt: string): string {
  const base = (name || 'user').toLowerCase().split('').map(c => TRANSLIT[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'user'
  return `${base}-${salt.slice(0, 4)}`
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Дата → YYYY-MM-DD (для поля date; из timestamp приёмки логистом).
export function toYMD(d: Date | string): string {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// YYYY-MM-DD → ДДММГГ (для номера накладной 01-060826).
export function ddmmyy(ymd: string): string {
  const [y, m, d] = toYMD(ymd).split('-')
  return `${d}${m}${y.slice(-2)}`
}

// Номер приходной: порядковый за день + дата. seq — счётчик за этот день (1,2,…).
export function invoiceNumber(seq: number, ymd: string): string {
  return `${String(seq).padStart(2, '0')}-${ddmmyy(ymd)}`
}
