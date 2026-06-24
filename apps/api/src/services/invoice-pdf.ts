import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { query } from '../db/pool.js';
import { config } from '../config.js';

// ── Series counter ────────────────────────────────────────────────────────────
export async function nextInvoiceNumber(series: 'SUBS' | 'VTA' | 'PROV' | 'RECT'): Promise<string> {
  const year = new Date().getFullYear();
  const r = await query(
    `INSERT INTO moveadvisor_invoice_counters (series, year, last_n)
     VALUES ($1, $2, 1)
     ON CONFLICT (series, year) DO UPDATE
       SET last_n = moveadvisor_invoice_counters.last_n + 1
     RETURNING last_n`,
    [series, year]
  );
  const n = (r.rows[0] as { last_n: number }).last_n;
  return `${series}-${year}-${String(n).padStart(4, '0')}`;
}

// ── Upload PDF bytes to Supabase Storage ─────────────────────────────────────
async function uploadPdf(bytes: Uint8Array, path: string): Promise<string | null> {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/vehicle-files/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: Buffer.from(bytes),
    });
    if (!res.ok) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/vehicle-files/${path}`;
  } catch { return null; }
}

// ── Fetch logo bytes ──────────────────────────────────────────────────────────
let logoCache: Uint8Array | null = null;
async function fetchLogo(): Promise<Uint8Array | null> {
  if (logoCache) return logoCache;
  try {
    const res = await fetch('https://carswiseai.com/carswise-logo.png');
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    logoCache = new Uint8Array(buf);
    return logoCache;
  } catch { return null; }
}

export interface InvoiceLine {
  description: string;
  subtitle?: string;
  amount: number; // base imponible (sin IVA)
}

export interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  series: 'SUBS' | 'VTA' | 'PROV' | 'RECT';
  recipientName: string;
  recipientNif?: string;
  recipientEmail?: string;
  recipientAddress?: string;
  lines: InvoiceLine[];
  ivaRate?: number; // default 0.21
  notes?: string;
}

function fmtEur(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Core PDF builder ──────────────────────────────────────────────────────────
export async function buildInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const boldFont    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const ivaRate = data.ivaRate ?? 0.21;
  const base    = data.lines.reduce((s, l) => s + l.amount, 0);
  const ivaAmt  = base * ivaRate;
  const total   = base + ivaAmt;

  const M = 56;

  // ── Palette ───────────────────────────────────────────────────────────────────
  const INK        = rgb(0.055, 0.090, 0.149);
  const AMBER      = rgb(0.729, 0.459, 0.090);
  const AMBER_DEEP = rgb(0.522, 0.310, 0.043);
  const AMBER_TINT = rgb(0.984, 0.953, 0.894);
  const TEXT       = rgb(0.133, 0.165, 0.220);
  const MUTED      = rgb(0.420, 0.455, 0.518);
  const FAINT      = rgb(0.604, 0.631, 0.682);
  const LINE       = rgb(0.914, 0.925, 0.945);
  const LINE_SOFT  = rgb(0.945, 0.953, 0.969);
  const WHITE      = rgb(1, 1, 1);
  const HDR_MUTED  = rgb(0.682, 0.714, 0.769);
  const ROW_BG     = rgb(0.988, 0.992, 1.000);

  // ── HEADER ────────────────────────────────────────────────────────────────────
  const HEADER_H = 110;
  page.drawRectangle({ x: 0, y: height - HEADER_H, width, height: HEADER_H, color: INK });
  page.drawRectangle({ x: 0, y: height - HEADER_H, width, height: 4, color: AMBER });

  // Logo / brand
  const logoBytes = await fetchLogo();
  if (logoBytes) {
    try {
      const img = await pdfDoc.embedPng(logoBytes);
      const { width: iw, height: ih } = img.scale(1);
      const scale = Math.min(130 / iw, 52 / ih);
      page.drawImage(img, { x: M, y: height - HEADER_H + 28, width: iw * scale, height: ih * scale });
      const cwW = boldFont.widthOfTextAtSize('CarsWise ', 16);
      page.drawText('CarsWise ', { x: M, y: height - HEADER_H + 12, size: 16, font: boldFont, color: WHITE });
      page.drawText('AI', { x: M + cwW, y: height - HEADER_H + 12, size: 16, font: boldFont, color: AMBER });
    } catch {
      const cwW = boldFont.widthOfTextAtSize('CarsWise ', 18);
      page.drawText('CarsWise ', { x: M, y: height - HEADER_H + 58, size: 18, font: boldFont, color: WHITE });
      page.drawText('AI', { x: M + cwW, y: height - HEADER_H + 58, size: 18, font: boldFont, color: AMBER });
      page.drawText('MOVILIDAD INTELIGENTE', { x: M, y: height - HEADER_H + 40, size: 8, font: regularFont, color: HDR_MUTED });
    }
  } else {
    const cwW = boldFont.widthOfTextAtSize('CarsWise ', 18);
    page.drawText('CarsWise ', { x: M, y: height - HEADER_H + 58, size: 18, font: boldFont, color: WHITE });
    page.drawText('AI', { x: M + cwW, y: height - HEADER_H + 58, size: 18, font: boldFont, color: AMBER });
    page.drawText('MOVILIDAD INTELIGENTE', { x: M, y: height - HEADER_H + 40, size: 8, font: regularFont, color: HDR_MUTED });
  }

  // Doc title right
  const docTitle  = data.series === 'RECT' ? 'FACTURA RECTIFICATIVA' : 'FACTURA';
  const titleSize = data.series === 'RECT' ? 17 : 28;
  const titleW    = regularFont.widthOfTextAtSize(docTitle, titleSize);
  page.drawText(docTitle, { x: width - M - titleW, y: height - HEADER_H + 65, size: titleSize, font: regularFont, color: WHITE });

  // Invoice number
  const numLabel  = 'N°  ';
  const numLabelW = regularFont.widthOfTextAtSize(numLabel, 10);
  page.drawText(numLabel,        { x: width - M - 160, y: height - HEADER_H + 42, size: 10, font: regularFont, color: HDR_MUTED });
  page.drawText(data.invoiceNumber, { x: width - M - 160 + numLabelW, y: height - HEADER_H + 42, size: 10, font: boldFont, color: WHITE });

  let y = height - HEADER_H - 30;

  // ── PARTIES ───────────────────────────────────────────────────────────────────
  const colR = width / 2 + 10;
  const partyTopY = y;

  // Left: EMISOR
  page.drawText('EMISOR', { x: M, y: partyTopY, size: 9, font: boldFont, color: AMBER });
  page.drawText('CarsWise AI',                        { x: M, y: partyTopY - 16, size: 13, font: boldFont,    color: TEXT  });
  page.drawText('NIF: Pendiente de asignación',  { x: M, y: partyTopY - 31, size: 10, font: regularFont, color: MUTED });
  page.drawText('Dirección: Pendiente de asignación', { x: M, y: partyTopY - 44, size: 10, font: regularFont, color: MUTED });
  page.drawText('carswiseai.com',                     { x: M, y: partyTopY - 57, size: 10, font: regularFont, color: AMBER_DEEP });

  // Right: FACTURAR A
  page.drawText('FACTURAR A', { x: colR, y: partyTopY, size: 9, font: boldFont, color: AMBER });
  page.drawText(data.recipientName, { x: colR, y: partyTopY - 16, size: 13, font: boldFont, color: TEXT });
  let recvY = partyTopY - 31;
  if (data.recipientEmail) {
    page.drawText(data.recipientEmail, { x: colR, y: recvY, size: 10, font: regularFont, color: MUTED });
    recvY -= 13;
  }
  if (data.recipientNif) {
    page.drawText(`NIF/CIF: ${data.recipientNif}`, { x: colR, y: recvY, size: 10, font: regularFont, color: MUTED });
    recvY -= 13;
  }
  page.drawText(data.recipientAddress ?? 'Cliente particular', { x: colR, y: recvY, size: 10, font: regularFont, color: MUTED });

  y = partyTopY - 80;

  // ── META GRID ─────────────────────────────────────────────────────────────────
  const metaH  = 50;
  const cellW  = (width - 2 * M) / 4;
  const metaCells = [
    { label: 'Nº FACTURA',    value: data.invoiceNumber },
    { label: 'FECHA DE EMISIÓN', value: fmtDate(data.date) },
    { label: 'SERIE',              value: data.series },
    { label: 'VENCIMIENTO',        value: 'Al contado' },
  ];

  page.drawRectangle({ x: M, y: y - metaH, width: width - 2 * M, height: metaH, borderColor: LINE, borderWidth: 1, color: WHITE });
  metaCells.forEach((cell, i) => {
    const cx = M + i * cellW;
    if (i < 3) page.drawLine({ start: { x: cx + cellW, y }, end: { x: cx + cellW, y: y - metaH }, thickness: 1, color: LINE });
    page.drawText(cell.label, { x: cx + 10, y: y - 16, size: 8,  font: boldFont,    color: FAINT });
    page.drawText(cell.value, { x: cx + 10, y: y - 34, size: 12, font: boldFont,    color: INK   });
  });
  y -= metaH + 24;

  // ── TABLE ─────────────────────────────────────────────────────────────────────
  const tableW = width - 2 * M;
  page.drawRectangle({ x: M, y: y - 28, width: tableW, height: 28, color: INK });
  page.drawText('CONCEPTO',       { x: M + 16,            y: y - 18, size: 9, font: boldFont, color: WHITE });
  page.drawText('IMPORTE (BASE)', { x: M + tableW - 110,  y: y - 18, size: 9, font: boldFont, color: WHITE });
  y -= 28;

  for (const line of data.lines) {
    // Split subtitle: last segment that mentions Stripe becomes a badge
    const parts    = (line.subtitle ?? '').split('·').map(s => s.trim());
    const stripeIdx = parts.findIndex(p => /stripe/i.test(p));
    const mainSub  = parts.filter((_, i) => i !== stripeIdx).join(' · ').trim();
    const refPart  = stripeIdx >= 0 ? parts[stripeIdx] : null;
    const rowH     = refPart ? 64 : (mainSub ? 44 : 30);

    page.drawRectangle({ x: M, y: y - rowH, width: tableW, height: rowH, color: ROW_BG });
    page.drawText(line.description, { x: M + 16, y: y - 16, size: 12, font: boldFont, color: TEXT });
    if (mainSub) page.drawText(mainSub, { x: M + 16, y: y - 30, size: 10, font: regularFont, color: MUTED });

    if (refPart) {
      const refLabel  = refPart.includes(':') ? refPart : `Ref. Stripe · ${refPart}`;
      const badgeW    = regularFont.widthOfTextAtSize(refLabel, 9) + 18;
      const badgeY    = y - 50;
      page.drawRectangle({ x: M + 16, y: badgeY - 4, width: badgeW, height: 16, color: AMBER_TINT, borderColor: rgb(0.941, 0.890, 0.784), borderWidth: 1 });
      page.drawText(refLabel, { x: M + 25, y: badgeY + 1, size: 9, font: boldFont, color: AMBER_DEEP });
    }

    const amtW = boldFont.widthOfTextAtSize(fmtEur(line.amount), 12);
    page.drawText(fmtEur(line.amount), { x: width - M - amtW, y: y - 16, size: 12, font: boldFont, color: TEXT });
    y -= rowH;
    page.drawLine({ start: { x: M, y }, end: { x: M + tableW, y }, thickness: 1, color: LINE });
  }

  y -= 22;

  // ── TOTALS ────────────────────────────────────────────────────────────────────
  const totW = 240;
  const totX = width - M - totW;

  const drawTotRow = (label: string, value: string) => {
    page.drawText(label, { x: totX, y, size: 12, font: regularFont, color: MUTED });
    const vw = boldFont.widthOfTextAtSize(value, 12);
    page.drawText(value, { x: width - M - vw, y, size: 12, font: boldFont, color: TEXT });
    y -= 22;
  };

  drawTotRow('Base imponible', fmtEur(base));
  drawTotRow(`IVA (${Math.round(ivaRate * 100)} %)`, fmtEur(ivaAmt));
  y -= 4;
  page.drawLine({ start: { x: totX, y }, end: { x: width - M, y }, thickness: 1, color: LINE });
  y -= 16;

  // Dark total box
  const totalBoxH = 46;
  page.drawRectangle({ x: totX, y: y - totalBoxH, width: totW, height: totalBoxH, color: INK });
  page.drawRectangle({ x: totX, y: y - totalBoxH, width: 4, height: totalBoxH, color: AMBER });
  page.drawText('TOTAL FACTURA', { x: totX + 14, y: y - 16, size: 9, font: boldFont, color: HDR_MUTED });
  const totalStr = fmtEur(total);
  const totalStrW = boldFont.widthOfTextAtSize(totalStr, 22);
  page.drawText(totalStr, { x: width - M - totalStrW - 4, y: y - 36, size: 22, font: boldFont, color: WHITE });
  y -= totalBoxH + 10;

  // Note
  const noteText = 'Importe abonado · IVA incluído';
  const noteW = regularFont.widthOfTextAtSize(noteText, 10);
  page.drawText(noteText, { x: width - M - noteW, y, size: 10, font: regularFont, color: FAINT });
  y -= 24;

  // Notes block
  if (data.notes) {
    page.drawText('NOTAS', { x: M, y, size: 9, font: boldFont, color: FAINT });
    y -= 14;
    page.drawText(data.notes, { x: M, y, size: 10, font: regularFont, color: MUTED });
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────────
  const footerBaseY = 52;
  page.drawLine({ start: { x: M, y: footerBaseY + 50 }, end: { x: width - M, y: footerBaseY + 50 }, thickness: 1, color: LINE });
  page.drawText(
    'Factura emitida conforme a la Ley 37/1992 del IVA y normativa de facturación española.',
    { x: M, y: footerBaseY + 34, size: 9, font: regularFont, color: FAINT }
  );
  page.drawLine({ start: { x: M, y: footerBaseY + 18 }, end: { x: width - M, y: footerBaseY + 18 }, thickness: 0.5, color: LINE_SOFT });

  const thanksPrefix = 'Gracias por confiar en ';
  const thanksPW = regularFont.widthOfTextAtSize(thanksPrefix, 11);
  page.drawText(thanksPrefix, { x: M, y: footerBaseY, size: 11, font: regularFont, color: MUTED });
  page.drawText('CarsWise AI', { x: M + thanksPW, y: footerBaseY, size: 11, font: boldFont, color: TEXT });
  const siteStr = 'carswiseai.com';
  const siteW = boldFont.widthOfTextAtSize(siteStr, 11);
  page.drawText(siteStr, { x: width - M - siteW, y: footerBaseY, size: 11, font: boldFont, color: AMBER_DEEP });

  return pdfDoc.save();
}

// ── High-level: generate + upload + store URL ─────────────────────────────────
export async function generateAndStoreInvoicePdf(
  data: InvoiceData,
  storagePath: string,
  updateFn: (pdfUrl: string) => Promise<void>
): Promise<{ pdf: Uint8Array; url: string | null }> {
  const pdf = await buildInvoicePdf(data);
  const url = await uploadPdf(pdf, storagePath);
  if (url) await updateFn(url).catch(() => {});
  return { pdf, url };
}
