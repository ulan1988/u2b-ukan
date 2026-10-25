import ExcelJS from 'exceljs';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign, TableLayoutType, ImageRun,
} from 'docx';
import { formatDate } from '@/lib/accDocs/format';

// Модель данных документа (из таблицы documents) + реквизиты организации (org_settings).
type Item = { name: string; sku?: string | null; qty: number; unit: string; price: number; sum: number };
type Doc = {
  docNo?: string | null; number: number; docDate?: string | null;
  buyerName?: string | null; buyerBin?: string | null; buyerAddress?: string | null; buyerRequisites?: string | null;
  bank?: string | null; items?: Item[] | null; total?: string | number | null; amountWords?: string | null;
  withStamp?: boolean | null; withSign?: boolean | null;
};
type Bank = { key: string; name: string; iik: string; bik: string; kbe?: string };
type Org = {
  companyName?: string | null; bin?: string | null; address?: string | null; phone?: string | null;
  directorName?: string | null; banks?: Bank[] | null; logoB64?: string | null; stampB64?: string | null; signB64?: string | null;
  invoiceTemplateB64?: string | null;
};

const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d?: string | null) => formatDate(d);
const stripB64 = (s?: string | null) => (s ? s.replace(/^data:image\/\w+;base64,/, '') : '');
const bankOf = (org: Org, key?: string | null): Bank | null => (org.banks || []).find(b => b.key === (key || 'kaspi')) || (org.banks || [])[0] || null;

// ── EXCEL (.xlsx) ────────────────────────────────────────────────────────────
// Счёт печатается ЗАПОЛНЕНИЕМ ГОСТ-шаблона (org.invoiceTemplateB64) 1-в-1: вёрстка,
// логотип, печать и подпись берутся из самого шаблона. Если шаблона нет — сборка кодом.
export async function buildInvoiceExcel(doc: Doc, org: Org): Promise<Buffer> {
  if (org.invoiceTemplateB64) {
    try { return await fillInvoiceTemplate(doc, org); }
    catch (e) { console.warn('[invoice template] fallback to code build:', (e as Error).message); }
  }
  return buildInvoiceExcelLegacy(doc, org);
}

// Заполнение готового ГОСТ-шаблона счёта. Слоты товаров начинаются со строки 27
// (в шаблоне их 2); при необходимости строки добавляются/убираются с сохранением
// стиля и объединений. Итоги проставляются числами, «Итого»/«Всего» ищутся по метке.
async function fillInvoiceTemplate(doc: Doc, org: Org): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(stripB64(org.invoiceTemplateB64), 'base64') as never);
  // лист под выбранный банк (Каспи/БЦК); прочие листы убираем — печатаем один
  const wantBck = doc.bank === 'bck' || doc.bank === 'БЦК';
  const ws = wb.getWorksheet(wantBck ? 'БЦК' : 'Каспи') || wb.worksheets[0];
  wb.worksheets.filter(w => w.id !== ws.id).forEach(w => wb.removeWorksheet(w.id));

  const txt = (c: ExcelJS.Cell): string => {
    const v = c.value as unknown;
    if (v && typeof v === 'object' && 'richText' in (v as object)) return (v as { richText: { text: string }[] }).richText.map(t => t.text).join('');
    return typeof v === 'string' ? v : '';
  };

  // Заголовок (№ + дата) и Покупатель
  ws.getCell('B16').value = `Счет на оплату № ${doc.number} от ${dmy(doc.docDate)} г.`;
  ws.getCell('F22').value = [doc.buyerBin ? 'БИН / ИИН: ' + doc.buyerBin : '', doc.buyerName || '', doc.buyerAddress || ''].filter(Boolean).join('\n');

  // Товары
  const items = (doc.items || []).filter(it => (it.name || '').trim());
  const START = 27, BASE = 2, need = Math.max(items.length, 1);
  if (need > BASE) ws.duplicateRow(START, need - BASE, true);
  else if (need < BASE) ws.spliceRows(START + need, BASE - need);

  const rowMerges = (r: number) => [`D${r}:E${r}`, `F${r}:S${r}`, `T${r}:W${r}`, `X${r}:Z${r}`, `AA${r}:AF${r}`, `AG${r}:AL${r}`];
  let total = 0;
  items.forEach((it, i) => {
    const r = START + i;
    rowMerges(r).forEach(m => { try { ws.unMergeCells(m); } catch { /* not merged */ } try { ws.mergeCells(m); } catch { /* already */ } });
    const sum = (Number(it.qty) || 0) * (Number(it.price) || 0); total += sum;
    ws.getCell(`B${r}`).value = i + 1;
    ws.getCell(`D${r}`).value = it.sku || '';
    ws.getCell(`F${r}`).value = it.name || '';
    ws.getCell(`T${r}`).value = Number(it.qty) || 0;
    ws.getCell(`X${r}`).value = it.unit || 'шт';
    ws.getCell(`AA${r}`).value = Number(it.price) || 0;
    ws.getCell(`AG${r}`).value = sum;
  });

  // «Итого:» (число) и «Всего к оплате: <прописью>» — по метке (строки сместились)
  for (let r = START; r <= START + need + 10; r++) {
    if (txt(ws.getCell(`AF${r}`)).startsWith('Итого')) ws.getCell(`AG${r}`).value = total;
    if (txt(ws.getCell(`B${r}`)).startsWith('Всего к оплате')) ws.getCell(`B${r}`).value = `Всего к оплате:   ${doc.amountWords || ''}`;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function buildInvoiceExcelLegacy(doc: Doc, org: Org): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Счет', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 } },
  });
  const W = [5, 11, 44, 9, 6, 14, 16];
  ws.columns = W.map(w => ({ width: w }));
  const FONT = 'Times New Roman';
  const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };
  const boxAll = { top: thin, bottom: thin, left: thin, right: thin };
  const bank = bankOf(org, doc.bank);

  let r = 1;
  const merge = (row: number, c1: string, c2: string, value: string, opts: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; italic?: boolean; border?: boolean; wrap?: boolean } = {}) => {
    ws.mergeCells(`${c1}${row}:${c2}${row}`);
    const cell = ws.getCell(`${c1}${row}`);
    cell.value = value;
    cell.font = { name: FONT, size: opts.size || 10, bold: !!opts.bold, italic: !!opts.italic };
    cell.alignment = { horizontal: opts.align || 'left', vertical: 'middle', wrapText: !!opts.wrap };
    if (opts.border) { for (let ci = 1; ci <= 7; ci++) ws.getCell(row, ci).border = boxAll; }
    return cell;
  };

  // Логотип VERTEX SERVICE справа сверху (широкий, ~3.5:1 — без искажения)
  if (org.logoB64) {
    const id = wb.addImage({ base64: stripB64(org.logoB64), extension: 'png' });
    ws.addImage(id, { tl: { col: 5.05, row: 0.1 } as ExcelJS.Anchor, ext: { width: 190, height: 54 } });
  }

  // Реквизиты банка (бордер-блок)
  merge(r++, 'A', 'G', 'Внимание! Оплата данного счета означает согласие с условиями поставки товара. Товар отпускается по факту прихода денег на р/с Поставщика, самовывозом, при наличии доверенности и документов, удостоверяющих личность.', { size: 8, italic: true, wrap: true });
  ws.getRow(r - 1).height = 34;
  r++;
  merge(r, 'A', 'C', 'Бенефициар:', { bold: true, border: true });
  merge(r, 'D', 'G', `${org.companyName || ''}   БИН ${org.bin || ''}`, { bold: true, border: true }); r++;
  merge(r, 'A', 'C', 'ИИК', { border: true });
  merge(r, 'D', 'F', bank?.iik || '', { border: true });
  ws.getCell(`G${r}`).value = `Кбе ${bank?.kbe || ''}`; ws.getCell(`G${r}`).font = { name: FONT, size: 10 }; ws.getCell(`G${r}`).border = boxAll; r++;
  merge(r, 'A', 'C', 'Банк бенефициара:', { border: true });
  merge(r, 'D', 'G', bank?.name || '', { border: true }); r++;
  merge(r, 'A', 'C', 'БИК', { border: true });
  merge(r, 'D', 'G', bank?.bik || '', { border: true }); r++;
  merge(r, 'A', 'C', 'Код назначения платежа', { border: true });
  merge(r, 'D', 'G', '', { border: true }); r++;
  r++;

  // Заголовок
  merge(r++, 'A', 'G', `${doc.docNo || 'Счет на оплату'} от ${dmy(doc.docDate)} г.`, { bold: true, size: 14, align: 'left' });
  const line = ws.getRow(r); ws.mergeCells(`A${r}:G${r}`); ws.getCell(`A${r}`).border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } }; line.height = 4; r++;
  r++;

  merge(r, 'A', 'B', 'Поставщик:', { bold: true });
  merge(r, 'C', 'G', `БИН ${org.bin || ''}, ${org.companyName || ''}, ${org.address || ''}`, { wrap: true }); r++;
  merge(r, 'A', 'B', 'Покупатель:', { bold: true });
  merge(r, 'C', 'G', `${doc.buyerBin ? 'БИН ' + doc.buyerBin + ', ' : ''}${doc.buyerName || ''}${doc.buyerAddress ? ', ' + doc.buyerAddress : ''}`, { wrap: true }); r++;
  merge(r, 'A', 'B', 'Договор:', { bold: true });
  merge(r, 'C', 'G', 'б/д', {}); r++;
  r++;

  // Таблица товаров
  const HEAD = ['№', 'Код', 'Наименование', 'Кол-во', 'Ед.', 'Цена', 'Сумма'];
  const hr = ws.getRow(r);
  HEAD.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; c.font = { name: FONT, size: 10, bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = boxAll; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }; });
  hr.height = 22; r++;
  (doc.items || []).forEach((it, i) => {
    const vals = [i + 1, it.sku || '', it.name || '', it.qty, it.unit || 'шт', fmt(it.price), fmt(it.sum)];
    const align: Array<'left' | 'center' | 'right'> = ['center', 'center', 'left', 'center', 'center', 'right', 'right'];
    vals.forEach((v, ci) => { const c = ws.getCell(r, ci + 1); c.value = v as string | number; c.font = { name: FONT, size: 10 }; c.alignment = { horizontal: align[ci], vertical: 'middle', wrapText: ci === 2 }; c.border = boxAll; });
    r++;
  });
  // Итого
  merge(r, 'A', 'F', 'Итого:', { bold: true, align: 'right', border: true });
  ws.getCell(`G${r}`).value = fmt(doc.total || 0); ws.getCell(`G${r}`).font = { name: FONT, size: 10, bold: true }; ws.getCell(`G${r}`).alignment = { horizontal: 'right' }; ws.getCell(`G${r}`).border = boxAll; r++;
  r++;

  const cnt = (doc.items || []).length;
  merge(r++, 'A', 'G', `Всего наименований ${cnt}, на сумму ${fmt(doc.total || 0)} KZT`, {});
  merge(r++, 'A', 'G', `Всего к оплате:  ${doc.amountWords || ''}`, { bold: true });
  merge(r++, 'A', 'G', 'Без НДС', { italic: true });
  r++;

  // Исполнитель + печать/подпись
  const signRow = r + 1;
  merge(signRow, 'A', 'B', 'Исполнитель', { bold: true });
  ws.getCell(`C${signRow}`).border = { bottom: thin };
  merge(signRow, 'D', 'G', `/ ${org.directorName || ''} /`, { align: 'left' });
  if (doc.withSign && org.signB64) {
    const sid = wb.addImage({ base64: stripB64(org.signB64), extension: 'png' });
    ws.addImage(sid, { tl: { col: 2.1, row: signRow - 1.4 } as ExcelJS.Anchor, ext: { width: 120, height: 75 } });
  }
  if (doc.withStamp && org.stampB64) {
    const pid = wb.addImage({ base64: stripB64(org.stampB64), extension: 'png' });
    ws.addImage(pid, { tl: { col: 3.4, row: signRow - 1.9 } as ExcelJS.Anchor, ext: { width: 124, height: 124 } });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── WORD (.docx) ─────────────────────────────────────────────────────────────
const F = 'Times New Roman';
function tr(cells: Array<{ text: string; bold?: boolean; align?: keyof typeof AlignmentType; w?: number }>) {
  return new TableRow({ children: cells.map(c => new TableCell({
    width: c.w ? { size: c.w, type: WidthType.PERCENTAGE } : undefined,
    borders: { top: { style: BorderStyle.SINGLE, size: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4 }, left: { style: BorderStyle.SINGLE, size: 4 }, right: { style: BorderStyle.SINGLE, size: 4 } },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType[c.align || 'CENTER'], children: [new TextRun({ text: c.text, font: F, size: 18, bold: !!c.bold })] })],
  })) });
}
const P = (text: string, opts: { bold?: boolean; size?: number; align?: keyof typeof AlignmentType; before?: number } = {}) =>
  new Paragraph({ alignment: AlignmentType[opts.align || 'LEFT'], spacing: { before: opts.before || 0, after: 40 }, children: [new TextRun({ text, font: F, size: opts.size || 20, bold: !!opts.bold })] });

export async function buildInvoiceWord(doc: Doc, org: Org): Promise<Buffer> {
  const bank = bankOf(org, doc.bank);
  const cols = [6, 10, 44, 10, 6, 12, 12];
  const header = tr(['№', 'Код', 'Наименование', 'Кол-во', 'Ед.', 'Цена', 'Сумма'].map((h, i) => ({ text: h, bold: true, align: 'CENTER' as const, w: cols[i] })));
  const rows = (doc.items || []).map((it, i) => tr([
    { text: String(i + 1), w: cols[0] }, { text: it.sku || '', w: cols[1] },
    { text: it.name || '', align: 'LEFT', w: cols[2] }, { text: String(it.qty), w: cols[3] },
    { text: it.unit || 'шт', w: cols[4] }, { text: fmt(it.price), align: 'RIGHT', w: cols[5] }, { text: fmt(it.sum), align: 'RIGHT', w: cols[6] },
  ]));
  const totalRow = tr([{ text: '', w: cols[0] }, { text: '', w: cols[1] }, { text: 'Итого:', bold: true, align: 'RIGHT', w: cols[2] }, { text: '', w: cols[3] }, { text: '', w: cols[4] }, { text: '', w: cols[5] }, { text: fmt(doc.total || 0), bold: true, align: 'RIGHT', w: cols[6] }]);
  const table = new Table({ layout: TableLayoutType.FIXED, width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows, totalRow] });

  // печать/подпись у строки «Исполнитель»
  const signChildren: (TextRun | ImageRun)[] = [new TextRun({ text: 'Исполнитель  __________________  ', font: F, size: 20, bold: true })];
  if (doc.withSign && org.signB64) signChildren.push(new ImageRun({ type: 'png', data: Buffer.from(stripB64(org.signB64), 'base64'), transformation: { width: 110, height: 69 } }));
  if (doc.withStamp && org.stampB64) signChildren.push(new ImageRun({ type: 'png', data: Buffer.from(stripB64(org.stampB64), 'base64'), transformation: { width: 118, height: 118 } }));
  signChildren.push(new TextRun({ text: `  / ${org.directorName || ''} /`, font: F, size: 20, bold: true }));

  const bodyChildren = [
    // Логотип VERTEX SERVICE — только на счёте на оплату (широкий, справа сверху)
    ...(org.logoB64 ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: 'png', data: Buffer.from(stripB64(org.logoB64), 'base64'), transformation: { width: 210, height: 60 } })] })] : []),
    P('Внимание! Оплата данного счета означает согласие с условиями поставки товара.', { size: 16 }),
    P(`Бенефициар: ${org.companyName || ''}   БИН ${org.bin || ''}`, { bold: true, before: 120 }),
    P(`ИИК: ${bank?.iik || ''}    Кбе ${bank?.kbe || ''}`),
    P(`Банк бенефициара: ${bank?.name || ''}    БИК: ${bank?.bik || ''}`),
    P(`${doc.docNo || 'Счет на оплату'} от ${dmy(doc.docDate)} г.`, { bold: true, size: 28, before: 200 }),
    P(`Поставщик: БИН ${org.bin || ''}, ${org.companyName || ''}, ${org.address || ''}`, { before: 120 }),
    P(`Покупатель: ${doc.buyerBin ? 'БИН ' + doc.buyerBin + ', ' : ''}${doc.buyerName || ''}${doc.buyerAddress ? ', ' + doc.buyerAddress : ''}`),
    P('Договор: б/д', { after: 120 } as never),
    table,
    P(`Всего наименований ${(doc.items || []).length}, на сумму ${fmt(doc.total || 0)} KZT`, { before: 120 }),
    P(`Всего к оплате:  ${doc.amountWords || ''}`, { bold: true }),
    P('Без НДС'),
    new Paragraph({ spacing: { before: 300 }, children: signChildren }),
  ];

  const documentDoc = new Document({
    styles: { default: { document: { run: { font: F, size: 20 } } } },
    sections: [{ properties: { page: { margin: { top: 567, right: 567, bottom: 567, left: 567 } } }, children: bodyChildren }],
  });
  return Buffer.from(await Packer.toBuffer(documentDoc));
}
