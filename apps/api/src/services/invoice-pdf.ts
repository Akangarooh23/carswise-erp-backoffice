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

// ── Color palette ─────────────────────────────────────────────────────────────
const BRAND = rgb(0.149, 0.361, 0.937); // #2563EB
const BLACK = rgb(0, 0, 0);
const DARK  = rgb(0.071, 0.094, 0.145); // #121823
const MID   = rgb(0.278, 0.333, 0.408); // #475569
const LIGHT = rgb(0.886, 0.918, 0.953); // #E2E8F2
const WHITE = rgb(1, 1, 1);

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
  const pdfDoc  = await PDFDocument.create();
  const page    = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const boldFont   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const ivaRate  = data.ivaRate ?? 0.21;
  const base     = data.lines.reduce((s, l) => s + l.amount, 0);
  const ivaAmt   = base * ivaRate;
  const total    = base + ivaAmt;

  const M = 48; // margin
  let y = height - M;

  // ── Header band ──────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: BRAND });

  // Logo (top-left inside band)
  const logoBytes = await fetchLogo();
  if (logoBytes) {
    try {
      const img = await pdfDoc.embedPng(logoBytes);
      const { width: iw, height: ih } = img.scale(1);
      const scale = Math.min(120 / iw, 50 / ih);
      page.drawImage(img, { x: M, y: height - 72, width: iw * scale, height: ih * scale });
    } catch { /* logo embed failed, skip */ }
  } else {
    // Fallback text logo
    page.drawText('CarsWiseAi', { x: M, y: height - 56, size: 18, font: boldFont, color: WHITE });
  }

  // "FACTURA" top-right
  const invoiceTypeLabel = data.series === 'RECT' ? 'FACTURA RECTIFICATIVA' : 'FACTURA';
  const labelSize = data.series === 'RECT' ? 13 : 22;
  const labelX = data.series === 'RECT' ? width - M - 165 : width - M - 90;
  page.drawText(invoiceTypeLabel, { x: labelX, y: height - 38, size: labelSize, font: boldFont, color: WHITE });

  y = height - 110;

  // ── Invoice meta block (two columns) ─────────────────────────────────────
  const colL = M;
  const colR = width / 2 + 10;

  // Left: emisor
  page.drawText('EMISOR', { x: colL, y, size: 8, font: boldFont, color: MID });
  y -= 14;
  page.drawText('CarsWiseAi', { x: colL, y, size: 11, font: boldFont, color: DARK });
  y -= 13;
  page.drawText('NIF: Pendiente de asignación', { x: colL, y, size: 9, font: regularFont, color: MID });
  y -= 12;
  page.drawText('Dirección: Pendiente de asignación', { x: colL, y, size: 9, font: regularFont, color: MID });
  y -= 12;
  page.drawText('carswiseai.com', { x: colL, y, size: 9, font: regularFont, color: BRAND });

  // Right: invoice number + date
  const metaY = height - 110;
  page.drawText('Nº Factura:', { x: colR, y: metaY, size: 8, font: boldFont, color: MID });
  page.drawText(data.invoiceNumber, { x: colR + 72, y: metaY, size: 10, font: boldFont, color: DARK });
  page.drawText('Fecha:', { x: colR, y: metaY - 14, size: 8, font: boldFont, color: MID });
  page.drawText(fmtDate(data.date), { x: colR + 72, y: metaY - 14, size: 10, font: regularFont, color: DARK });
  page.drawText('Serie:', { x: colR, y: metaY - 28, size: 8, font: boldFont, color: MID });
  page.drawText(data.series, { x: colR + 72, y: metaY - 28, size: 10, font: regularFont, color: MID });

  y -= 30;

  // ── Separator ─────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 0.5, color: LIGHT });
  y -= 20;

  // ── Recipient block ───────────────────────────────────────────────────────
  page.drawText('RECEPTOR', { x: M, y, size: 8, font: boldFont, color: MID });
  y -= 14;
  page.drawText(data.recipientName, { x: M, y, size: 11, font: boldFont, color: DARK });
  y -= 13;
  if (data.recipientNif) {
    page.drawText(`NIF/CIF: ${data.recipientNif}`, { x: M, y, size: 9, font: regularFont, color: MID });
    y -= 12;
  }
  if (data.recipientEmail) {
    page.drawText(data.recipientEmail, { x: M, y, size: 9, font: regularFont, color: MID });
    y -= 12;
  }
  if (data.recipientAddress) {
    page.drawText(data.recipientAddress, { x: M, y, size: 9, font: regularFont, color: MID });
    y -= 12;
  }
  y -= 18;

  // ── Lines table header ────────────────────────────────────────────────────
  page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 22, color: DARK });
  page.drawText('CONCEPTO', { x: M + 8, y: y + 4, size: 9, font: boldFont, color: WHITE });
  page.drawText('IMPORTE (base)', { x: width - M - 100, y: y + 4, size: 9, font: boldFont, color: WHITE });
  y -= 22;

  // ── Line items ────────────────────────────────────────────────────────────
  for (const line of data.lines) {
    const rowH = line.subtitle ? 28 : 18;
    page.drawRectangle({ x: M, y: y - rowH + 14, width: width - 2 * M, height: rowH, color: rgb(0.98, 0.99, 1) });
    page.drawText(line.description, { x: M + 8, y: y + 2, size: 10, font: boldFont, color: DARK });
    if (line.subtitle) {
      page.drawText(line.subtitle, { x: M + 8, y: y - 11, size: 8, font: regularFont, color: MID });
    }
    page.drawText(fmtEur(line.amount), { x: width - M - 80, y: y + 2, size: 10, font: boldFont, color: DARK });
    y -= rowH + 2;
    page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 0.3, color: LIGHT });
  }

  y -= 20;

  // ── Totals block (right-aligned) ──────────────────────────────────────────
  const totX = width - M - 200;
  const totW = 200;

  const drawTotalRow = (label: string, value: string, bold = false, highlight = false) => {
    if (highlight) {
      page.drawRectangle({ x: totX, y: y - 4, width: totW, height: 22, color: BRAND });
    }
    page.drawText(label, {
      x: totX + 8, y: y + 4, size: bold ? 11 : 9,
      font: bold ? boldFont : regularFont,
      color: highlight ? WHITE : (bold ? DARK : MID),
    });
    page.drawText(value, {
      x: totX + totW - 8 - (value.length * (bold ? 6.5 : 5.5)),
      y: y + 4, size: bold ? 11 : 9,
      font: bold ? boldFont : regularFont,
      color: highlight ? WHITE : (bold ? DARK : MID),
    });
    y -= 22;
  };

  drawTotalRow('Base imponible', fmtEur(base));
  drawTotalRow(`IVA (${Math.round(ivaRate * 100)}%)`, fmtEur(ivaAmt));
  page.drawLine({ start: { x: totX, y: y + 16 }, end: { x: width - M, y: y + 16 }, thickness: 0.5, color: LIGHT });
  y -= 4;
  drawTotalRow('TOTAL FACTURA', fmtEur(total), true, true);

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (data.notes) {
    y -= 20;
    page.drawText('NOTAS', { x: M, y, size: 8, font: boldFont, color: MID });
    y -= 13;
    page.drawText(data.notes, { x: M, y, size: 9, font: regularFont, color: MID });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: M, y: 50 }, end: { x: width - M, y: 50 }, thickness: 0.5, color: LIGHT });
  page.drawText(
    'Factura emitida conforme a la Ley 37/1992 del Impuesto sobre el Valor Añadido y normativa de facturación española.',
    { x: M, y: 36, size: 7, font: regularFont, color: MID }
  );
  page.drawText('CarsWiseAi · carswiseai.com', { x: M, y: 24, size: 7, font: regularFont, color: MID });

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
