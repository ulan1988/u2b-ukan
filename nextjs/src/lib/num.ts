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
