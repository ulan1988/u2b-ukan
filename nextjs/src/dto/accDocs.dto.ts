import { z } from 'zod';

// ── Сумма прописью (казахстанский стандарт: «… тенге NN тиын») ────────────────
const ONES_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEN_19 = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function triplet(n: number, feminine: boolean): string[] {
  const words: string[] = [];
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
  if (h) words.push(HUNDREDS[h]);
  if (t > 1) { words.push(TENS[t]); if (o) words.push((feminine ? ONES_F : ONES_M)[o]); }
  else if (t === 1) { words.push(TEN_19[o]); }
  else if (o) { words.push((feminine ? ONES_F : ONES_M)[o]); }
  return words;
}

// Склонение: [1, 2-4, 5+] — «тысяча/тысячи/тысяч», «миллион/миллиона/миллионов».
function plural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

export function intToWords(num: number): string {
  num = Math.floor(Math.abs(num));
  if (num === 0) return 'ноль';
  const parts: string[] = [];
  const billions = Math.floor(num / 1e9) % 1000;
  const millions = Math.floor(num / 1e6) % 1000;
  const thousands = Math.floor(num / 1e3) % 1000;
  const units = num % 1000;
  if (billions) { parts.push(...triplet(billions, false), plural(billions, ['миллиард', 'миллиарда', 'миллиардов'])); }
  if (millions) { parts.push(...triplet(millions, false), plural(millions, ['миллион', 'миллиона', 'миллионов'])); }
  if (thousands) { parts.push(...triplet(thousands, true), plural(thousands, ['тысяча', 'тысячи', 'тысяч'])); }
  if (units) { parts.push(...triplet(units, false)); }   // тенге — мужской род
  return parts.join(' ');
}

// «Девяносто пять тысяч тенге 00 тиын»
export function amountInWordsKzt(amount: number | string): string {
  const a = Math.round((Number(amount) || 0) * 100) / 100;
  const tenge = Math.floor(a);
  const tiyn = Math.round((a - tenge) * 100);
  const w = intToWords(tenge);
  const cap = w.charAt(0).toUpperCase() + w.slice(1);
  return `${cap} тенге ${String(tiyn).padStart(2, '0')} тиын`;
}

// ── Автонумерация по типу (продолжаем с номеров образцов) ────────────────────
export const DOC_TYPES = ['invoice', 'nakladnaya', 'akt', 'kp'] as const;
export type DocType = (typeof DOC_TYPES)[number];

// «Следующий» номер: нумерация по типу начинается с 1 (дальше max+1 по орг).
export const DOC_NEXT_SEED: Record<DocType, number> = { invoice: 1, nakladnaya: 1, akt: 1, kp: 1 };

export function nextDocNumber(type: DocType, existing: Array<number | string>): number {
  const seed = DOC_NEXT_SEED[type] || 1;
  const maxExisting = existing.length ? Math.max(...existing.map(n => Number(n) || 0)) : 0;
  return Math.max(seed, maxExisting + 1);
}

// ── Схемы ────────────────────────────────────────────────────────────────────
export const docItemSchema = z.object({
  name: z.string().trim().min(1),
  sku: z.string().nullish(),
  qty: z.coerce.number().default(1),
  unit: z.string().default('шт'),
  price: z.coerce.number().default(0),
});

export const documentCreateSchema = z.object({
  type: z.enum(DOC_TYPES),
  docDate: z.string().nullish(),
  buyerName: z.string().trim().min(1, 'Укажите покупателя'),
  buyerBin: z.string().nullish(),
  buyerAddress: z.string().nullish(),
  buyerRequisites: z.string().nullish(),
  bank: z.enum(['kaspi', 'bck']).nullish(),
  items: z.array(docItemSchema).min(1, 'Добавьте хотя бы одну позицию'),
  withStamp: z.boolean().optional().default(false),
  withSign: z.boolean().optional().default(false),
  comment: z.string().nullish(),
});
export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;

// Позиции → суммы и итог.
export function computeItems<T extends { qty: number | string; price: number | string }>(items: T[]) {
  const rows = items.map(it => {
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    return { ...it, qty, price, sum: Math.round(qty * price * 100) / 100 };
  });
  const total = Math.round(rows.reduce((s, r) => s + r.sum, 0) * 100) / 100;
  return { rows, total };
}
