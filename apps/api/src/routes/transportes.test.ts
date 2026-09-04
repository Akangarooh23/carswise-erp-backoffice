import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';


/**
 * De qué expediente es cada tramo.
 *
 * El tramo nace del pedido, y se quedaba con `lead_id` a nulo. Eso rompe dos
 * cosas que no se ven hasta que hacen falta: **el segundo tramo se queda sin la
 * dirección del cliente** —sale del expediente, no del pedido— y la orden de
 * recogida no encuentra ningún papel que adjuntar, porque cuelgan del
 * expediente también.
 *
 * Y una tercera que sí se vio: un tramo sin expediente no aparece al buscar los
 * de un coche, así que sobrevive a un borrado y se queda huérfano apuntando a un
 * pedido que ya no existe.
 */
describe('el tramo sabe de qué expediente es', () => {
  const FUENTE = readFileSync(new URL('./transportes.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');

  test('se guarda al abrirlo', () => {
    const abrir = FUENTE.slice(FUENTE.indexOf('export async function abreTransporteDePedido'));
    assert.match(abrir, /INSERT INTO erp_transportes \(id, pedido_id, lead_id,/);
  });

  test('y sale del pedido, no de quien llama', () => {
    // Quien llama ya lo sabe, pero uno de los dos sitios acabaría olvidándoselo.
    const abrir = FUENTE.slice(FUENTE.indexOf('export async function abreTransporteDePedido'));
    assert.match(abrir, /SELECT lead_id FROM erp_pedidos WHERE id = \$1/);
  });

  test('la orden de recogida cuenta con él para los papeles', () => {
    // Los papeles del coche pueden estar en tres cajones: el expediente, el
    // pedido y el propio tramo. La ficha y el COC se suben en el pedido, así
    // que mirando solo uno la lista sale vacía justo cuando existen.
    assert.match(FUENTE, /\{ ambito: 'lead', id: t\.lead_id/);
    assert.match(FUENTE, /\{ ambito: 'pedido', id: t\.pedido_id/);
    assert.match(FUENTE, /\{ ambito: 'transporte', id: req\.params\.id \}/);
  });
});

describe('los tramos que faltan', () => {
  /**
   * El tramo nace con el pedido, pero los pedidos anteriores a esa regla se
   * quedaron sin él. Y sin tramo no hay dónde preguntarle al vendedor por la
   * recogida —que es lo que el expediente pide—, así que un coche pagado sin
   * tramo es trabajo que no aparece en ninguna pantalla.
   */
  const fuente = readFileSync('apps/api/src/routes/transportes.ts', 'utf8');

  test('se abren mirando lo que hay, no confiando en que se crearon', () => {
    assert.match(fuente, /export async function abreLosTramosQueFalten/);
    assert.match(fuente, /LEFT JOIN erp_transportes t ON t\.pedido_id = pe\.id AND t\.tramo = 1/);
    assert.match(fuente, /t\.id IS NULL/);
  });

  test('solo importaciones, y ninguna cancelada', () => {
    // Un pedido de concesionario se recoge de otra manera, y uno cancelado no
    // se trae: abrirle un tramo sería inventar trabajo.
    const trozo = fuente.slice(fuente.indexOf('abreLosTramosQueFalten'));
    assert.match(trozo, /pe\.origen = 'importacion'/);
    assert.match(trozo, /pe\.estado <> 'Cancelado'/);
  });

  test('y se abren al mirar los transportes', () => {
    assert.match(fuente, /await abreLosTramosQueFalten\(\)\.catch/);
  });
});

/**
 * Confirmar al transportista es contratarlo, y el servidor lo comprueba.
 *
 * El correo de la orden **es** el contrato: no se marca «Contratado» y luego se
 * manda, se manda y con eso queda contratado. Lo que salga mal aquí sale mal ya
 * pagado, así que lo que la pantalla exige lo exige también la ruta: entre lo
 * que se cargó y el clic caben unos minutos y otra persona, y dos pestañas
 * abiertas no ven lo mismo.
 *
 * Son las tres partes del tramo, cerradas en orden: el origen avisado de quién
 * va, por quién pregunta el conductor, en qué horas y si entra un portacoches.
 * Sin lo primero, un conductor llega donde nadie le espera y se va vacío con el
 * viaje pagado igual. Sin lo último, el precio acordado ya no es el que se paga.
 */
describe('lo que el servidor exige antes de confirmar', () => {
  const FUENTE = readFileSync(new URL('./transportes.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const GUARDA = FUENTE.slice(
    FUENTE.indexOf('const falta = faltaParaLaOrden(datos)'),
    FUENTE.indexOf("error: 'faltan_datos_del_tramo'")
  );

  test('el origen tiene que estar avisado, en los dos viajes', () => {
    // En el primero es el vendedor alemán; en el segundo, nuestra persona de
    // Zaragoza. Que no le espere nadie sale igual de caro tanto si la nave es
    // suya como si es nuestra, y el de la nuestra además tiene que sacar las
    // llaves y los papeles del cajón.
    assert.match(GUARDA, /if \(!t\.aviso_recogida_at\)/);
    assert.doesNotMatch(GUARDA, /esElPrimero && !t\.aviso_recogida_at/);
  });

  test('y eso no depende de que se le preguntara antes desde el expediente', () => {
    // Lo estuvo, y era un agujero: un tramo al que nadie le había preguntado
    // nada se saltaba también el aviso, que es el que evita el viaje en balde.
    assert.doesNotMatch(GUARDA, /recogida_preguntada_at/);
  });

  test('por quién pregunta el conductor', () => {
    assert.match(GUARDA, /t\.contacto_origen/);
  });

  test('y en qué horas puede ir', () => {
    assert.match(GUARDA, /t\.horario_origen/);
  });

  test('lo del portacoches, sabido y no supuesto', () => {
    // Tres valores y no dos: «todavía no lo sé» no es «entra». Comprobar que no
    // es nulo dejaría pasar el «no lo sé» del desplegable.
    assert.match(GUARDA, /typeof t\.portacoches !== 'boolean'/);
  });
});

/**
 * Si sabemos de dónde sale, sabemos quién sale a abrir.
 *
 * El segundo viaje de una importación sale de nuestro depósito, y allí siempre
 * está la misma persona, con el mismo teléfono y el mismo horario. Escribirlo a
 * mano coche a coche es teclear tres veces lo que ya está en su ficha, con la
 * variedad de erratas que eso trae — y es exactamente el hueco vacío que acaba
 * rellenándose con lo primero que sirva.
 *
 * Lo que se sostiene aquí son las dos cosas que pueden hacer daño: que **no se
 * pise lo que alguien escribió**, y que **no se adivine la dirección**. Un
 * camión mandado a la nave de al lado no se deshace.
 *
 * El UPDATE se ha probado contra la base, dentro de una transacción deshecha:
 * rellena el tramo 2, no toca el 1 —la dirección alemana no es la de ningún
 * proveedor nuestro— y en la segunda pasada no escribe ninguna fila.
 */
describe('el origen que ya conocemos', () => {
  const FUENTE = readFileSync(new URL('./transportes.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const RELLENA = FUENTE.slice(
    FUENTE.indexOf('export async function rellenaElOrigenQueYaConocemos'),
    FUENTE.indexOf('export async function abreTransporteDePedido')
  );

  test('se mira al abrir la pantalla, como los demás', () => {
    // Reconciliador y no disparo al crear el tramo: un disparo ocurre en un
    // momento, y un momento se pierde. Los tramos que ya existen se arreglan la
    // próxima vez que alguien mire.
    assert.match(FUENTE, /await rellenaElOrigenQueYaConocemos\(\)\.catch/);
  });

  test('solo rellena lo que está vacío, campo a campo', () => {
    // Si el vendedor contestó que ese día pregunte por otra persona, manda su
    // respuesta, no la ficha.
    assert.ok(RELLENA.includes(`contacto_origen = CASE WHEN COALESCE(t.contacto_origen, '') = ''`),
      'el contacto se pisaría');
    assert.ok(RELLENA.includes(`telefono_origen = CASE WHEN COALESCE(t.telefono_origen, '') = ''`),
      'el teléfono se pisaría');
    assert.ok(RELLENA.includes(`horario_origen  = CASE WHEN COALESCE(t.horario_origen, '') = ''`),
      'el horario se pisaría');
  });

  test('y solo si la dirección es exactamente la misma', () => {
    // Sin adivinar parecidos: si no coinciden, no se rellena y no pasa nada.
    // Adivinar direcciones parecidas es como se manda un camión a la nave de al
    // lado.
    assert.match(RELLENA, /lower\(regexp_replace\(btrim\(p\.direccion\)/);
    assert.match(RELLENA, /lower\(regexp_replace\(btrim\(COALESCE\(t\.desde/);
    assert.doesNotMatch(RELLENA, /LIKE|ILIKE|similarity/);
  });

  test('no habla de tramos ni de depósitos', () => {
    // La regla es «quien esté en esa dirección», no «el tramo 2». Así vale
    // igual para el depósito de Zaragoza, para un vendedor cuya nave ya
    // conocemos, y para el segundo depósito que haya algún día.
    assert.doesNotMatch(RELLENA, /t\.tramo/);
  });

  test('con una ficha vacía no escribe nada', () => {
    // Ni una escritura por visita: sin nada que dar, y sin nada que rellenar,
    // el UPDATE no toca ninguna fila.
    assert.ok(RELLENA.includes(`AND (COALESCE(p.contacto, '') <> ''`),
      'escribiría con la ficha vacía');
    assert.ok(RELLENA.includes(`AND (COALESCE(t.contacto_origen, '') = ''`),
      'escribiría en cada visita');
  });

  test('y a un proveedor dado de baja no se le pregunta', () => {
    assert.match(RELLENA, /WHERE p\.activo/);
  });
});

/**
 * Y la ficha del proveedor tiene dónde guardarlo.
 *
 * Estaba en «notas», que es texto libre: ahí se lee, pero de ahí no lo puede
 * coger nada. Un nombre y un horario que no se pueden leer desde el código son
 * un nombre y un horario que se vuelven a teclear en cada coche.
 */
describe('quién sale a abrir, en la ficha del proveedor', () => {
  const FUENTE = readFileSync(new URL('./proveedores.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');

  test('las dos columnas existen', () => {
    assert.match(FUENTE, /ADD COLUMN IF NOT EXISTS contacto TEXT/);
    assert.match(FUENTE, /ADD COLUMN IF NOT EXISTS horario  TEXT/);
  });

  test('y se crean al preparar, no solo en el CREATE TABLE', () => {
    // La tabla ya existe en producción: un CREATE TABLE IF NOT EXISTS con dos
    // columnas más no las añade, y la consulta fallaría en la primera lectura.
    assert.match(FUENTE, /await query\(ENSURE_CONTACTO, \[\]\)/);
  });

  test('se leen, se pueden dar de alta y se pueden cambiar', () => {
    assert.match(FUENTE, /const CAMPOS = [\s\S]{0,200}contacto, horario/);
    assert.match(FUENTE, /nt\(req\.body\?\.contacto\), nt\(req\.body\?\.horario\)/);
    assert.match(FUENTE, /'direccion', 'contacto', 'horario', 'notas'/);
  });
});

/**
 * En el segundo viaje también hay alguien a quien preguntar.
 *
 * La orden se quedó sin nombre en el origen cuando el segundo viaje salía de
 * «Zaragoza» a secas y allí no había ficha de nadie. Ahora sale de nuestro
 * depósito, con su calle y con la persona que abre: sin eso, el conductor llega
 * a una nave y llama aquí, que es justo lo que esta orden existe para evitar.
 */
describe('a quién pregunta el conductor, en los dos viajes', () => {
  const FUENTE = readFileSync(new URL('./transportes.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const ORDEN = FUENTE.slice(
    FUENTE.indexOf('const origen = {'),
    FUENTE.indexOf('const falta = faltaParaLaOrden(datos)')
  );

  test('el origen lleva nombre y teléfono, sin mirar el tramo', () => {
    assert.match(ORDEN, /quien: String\(t\.contacto_origen/);
    assert.match(ORDEN, /telefono: String\(t\.telefono_origen/);
  });

  test('y el vendedor solo vale de repuesto en el primero', () => {
    // En el segundo mandaría al conductor a preguntar por un concesionario
    // alemán en una nave de Zaragoza.
    assert.match(ORDEN, /esElPrimero \? \(t\.vendedor as string \| null\) : null/);
  });

  test('y le va lo del portacoches, que decide qué camión mandan', () => {
    assert.match(ORDEN, /portacoches: typeof t\.portacoches === 'boolean'/);
  });
});
