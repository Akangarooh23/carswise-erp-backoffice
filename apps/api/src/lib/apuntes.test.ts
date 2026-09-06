/**
 * La conversión de una fila de la base en un apunte.
 *
 * Antes esto se comprobaba leyendo el fichero con expresiones regulares, porque
 * la conversión estaba metida dentro de la función que habla con la base. Un
 * test que busca `Number(f.tipo) * 100` en el código pasa aunque el resultado
 * sea un IVA del 0,21 %: lo que comprueba es que la línea sigue escrita, no que
 * haga lo que dice.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  elApunteDelProveedor, elApunteDelCliente, losSuplidosDelCliente, type FichaDeProveedor,
} from './apuntes.js';

const ALTA: FichaDeProveedor[] = [
  { nombre: 'checkdenwagen Automobile DE', nif: 'DE111', tipos: ['perito'] },
  { nombre: 'Becker Solutions, S.L. (Becker Lines)', nif: 'ESB88835145', tipos: ['transportista'] },
];

/** Una factura recibida tal como la devuelve Postgres. */
const RECIBIDA = {
  id: 'PROV-2026-001',
  invoice_number: 'ACD-2026-0907-001',
  provider_name: 'checkdenwagen Automobile DE',
  direction: 'received',
  status: 'paid',
  type: 'received_invoice',
  notes: 'Peritación en Alemania',
  vehicle_title: 'Kia Sorento',
  base: '289.00',
  total: '289.00',
  tipo: '0.0000',
  regimen: 'intracomunitario',
  fecha: new Date(2026, 8, 7),
};

describe('una factura de proveedor', () => {
  test('el tipo de IVA se convierte: la columna lo guarda en tanto por uno', () => {
    // 0,21 en la base son 21 aquí. Sin convertirlo sale un IVA del 0,21 % y
    // nadie lo mira dos veces.
    const a = elApunteDelProveedor({ ...RECIBIDA, tipo: '0.2100' }, ALTA);
    assert.equal(a.iva, 21);
  });

  test('y un tipo que no se sabe se queda sin saber, no en cero', () => {
    // Cero por ciento y «no lo sé» son cosas distintas: la primera es una
    // factura exenta y la segunda es una factura que hay que mirar.
    assert.equal(elApunteDelProveedor({ ...RECIBIDA, tipo: null }, ALTA).iva, null);
    assert.equal(elApunteDelProveedor({ ...RECIBIDA, tipo: '0.0000' }, ALTA).iva, 0);
  });

  test('la fecha sale legible, no como «Wed Sep 07 2026»', () => {
    assert.equal(elApunteDelProveedor(RECIBIDA, ALTA).fecha, '2026-09-07');
  });

  test('trae el NIF del proveedor, que el asesor necesita', () => {
    assert.equal(elApunteDelProveedor(RECIBIDA, ALTA).nif, 'DE111');
  });

  test('y lo encuentra aunque el nombre esté escrito más corto', () => {
    const a = elApunteDelProveedor(
      { ...RECIBIDA, provider_name: 'Becker Solutions, S.L.' }, ALTA);
    assert.equal(a.nif, 'ESB88835145');
    assert.equal(a.linea, 'transporte', 'sin ficha se quedaría sin clasificar');
  });

  test('una esperada viaja marcada, no escondida', () => {
    const a = elApunteDelProveedor({ ...RECIBIDA, status: 'esperada' }, ALTA);
    assert.equal(a.pendiente, true);
  });

  test('y una pagada no', () => {
    assert.equal(elApunteDelProveedor(RECIBIDA, ALTA).pendiente, false);
  });

  test('el gasto se clasifica por el tipo del proveedor', () => {
    assert.equal(elApunteDelProveedor(RECIBIDA, ALTA).linea, 'peritacion');
  });

  test('un proveedor que no está de alta no se inventa un tipo', () => {
    const a = elApunteDelProveedor({ ...RECIBIDA, provider_name: 'Quien sea' }, ALTA);
    assert.equal(a.nif, null);
    assert.equal(a.linea, 'otros');
  });

  test('sin número de factura se usa el identificador, para poder buscarla', () => {
    const a = elApunteDelProveedor({ ...RECIBIDA, invoice_number: null }, ALTA);
    assert.equal(a.numero, 'PROV-2026-001');
  });

  test('una emitida mira al cliente, no al proveedor', () => {
    const a = elApunteDelProveedor({
      ...RECIBIDA, direction: 'emitted', type: 'vehicle_sale',
      customer_name: 'Ana', provider_name: 'no debería salir',
    }, ALTA);
    assert.equal(a.sentido, 'emitida');
    assert.equal(a.contraparte, 'Ana');
    assert.equal(a.linea, 'venta');
  });

  test('sin régimen se supone nacional, que es el caso normal', () => {
    assert.equal(elApunteDelProveedor({ ...RECIBIDA, regimen: null }, ALTA).regimen, 'nacional');
  });
});

describe('una factura nuestra al cliente', () => {
  const DEL_CLIENTE = {
    number: 'SRV-2026-0001',
    email: 'cliente@ejemplo.es',
    date: new Date(2026, 8, 2),
    total: '3630.00',
    description: 'Servicio de importación',
  };

  test('lleva el IVA general dentro del total', () => {
    const a = elApunteDelCliente(DEL_CLIENTE);
    assert.equal(a.iva, 21);
    assert.equal(a.total, '3630.00');
    assert.equal(a.sentido, 'emitida');
  });

  test('se clasifica por su serie', () => {
    assert.equal(elApunteDelCliente(DEL_CLIENTE).linea, 'importacion');
    assert.equal(elApunteDelCliente({ ...DEL_CLIENTE, number: 'CW-2026-X' }).linea, 'informes');
  });

  test('y su fecha también sale legible', () => {
    assert.equal(elApunteDelCliente(DEL_CLIENTE).fecha, '2026-09-02');
  });

  describe('y sus suplidos', () => {
    const CON_SUPLIDOS = {
      ...DEL_CLIENTE,
      suplidos: [
        { importe: 16890, concepto: 'Precio del coche (vendedor en Alemania)' },
        { importe: 1420, concepto: 'Impuesto de matriculación (a cuenta)' },
      ],
    };

    test('salen uno por línea, marcados como suplido', () => {
      // Sin esto, 18.310 € pasaban por la cuenta sin existir en ningún sitio.
      const s = losSuplidosDelCliente(CON_SUPLIDOS);
      assert.equal(s.length, 2);
      assert.ok(s.every((x) => x.que === 'suplido'), 'un suplido sin marcar entra en la base');
      assert.deepEqual(s.map((x) => x.total), [16890, 1420]);
    });

    test('con un número propio, para que no parezcan la misma factura repetida', () => {
      const s = losSuplidosDelCliente(CON_SUPLIDOS);
      assert.deepEqual(s.map((x) => x.numero), ['SRV-2026-0001·s1', 'SRV-2026-0001·s2']);
    });

    test('y una factura sin suplidos no genera ninguno', () => {
      assert.deepEqual(losSuplidosDelCliente(DEL_CLIENTE), []);
      assert.deepEqual(losSuplidosDelCliente({ ...DEL_CLIENTE, suplidos: null }), []);
    });

    test('una línea sin importe no se cuela como un suplido de cero', () => {
      const s = losSuplidosDelCliente({
        ...DEL_CLIENTE, suplidos: [{ concepto: 'sin cifra' }, { importe: 0 }, { importe: 12 }],
      });
      assert.equal(s.length, 1);
      assert.equal(s[0].total, 12);
    });
  });
});

/*
 * Y una comprobación sobre el fichero, que aquí sí toca.
 *
 * Excluir las cuadradas es cosa del SQL, no de la conversión, así que no se
 * puede probar llamando a nada sin una base delante. Se comprueba la forma de
 * la consulta a sabiendas de que es un test débil: lo que lo justifica es lo
 * que cuesta el fallo —una cuadrada contada suma dos veces el mismo transporte
 * y esos 400 € entran en el libro del asesor sin que nada chille—.
 */
describe('las cuadradas no entran', () => {
  const FUENTE = readFileSync(new URL('./apuntes.ts', import.meta.url), 'utf8');

  test('la consulta las deja fuera', () => {
    assert.match(FUENTE, /<>\s*\$3/, 'falta el filtro por estado');
    assert.match(FUENTE, /\[desde, hasta, CUADRADA\]/, 'el filtro tiene que ser el de cuadrada');
  });

  test('y no se excluyen las esperadas, que sí tienen que verse', () => {
    // Quien mira el trimestre necesita saber cuántas faltan por llegar.
    assert.doesNotMatch(FUENTE, /status\s*<>\s*\$\d+\s*AND[\s\S]{0,40}ESPERADA/);
  });
});
