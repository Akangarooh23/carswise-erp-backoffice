/**
 * El puente con el asesor contable.
 *
 * El ERP no lleva los libros: los lleva él. Lo que hace esto es entregarle lo
 * que hay sin que nadie teclee, porque teclear es donde se pierde una factura y
 * donde un transporte alemán de 890 € entra con 154,46 € de IVA que nadie
 * soportó.
 *
 * Lo que se sostiene aquí son las tres cosas que se equivocan al teclear: que el
 * intracomunitario va aparte porque entra y sale, que los suplidos no son ni
 * base ni cuota, y que una factura esperada no es un apunte contable.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resumeElPeriodo, queFaltaAntesDeMandarlo, cuentaEnElModelo,
  trimestreDe, delTrimestre, comoFichero, comoSeLlamaElFichero,
  type Apunte,
} from './libro-para-el-asesor.js';

const DEL_KIA: Apunte[] = [
  {
    numero: 'SRV-2026-0001', fecha: '2026-09-02', sentido: 'emitida',
    contraparte: 'Ana Picazo', base: 2479.34, iva: 21, total: 3000,
    concepto: 'Servicio de importación', vehiculo: 'Kia Sorento',
  },
  {
    numero: 'ACD-2026-0907-001', fecha: '2026-09-07', sentido: 'recibida',
    contraparte: 'checkdenwagen Automobile DE', nif: 'DE123456789',
    total: 289, iva: 21, regimen: 'intracomunitario',
    concepto: 'Peritación', vehiculo: 'Kia Sorento',
  },
  {
    numero: 'BO-2026-118', fecha: '2026-09-10', sentido: 'recibida',
    contraparte: 'Business Ontime GmbH', nif: 'DE307265811',
    total: 890, iva: 21, regimen: 'intracomunitario',
    concepto: 'Transporte · tramo 1', vehiculo: 'Kia Sorento',
  },
  {
    numero: 'GB-2026-441', fecha: '2026-09-20', sentido: 'recibida',
    contraparte: 'Gestoría Bernal', nif: 'B12345678',
    base: 98.4, iva: 21, total: 119.07, regimen: 'nacional',
    concepto: 'Honorarios', vehiculo: 'Kia Sorento',
  },
  {
    numero: 'GB-2026-441', fecha: '2026-09-20', sentido: 'recibida',
    contraparte: 'Gestoría Bernal', nif: 'B12345678',
    total: 1420, iva: 0, regimen: 'exento', que: 'suplido',
    concepto: 'Impuesto de matriculación', vehiculo: 'Kia Sorento',
  },
];

describe('el resumen de un trimestre', () => {
  test('lo repercutido sale de lo que hemos facturado', () => {
    assert.equal(resumeElPeriodo(DEL_KIA).repercutido, 520.66);
  });

  test('lo soportado, solo de las españolas', () => {
    // 20,67 € de los honorarios. Lo alemán no lleva IVA que soportar.
    assert.equal(resumeElPeriodo(DEL_KIA).soportado, 20.66);
  });

  test('y lo intracomunitario aparte, porque entra y sale', () => {
    // Se repercute y se deduce a la vez: no mueve el resultado, pero va en sus
    // casillas y sin él no cuadra el modelo ni sale el 349.
    const r = resumeElPeriodo(DEL_KIA);
    assert.equal(r.intracomunitario, 247.59);
    assert.equal(r.aIngresar, 500, 'el intracomunitario no lo mueve');
  });

  test('los suplidos van fuera de todo', () => {
    // Es el error que hace que a una gestoría le salga IVA repercutido de las
    // tasas de la DGT.
    const r = resumeElPeriodo(DEL_KIA);
    assert.equal(r.suplidos, 1420);
    assert.ok(!String(r.repercutido).includes('1420'));
  });

  test('una esperada no es un apunte contable', () => {
    // Sin número ni fecha no hay nada que declarar, y deducir su IVA sería
    // deducir el de un papel que no existe.
    const conEsperada = [...DEL_KIA, {
      numero: '', fecha: '2026-09-25', sentido: 'recibida' as const,
      contraparte: 'Müller Fahrzeugtransporte', total: 484, iva: 21, pendiente: true,
    }];
    const r = resumeElPeriodo(conEsperada);
    assert.equal(r.soportado, 20.66, 'no se deduce lo que no ha llegado');
    assert.equal(r.pendientes, 1);
    assert.equal(cuentaEnElModelo(conEsperada[5]), false);
  });

  test('y las que no dicen su IVA se cuentan para poder arreglarlas', () => {
    const r = resumeElPeriodo([...DEL_KIA, {
      numero: 'X-1', fecha: '2026-09-28', sentido: 'recibida' as const,
      contraparte: 'Taller Paco', total: 480,
    }]);
    assert.equal(r.sinDesglosar, 1);
  });
});

describe('qué hay que arreglar antes de mandarlo', () => {
  test('nada, si está todo', () => {
    assert.deepEqual(queFaltaAntesDeMandarlo(resumeElPeriodo(DEL_KIA)), []);
  });

  test('y si falta, se dice en singular o en plural', () => {
    // Un fichero con huecos vuelve en forma de correo dos días después.
    const uno = queFaltaAntesDeMandarlo({
      repercutido: 0, soportado: 0, intracomunitario: 0, aIngresar: 0,
      suplidos: 0, sinDesglosar: 1, pendientes: 2,
    });
    assert.deepEqual(uno, ['una factura no dice su IVA', '2 facturas esperadas sin llegar']);
  });
});

describe('los trimestres', () => {
  test('el de una fecha', () => {
    assert.deepEqual(trimestreDe('2026-09-04'), { anio: 2026, trimestre: 3 });
    assert.deepEqual(trimestreDe('2026-01-01'), { anio: 2026, trimestre: 1 });
    assert.deepEqual(trimestreDe('2026-12-31'), { anio: 2026, trimestre: 4 });
  });

  test('y lo que no es una fecha no inventa uno', () => {
    assert.equal(trimestreDe('lo que sea'), null);
  });

  test('sus dos extremos, con los días que tiene cada mes', () => {
    assert.deepEqual(delTrimestre(2026, 1), { desde: '2026-01-01', hasta: '2026-03-31' });
    assert.deepEqual(delTrimestre(2026, 2), { desde: '2026-04-01', hasta: '2026-06-30' });
    assert.deepEqual(delTrimestre(2026, 4), { desde: '2026-10-01', hasta: '2026-12-31' });
  });

  test('un trimestre inventado se recorta, no revienta', () => {
    assert.equal(delTrimestre(2026, 9).desde, '2026-10-01');
    assert.equal(delTrimestre(2026, 0).desde, '2026-01-01');
  });
});

describe('el fichero', () => {
  test('lleva las columnas que él espera', () => {
    const csv = comoFichero(DEL_KIA);
    assert.match(csv.split('\r\n')[0], /^Fecha;Sentido;Numero;Contraparte;NIF;/);
    assert.match(csv, /Regimen;Que$/m);
  });

  test('con punto y coma y decimales con coma', () => {
    // Es lo que abre un Excel español sin preguntar. Un fichero que hay que
    // configurar al abrirlo se abre mal una de cada tres veces.
    const csv = comoFichero(DEL_KIA);
    assert.match(csv, /2479,34;21;520,66;3000,00/);
  });

  test('van todos, también los suplidos y los que no dicen su IVA', () => {
    // El asesor tiene que ver lo que hay, no una versión limpia de lo que hay.
    const csv = comoFichero(DEL_KIA);
    assert.match(csv, /Impuesto de matriculación/);
    assert.match(csv, /;exento;suplido/);
  });

  test('pero las esperadas no: no son un apunte todavía', () => {
    const csv = comoFichero([...DEL_KIA, {
      numero: '', fecha: '2026-09-25', sentido: 'recibida' as const,
      contraparte: 'Müller', total: 484, pendiente: true,
    }]);
    assert.doesNotMatch(csv, /Müller/);
  });

  test('y un punto y coma dentro de un nombre no parte la fila', () => {
    const csv = comoFichero([{
      numero: 'X', fecha: '2026-09-01', sentido: 'recibida',
      contraparte: 'Talleres Paco; e hijos', total: 100, iva: 21,
    }]);
    assert.equal(csv.split('\r\n').length, 2);
    assert.match(csv, /"Talleres Paco; e hijos"/);
  });

  test('una lista vacía es solo la cabecera, no un fichero roto', () => {
    assert.equal(comoFichero([]).split('\r\n').length, 1);
    assert.equal(comoFichero(null).split('\r\n').length, 1);
  });

  test('y se llama por su trimestre', () => {
    // Para que no acaben cuatro «export.csv» en la misma carpeta.
    assert.equal(comoSeLlamaElFichero(2026, 3), 'popcar-2026-T3.csv');
  });
});
