/**
 * Las reglas de un expediente de importación.
 *
 * Lo que se comprueba aquí no es cómo se pinta la pantalla: es lo que no se
 * puede hacer todavía —pedir un coche sin fianza, dar una fecha de entrega
 * antes de que haya pedido— y cuánto dinero de clientes tenemos cobrado sin
 * entregar, que es la cifra que nadie puede mirar mal.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ETAPAS, QUE_TOCA, siguienteEtapa, puedePedirlo, puedeDarFecha,
  agrupaPorEtapa, fueraDelCamino, resumen, diasDesde, notaDelCambio, loQueSeEscribio,
  puedeLiberar, repartoDelDeposito,
  bloquesDelExpediente,
  type Expediente,
} from './expedientes-importacion.js';

function exp(parcial: Partial<Expediente> & { status: string }): Expediente {
  return {
    id: 'imp-1',
    user_email: 'cliente@ejemplo.es',
    title: 'Volkswagen Golf',
    created_at: '2026-08-01T10:00:00Z',
    meta: {},
    ...parcial,
  };
}

const CON_FIANZA = { deposit_quoted: 1019, deposit_paid_at: '2026-08-10T10:00:00Z' };

describe('el camino de un expediente', () => {
  test('cada etapa lleva a la siguiente', () => {
    assert.equal(siguienteEtapa('Pendiente'), 'Contactado');
    assert.equal(siguienteEtapa('Depósito retenido'), 'Verificado y pagado');
    assert.equal(siguienteEtapa('En trámites'), 'Entregado');
  });

  test('entregado es el final', () => {
    assert.equal(siguienteEtapa('Entregado'), null);
  });

  test('un estado que no es del camino no lleva a ninguna parte', () => {
    assert.equal(siguienteEtapa('Cancelado'), null);
  });

  test('cada etapa dice qué hay que hacer', () => {
    for (const e of ETAPAS) {
      assert.ok(QUE_TOCA[e] && QUE_TOCA[e].length > 3,
        `«${e}» sin decir qué toca: la columna no sirve de nada`);
    }
  });
});

describe('lo que no se puede hacer todavía', () => {
  test('sin fianza no se pide el coche a Alemania', () => {
    assert.equal(puedePedirlo(exp({ status: 'Contactado' })), false,
      'pedirlo nos compromete con dinero, y lo que cubre eso es la fianza');
  });

  test('con la fianza cobrada, sí', () => {
    assert.equal(puedePedirlo(exp({ status: 'Depósito retenido', meta: CON_FIANZA })), true);
  });

  test('no hay fecha de entrega antes del pedido', () => {
    assert.equal(puedeDarFecha('Pendiente'), false);
    assert.equal(puedeDarFecha('Depósito retenido'), false,
      'la fecha la da el vendedor al aceptar el pedido: antes es inventada');
  });

  test('y desde el pedido en adelante, sí', () => {
    assert.equal(puedeDarFecha('Verificado y pagado'), true);
    assert.equal(puedeDarFecha('En transporte'), true);
    assert.equal(puedeDarFecha('Entregado'), true);
  });
});

describe('el reparto por etapas', () => {
  const lista = [
    exp({ id: 'a', status: 'Pendiente' }),
    exp({ id: 'b', status: 'En transporte', meta: CON_FIANZA }),
    exp({ id: 'c', status: 'En transporte', meta: CON_FIANZA }),
    exp({ id: 'd', status: 'Cancelado' }),
  ];

  test('cada uno cae en su columna', () => {
    const m = agrupaPorEtapa(lista);
    assert.equal(m.get('En transporte')!.length, 2);
    assert.equal(m.get('Pendiente')!.length, 1);
    assert.equal(m.get('Entregado')!.length, 0);
  });

  test('lo cancelado no se cuela en ninguna etapa, pero no se pierde', () => {
    const m = agrupaPorEtapa(lista);
    const enElTablero = [...m.values()].flat().map((x) => x.id);
    assert.ok(!enElTablero.includes('d'));
    assert.deepEqual(fueraDelCamino(lista).map((x) => x.id), ['d']);
  });
});

describe('el resumen de arriba', () => {
  const lista = [
    exp({ id: 'a', status: 'Pendiente' }),
    exp({ id: 'b', status: 'En transporte', meta: CON_FIANZA }),
    exp({ id: 'c', status: 'Entregado', meta: CON_FIANZA }),
    exp({ id: 'd', status: 'Cancelado', meta: CON_FIANZA }),
  ];

  test('en marcha es lo que sigue abierto, sin los entregados', () => {
    assert.equal(resumen(lista).enMarcha, 2);
  });

  test('cuenta los que esperan la fianza', () => {
    assert.equal(resumen(lista).sinFianza, 1);
  });

  test('el dinero comprometido es el cobrado de coches sin entregar', () => {
    assert.equal(resumen(lista).comprometido, 1019,
      'el entregado ya no se debe, y el cancelado tampoco está en marcha');
  });

  test('una fianza devuelta deja de estar comprometida', () => {
    const conDevolucion = [exp({
      status: 'En transporte',
      meta: { ...CON_FIANZA, deposit_refunded_at: '2026-08-20T10:00:00Z' },
    })];
    assert.equal(resumen(conDevolucion).comprometido, 0,
      'contarla sería decir que debemos dinero que ya hemos devuelto');
  });

  test('los entregados se cuentan aparte', () => {
    assert.equal(resumen(lista).entregados, 1);
  });
});

describe('cuánto lleva esperando', () => {
  test('los días desde que lo pidió', () => {
    assert.equal(diasDesde('2026-08-01T10:00:00Z', new Date('2026-08-11T10:00:00Z')), 10);
  });

  test('sin fecha, no se inventa un número', () => {
    assert.equal(diasDesde(null), null);
    assert.equal(diasDesde('lo que sea'), null);
  });
});

describe('la nota que deja un cambio de etapa', () => {
  const CUANDO = new Date('2026-08-30T10:00:00Z');

  test('dice de dónde a dónde, con la fecha', () => {
    const r = notaDelCambio('', 'Pendiente', 'Contactado', 'Le he llamado, se lo piensa', CUANDO);
    assert.match(r, /Pendiente → Contactado/);
    assert.match(r, /Le he llamado, se lo piensa/);
    assert.match(r, /ago/, 'sin fecha, dentro de un mes nadie sabe cuándo fue');
  });

  test('se añade a lo que ya había: las notas son un cuaderno', () => {
    const previas = '[29 ago 2026 · Pendiente → Contactado] Primera llamada';
    const r = notaDelCambio(previas, 'Contactado', 'Depósito retenido', 'Ha pagado por transferencia', CUANDO);
    assert.ok(r.startsWith(previas), 'lo de antes no se pisa');
    assert.match(r, /Ha pagado por transferencia/);
    assert.equal(r.split('\n').length, 2);
  });

  test('sin texto no se escribe nada', () => {
    assert.equal(notaDelCambio('lo de antes', 'Pendiente', 'Contactado', '   ', CUANDO), 'lo de antes');
  });

  test('los espacios de más no cuentan como motivo', () => {
    const r = notaDelCambio('', 'Pendiente', 'Contactado', '  vale  ', CUANDO);
    assert.match(r, /\] vale$/, 'se guarda limpio');
  });
});

describe('lo que se escribió esta vez', () => {
  test('de un cuaderno que crece, solo la línea nueva', () => {
    const antes = '[29 ago 2026 · Pendiente → Contactado] Primera llamada';
    const linea = '[30 ago 2026 · Contactado → Depósito retenido] Ha pagado';
    const despues = `${antes}\n${linea}`;
    assert.equal(loQueSeEscribio(antes, despues), linea,
      'enseñar el cuaderno entero en cada apunte lo repite una vez por línea');
  });

  test('la primera nota es la nota entera', () => {
    assert.equal(loQueSeEscribio('', 'Le he llamado'), 'Le he llamado');
    assert.equal(loQueSeEscribio(null, 'Le he llamado'), 'Le he llamado');
  });

  test('si alguien corrige lo que había, se enseña como quedó', () => {
    assert.equal(loQueSeEscribio('Le he llamdo', 'Le he llamado'), 'Le he llamado',
      'eso ya no es lo añadido: lo único cierto es cómo quedó');
  });

  test('borrar la nota no escribe nada', () => {
    assert.equal(loQueSeEscribio('algo', ''), '');
  });
});

/**
 * Ver el coche y soltar el dinero.
 *
 * Los dos pasos que sostienen el producto, y en este orden. El cliente ha
 * transferido veinte mil euros por una promesa: que nadie los toca hasta que uno
 * de los nuestros ha visto el coche.
 */
describe('antes de soltar el dinero', () => {
  const exp = (meta: Record<string, unknown>): Expediente => ({
    id: 'imp-1', status: 'Depósito retenido', title: 'SEAT León', user_email: 'x@y.es',
    created_at: '2026-09-01', meta,
  } as unknown as Expediente);

  test('con el dinero dentro y el coche visto, se puede liberar', () => {
    assert.equal(puedeLiberar(exp({
      deposit_paid_at: '2026-09-01', verificado_alemania_at: '2026-09-02',
    })), true);
  });

  test('sin haber visto el coche, no', () => {
    // Es la única condición que sostiene todo lo demás.
    assert.equal(puedeLiberar(exp({ deposit_paid_at: '2026-09-01' })), false);
  });

  test('sin el dinero en la cuenta, tampoco: no hay nada que soltar', () => {
    assert.equal(puedeLiberar(exp({ verificado_alemania_at: '2026-09-02' })), false);
  });

  test('y no se libera dos veces', () => {
    // Un segundo clic con el dinero ya enviado sería un segundo pago.
    assert.equal(puedeLiberar(exp({
      deposit_paid_at: '2026-09-01', verificado_alemania_at: '2026-09-02',
      escrow_liberado_at: '2026-09-03',
    })), false);
  });
});

describe('el reparto del depósito', () => {
  const exp = (meta: Record<string, unknown>): Expediente => ({
    id: 'imp-1', status: 'Depósito retenido', title: 'SEAT León', user_email: 'x@y.es',
    created_at: '2026-09-01', meta,
  } as unknown as Expediente);

  test('cada parte con quien la cobra', () => {
    // El día que se libera hay que soltar lo del vendedor y no lo demás. Quien
    // lo haga tiene que verlo, no calcularlo.
    const r = repartoDelDeposito(exp({ escrow_coche: 18000, escrow_fee: 3000, escrow_garantia: 590 }));
    assert.deepEqual(r.map((l) => [l.concepto, l.importe, l.a]), [
      ['Coche', 18000, 'vendedor alemán'],
      ['Servicio PopCar', 3000, 'nosotros'],
      ['Garantía', 590, 'proveedor'],
    ]);
  });

  test('sin garantía, esa línea no sale', () => {
    const r = repartoDelDeposito(exp({ escrow_coche: 18000, escrow_fee: 3000 }));
    assert.equal(r.length, 2);
    assert.ok(!r.some((l) => l.concepto === 'Garantía'));
  });

  test('un expediente viejo sin depósito no enseña nada', () => {
    // Los de antes del cambio de modelo no tienen estas columnas: inventarles un
    // reparto de ceros sería peor que no enseñar el bloque.
    assert.deepEqual(repartoDelDeposito(exp({ deposit_quoted: 5000 })), []);
  });
});

describe('qué partes del expediente tienen sentido en cada etapa', () => {
  test('con el coche sin ver, ninguna de las tres', () => {
    // Ni día de entrega, ni papeles que reunir, ni casillas que marcar: el
    // coche no es nuestro todavía. Un hueco vacío parece una tarea pendiente.
    assert.deepEqual(bloquesDelExpediente('Depósito retenido'), []);
    assert.deepEqual(bloquesDelExpediente('Pendiente'), []);
  });

  test('comprado, empiezan los papeles', () => {
    // Del vendedor alemán llegan la factura, las fichas y el COC.
    assert.deepEqual(bloquesDelExpediente('Verificado y pagado'), ['papeles']);
  });

  test('de camino, ya se puede quedar con el cliente', () => {
    assert.ok(bloquesDelExpediente('En transporte').includes('entregaCita'));
    assert.ok(!bloquesDelExpediente('En transporte').includes('entregaFirma'));
  });

  test('aquí, lo que se le da al firmar', () => {
    assert.deepEqual(
      bloquesDelExpediente('En trámites'),
      ['papeles', 'entregaCita', 'entregaFirma']
    );
  });

  test('una etapa que no existe no abre nada', () => {
    assert.deepEqual(bloquesDelExpediente('Lo que sea'), []);
  });
});
