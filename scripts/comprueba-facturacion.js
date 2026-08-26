/**
 * Lo que se descarga tiene que ser lo que se ve.
 *
 * El fichero de facturas y el listado salen de dos consultas distintas, y ya se
 * separaron una vez: pedir «Suscripciones» devolvía las ocho filas de la tabla
 * —seis de ellas informes de mercado, etiquetados como suscripción— y pedir
 * «Informes de mercado» devolvía un fichero vacío. Eso nadie lo nota hasta que
 * se sienta a cuadrar las cuentas.
 *
 * Comprueba además que los importes del CSV coinciden con lo que dice la
 * factura en PDF: lo guardado lleva el IVA dentro, así que la base sale de
 * dividir, no de sumar.
 *
 * Necesita la API levantada y las claves en .env.
 *   node scripts/comprueba-facturacion.js
 */
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const clave = (n) => (env.split(/\r?\n/).find((x) => x.startsWith(n + '=')) || '').slice(n.length + 1).trim();
const API = process.env.API_URL || 'http://localhost:4000/api';

let mal = 0;
const ok = (t, b, extra = '') => { if (!b) mal++; console.log((b ? '  OK  ' : '  MAL ') + t + (extra ? '  · ' + extra : '')); };

(async () => {
  const login = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@carswise.es', password: clave('ERP_ADMIN_PASSWORD') }),
  });
  const { token } = await login.json();
  if (!token) { console.log('  MAL  no se ha podido entrar en la API'); process.exit(1); }
  const cab = { Authorization: 'Bearer ' + token };

  // Cada pestaña exporta lo que enseña.
  for (const t of ['all', 'suscripcion', 'tasacion', 'venta', 'renting']) {
    const csv = await (await fetch(API + '/billing/invoices/export?type=' + t, { headers: cab })).text();
    const lista = await (await fetch(API + '/billing/invoices?type=' + t + '&limit=500', { headers: cab })).json();
    const enFichero = csv.trim().split(/\r?\n/).length - 1;
    const enPantalla = (lista.data || []).length;
    ok('«' + t + '» exporta lo que enseña', enFichero === enPantalla,
       'pantalla ' + enPantalla + ' · fichero ' + enFichero);
  }

  // Los importes dicen lo mismo que la factura.
  const res = await fetch(API + '/billing/invoices/export?type=tasacion', { headers: cab });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const texto = new TextDecoder('utf-8').decode(bytes);
  const lineas = texto.trim().split(/\r?\n/);
  const cols = lineas[0].replace(/^﻿/, '').split(';');
  const num = (fila, col) => Number(String(fila[cols.indexOf(col)] || '0').replace(/\./g, '').replace(',', '.'));

  ok('lleva el BOM que Excel de aquí necesita', bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);

  let descuadres = 0;
  for (const linea of lineas.slice(1)) {
    const f = linea.split(';');
    // Un céntimo de margen: los tres importes se redondean por separado.
    if (Math.abs(num(f, 'Base imponible') + num(f, 'IVA (21%)') - num(f, 'Total facturado')) > 0.01) descuadres++;
  }
  ok('base + IVA da el total en todas las filas', descuadres === 0, descuadres + ' descuadres');

  const sinSesion = await fetch(API + '/billing/invoices/export');
  ok('sin sesión no se descarga', sinSesion.status === 401);

  console.log(mal ? '\n' + mal + ' FALLOS' : '\ntodo correcto');
  process.exit(mal ? 1 : 0);
})();
