/**
 * Da de alta a checkdenwagen.de como perito.
 *
 * Se ejecuta a mano: `npm run alta:checkdenwagen`. No pisa nada — si ya está, le
 * suma el tipo y rellena los huecos.
 *
 * Es el proveedor que resuelve el paso del que depende todo: alguien que va a
 * donde esté el coche, en cualquier punto de Alemania, y dice si es el que se
 * anunció. Su modelo encaja exactamente con lo que hace falta aquí — no hay que
 * llevar el coche a ningún taller, va el inspector.
 *
 * **Lo que cuesta y a quién le duele.** 289 € la revisión estándar, con el
 * desplazamiento dentro y sin kilómetros aparte. Eso sale del margen de PopCar,
 * que hoy son 1.136 € por coche: una de cada cuatro pesetas de lo que se gana
 * se va en mirar el coche. No es un problema, es el precio de poder prometer lo
 * que prometemos, pero tiene que estar escrito en algún sitio y no descubrirse
 * al final del mes.
 *
 * **Le falta el correo**, que es el dato con el que se le encarga la revisión
 * desde el ERP. Está solo el teléfono, que es lo que hay publicado. Mientras no
 * esté, el botón de encargar dirá que falta y no mandará nada — que es lo
 * correcto: mejor eso que un encargo a ninguna parte.
 */
import { query } from '../db/pool.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import { nombreComparable } from '../lib/proveedores.js';
import { preparaProveedores } from '../routes/proveedores.js';

const CHECKDENWAGEN = {
  nombre: 'checkdenwagen.de',
  nif: '',
  telefono: '+49 30 301 32 327',
  // Lo publicado es el teléfono. Sin correo no se le puede encargar desde aquí.
  email: '',
  direccion: 'Alemania · inspección móvil, va donde esté el coche',
  notas: [
    'Inspección independiente de vehículos usados, a domicilio, en toda Alemania.',
    'Van a donde esté el coche: no hay que llevarlo a ningún taller.',
    '',
    'Duración: ~1,5 h · Más de 100 puntos de revisión.',
    'Informe digital con fotografías, normalmente en 24 h.',
    '',
    'Estándar: 289 € IVA incluido.',
    'Premium: 339 € IVA incluido.',
    'El desplazamiento va dentro: ni kilómetros aparte ni tarifa por hora.',
    '',
    'FALTA EL CORREO. Es el dato con el que se le encarga la revisión desde el',
    'ERP; mientras no esté, hay que llamarles.',
  ].join('\n'),
};

async function alta(): Promise<void> {
  await preparaProveedores();

  const clave = nombreComparable(CHECKDENWAGEN.nombre);
  const ya = await query<{ id: string; tipos: string[] }>(
    `SELECT id, tipos FROM erp_proveedores WHERE clave = $1`,
    [clave]
  );

  if (ya.rows.length) {
    const { id, tipos } = ya.rows[0];
    // Se le suma el tipo y se rellenan los huecos. Lo que ya tenga escrito
    // alguien a mano vale más que esto.
    await query(
      `UPDATE erp_proveedores
          SET tipos = (SELECT ARRAY(SELECT DISTINCT UNNEST(tipos || ARRAY['perito']))),
              telefono  = COALESCE(NULLIF(telefono, ''), $2),
              direccion = COALESCE(NULLIF(direccion, ''), $3),
              notas     = COALESCE(NULLIF(notas, ''), $4)
        WHERE id = $1`,
      [id, CHECKDENWAGEN.telefono, CHECKDENWAGEN.direccion, CHECKDENWAGEN.notas]
    );
    console.log(`ya estaba: ${id} · ${CHECKDENWAGEN.nombre} · tipos ahora con «perito» (tenía: ${tipos.join(', ')})`);
    return;
  }

  const { id } = await guardaConIdUnico(
    () => siguienteDeSerie('erp_proveedores', prefijoAnual('PRV')),
    async (nuevoId) => {
      await query(
        `INSERT INTO erp_proveedores (id, nombre, clave, tipos, nif, telefono, email, direccion, notas, creado_por)
         VALUES ($1,$2,$3,ARRAY['perito'],$4,$5,$6,$7,$8,'alta a mano')`,
        [nuevoId, CHECKDENWAGEN.nombre, clave, CHECKDENWAGEN.nif,
         CHECKDENWAGEN.telefono, CHECKDENWAGEN.email, CHECKDENWAGEN.direccion, CHECKDENWAGEN.notas]
      );
    }
  );
  console.log(`dado de alta: ${id} · ${CHECKDENWAGEN.nombre} (perito)`);
  console.log('OJO: sin correo. Hasta que lo tenga, el ERP no le puede encargar la revisión.');
}

alta()
  .then(() => process.exit(0))
  .catch((e: Error) => { console.error('ERROR:', e.message); process.exit(1); });
