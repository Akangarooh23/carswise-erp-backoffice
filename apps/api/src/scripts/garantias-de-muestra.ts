/**
 * Tres garantías **inventadas**, para ver cómo queda la oferta.
 *
 * `npm run garantias:muestra` las pone, `npm run garantias:muestra -- --quitar`
 * las borra. No son productos reales: ni los precios, ni las coberturas, ni los
 * límites de antigüedad salen de ningún sitio.
 *
 * Importa que se puedan quitar de un tirón, porque en cuanto PopCar despliegue
 * el código que las lee, **esto sale en el marketplace público**. Un producto de
 * mentira con un precio de mentira delante de un cliente real no es una maqueta:
 * es una oferta.
 *
 * Están pensadas para que se vean las tres cosas que hace la pantalla:
 *
 * - La base va dentro del precio y las demás salen como diferencia.
 * - La premium **no se le ofrece a un coche viejo**: su tope son 8 años, y la
 *   media del catálogo es de 12,8. Ahí se ve la regla funcionando.
 * - Las coberturas listan también lo que **no** entra.
 */
import { query } from '../db/pool.js';
import { preparaGarantias } from '../routes/garantias.js';
import { preparaProveedores } from '../routes/proveedores.js';
import { nombreComparable } from '../lib/proveedores.js';

interface Muestra {
  id: string;
  nombre: string;
  nivel: number;
  es_base: boolean;
  renunciable: boolean;
  meses: number;
  km_cubiertos: number | null;
  precio: number;
  coste: number;
  antiguedad_max_anios: number | null;
  km_max_vehiculo: number | null;
  cubre: string[];
  no_cubre: string[];
}

/** Todas llevan este prefijo para poder borrarlas sin tocar nada de verdad. */
const PREFIJO = 'GAR-MUESTRA-';

/**
 * Quien da estas garantías, también inventado.
 *
 * Sin él la cadena queda a medias: hay un tipo de proveedor «Garantías» y
 * ningún proveedor que lo sea, así que no se ve lo que de verdad va a pasar —un
 * producto colgando de alguien a quien se le puede reclamar—.
 *
 * El identificador **no sigue la serie PRV-AÑO-NNN** a propósito: nadie tiene
 * que poder confundirlo con un proveedor real, y el nombre lo dice también.
 */
const PROVEEDOR = {
  id: 'PRV-MUESTRA-GARANTIAS',
  nombre: 'Garantías de muestra (inventado)',
  telefono: '900 000 000',
  email: 'inventado@example.com',
  notas: [
    'INVENTADO. Está aquí solo para que las garantías de muestra cuelguen de',
    'alguien, como colgarán las de verdad.',
    '',
    'Se va con: npm run garantias:muestra -- --quitar',
  ].join('\n'),
};

const MUESTRAS: Muestra[] = [
  {
    id: `${PREFIJO}1`,
    nombre: 'Básica',
    nivel: 1,
    es_base: true,
    // Puesta como comercial para que se vea la opción de quitarla. Si el
    // producto real es el mínimo legal, esa opción no saldrá.
    renunciable: true,
    meses: 12,
    km_cubiertos: null,
    precio: 180,
    coste: 95,
    antiguedad_max_anios: 15,
    km_max_vehiculo: 250000,
    cubre: ['Motor y transmisión', 'Caja de cambios', 'Sistema de refrigeración'],
    no_cubre: ['Desgaste: neumáticos, frenos y embrague', 'Mantenimiento periódico'],
  },
  {
    id: `${PREFIJO}2`,
    nombre: 'Ampliada',
    nivel: 2,
    es_base: false,
    renunciable: true,
    meses: 24,
    km_cubiertos: 200000,
    precio: 420,
    coste: 260,
    antiguedad_max_anios: 12,
    km_max_vehiculo: 200000,
    cubre: [
      'Todo lo de la básica',
      'Electrónica y electricidad',
      'Aire acondicionado',
      'Dirección y suspensión',
    ],
    no_cubre: ['Desgaste: neumáticos, frenos y embrague'],
  },
  {
    id: `${PREFIJO}3`,
    nombre: 'Premium',
    nivel: 3,
    es_base: false,
    renunciable: true,
    meses: 36,
    km_cubiertos: 150000,
    precio: 890,
    coste: 590,
    antiguedad_max_anios: 8,
    km_max_vehiculo: 150000,
    cubre: [
      'Todo lo de la ampliada',
      'Vehículo de sustitución',
      'Asistencia en carretera desde el kilómetro 0',
      'Sin franquicia',
    ],
    no_cubre: [],
  },
];

async function quita(): Promise<void> {
  await query(`DELETE FROM market_garantia_coberturas WHERE garantia_id LIKE $1`, [`${PREFIJO}%`]);
  const r = await query(`DELETE FROM market_garantias WHERE id LIKE $1 RETURNING id`, [`${PREFIJO}%`]);
  // Y el proveedor inventado, que sin sus productos no pinta nada.
  const q = await query(`DELETE FROM erp_proveedores WHERE id = $1 RETURNING id`, [PROVEEDOR.id]);
  if (q.rows.length) console.log('quitado el proveedor de muestra');
  // Se dice si no había ninguna en vez de «quitadas 0», que parece que ha
  // fallado cuando lo que pasa es que ya estaban fuera.
  console.log(r.rows.length
    ? `quitadas ${r.rows.length} garantías de muestra`
    : 'no había ninguna garantía de muestra que quitar');
}

async function pon(): Promise<void> {
  await query(
    `INSERT INTO erp_proveedores (id, nombre, clave, tipos, telefono, email, notas, creado_por)
     VALUES ($1,$2,$3,ARRAY['garantia'],$4,$5,$6,'muestra')
     ON CONFLICT (id) DO NOTHING`,
    [PROVEEDOR.id, PROVEEDOR.nombre, nombreComparable(PROVEEDOR.nombre),
     PROVEEDOR.telefono, PROVEEDOR.email, PROVEEDOR.notas]
  );
  console.log(`  ${PROVEEDOR.id} · ${PROVEEDOR.nombre}`);

  for (const m of MUESTRAS) {
    await query(
      `INSERT INTO market_garantias
         (id, nombre, nivel, es_base, renunciable, meses, km_cubiertos, precio, coste,
          proveedor_id, antiguedad_max_anios, km_max_vehiculo, notas, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'muestra')
       ON CONFLICT (id) DO NOTHING`,
      [
        m.id, m.nombre, m.nivel, m.es_base, m.renunciable, m.meses, m.km_cubiertos,
        m.precio, m.coste, PROVEEDOR.id, m.antiguedad_max_anios, m.km_max_vehiculo,
        'INVENTADA, para ver cómo queda la oferta. Quitar con: npm run garantias:muestra -- --quitar',
      ]
    );

    let orden = 1;
    for (const texto of m.cubre) {
      await query(
        `INSERT INTO market_garantia_coberturas (garantia_id, texto, incluida, orden)
         VALUES ($1,$2,TRUE,$3)`,
        [m.id, texto, orden++]
      );
    }
    for (const texto of m.no_cubre) {
      await query(
        `INSERT INTO market_garantia_coberturas (garantia_id, texto, incluida, orden)
         VALUES ($1,$2,FALSE,$3)`,
        [m.id, texto, orden++]
      );
    }

    console.log(`  ${m.id} · ${m.nombre} · ${m.meses} meses · ${m.precio} €`);
  }

  console.log('\nEn un coche de menos de 8 años se ofrecen las tres.');
  console.log('En uno de 12, la premium no: su tope son 8 años. Eso es la regla, no un fallo.');
  console.log('\nSon INVENTADAS. Quítalas antes de desplegar PopCar, o salen en público:');
  console.log('  npm run garantias:muestra -- --quitar');
}

async function main(): Promise<void> {
  await preparaProveedores();
  await preparaGarantias();
  // Siempre se limpian antes: así volver a ejecutarlo no duplica coberturas.
  await quita();
  if (!process.argv.includes('--quitar')) await pon();
  process.exit(0);
}

void main();
