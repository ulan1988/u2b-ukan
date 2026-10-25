import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign, TableLayoutType, ImageRun,
} from 'docx';
import { intToWords, amountInWordsKzt } from '@/dto/accDocs.dto';
import { formatDate } from '@/lib/accDocs/format';

// Общие типы/хелперы для Накладной З-2, Акта Р-1 и КП. Формы собраны в коде,
// печать/подпись/логотип берутся из org_settings (base64).
type Item = { name: string; sku?: string | null; qty: number; unit: string; price: number; sum: number };
type Doc = {
  docNo?: string | null; number: number; docDate?: string | null;
  buyerName?: string | null; buyerBin?: string | null; buyerAddress?: string | null;
  items?: Item[] | null; total?: string | number | null; amountWords?: string | null;
  withStamp?: boolean | null; withSign?: boolean | null;
};
type Org = {
  companyName?: string | null; companyFull?: string | null; bin?: string | null; address?: string | null;
  phone?: string | null; directorName?: string | null; logoB64?: string | null; stampB64?: string | null; signB64?: string | null;
  naklTemplateB64?: string | null; aktTemplateB64?: string | null; kpTemplateB64?: string | null;
};

const F = 'Times New Roman';
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d?: string | null) => formatDate(d);
const stripB64 = (s?: string | null) => (s ? s.replace(/^data:image\/\w+;base64,/, '') : '');
const qtyTotal = (doc: Doc) => (doc.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);

const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };
const boxAll = { top: thin, bottom: thin, left: thin, right: thin };

// ── EXCEL helpers ────────────────────────────────────────────────────────────
function xlHeaderNote(ws: ExcelJS.Worksheet, r: number, lines: string[]) {
  lines.forEach((t) => {
    ws.mergeCells(`F${r}:H${r}`);
    const c = ws.getCell(`F${r}`); c.value = t; c.font = { name: F, size: 8 }; c.alignment = { horizontal: 'right' };
    r++;
  });
  return r;
}
function mergeRow(ws: ExcelJS.Worksheet, row: number, c1: string, c2: string, value: string, opts: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; wrap?: boolean } = {}) {
  ws.mergeCells(`${c1}${row}:${c2}${row}`);
  const cell = ws.getCell(`${c1}${row}`);
  cell.value = value;
  cell.font = { name: F, size: opts.size || 10, bold: !!opts.bold };
  cell.alignment = { horizontal: opts.align || 'left', vertical: 'middle', wrapText: !!opts.wrap };
  return cell;
}
function stampSign(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, doc: Doc, org: Org, col: number, row: number) {
  if (doc.withSign && org.signB64) {
    const id = wb.addImage({ base64: stripB64(org.signB64), extension: 'png' });
    ws.addImage(id, { tl: { col, row } as ExcelJS.Anchor, ext: { width: 110, height: 69 } });
  }
  if (doc.withStamp && org.stampB64) {
    const id = wb.addImage({ base64: stripB64(org.stampB64), extension: 'png' });
    ws.addImage(id, { tl: { col: col + 1.2, row: row - 0.5 } as ExcelJS.Anchor, ext: { width: 124, height: 124 } });
  }
}

// ── НАКЛАДНАЯ З-2 ────────────────────────────────────────────────────────────
// Накладная = ЗАПОЛНЕНИЕ ГОСТ-шаблона З-2 (org.naklTemplateB64) 1-в-1; печать/подпись
// вставляются из assets по чекбоксам. Нет шаблона — старая сборка кодом (fallback).
export async function buildNakladnayaExcel(doc: Doc, org: Org): Promise<Buffer> {
  if (org.naklTemplateB64) {
    try { return await fillNakladnayaTemplate(doc, org); }
    catch (e) { console.warn('[nakladnaya template] fallback:', (e as Error).message); }
  }
  return buildNakladnayaExcelLegacy(doc, org);
}

// Карта ячеек шаблона З-2: AP12 №, AT12 дата, L17 получатель; товары с 22-й
// (A №, C наим, T ед, W подлежит, AB отпущено, AF цена, AL=SUM(AB*AF)); Итого по
// метке; N26 кол-во прописью, AE26 сумма прописью; печать C31(200x215), подпись L27(150x102).
async function fillNakladnayaTemplate(doc: Doc, org: Org): Promise<Buffer> {
  const strip = (s?: string | null) => (s ? s.replace(/^data:image\/\w+;base64,/, '') : '');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(strip(org.naklTemplateB64), 'base64') as never);
  const ws = wb.worksheets[0];
  const txt = (c: ExcelJS.Cell): string => {
    const v = c.value as unknown;
    if (v && typeof v === 'object' && 'richText' in (v as object)) return (v as { richText: { text: string }[] }).richText.map(t => t.text).join('');
    return typeof v === 'string' ? v : '';
  };
  ws.getCell('AP12').value = doc.number;
  ws.getCell('AT12').value = `${dmy(doc.docDate)} г.`;
  ws.getCell('L17').value = `БИН / ИИН: ${doc.buyerBin || ''}\n${doc.buyerName || ''}`;

  const items = (doc.items || []).filter(it => (it.name || '').trim());
  const START = 22, BASE = 2, need = Math.max(items.length, 1);
  const k = need - BASE;                               // сколько строк добавили (для сдвига зон ниже)
  if (k > 0) ws.duplicateRow(START, k, true);
  else if (k < 0) ws.spliceRows(START + need, -k);

  const rowM = (r: number) => [`A${r}:B${r}`, `C${r}:N${r}`, `T${r}:V${r}`, `W${r}:AA${r}`, `AB${r}:AE${r}`, `AF${r}:AK${r}`, `AL${r}:AQ${r}`];
  let total = 0;
  items.forEach((it, i) => {
    const r = START + i;
    rowM(r).forEach(m => { try { ws.unMergeCells(m); } catch { /* not merged */ } try { ws.mergeCells(m); } catch { /* already */ } });
    const qty = Number(it.qty) || 0, price = Number(it.price) || 0; total += qty * price;
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`C${r}`).value = it.name || '';
    ws.getCell(`T${r}`).value = it.unit || 'шт';
    ws.getCell(`W${r}`).value = qty;
    ws.getCell(`AB${r}`).value = qty;
    ws.getCell(`AF${r}`).value = price;
    // формула суммы строки — живая, но с верными ссылками (после вставки строк
    // копия не сдвигает ссылки сама): AL = отпущено × цена.
    ws.getCell(`AL${r}`).value = { formula: `SUM(AB${r}*AF${r})` } as ExcelJS.CellFormulaValue;
  });
  const lastItem = START + need - 1;
  for (let r = START; r <= START + need + 12; r++) {
    if (txt(ws.getCell(`V${r}`)).startsWith('Итого')) ws.getCell(`AL${r}`).value = { formula: `SUM(AL${START}:AL${lastItem})` } as ExcelJS.CellFormulaValue;
    if (txt(ws.getCell(`A${r}`)).startsWith('Всего отпущено')) {
      ws.getCell(`N${r}`).value = intToWords(items.length);
      ws.getCell(`AE${r}`).value = amountInWordsKzt(total);
    }
  }
  // Печать/подпись — по МЕТКАМ шаблона (не по координатам): подпись ставим НАД
  // словом «подпись» (над линией), штамп — на «М.П.». Метки ищем ПОСЛЕ вставки
  // строк — значит они уже сдвинуты, отдельная поправка на k не нужна.
  const colNum = (addr: string) => { let n = 0; for (const ch of addr.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
  let mp: { c: number; r: number } | null = null, sg: { c: number; r: number } | null = null;
  for (let r = START; r <= ws.rowCount && !(mp && sg); r++) {
    ws.getRow(r).eachCell(c => {
      const t = txt(c).trim();
      if (!mp && /^М\.?\s*П\.?$/.test(t)) mp = { c: colNum(c.address), r };
      if (!sg && t === 'подпись') sg = { c: colNum(c.address), r };
    });
  }
  if (doc.withSign && org.signB64 && sg) { const s = sg as { c: number; r: number }; const id = wb.addImage({ base64: strip(org.signB64), extension: 'png' }); ws.addImage(id, { tl: { col: s.c - 1, row: s.r - 3 } as ExcelJS.Anchor, ext: { width: 150, height: 102 } }); }
  if (doc.withStamp && org.stampB64 && mp) { const m = mp as { c: number; r: number }; const id = wb.addImage({ base64: strip(org.stampB64), extension: 'png' }); ws.addImage(id, { tl: { col: m.c + 1, row: m.r - 4 } as ExcelJS.Anchor, ext: { width: 200, height: 215 } }); }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function buildNakladnayaExcelLegacy(doc: Doc, org: Org): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Накладная', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 } } });
  ws.columns = [5, 34, 12, 9, 11, 11, 13, 15].map(w => ({ width: w }));
  let r = 1;
  r = xlHeaderNote(ws, r, ['Приложение 26', 'к приказу Министра финансов', 'Республики Казахстан', 'от 20 декабря 2012 года № 562', 'Форма З-2']);
  r++;
  mergeRow(ws, r++, 'A', 'H', 'НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ НА СТОРОНУ', { bold: true, size: 13, align: 'center' });
  mergeRow(ws, r++, 'A', 'H', `${doc.docNo || 'Накладная'} от ${dmy(doc.docDate)} г.`, { bold: true, align: 'center' });
  r++;
  mergeRow(ws, r, 'A', 'B', 'Организация-отправитель:', { bold: true }); mergeRow(ws, r++, 'C', 'H', `${org.companyName || ''}, БИН ${org.bin || ''}, ${org.address || ''}`, { wrap: true });
  mergeRow(ws, r, 'A', 'B', 'Организация-получатель:', { bold: true }); mergeRow(ws, r++, 'C', 'H', `${doc.buyerName || ''}${doc.buyerBin ? ', БИН ' + doc.buyerBin : ''}${doc.buyerAddress ? ', ' + doc.buyerAddress : ''}`, { wrap: true });
  mergeRow(ws, r, 'A', 'B', 'Транспортная организация:', {}); mergeRow(ws, r++, 'C', 'H', '', {});
  r++;

  // Заголовок таблицы (2 строки: «Количество» = подлежит отпуску / отпущено)
  const h1 = r, h2 = r + 1;
  const setH = (cell: string, v: string) => { const c = ws.getCell(cell); c.value = v; c.font = { name: F, size: 9, bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; };
  ['A', 'B', 'C', 'D', 'G', 'H'].forEach(col => ws.mergeCells(`${col}${h1}:${col}${h2}`));
  ws.mergeCells(`E${h1}:F${h1}`);
  setH(`A${h1}`, '№'); setH(`B${h1}`, 'Наименование, характеристика'); setH(`C${h1}`, 'Номенклатурный номер'); setH(`D${h1}`, 'Единица измерения');
  setH(`E${h1}`, 'Количество'); setH(`E${h2}`, 'подлежит отпуску'); setH(`F${h2}`, 'отпущено'); setH(`G${h1}`, 'Цена за единицу, в KZT'); setH(`H${h1}`, 'Сумма с НДС, в KZT');
  for (let ci = 1; ci <= 8; ci++) { ws.getCell(h1, ci).border = boxAll; ws.getCell(h2, ci).border = boxAll; ws.getCell(h1, ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }; ws.getCell(h2, ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }; }
  ws.getRow(h1).height = 16; ws.getRow(h2).height = 24;
  r = h2 + 1;
  (doc.items || []).forEach((it, i) => {
    const vals = [i + 1, it.name || '', it.sku || '', it.unit || 'шт', it.qty, it.qty, fmt(it.price), fmt(it.sum)];
    const al: Array<'left' | 'center' | 'right'> = ['center', 'left', 'center', 'center', 'center', 'center', 'right', 'right'];
    vals.forEach((v, ci) => { const c = ws.getCell(r, ci + 1); c.value = v as string | number; c.font = { name: F, size: 9 }; c.alignment = { horizontal: al[ci], vertical: 'middle', wrapText: ci === 1 }; c.border = boxAll; });
    r++;
  });
  mergeRow(ws, r, 'A', 'D', 'Итого', { bold: true, align: 'right' }); for (let ci = 1; ci <= 4; ci++) ws.getCell(r, ci).border = boxAll;
  const setB = (cell: string, v: string | number, bold = true) => { const c = ws.getCell(cell); c.value = v; c.font = { name: F, size: 9, bold }; c.alignment = { horizontal: 'center' }; c.border = boxAll; };
  setB(`E${r}`, 'х'); setB(`F${r}`, qtyTotal(doc)); setB(`G${r}`, 'х'); ws.getCell(`H${r}`).value = fmt(doc.total || 0); ws.getCell(`H${r}`).font = { name: F, size: 9, bold: true }; ws.getCell(`H${r}`).alignment = { horizontal: 'right' }; ws.getCell(`H${r}`).border = boxAll; r++;
  r++;
  mergeRow(ws, r++, 'A', 'H', `Всего отпущено количество запасов (прописью): ${intToWords(qtyTotal(doc))}`, {});
  mergeRow(ws, r++, 'A', 'H', `на сумму (прописью), в KZT: ${doc.amountWords || ''}`, { bold: true });
  mergeRow(ws, r++, 'A', 'H', 'Сумма НДС, в KZT: без НДS'.replace('НДS', 'НДС'), {});
  r += 2;

  const sr = r;
  mergeRow(ws, sr, 'A', 'B', 'Отпуск разрешил   Директор', { bold: true });
  mergeRow(ws, sr, 'C', 'D', '______________', { align: 'center' });
  mergeRow(ws, sr, 'E', 'H', `/ ${org.directorName || ''} /`, {});
  mergeRow(ws, sr + 2, 'A', 'B', 'Главный бухгалтер', { bold: true }); mergeRow(ws, sr + 2, 'C', 'D', '______________', { align: 'center' });
  mergeRow(ws, sr + 4, 'A', 'B', 'Отпустил', { bold: true }); mergeRow(ws, sr + 4, 'C', 'D', '______________', { align: 'center' });
  mergeRow(ws, sr + 4, 'E', 'F', 'Запасы получил', { bold: true }); mergeRow(ws, sr + 4, 'G', 'H', '______________', { align: 'center' });
  mergeRow(ws, sr + 6, 'A', 'B', 'М.П.', { bold: true });
  stampSign(wb, ws, doc, org, 2.1, sr - 1);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── АКТ Р-1 ──────────────────────────────────────────────────────────────────
// Акт (Р-1 / АВР) = заполнение ГОСТ-шаблона (org.aktTemplateB64) 1-в-1.
export async function buildAktExcel(doc: Doc, org: Org): Promise<Buffer> {
  if (org.aktTemplateB64) {
    try { return await fillAktTemplate(doc, org); }
    catch (e) { console.warn('[akt template] fallback:', (e as Error).message); }
  }
  return buildAktExcelLegacy(doc, org);
}

// Карта шаблона Р-1: AI15 №, AM15 дата; заказчик E8 (наим+адрес), AJ8 БИН; товары
// с 20-й (A №, C наим, V ед, Y кол, AD цена, AJ=SUM(Y*AD)); Итого по метке «х»;
// подпись над «подпись», печать на «М.П.».
async function fillAktTemplate(doc: Doc, org: Org): Promise<Buffer> {
  const strip = (s?: string | null) => (s ? s.replace(/^data:image\/\w+;base64,/, '') : '');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(strip(org.aktTemplateB64), 'base64') as never);
  const ws = wb.worksheets[0];
  const txt = (c: ExcelJS.Cell): string => {
    const v = c.value as unknown;
    if (v && typeof v === 'object' && 'richText' in (v as object)) return (v as { richText: { text: string }[] }).richText.map(t => t.text).join('');
    return typeof v === 'string' ? v : '';
  };
  ws.getCell('AI15').value = doc.number;
  ws.getCell('AM15').value = `${dmy(doc.docDate)} г.`;
  ws.getCell('E8').value = `${doc.buyerName || ''}${doc.buyerAddress ? '\n' + doc.buyerAddress : ''}`;
  ws.getCell('AJ8').value = doc.buyerBin || '';

  const items = (doc.items || []).filter(it => (it.name || '').trim());
  const START = 20, BASE = 1, need = Math.max(items.length, 1);
  if (need > BASE) ws.duplicateRow(START, need - BASE, true);
  else if (need < BASE) ws.spliceRows(START + need, BASE - need);
  const rowM = (r: number) => [`A${r}:B${r}`, `C${r}:M${r}`, `N${r}:U${r}`, `V${r}:X${r}`, `Y${r}:AC${r}`, `AD${r}:AI${r}`, `AJ${r}:AP${r}`];
  items.forEach((it, i) => {
    const r = START + i;
    rowM(r).forEach(m => { try { ws.unMergeCells(m); } catch { /* not merged */ } try { ws.mergeCells(m); } catch { /* already */ } });
    const qty = Number(it.qty) || 0, price = Number(it.price) || 0;
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`C${r}`).value = it.name || '';
    ws.getCell(`V${r}`).value = it.unit || 'усл.';
    ws.getCell(`Y${r}`).value = qty;
    ws.getCell(`AD${r}`).value = price;
    ws.getCell(`AJ${r}`).value = { formula: `SUM(Y${r}*AD${r})` } as ExcelJS.CellFormulaValue;
  });
  const lastItem = START + need - 1;
  for (let r = START; r <= START + need + 8; r++) {
    if (txt(ws.getCell(`AD${r}`)).trim() === 'х') ws.getCell(`AJ${r}`).value = { formula: `SUM(AJ${START}:AJ${lastItem})` } as ExcelJS.CellFormulaValue;
  }
  // подпись над «подпись», печать на «М.П.» (по меткам)
  const colNum = (addr: string) => { let n = 0; for (const ch of addr.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
  let mp: { c: number; r: number } | null = null, sg: { c: number; r: number } | null = null;
  for (let r = START; r <= ws.rowCount && !(mp && sg); r++) ws.getRow(r).eachCell(c => { const t = txt(c).trim(); if (!mp && /^М\.?\s*П\.?$/.test(t)) mp = { c: colNum(c.address), r }; if (!sg && t === 'подпись') sg = { c: colNum(c.address), r }; });
  if (doc.withSign && org.signB64 && sg) { const s = sg as { c: number; r: number }; const id = wb.addImage({ base64: strip(org.signB64), extension: 'png' }); ws.addImage(id, { tl: { col: s.c - 1, row: s.r - 3 } as ExcelJS.Anchor, ext: { width: 150, height: 102 } }); }
  if (doc.withStamp && org.stampB64 && mp) { const m = mp as { c: number; r: number }; const id = wb.addImage({ base64: strip(org.stampB64), extension: 'png' }); ws.addImage(id, { tl: { col: m.c + 1, row: m.r - 4 } as ExcelJS.Anchor, ext: { width: 190, height: 200 } }); }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function buildAktExcelLegacy(doc: Doc, org: Org): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Акт', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 } } });
  ws.columns = [5, 40, 20, 10, 10, 13, 15].map(w => ({ width: w }));
  let r = 1;
  r = xlHeaderNote(ws, r, ['Приложение 50', 'к приказу Министра финансов', 'Республики Казахстан', 'от 20 декабря 2012 года № 562', 'Форма Р-1']);
  r++;
  mergeRow(ws, r, 'A', 'A', 'Заказчик:', { bold: true }); mergeRow(ws, r++, 'B', 'G', `${doc.buyerName || ''}${doc.buyerAddress ? ', ' + doc.buyerAddress : ''}${doc.buyerBin ? ', БИН/ИИН ' + doc.buyerBin : ''}`, { wrap: true });
  mergeRow(ws, r, 'A', 'A', 'Исполнитель:', { bold: true }); mergeRow(ws, r++, 'B', 'G', `${org.companyFull || org.companyName || ''}, ${org.address || ''}, БИН ${org.bin || ''}`, { wrap: true });
  r++;
  mergeRow(ws, r++, 'A', 'G', `АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)  ${doc.docNo ? '№ ' + doc.number : ''} от ${dmy(doc.docDate)} г.`, { bold: true, size: 13, align: 'center' });
  r++;

  const head = ['№', 'Наименование работ (услуг)', 'Сведения об отчёте (при наличии)', 'Единица измерения', 'Количество', 'Цена за единицу', 'Стоимость'];
  head.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; c.font = { name: F, size: 9, bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = boxAll; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }; });
  ws.getRow(r).height = 30; r++;
  (doc.items || []).forEach((it, i) => {
    const vals = [i + 1, it.name || '', '', it.unit || 'услуга', it.qty, fmt(it.price), fmt(it.sum)];
    const al: Array<'left' | 'center' | 'right'> = ['center', 'left', 'center', 'center', 'center', 'right', 'right'];
    vals.forEach((v, ci) => { const c = ws.getCell(r, ci + 1); c.value = v as string | number; c.font = { name: F, size: 9 }; c.alignment = { horizontal: al[ci], vertical: 'middle', wrapText: ci === 1 }; c.border = boxAll; });
    r++;
  });
  mergeRow(ws, r, 'A', 'D', 'Итого', { bold: true, align: 'right' }); for (let ci = 1; ci <= 4; ci++) ws.getCell(r, ci).border = boxAll;
  const c5 = ws.getCell(`E${r}`); c5.value = 'х'; c5.font = { name: F, size: 9, bold: true }; c5.alignment = { horizontal: 'center' }; c5.border = boxAll;
  const c6 = ws.getCell(`F${r}`); c6.value = 'х'; c6.font = { name: F, size: 9, bold: true }; c6.alignment = { horizontal: 'center' }; c6.border = boxAll;
  const c7 = ws.getCell(`G${r}`); c7.value = fmt(doc.total || 0); c7.font = { name: F, size: 9, bold: true }; c7.alignment = { horizontal: 'right' }; c7.border = boxAll; r++;
  r++;
  mergeRow(ws, r++, 'A', 'G', `Всего на сумму (прописью): ${doc.amountWords || ''}`, { bold: true });
  r += 2;

  const sr = r;
  mergeRow(ws, sr, 'A', 'C', 'Сдал (Исполнитель)  Директор  ______________', { bold: true });
  mergeRow(ws, sr, 'D', 'G', `/ ${org.directorName || ''} /`, {});
  mergeRow(ws, sr + 2, 'A', 'C', 'Принял (Заказчик)  ______________', { bold: true });
  mergeRow(ws, sr + 2, 'D', 'G', '/______________/', {});
  mergeRow(ws, sr + 4, 'A', 'B', 'М.П.', { bold: true });
  mergeRow(ws, sr + 4, 'D', 'E', 'М.П.', { bold: true });
  stampSign(wb, ws, doc, org, 2.6, sr - 1);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── КП (коммерческое предложение) ────────────────────────────────────────────
export async function buildKpExcel(doc: Doc, org: Org): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('КП', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 } } });
  ws.columns = [5, 46, 9, 6, 14, 16].map(w => ({ width: w }));
  // Логотип в КП НЕ выводим — по требованию логотип только на «Счёте на оплату».
  let r = 1;
  mergeRow(ws, r++, 'C', 'F', org.companyName || '', { bold: true, size: 12, align: 'right' });
  mergeRow(ws, r++, 'C', 'F', `БИН ${org.bin || ''} · ${org.address || ''}`, { size: 9, align: 'right' });
  mergeRow(ws, r++, 'C', 'F', org.phone || '', { size: 9, align: 'right' });
  r++;
  mergeRow(ws, r++, 'A', 'F', `КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ ${doc.docNo ? '№ ' + doc.number : ''} от ${dmy(doc.docDate)} г.`, { bold: true, size: 13, align: 'center' });
  r++;
  mergeRow(ws, r++, 'A', 'F', `Кому: ${doc.buyerName || ''}${doc.buyerBin ? ' (БИН/ИИН ' + doc.buyerBin + ')' : ''}`, { bold: true });
  mergeRow(ws, r++, 'A', 'F', `${org.companyName || ''} предлагает Вам следующие товары и услуги:`, { wrap: true });
  r++;
  const head = ['№', 'Наименование', 'Кол-во', 'Ед.', 'Цена', 'Сумма'];
  head.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; c.font = { name: F, size: 10, bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = boxAll; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }; });
  r++;
  (doc.items || []).forEach((it, i) => {
    const vals = [i + 1, it.name || '', it.qty, it.unit || 'шт', fmt(it.price), fmt(it.sum)];
    const al: Array<'left' | 'center' | 'right'> = ['center', 'left', 'center', 'center', 'right', 'right'];
    vals.forEach((v, ci) => { const c = ws.getCell(r, ci + 1); c.value = v as string | number; c.font = { name: F, size: 10 }; c.alignment = { horizontal: al[ci], vertical: 'middle', wrapText: ci === 1 }; c.border = boxAll; });
    r++;
  });
  mergeRow(ws, r, 'A', 'E', 'Итого:', { bold: true, align: 'right' }); for (let ci = 1; ci <= 5; ci++) ws.getCell(r, ci).border = boxAll;
  const cg = ws.getCell(`F${r}`); cg.value = fmt(doc.total || 0); cg.font = { name: F, size: 10, bold: true }; cg.alignment = { horizontal: 'right' }; cg.border = boxAll; r++;
  r++;
  mergeRow(ws, r++, 'A', 'F', `Всего на сумму: ${doc.amountWords || ''}`, { bold: true });
  mergeRow(ws, r++, 'A', 'F', 'Предложение действительно 30 дней. Условия оплаты и поставки обсуждаются.', { size: 9 });
  r += 2;
  mergeRow(ws, r, 'A', 'C', 'С уважением, Директор  ______________', { bold: true });
  mergeRow(ws, r, 'D', 'F', `/ ${org.directorName || ''} /`, {});
  stampSign(wb, ws, doc, org, 2.1, r - 1);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── WORD (общий генератор по типам) ──────────────────────────────────────────
const tcBorder = { top: { style: BorderStyle.SINGLE, size: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4 }, left: { style: BorderStyle.SINGLE, size: 4 }, right: { style: BorderStyle.SINGLE, size: 4 } };
function wtr(cells: Array<{ text: string; bold?: boolean; align?: keyof typeof AlignmentType; w?: number }>) {
  return new TableRow({ children: cells.map(c => new TableCell({ width: c.w ? { size: c.w, type: WidthType.PERCENTAGE } : undefined, borders: tcBorder, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType[c.align || 'CENTER'], children: [new TextRun({ text: c.text, font: F, size: 16, bold: !!c.bold })] })] })) });
}
const WP = (text: string, o: { bold?: boolean; size?: number; align?: keyof typeof AlignmentType; before?: number } = {}) =>
  new Paragraph({ alignment: AlignmentType[o.align || 'LEFT'], spacing: { before: o.before || 0, after: 40 }, children: [new TextRun({ text, font: F, size: o.size || 20, bold: !!o.bold })] });

function signParagraph(doc: Doc, org: Org, prefix: string) {
  const kids: (TextRun | ImageRun)[] = [new TextRun({ text: prefix + '  ', font: F, size: 20, bold: true })];
  if (doc.withSign && org.signB64) kids.push(new ImageRun({ type: 'png', data: Buffer.from(stripB64(org.signB64), 'base64'), transformation: { width: 100, height: 62 } }));
  if (doc.withStamp && org.stampB64) kids.push(new ImageRun({ type: 'png', data: Buffer.from(stripB64(org.stampB64), 'base64'), transformation: { width: 112, height: 112 } }));
  kids.push(new TextRun({ text: `  / ${org.directorName || ''} /`, font: F, size: 20, bold: true }));
  return new Paragraph({ spacing: { before: 300 }, children: kids });
}

async function pack(children: (Paragraph | Table)[]): Promise<Buffer> {
  const d = new Document({ styles: { default: { document: { run: { font: F, size: 20 } } } }, sections: [{ properties: { page: { margin: { top: 567, right: 567, bottom: 567, left: 567 } } }, children }] });
  return Buffer.from(await Packer.toBuffer(d));
}

export async function buildNakladnayaWord(doc: Doc, org: Org): Promise<Buffer> {
  const cols = [5, 34, 12, 10, 12, 13, 14];
  const head = wtr(['№', 'Наименование, характеристика', 'Номенкл. №', 'Ед. изм.', 'Кол-во', 'Цена, KZT', 'Сумма с НДС'].map((h, i) => ({ text: h, bold: true, w: cols[i] })));
  const rows = (doc.items || []).map((it, i) => wtr([{ text: String(i + 1), w: cols[0] }, { text: it.name || '', align: 'LEFT', w: cols[1] }, { text: it.sku || '', w: cols[2] }, { text: it.unit || 'шт', w: cols[3] }, { text: String(it.qty), w: cols[4] }, { text: fmt(it.price), align: 'RIGHT', w: cols[5] }, { text: fmt(it.sum), align: 'RIGHT', w: cols[6] }]));
  const tot = wtr([{ text: 'Итого', bold: true, align: 'RIGHT', w: cols[0] + cols[1] + cols[2] + cols[3] }, { text: String(qtyTotal(doc)), bold: true, w: cols[4] }, { text: 'х', bold: true, w: cols[5] }, { text: fmt(doc.total || 0), bold: true, align: 'RIGHT', w: cols[6] }]);
  const table = new Table({ layout: TableLayoutType.FIXED, width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...rows, tot] });
  return pack([
    WP('Форма З-2 (приказ Министра финансов РК от 20.12.2012 № 562)', { size: 14, align: 'RIGHT' }),
    WP('НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ НА СТОРОНУ', { bold: true, size: 26, align: 'CENTER', before: 120 }),
    WP(`${doc.docNo || ''} от ${dmy(doc.docDate)} г.`, { bold: true, align: 'CENTER' }),
    WP(`Организация-отправитель: ${org.companyName || ''}, БИН ${org.bin || ''}, ${org.address || ''}`, { before: 160 }),
    WP(`Организация-получатель: ${doc.buyerName || ''}${doc.buyerBin ? ', БИН ' + doc.buyerBin : ''}${doc.buyerAddress ? ', ' + doc.buyerAddress : ''}`),
    new Paragraph({ spacing: { after: 80 }, children: [] }),
    table,
    WP(`Всего отпущено количество запасов (прописью): ${intToWords(qtyTotal(doc))}`, { before: 120 }),
    WP(`на сумму (прописью), в KZT: ${doc.amountWords || ''}`, { bold: true }),
    signParagraph(doc, org, 'Отпуск разрешил  Директор  ______________'),
    WP('Главный бухгалтер ______________     Отпустил ______________     Запасы получил ______________', { before: 160 }),
    WP('М.П.', { bold: true, before: 120 }),
  ]);
}

export async function buildAktWord(doc: Doc, org: Org): Promise<Buffer> {
  const cols = [5, 42, 18, 10, 10, 15];
  const head = wtr(['№', 'Наименование работ (услуг)', 'Сведения об отчёте', 'Ед. изм.', 'Кол-во', 'Стоимость'].map((h, i) => ({ text: h, bold: true, w: cols[i] })));
  const rows = (doc.items || []).map((it, i) => wtr([{ text: String(i + 1), w: cols[0] }, { text: it.name || '', align: 'LEFT', w: cols[1] }, { text: '', w: cols[2] }, { text: it.unit || 'услуга', w: cols[3] }, { text: String(it.qty), w: cols[4] }, { text: fmt(it.sum), align: 'RIGHT', w: cols[5] }]));
  const tot = wtr([{ text: 'Итого', bold: true, align: 'RIGHT', w: cols[0] + cols[1] + cols[2] + cols[3] + cols[4] }, { text: fmt(doc.total || 0), bold: true, align: 'RIGHT', w: cols[5] }]);
  const table = new Table({ layout: TableLayoutType.FIXED, width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...rows, tot] });
  return pack([
    WP('Форма Р-1 (приказ Министра финансов РК от 20.12.2012 № 562)', { size: 14, align: 'RIGHT' }),
    WP(`Заказчик: ${doc.buyerName || ''}${doc.buyerAddress ? ', ' + doc.buyerAddress : ''}${doc.buyerBin ? ', БИН/ИИН ' + doc.buyerBin : ''}`, { before: 120 }),
    WP(`Исполнитель: ${org.companyFull || org.companyName || ''}, ${org.address || ''}, БИН ${org.bin || ''}`),
    WP('АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)', { bold: true, size: 26, align: 'CENTER', before: 160 }),
    WP(`${doc.docNo ? '№ ' + doc.number : ''} от ${dmy(doc.docDate)} г.`, { bold: true, align: 'CENTER' }),
    new Paragraph({ spacing: { after: 80 }, children: [] }),
    table,
    WP(`Всего на сумму (прописью): ${doc.amountWords || ''}`, { bold: true, before: 120 }),
    signParagraph(doc, org, 'Сдал (Исполнитель)  Директор  ______________'),
    WP('Принял (Заказчик) ______________ /______________/', { before: 160 }),
    WP('М.П.', { bold: true, before: 80 }),
  ]);
}

// КП = заполнение .docx-шаблона (org.kpTemplateB64): таблица позиций + Итого +
// замена вшитых печати/подписи на новые (по чекбоксам). Нет шаблона — сборка кодом.
export async function buildKpWord(doc: Doc, org: Org): Promise<Buffer> {
  if (org.kpTemplateB64) {
    try { return await fillKpTemplate(doc, org); }
    catch (e) { console.warn('[kp template] fallback:', (e as Error).message); }
  }
  return buildKpWordLegacy(doc, org);
}

const TRANSPARENT_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function fillKpTemplate(doc: Doc, org: Org): Promise<Buffer> {
  const strip = (s?: string | null) => Buffer.from((s || '').replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const money = (n: unknown) => (Number(n) || 0).toLocaleString('ru-RU');
  const zip = await JSZip.loadAsync(strip(org.kpTemplateB64));
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('нет word/document.xml');
  let xml = await docFile.async('string');
  const tblM = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/);
  if (!tblM) throw new Error('нет таблицы позиций');
  const tbl = tblM[0];
  const rows = tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  if (rows.length < 3) throw new Error('мало строк в таблице КП');
  const sample = rows[1];               // строка-образец позиции
  const itogo = rows[rows.length - 1];  // строка «Итого»
  // Заполнить строку: в каждой ячейке первый <w:t> = значение, остальные пусто.
  const fillRow = (rowXml: string, vals: (string | number)[]) => {
    let ci = 0;
    return rowXml.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, tc => {
      const v = vals[ci++] ?? ''; let first = true;
      return tc.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g, (_m, a, _t, b) => first ? (first = false, a + esc(v) + b) : (a + b));
    });
  };
  const items = (doc.items || []).filter(it => (it.name || '').trim());
  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const dataRows = items.map((it, i) => fillRow(sample, [i + 1, it.name || '', it.unit || 'шт', Number(it.qty) || 0, money(it.price), money((Number(it.qty) || 0) * (Number(it.price) || 0))])).join('');
  const itogoRow = fillRow(itogo, ['Итого:', '', '', '', '', money(total)]);
  xml = xml.replace(tbl, tbl.replace(rows.slice(1).join(''), dataRows + itogoRow));
  zip.file('word/document.xml', xml);
  // Вшитые печать(image1)/подпись(image2) → новые (или прозрачный 1×1, если чекбокс снят).
  if (zip.file('word/media/image1.png')) zip.file('word/media/image1.png', doc.withStamp && org.stampB64 ? strip(org.stampB64) : TRANSPARENT_PNG);
  if (zip.file('word/media/image2.png')) zip.file('word/media/image2.png', doc.withSign && org.signB64 ? strip(org.signB64) : TRANSPARENT_PNG);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function buildKpWordLegacy(doc: Doc, org: Org): Promise<Buffer> {
  const cols = [6, 48, 10, 8, 14, 14];
  const head = wtr(['№', 'Наименование', 'Кол-во', 'Ед.', 'Цена', 'Сумма'].map((h, i) => ({ text: h, bold: true, w: cols[i] })));
  const rows = (doc.items || []).map((it, i) => wtr([{ text: String(i + 1), w: cols[0] }, { text: it.name || '', align: 'LEFT', w: cols[1] }, { text: String(it.qty), w: cols[2] }, { text: it.unit || 'шт', w: cols[3] }, { text: fmt(it.price), align: 'RIGHT', w: cols[4] }, { text: fmt(it.sum), align: 'RIGHT', w: cols[5] }]));
  const tot = wtr([{ text: 'Итого:', bold: true, align: 'RIGHT', w: cols[0] + cols[1] + cols[2] + cols[3] + cols[4] }, { text: fmt(doc.total || 0), bold: true, align: 'RIGHT', w: cols[5] }]);
  const table = new Table({ layout: TableLayoutType.FIXED, width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...rows, tot] });
  const header: (Paragraph | Table)[] = [];
  // Логотип в КП НЕ выводим — по требованию логотип только на «Счёте на оплату».
  return pack([
    ...header,
    WP(`${org.companyName || ''} · БИН ${org.bin || ''}`, { bold: true, align: 'RIGHT' }),
    WP(`${org.address || ''} · ${org.phone || ''}`, { size: 16, align: 'RIGHT' }),
    WP('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', { bold: true, size: 26, align: 'CENTER', before: 160 }),
    WP(`${doc.docNo ? '№ ' + doc.number : ''} от ${dmy(doc.docDate)} г.`, { bold: true, align: 'CENTER' }),
    WP(`Кому: ${doc.buyerName || ''}${doc.buyerBin ? ' (БИН/ИИН ' + doc.buyerBin + ')' : ''}`, { bold: true, before: 160 }),
    WP(`${org.companyName || ''} предлагает Вам следующие товары и услуги:`),
    new Paragraph({ spacing: { after: 80 }, children: [] }),
    table,
    WP(`Всего на сумму: ${doc.amountWords || ''}`, { bold: true, before: 120 }),
    WP('Предложение действительно 30 дней. Условия оплаты и поставки обсуждаются.', { size: 16 }),
    signParagraph(doc, org, 'С уважением, Директор  ______________'),
  ]);
}
