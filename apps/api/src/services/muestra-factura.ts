/**
 * Saca una factura de ejemplo a fichero, para poder mirarla.
 *
 * Los importes se calculan igual que en la ruta real: lo que se guarda de un
 * cobro es lo que pagó el cliente, con el IVA dentro, y la base sale de
 * dividir entre 1,21. Así lo que se ve aquí es lo que recibe un cliente.
 *
 * `npx tsx src/services/muestra-factura.ts <fichero>`
 */
import { writeFileSync } from 'fs';
import { buildInvoicePdf } from './invoice-pdf.js';

const salida = process.argv[2] || 'factura.pdf';
const IVA = 0.21;

/** De lo que pagó el cliente a la base imponible. */
const base = (totalPagado: number) => Math.round((totalPagado / (1 + IVA)) * 100) / 100;

const bytes = await buildInvoicePdf({
  invoiceNumber: 'SUBS-2026-0009',
  date: new Date('2026-08-22T10:00:00Z'),
  series: 'SUBS',
  recipientName: 'Ana Picazo Kangaroo',
  recipientNif: '12345678Z',
  recipientEmail: 'ana@ejemplo.es',
  recipientAddress: 'Calle Alcalá 120, 28009 Madrid',
  lines: [
    // Un informe de mercado: el cliente paga 10,00 €.
    { description: 'Informe de Valor de Mercado Avanzado',
      subtitle: 'Volkswagen T-Roc 1.5 TSI · Ref. Stripe: in_1QxYz',
      amount: base(10) },
  ],
  ivaRate: IVA,
  // El cliente pagó 10,00 €: el IVA va dentro.
  totalCobrado: 10,
  notes: 'Precio final: 10,00 € con IVA incluido. Cargo en la tarjeta terminada en 4242.',
});

writeFileSync(salida, bytes);
console.log('factura en ' + salida);
