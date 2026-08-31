/**
 * Da de alta la gestoría Bernal y su tarifa.
 *
 * Se ejecuta a mano: `npm run alta:bernal`. No pisa nada — si ya está, le suma
 * el tipo y rellena los huecos, y las tarifas que ya existan de ese trámite se
 * dejan como están.
 *
 * De su tarifa solo entra **lo que sirve para un coche**. Lo de tarjetas de
 * transporte, VTC y tacógrafos es otro negocio suyo y no tiene sitio aquí:
 * meterlo sería llenar la lista de trámites que ningún coche va a necesitar.
 *
 * Y lo que **no** trae su tarifa está escrito en las notas: no hay precio de
 * matriculación de vehículo importado, que es justo el trámite que necesita un
 * coche de Alemania. Un hueco callado se convierte en un coste que aparece
 * después.
 */
import { query } from '../db/pool.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import { nombreComparable } from '../lib/proveedores.js';
import { tramiteComparable } from '../lib/tarifas-gestoria.js';
import { preparaProveedores } from '../routes/proveedores.js';
import { preparaTarifas } from '../routes/tarifas.js';

const BERNAL = {
  nombre: 'Gestoría Bernal',
  nif: '',
  telefono: '915610386',
  email: 'trafico@gestoriabernal.com',
  direccion: 'Calle Joaquín Costa 61, Madrid',
  notas: [
    'Especialistas en trámites de DGT. WhatsApp: 609034991.',
    'Su tarifa no lleva IVA incluido: se aplica sobre los honorarios, no sobre las',
    'tasas de la DGT, que son un suplido.',
    '',
    'LO QUE FALTA POR PEDIRLES, y es lo que más nos importa:',
    '- Matriculación de un vehículo importado. Su presentación dice que la hacen,',
    '  pero no está en la tarifa. Es el trámite central de un coche de Alemania.',
    '- ITV de homologación / ficha reducida, y las placas.',
    '- Si presentan el modelo 576 del impuesto de matriculación, y con qué honorarios.',
    '- Confirmar si la tasa del colegio lleva IVA o va como suplido.',
    '',
    'Sin esos precios, el papeleo de una importación sigue sin poder calcularse.',
  ].join('\n'),
};

/**
 * Lo de su tarifa que le puede tocar a un coche.
 *
 * Los nombres son los que usa el ERP cuando abre un trámite, no los de su hoja:
 * si no coinciden, el coste no se casa con el expediente y la tarifa no sirve
 * para nada. Su nombre original va en las notas para poder cotejarlo.
 */
const TARIFA = [
  {
    tramite: 'Transferencia de titularidad',
    honorarios: 20, tasas: 55.70, tasa_colegio: 7.90,
    notas: 'En su tarifa: TRANSFERENCIAS.',
  },
  {
    tramite: 'Impuesto de transmisiones',
    honorarios: 25, tasas: 55.70, tasa_colegio: 7.90,
    notas: [
      'En su tarifa: TRANSFERENCIA CON ITP O MODELO 620.',
      'OJO: es la transferencia CON el impuesto, no un trámite aparte. Cuando toque',
      'este, no sumar también la transferencia: se cobraría dos veces.',
      'No incluye el ITP en sí, que depende del valor fiscal del coche.',
    ].join('\n'),
  },
  {
    tramite: 'Baja por exportación o tránsito comunitario',
    honorarios: 15, tasas: 8.67, tasa_colegio: 2.95,
    notas: 'En su tarifa: BAJA TRÁNSITO COMUNITARIO, BAJA EXPORTACIÓN, BAJA TEMPORAL.',
  },
  {
    tramite: 'Informe de la DGT',
    honorarios: 3, tasas: 8.67, tasa_colegio: 1.65,
    notas: 'En su tarifa: INFORME DE TRÁFICO. Es el que hay que mirar antes de pagarle a un particular.',
  },
  {
    tramite: 'Duplicado del permiso de circulación',
    honorarios: 12, tasas: 20.81, tasa_colegio: 3.20,
    notas: 'En su tarifa: DUPLICADO PERMISO DE CIRCULACIÓN.',
  },
  {
    tramite: 'Duplicado de la ficha técnica',
    honorarios: 12, tasas: 8.67, tasa_colegio: 3.20,
    notas: 'En su tarifa: DUPLICADO FICHA TÉCNICA ELECTRÓNICA.',
  },
  {
    tramite: 'Cambio de domicilio',
    honorarios: 9, tasas: null, tasa_colegio: 3.20,
    notas: 'En su tarifa: CAMBIO DOMICILIO EN PERMISO CIRCULACIÓN.',
  },
  {
    tramite: 'Cambio de servicio en la ficha técnica',
    honorarios: 15, tasas: 35, tasa_colegio: null,
    notas: 'En su tarifa: CAMBIO DE SERVICIO EN FT (ITV), tasa de industria.',
  },
  {
    tramite: 'Baja temporal por entrega a compraventa',
    honorarios: 12, tasas: 8.67, tasa_colegio: 2.95,
    notas: 'En su tarifa: BAJA TEMPORAL POR ENTREGA AL COMPRAVENTA.',
  },
];

async function altaProveedor(): Promise<string> {
  const clave = nombreComparable(BERNAL.nombre);
  const hay = await query(`SELECT id, tipos FROM erp_proveedores WHERE clave = $1`, [clave]);

  if (hay.rows.length) {
    const previo = hay.rows[0] as { id: string; tipos: string[] };
    const tipos = [...new Set([...(previo.tipos ?? []), 'gestoria'])];
    await query(
      `UPDATE erp_proveedores SET
         tipos = $2, activo = TRUE,
         telefono  = CASE WHEN telefono = ''  THEN $3 ELSE telefono END,
         email     = CASE WHEN email = ''     THEN $4 ELSE email END,
         direccion = CASE WHEN direccion = '' THEN $5 ELSE direccion END,
         notas     = CASE WHEN notas = ''     THEN $6 ELSE notas END
       WHERE id = $1`,
      [previo.id, tipos, BERNAL.telefono, BERNAL.email, BERNAL.direccion, BERNAL.notas]
    );
    console.log(`ya estaba, completado · ${previo.id} · ${BERNAL.nombre}`);
    return previo.id;
  }

  const { id } = await guardaConIdUnico(
    () => siguienteDeSerie('erp_proveedores', prefijoAnual('PRV')),
    async (nuevoId) => {
      await query(
        `INSERT INTO erp_proveedores
           (id, nombre, clave, tipos, nif, telefono, email, direccion, notas, creado_por)
         VALUES ($1,$2,$3,ARRAY['gestoria'],$4,$5,$6,$7,$8,'alta desde su tarifa')`,
        [nuevoId, BERNAL.nombre, clave, BERNAL.nif, BERNAL.telefono, BERNAL.email,
         BERNAL.direccion, BERNAL.notas]
      );
    }
  );
  console.log(`alta · ${id} · ${BERNAL.nombre}`);
  return id;
}

async function altaTarifa(proveedorId: string, t: (typeof TARIFA)[number]): Promise<void> {
  const yaHay = await query(
    `SELECT id, tramite FROM erp_tarifas_gestoria WHERE proveedor_id = $1`, [proveedorId]
  );
  const repetida = (yaHay.rows as { tramite: string }[])
    .some((x) => tramiteComparable(x.tramite) === tramiteComparable(t.tramite));
  if (repetida) { console.log(`  ya estaba · ${t.tramite}`); return; }

  const { id } = await guardaConIdUnico(
    () => siguienteDeSerie('erp_tarifas_gestoria', prefijoAnual('TGE')),
    async (nuevoId) => {
      await query(
        `INSERT INTO erp_tarifas_gestoria
           (id, proveedor_id, tramite, honorarios, tasas, tasa_colegio, colegio_con_iva, notas, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,FALSE,$7,'alta desde su tarifa')`,
        [nuevoId, proveedorId, t.tramite, t.honorarios, t.tasas, t.tasa_colegio, t.notas]
      );
    }
  );
  console.log(`  ${id} · ${t.tramite}`);
}

await preparaProveedores();
await preparaTarifas();

const proveedorId = await altaProveedor();
for (const t of TARIFA) await altaTarifa(proveedorId, t);

console.log('\nSin precio suyo, y son los de una importación:');
for (const falta of ['Impuesto de matriculación', 'ITV de homologación', 'Matriculación de importación']) {
  console.log(`  · ${falta}`);
}

process.exit(0);
