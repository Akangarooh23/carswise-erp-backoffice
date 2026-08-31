/**
 * El proveedor de garantías y sus productos, dados de alta como los demás.
 *
 * `npm run alta:garantias`. Se ejecuta una vez y se queda: a diferencia de los
 * de muestra, estos llevan **identificador de serie** —`PRV-2026-NNN` y
 * `GAR-2026-NNN`— y `npm run garantias:muestra -- --quitar` ya no los toca.
 * Cuando lleguen los productos de verdad se borran a mano desde su ficha.
 *
 * Y hay que decirlo con todas las letras, porque es lo único que separa esto de
 * una mentira: **los precios y las coberturas son inventados**. Están en las
 * notas del proveedor y en las de cada producto, que es donde se van a leer
 * dentro de seis meses.
 *
 * Con PopCar ya desplegado, **esto sale en el marketplace público**: quien abra
 * un coche de importación verá estas garantías y estos precios.
 */
import { query } from '../db/pool.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import { nombreComparable } from '../lib/proveedores.js';
import { tramiteComparable } from '../lib/tarifas-gestoria.js';
import { preparaProveedores } from '../routes/proveedores.js';
import { preparaGarantias } from '../routes/garantias.js';

const AVISO = [
  'PROVISIONAL: los precios y las coberturas de sus garantías son inventados,',
  'puestos para poder ver y probar el flujo mientras llegan los productos de',
  'verdad. Nada de esto viene de una oferta de nadie.',
  '',
  'Cuando lleguen los reales: cambiar precios y coberturas, o dar de baja este',
  'proveedor y cargar los suyos.',
].join('\n');

const PROVEEDOR = {
  nombre: 'Garantías de muestra',
  telefono: '',
  email: '',
  notas: AVISO,
};

const PRODUCTOS = [
  {
    nombre: 'Básica', nivel: 1, es_base: true, renunciable: true,
    meses: 12, km_cubiertos: null as number | null,
    precio: 180, coste: 95,
    antiguedad_max_anios: 15 as number | null, km_max_vehiculo: 250000 as number | null,
    cubre: ['Motor y transmisión', 'Caja de cambios', 'Sistema de refrigeración'],
    no_cubre: ['Desgaste: neumáticos, frenos y embrague', 'Mantenimiento periódico'],
  },
  {
    nombre: 'Ampliada', nivel: 2, es_base: false, renunciable: true,
    meses: 24, km_cubiertos: 200000,
    precio: 420, coste: 260,
    antiguedad_max_anios: 12, km_max_vehiculo: 200000,
    cubre: ['Todo lo de la básica', 'Electrónica y electricidad', 'Aire acondicionado',
            'Dirección y suspensión'],
    no_cubre: ['Desgaste: neumáticos, frenos y embrague'],
  },
  {
    nombre: 'Premium', nivel: 3, es_base: false, renunciable: true,
    meses: 36, km_cubiertos: 150000,
    precio: 890, coste: 590,
    antiguedad_max_anios: 8, km_max_vehiculo: 150000,
    cubre: ['Todo lo de la ampliada', 'Vehículo de sustitución',
            'Asistencia en carretera desde el kilómetro 0', 'Sin franquicia'],
    no_cubre: [],
  },
];

/** El proveedor, con id de serie como cualquier otro. */
async function altaProveedor(): Promise<string> {
  const clave = nombreComparable(PROVEEDOR.nombre);
  const hay = await query(`SELECT id, tipos FROM erp_proveedores WHERE clave = $1`, [clave]);

  if (hay.rows.length) {
    const previo = hay.rows[0] as { id: string; tipos: string[] };
    const tipos = [...new Set([...(previo.tipos ?? []), 'garantia'])];
    await query(
      `UPDATE erp_proveedores SET tipos = $2, activo = TRUE,
         notas = CASE WHEN notas = '' THEN $3 ELSE notas END
       WHERE id = $1`,
      [previo.id, tipos, PROVEEDOR.notas]
    );
    console.log(`ya estaba · ${previo.id} · ${PROVEEDOR.nombre}`);
    return previo.id;
  }

  const { id } = await guardaConIdUnico(
    () => siguienteDeSerie('erp_proveedores', prefijoAnual('PRV')),
    async (nuevoId) => {
      await query(
        `INSERT INTO erp_proveedores
           (id, nombre, clave, tipos, telefono, email, notas, creado_por)
         VALUES ($1,$2,$3,ARRAY['garantia'],$4,$5,$6,'alta provisional')`,
        [nuevoId, PROVEEDOR.nombre, clave, PROVEEDOR.telefono, PROVEEDOR.email, PROVEEDOR.notas]
      );
    }
  );
  console.log(`alta · ${id} · ${PROVEEDOR.nombre}`);
  return id;
}

async function altaProducto(proveedorId: string, x: (typeof PRODUCTOS)[number]): Promise<void> {
  const yaHay = await query(
    `SELECT id, nombre FROM market_garantias WHERE proveedor_id = $1`, [proveedorId]
  );
  const repetido = (yaHay.rows as { nombre: string }[])
    .some((y) => tramiteComparable(y.nombre) === tramiteComparable(x.nombre));
  if (repetido) { console.log(`  ya estaba · ${x.nombre}`); return; }

  const { id } = await guardaConIdUnico(
    () => siguienteDeSerie('market_garantias', prefijoAnual('GAR')),
    async (nuevoId) => {
      await query(
        `INSERT INTO market_garantias
           (id, nombre, nivel, es_base, renunciable, meses, km_cubiertos, precio, coste,
            proveedor_id, antiguedad_max_anios, km_max_vehiculo, notas, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'alta provisional')`,
        [
          nuevoId, x.nombre, x.nivel, x.es_base, x.renunciable, x.meses, x.km_cubiertos,
          x.precio, x.coste, proveedorId, x.antiguedad_max_anios, x.km_max_vehiculo,
          'PROVISIONAL: precio y coberturas inventados, a la espera del producto real.',
        ]
      );
    }
  );

  let orden = 1;
  for (const texto of x.cubre) {
    await query(
      `INSERT INTO market_garantia_coberturas (garantia_id, texto, incluida, orden)
       VALUES ($1,$2,TRUE,$3)`, [id, texto, orden++]
    );
  }
  for (const texto of x.no_cubre) {
    await query(
      `INSERT INTO market_garantia_coberturas (garantia_id, texto, incluida, orden)
       VALUES ($1,$2,FALSE,$3)`, [id, texto, orden++]
    );
  }

  console.log(`  ${id} · ${x.nombre} · ${x.meses} meses · ${x.precio} €`);
}

async function main(): Promise<void> {
  await preparaProveedores();
  await preparaGarantias();

  // Lo de muestra sobra: esto lo sustituye, y tenerlos a la vez daría dos bases.
  await query(`DELETE FROM market_garantia_coberturas WHERE garantia_id LIKE 'GAR-MUESTRA-%'`, []);
  await query(`DELETE FROM market_garantias WHERE id LIKE 'GAR-MUESTRA-%'`, []);
  await query(`DELETE FROM erp_proveedores WHERE id = 'PRV-MUESTRA-GARANTIAS'`, []);

  const proveedorId = await altaProveedor();
  for (const x of PRODUCTOS) await altaProducto(proveedorId, x);

  console.log('\nEstos ya NO se van con: npm run garantias:muestra -- --quitar');
  console.log('Se borran a mano desde su ficha cuando lleguen los de verdad.');
  console.log('\nY con PopCar desplegado, salen en el marketplace público.');
  process.exit(0);
}

void main();
