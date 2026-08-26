/**
 * Saca una factura de ejemplo a fichero, para poder mirarla.
 *
 * Igual que `muestra-correos`: la única forma de ver lo que recibe un cliente
 * sin emitir nada de verdad. `npx tsx src/services/muestra-factura.ts <fichero>`
 */
import { writeFileSync } from 'fs';
import { buildInvoicePdf } from './invoice-pdf.js';

const salida = process.argv[2] || 'factura.pdf';

const bytes = await buildInvoicePdf({
  invoiceNumber: 'SUBS-2026-0042',
  date: new Date('2026-09-01T10:00:00Z'),
  series: 'SUBS',
  recipientName: 'Ana Picazo Kangaroo',
  recipientNif: '12345678Z',
  recipientEmail: 'ana@ejemplo.es',
  recipientAddress: 'Calle Alcalá 120, 28009 Madrid',
  lines: [
    { description: 'Suscripción PopCar — plan Avanzado', subtitle: 'Del 1 de septiembre al 30 de septiembre de 2026', amount: 24.79 },
    { description: 'Informe de mercado adicional', subtitle: 'Volkswagen T-Roc 1.5 TSI', amount: 9.09 },
  ],
  notes: 'Cargo domiciliado en la tarjeta terminada en 4242.',
});

writeFileSync(salida, bytes);
console.log('factura en ' + salida);
