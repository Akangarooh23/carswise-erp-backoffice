/**
 * El proveedor de garantías y sus productos, dados de alta como los demás.
 *
 * `npm run alta:garantias`. Se ejecuta una vez y se queda: a diferencia de los
 * de muestra, estos llevan **identificador de serie** —`PRV-2026-NNN` y
 * `GAR-2026-NNN`— y `npm run garantias:muestra -- --quitar` ya no los toca.
 * Cuando lleguen los productos de verdad se borran a mano desde su ficha.
 *
 * Las damos nosotros, no una compañía: por eso el proveedor somos nosotros y
 * nunca va a haber una factura suya.
 *
 * Y hay que decirlo con todas las letras, porque es lo único que separa esto de
 * una mentira: **los plazos, los precios y las coberturas son provisionales**.
 * Están en las notas del proveedor y en las de cada producto, que es donde se
 * van a leer dentro de seis meses.
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
  'Las garantías las damos nosotros: no hay una compañía detrás. Por eso este',
  'proveedor somos nosotros mismos y nunca va a haber una factura suya.',
  '',
  'PROVISIONAL: los plazos, los precios y las coberturas están puestos para poder',
  'ver y probar el flujo. Antes de venderlos hay que fijarlos de verdad, y sobre',
  'todo confirmar con el asesor el plazo mínimo legal de un usado.',
].join('\n');

const PROVEEDOR = {
  nombre: 'PopCar (garantía propia)',
  telefono: '',
  email: '',
  notas: AVISO,
};

/**
 * Las garantías que damos con el coche.
 *
 * La **básica es la legal**: va con la venta de una empresa a un particular, no
 * se cobra aparte y **no se puede renunciar a ella**. Por eso su precio es cero
 * —su coste está dentro del margen del coche, no en una línea suya— y no
 * aparece la opción de quitarla.
 *
 * Las otras dos son **ampliaciones**: empiezan donde acaba la legal y cubren
 * averías que salgan después, no defectos que el coche ya traía. Esas sí se
 * eligen y se cobran, y por eso salen como diferencia sobre la base.
 *
 * Los topes de antigüedad y kilómetros suben al revés que el plazo: cuanto más
 * larga es la garantía, más joven tiene que ser el coche. Alargar tres años la
 * cobertura de un coche de quince es prometer una avería.
 */
const PRODUCTOS = [
  {
    nombre: 'Garantía incluida', nivel: 1, es_base: true,
    // Legal: no se puede quitar.
    renunciable: false,
    meses: 12, km_cubiertos: null as number | null,
    // Al cliente, cero: va en el precio del coche. A nosotros nos cuesta.
    precio: 0, comision: 0,
    antiguedad_max_anios: null as number | null, km_max_vehiculo: null as number | null,
    cubre: [
      'Averías por defectos que el coche ya tenía al entregártelo',
      'Piezas y mano de obra, sin que pagues nada',
      'Reparación en nuestra red de talleres',
    ],
    no_cubre: [
      'Desgaste normal: neumáticos, frenos, embrague y escobillas',
      'Mantenimiento: aceite, filtros y revisiones',
      'Daños por accidente, mal uso o falta de mantenimiento',
    ],
  },
  {
    nombre: 'Ampliada a 24 meses', nivel: 2, es_base: false, renunciable: true,
    meses: 24, km_cubiertos: 200000,
    precio: 290, comision: 125,
    antiguedad_max_anios: 12, km_max_vehiculo: 180000,
    cubre: [
      'Todo lo de la garantía incluida, doce meses más',
      'Averías que salgan después de la entrega, no solo las que ya venían',
      'Motor, caja de cambios y transmisión',
      'Dirección, frenos y refrigeración',
      'Sin franquicia: no pagas nada por avería',
    ],
    no_cubre: [
      'Desgaste normal y mantenimiento',
      'Electrónica y climatización',
    ],
  },
  {
    nombre: 'Ampliada a 36 meses', nivel: 3, es_base: false, renunciable: true,
    meses: 36, km_cubiertos: 160000,
    precio: 690, comision: 280,
    antiguedad_max_anios: 8, km_max_vehiculo: 140000,
    cubre: [
      'Todo lo de la ampliada a 24 meses, un año más',
      'Electrónica, climatización y multimedia',
      'Coche de sustitución mientras esté en el taller',
      'Asistencia en carretera desde el kilómetro cero',
    ],
    no_cubre: [
      'Desgaste normal y mantenimiento',
    ],
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
           (id, nombre, nivel, es_base, renunciable, meses, km_cubiertos, precio, comision,
            proveedor_id, antiguedad_max_anios, km_max_vehiculo, notas, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'alta provisional')`,
        [
          nuevoId, x.nombre, x.nivel, x.es_base, x.renunciable, x.meses, x.km_cubiertos,
          x.precio, x.comision, proveedorId, x.antiguedad_max_anios, x.km_max_vehiculo,
          'PROVISIONAL: plazos, precio y coberturas puestos para probar el flujo.',
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

  /**
   * Lo anterior se va antes de poner esto.
   *
   * Tanto las de muestra como una tanda anterior de este mismo guion: con dos
   * juegos a la vez habría **dos garantías base activas**, y el precio del coche
   * dependería de cuál se leyera primero. El índice único lo impediría, pero
   * mejor no llegar a chocar con él.
   */
  await query(`DELETE FROM market_garantia_coberturas WHERE garantia_id IN
                 (SELECT id FROM market_garantias)`, []);
  await query(`DELETE FROM market_garantias`, []);
  await query(`DELETE FROM erp_proveedores WHERE id = $1 OR clave = $2`,
    ['PRV-MUESTRA-GARANTIAS', 'garantias de muestra']);

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
