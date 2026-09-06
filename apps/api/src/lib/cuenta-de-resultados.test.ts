import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cuentaDeResultados, mesAMes, losMeses, type ApunteConLinea } from './cuenta-de-resultados.js';

/** El fee de importación tal como se cobra: 3.000 + 21 %. */
const FEE: ApunteConLinea = {
  numero: 'SRV-2026-0001', fecha: '2026-09-02', sentido: 'emitida',
  contraparte: 'cliente', total: 3630, iva: 21, regimen: 'nacional', linea: 'importacion',
};

/** El perito alemán: intracomunitario, sin IVA dentro. */
const PERITO: ApunteConLinea = {
  numero: 'ACD-2026-0907-001', fecha: '2026-09-07', sentido: 'recibida',
  contraparte: 'checkdenwagen', base: 289, total: 289, iva: 0,
  regimen: 'intracomunitario', linea: 'peritacion',
};

describe('lo que es ingreso y lo que no', () => {
  test('el IVA no es nuestro: 3.630 € cobrados son 3.000 € de ingreso', () => {
    const r = cuentaDeResultados([FEE]);
    assert.equal(r.ingresos, 3000);
  });

  test('un suplido pasa por la cuenta y no es ni ingreso ni gasto', () => {
    // Los 16.890 € del coche los paga el cliente y salen enteros al vendedor.
    const r = cuentaDeResultados([
      FEE,
      { ...FEE, numero: 'SRV-supl', total: 16890, iva: 0, que: 'suplido', linea: 'importacion' },
    ]);
    assert.equal(r.ingresos, 3000, 'el suplido no puede sumar al ingreso');
    assert.equal(r.suplidos, 16890, 'pero tiene que verse, no desaparecer');
  });

  test('una factura esperada es gasto comprometido, no gasto', () => {
    const r = cuentaDeResultados([
      FEE,
      { ...PERITO, pendiente: true, total: 400, base: 400 },
    ]);
    assert.equal(r.gastos, 0, 'sin factura no hay nada que deducir');
    assert.equal(r.comprometido, 400);
    assert.equal(r.comprometidoN, 1);
  });

  test('y una factura nuestra sin emitir no es un ingreso comprometido', () => {
    // Solo se compromete el gasto. Un ingreso que no se ha facturado no existe.
    const r = cuentaDeResultados([{ ...FEE, pendiente: true }]);
    assert.equal(r.ingresos, 0);
    assert.equal(r.comprometido, 0);
  });
});

describe('el margen', () => {
  test('se resta base contra base, que es lo único comparable', () => {
    const r = cuentaDeResultados([FEE, PERITO]);
    assert.equal(r.ingresos, 3000);
    assert.equal(r.gastos, 289);
    assert.equal(r.margen, 2711);
    assert.equal(r.margenPorcentaje, 90.37);
  });

  test('sin ingresos no hay un 0 % de margen: no hay margen', () => {
    const r = cuentaDeResultados([PERITO]);
    assert.equal(r.margen, -289);
    assert.equal(r.margenPorcentaje, null, 'un 0 % se lee como que se ingresó algo');
  });

  test('una cuenta vacía es cero de todo y no revienta', () => {
    const r = cuentaDeResultados([]);
    assert.equal(r.ingresos, 0);
    assert.deepEqual(r.porLinea, []);
    assert.equal(cuentaDeResultados(null).gastos, 0);
  });
});

describe('el desglose', () => {
  test('cada línea con su base, sus facturas y su parte del total', () => {
    const r = cuentaDeResultados([
      FEE,
      { ...FEE, numero: 'VTA-1', total: 1210, linea: 'venta' },
    ]);
    assert.equal(r.ingresos, 4000);
    assert.deepEqual(r.porLinea.map((t) => [t.clave, t.base, t.n, t.porcentaje]), [
      ['importacion', 3000, 1, 75],
      ['venta', 1000, 1, 25],
    ]);
  });

  test('los ingresos y los gastos no se mezclan en la misma lista', () => {
    const r = cuentaDeResultados([FEE, PERITO]);
    assert.deepEqual(r.porLinea.map((t) => t.clave), ['importacion']);
    assert.deepEqual(r.porConcepto.map((t) => t.clave), ['peritacion']);
  });

  test('sale en el orden del negocio, no en el que llegaron', () => {
    const r = cuentaDeResultados([
      { ...FEE, numero: 'SUB-1', total: 121, linea: 'suscripciones' },
      { ...FEE, numero: 'VTA-1', total: 1210, linea: 'venta' },
      FEE,
    ]);
    assert.deepEqual(r.porLinea.map((t) => t.clave), ['importacion', 'venta', 'suscripciones']);
  });

  test('lo que no se sabe clasificar se ve, no se reparte', () => {
    const r = cuentaDeResultados([{ ...FEE, linea: null }]);
    assert.deepEqual(r.porLinea.map((t) => t.clave), ['otros']);
  });

  test('una factura sin su IVA se cuenta y se avisa', () => {
    // El número de arriba deja de ser exacto y quien lo mira debe saberlo.
    const r = cuentaDeResultados([{ ...FEE, iva: null, total: 500 }]);
    assert.equal(r.sinDesglosar, 1);
  });
});

describe('mes a mes', () => {
  test('los meses vacíos salen a cero, no se saltan', () => {
    // Si agosto no sale, el gráfico dibuja una pendiente que no existe.
    const meses = mesAMes([FEE, PERITO], '2026-07-01', '2026-09-30');
    assert.deepEqual(meses.map((m) => m.mes), ['2026-07', '2026-08', '2026-09']);
    assert.deepEqual(meses[1], { mes: '2026-08', ingresos: 0, gastos: 0, margen: 0 });
  });

  test('cada mes lleva su ingreso, su gasto y su margen', () => {
    const meses = mesAMes([FEE, PERITO], '2026-09-01', '2026-09-30');
    assert.deepEqual(meses, [{ mes: '2026-09', ingresos: 3000, gastos: 289, margen: 2711 }]);
  });

  test('los suplidos y las esperadas tampoco entran aquí', () => {
    const meses = mesAMes([
      { ...FEE, que: 'suplido', total: 16890 },
      { ...PERITO, pendiente: true },
    ], '2026-09-01', '2026-09-30');
    assert.deepEqual(meses, [{ mes: '2026-09', ingresos: 0, gastos: 0, margen: 0 }]);
  });

  test('un apunte con fecha ilegible no tira el gráfico', () => {
    const meses = mesAMes([{ ...FEE, fecha: 'cuando sea' }], '2026-09-01', '2026-09-30');
    assert.equal(meses[0].ingresos, 0);
  });
});

describe('los meses de un tramo', () => {
  test('cruzan el año', () => {
    assert.deepEqual(losMeses('2025-11-01', '2026-02-28'),
      ['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  test('un tramo del revés no devuelve nada', () => {
    assert.deepEqual(losMeses('2026-09-01', '2026-01-01'), []);
  });

  test('y uno absurdo no cuelga el servidor', () => {
    assert.ok(losMeses('1900-01-01', '2200-01-01').length <= 120);
  });
});
