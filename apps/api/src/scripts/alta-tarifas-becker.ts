/**
 * Los precios que Becker publica en su web, como tarifas de referencia.
 *
 * `npm run alta:tarifas-becker`. Se cargan **solo los corredores de coches en la
 * península**, y con una advertencia dentro de cada uno: son los ejemplos de su
 * página, no un presupuesto que nos hayan dado.
 *
 * Lo que NO se carga, y por qué:
 *
 * - **Alemania → España**: no lo publican. Publican España → Alemania, que es el
 *   sentido contrario, y traer no cuesta lo mismo que llevar. Cargarlo como si
 *   fuera el nuestro sería inventarnos un precio. Por eso el coste de traer un
 *   coche de importación **no cambia** con esto.
 * - **Península → Canarias** y las mudanzas: no es lo que hacemos hoy.
 *
 * De cada rango se guarda **el extremo alto**. Una tarifa sirve para estimar lo
 * que va a costar y para ver si un presupuesto se pasa; quedarse con el mínimo
 * de un rango es prometerse el mejor caso, que es la manera de que la cuenta
 * salga siempre corta.
 */
import { query } from '../db/pool.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import { nombreComparable, } from '../lib/proveedores.js';
import { zonaComparable } from '../lib/tarifas.js';
import { preparaTarifas } from '../routes/tarifas.js';
import { preparaProveedores } from '../routes/proveedores.js';

const BECKER = 'Becker Solutions, S.L. (Becker Lines)';

const AVISO = [
  'Precio publicado en becker-lines.com, no negociado con nosotros.',
  'Su web dice: «Los importes indicados son ejemplos orientativos basados en',
  'rutas frecuentes. El precio final puede variar según vehículo, volumen,',
  'accesibilidad, urgencia, seguro, documentación y temporada.»',
  'Se ha cargado el extremo alto del rango.',
].join('\n');

const TARIFAS = [
  {
    origen_zona: 'Madrid', destino_zona: 'Barcelona',
    rango: '450-750 €', precio: 750,
  },
  {
    origen_zona: 'Málaga', destino_zona: 'Madrid',
    rango: '400-700 €', precio: 700,
  },
];

async function main(): Promise<void> {
  await preparaProveedores();
  await preparaTarifas();

  const p = await query(
    `SELECT id FROM erp_proveedores WHERE clave = $1`, [nombreComparable(BECKER)]
  );
  if (!p.rows.length) {
    console.error(`No está dado de alta «${BECKER}». Ejecuta antes: npm run alta:transportistas`);
    process.exit(1);
  }
  const proveedorId = String((p.rows[0] as { id: string }).id);

  const yaHay = await query(
    `SELECT origen_zona, destino_zona FROM erp_tarifas_transporte WHERE proveedor_id = $1`,
    [proveedorId]
  );

  for (const t of TARIFAS) {
    const repetida = (yaHay.rows as { origen_zona: string; destino_zona: string }[]).some(
      (x) => zonaComparable(x.origen_zona) === zonaComparable(t.origen_zona)
          && zonaComparable(x.destino_zona) === zonaComparable(t.destino_zona)
    );
    if (repetida) {
      console.log(`  ya estaba · ${t.origen_zona} → ${t.destino_zona}`);
      continue;
    }

    const { id } = await guardaConIdUnico(
      () => siguienteDeSerie('erp_tarifas_transporte', prefijoAnual('TRF')),
      async (nuevoId) => {
        await query(
          `INSERT INTO erp_tarifas_transporte
             (id, proveedor_id, origen_pais, origen_zona, destino_pais, destino_zona,
              precio_1, notas, creado_por)
           VALUES ($1,$2,'ES',$3,'ES',$4,$5,$6,'alta desde su web')`,
          [nuevoId, proveedorId, t.origen_zona, t.destino_zona, t.precio,
           `Rango publicado: ${t.rango}.\n${AVISO}`]
        );
      }
    );
    console.log(`  ${id} · ${t.origen_zona} → ${t.destino_zona} · ${t.precio} € (rango ${t.rango})`);
  }

  console.log('\nSolo nacional. Alemania → España no lo publican, así que el coste');
  console.log('de traer un coche de importación no cambia: sigue en el supuesto de 1.500 €.');
  process.exit(0);
}

void main();
