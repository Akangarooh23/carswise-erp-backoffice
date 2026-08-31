/**
 * Da de alta los transportistas que se buscaron para traer coches.
 *
 * Se ejecuta a mano y una vez: `npm run alta:transportistas`. Usa las mismas
 * piezas que la ruta —el número de serie, la clave que junta un nombre escrito
 * de tres formas— para que estos cinco no sean proveedores de otra clase que
 * los que se den de alta desde la pantalla.
 *
 * No pisa nada: si el proveedor ya existe le suma el tipo y rellena solo los
 * huecos vacíos. Volver a ejecutarlo no hace daño.
 *
 * Los datos fiscales están comprobados uno a uno contra el aviso legal de cada
 * empresa o contra el registro mercantil, y **lo que no cuadró está escrito en
 * sus notas**. Un dato dudoso metido en silencio es peor que no tenerlo: quien
 * lea la ficha dentro de seis meses no va a volver a comprobarlo.
 */
import { query } from '../db/pool.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import { nombreComparable } from '../lib/proveedores.js';
import { preparaProveedores } from '../routes/proveedores.js';

interface Transportista {
  nombre: string;
  nif: string;
  telefono: string;
  email: string;
  direccion: string;
  notas: string[];
}

const TRANSPORTISTAS: Transportista[] = [
  {
    nombre: 'Trans-Frío Higueral, S.L.',
    nif: 'B75592642',
    telefono: '+34 950 420 129',
    email: 'portacoches@transfriohigueral.es',
    direccion: 'P.I. Tíjola, Parcela IP3, 04880 Tíjola (Almería)',
    notas: [
      'Nacional e internacional: Alemania, Francia, Bélgica, Suiza, Rep. Checa, Polonia y Reino Unido.',
      'Flota propia de portacoches, y correo específico para ellos.',
      'Móviles: +34 610 402 006 / +34 673 500 060. General: info@transfriohigueral.es',
      'Sin tarifa pública: hay que pedir precio B2B.',
      '',
      'Comprobado: el CIF, la dirección y los dos correos coinciden con su aviso legal.',
      'Ojo: la sociedad antigua (B04282299) se extinguió en diciembre de 2024 y se',
      'escindió en tres, una de ellas «Higueral Cars Logistics S.L.». Al pedir tarifa,',
      'preguntar qué sociedad factura el portacoches: puede no ser esta.',
    ],
  },
  {
    nombre: 'Relomar Relocation Services, S.L.',
    nif: 'B40542656',
    telefono: '+34 641 753 749',
    email: 'transport@relomar.com',
    direccion: 'C/ Ernesto Che Guevara, 18, 46920 Mislata (Valencia)',
    notas: [
      'Marca de transporte: Relocar Car Transport. Alemania → España desde 900 € según su web.',
      'General: info@relomar.com',
      '',
      'Comprobado: el CIF y el domicilio coinciden con el registro.',
      'Ojo: no son transportistas. Coordinan una red de transportistas y agentes en',
      'Alemania; su objeto social es relocation y consultoría, con menos de diez empleados.',
      'La factura será suya y el camión será de otro: antes de contratarlos, dejar por',
      'escrito quién responde de un golpe y con qué seguro.',
    ],
  },
  {
    nombre: 'Becker Solutions, S.L. (Becker Lines)',
    nif: 'ESB88835145',
    telefono: '+34 919 49 66 36',
    email: 'info@becker-lines.com',
    direccion: 'Av. Ricardo Soriano 72, Portal B, 1ª planta, 29601 Marbella (Málaga)',
    notas: [
      'Nacional y europeo: portavehículos, industriales y especiales, con seguro en cada operación.',
      'Publican precios de referencia, cosa rara: Madrid→Barcelona 450-750 €,',
      'Málaga→Madrid 400-700 €, España→Alemania 950-1.400 €, España→Italia 900-1.500 €.',
      'Ojo: esos precios son España→Alemania, el sentido contrario al nuestro. Valen para',
      'comparar presupuestos, no como estimación de lo que cuesta traer un coche.',
      '',
      'Comprobado: el CIF, la dirección y el teléfono coinciden con su aviso legal.',
      'Registro Mercantil de Málaga.',
    ],
  },
  {
    nombre: 'Quality Solution Carmove, S.L.',
    nif: 'B88700448',
    telefono: '+34 916 300 906',
    email: 'info@qualitysolutioncarmove.com',
    direccion: 'C/ Henri Dunant 15, 28036 Madrid',
    notas: [
      'Nacional e internacional, con importación desde Alemania y varios coches a la vez.',
      'También ofrecen ITV, impuestos y matriculación: mirarlo antes de dárselo a la gestoría.',
      'Móvil: +34 682 392 621. Presupuesto por su web.',
      'Sin tarifa pública.',
      '',
      'Comprobado: el CIF, la dirección y los dos teléfonos coinciden con su aviso legal.',
      'Están en Madrid, que ayuda si concentramos operaciones allí.',
    ],
  },
  {
    nombre: 'Business Ontime GmbH (Alemania Coche)',
    nif: 'DE307265811',
    telefono: '+49 157 8505 1160',
    email: 'info@alemaniacoche.es',
    direccion: 'Am Zimmersteig 2, 08606 Oelsnitz/Vogtland (Alemania)',
    notas: [
      'Sociedad alemana. Camión abierto, y transporte con chófer a todo riesgo.',
      'Útil para recoger en concesionarios alemanes. Otro correo: info@carcheckfrank.com',
      'Sin tarifa pública.',
      '',
      'Comprobado: el VAT DE307265811 y el HRB 30299 existen, y la dirección coincide.',
      'Dos cosas que no cuadran, preguntar antes de darles un coche:',
      '- El registro es el Amtsgericht de Chemnitz, no el de Zwickau.',
      '- Su objeto social registrado es venta de cigarrillos electrónicos y comercio',
      '  online de artículos del hogar. Nada de transporte. Administrador: Frank Stegehuis.',
      'Una factura intracomunitaria de una sociedad cuyo objeto no cubre el servicio es',
      'justo lo que mira una inspección.',
    ],
  },
];

async function alta(t: Transportista): Promise<string> {
  const clave = nombreComparable(t.nombre);
  const notas = t.notas.join('\n');

  const hay = await query(
    `SELECT id, tipos FROM erp_proveedores WHERE clave = $1`, [clave]
  );

  if (hay.rows.length) {
    const previo = hay.rows[0] as { id: string; tipos: string[] };
    const tipos = [...new Set([...(previo.tipos ?? []), 'transportista'])];
    // Solo los huecos: lo que haya escrito alguien no se pisa.
    await query(
      `UPDATE erp_proveedores SET
         tipos = $2, activo = TRUE,
         nif       = CASE WHEN nif = ''       THEN $3 ELSE nif END,
         telefono  = CASE WHEN telefono = ''  THEN $4 ELSE telefono END,
         email     = CASE WHEN email = ''     THEN $5 ELSE email END,
         direccion = CASE WHEN direccion = '' THEN $6 ELSE direccion END,
         notas     = CASE WHEN notas = ''     THEN $7 ELSE notas END
       WHERE id = $1`,
      [previo.id, tipos, t.nif, t.telefono, t.email, t.direccion, notas]
    );
    return `ya estaba, completado · ${previo.id} · ${t.nombre}`;
  }

  const { id } = await guardaConIdUnico(
    () => siguienteDeSerie('erp_proveedores', prefijoAnual('PRV')),
    async (nuevoId) => {
      await query(
        `INSERT INTO erp_proveedores
           (id, nombre, clave, tipos, nif, telefono, email, direccion, notas, creado_por)
         VALUES ($1,$2,$3,ARRAY['transportista'],$4,$5,$6,$7,$8,'alta desde la investigación')`,
        [nuevoId, t.nombre, clave, t.nif, t.telefono, t.email, t.direccion, notas]
      );
    }
  );
  return `alta · ${id} · ${t.nombre}`;
}

await preparaProveedores();

for (const t of TRANSPORTISTAS) {
  console.log(await alta(t));
}
process.exit(0);
