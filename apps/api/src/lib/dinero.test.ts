/**
 * Una línea de dinero con su base y su IVA.
 *
 * Lo que se sostiene aquí es contabilidad, no aritmética: que el coste sea la
 * base y no el total —el IVA soportado se deduce, no es coste—, que un suplido
 * no cueste nada porque es dinero del cliente, y que un importe sin desglosar
 * se diga en vez de suponerle un 21 %.
 *
 * Lo último es lo que más daño hace. Un 21 % puesto encima de 253 € de gestoría
 * —que son casi todo tasas sin IVA— no da un error visible: da una cifra
 * plausible y equivocada, y con esa cifra se calcula un margen.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  importe, tipoDeIva, desglosa, loQueNosCuesta, loQueSePaga, noCuadra,
  ivaPorDefecto, regimenPorDefecto, cuenta, comoSeCuenta, TIPOS_DE_IVA,
} from './dinero.js';

describe('leer un importe', () => {
  test('venga como venga', () => {
    assert.equal(importe('1.420,00 €'), 1420);
    assert.equal(importe('890.00'), 890);
    assert.equal(importe('6,534'), 6.534);
    assert.equal(importe(253), 253);
  });

  test('y lo que no es un número vale cero, no NaN', () => {
    // Un NaN paseando por una suma la convierte entera en NaN, y eso acaba
    // impreso en una pantalla como «NaN €».
    assert.equal(importe('lo que sea'), 0);
    assert.equal(importe(null), 0);
    assert.equal(importe(''), 0);
  });
});

describe('el tipo de IVA', () => {
  test('los que existen', () => {
    for (const t of TIPOS_DE_IVA) assert.equal(tipoDeIva(t), t);
    assert.equal(tipoDeIva('21%'), 21);
    assert.equal(tipoDeIva('10'), 10);
  });

  test('y uno inventado no vale', () => {
    // Un 15 % tecleado a mano es una errata, no un tipo.
    assert.equal(tipoDeIva(15), null);
    assert.equal(tipoDeIva('veintiuno'), null);
  });

  test('vacío quiere decir «todavía no se sabe», no cero', () => {
    // Cero es un tipo de verdad —una tasa exenta— y no saberlo es otra cosa.
    assert.equal(tipoDeIva(''), null);
    assert.equal(tipoDeIva(null), null);
    assert.equal(tipoDeIva(0), 0);
  });
});

describe('cómo se parte una línea', () => {
  test('con base y tipo, se calcula la cuota', () => {
    const d = desglosa({ base: 400, iva: 21 });
    assert.equal(d.cuota, 84);
    assert.equal(d.total, 484);
    assert.equal(d.desglosada, true);
  });

  test('con total y tipo, se saca la base hacia atrás', () => {
    // Es como llega una factura que solo trae el total.
    const d = desglosa({ total: 484, iva: 21 });
    assert.equal(d.base, 400);
    assert.equal(d.cuota, 84);
  });

  test('con un número a secas, se dice que no está desglosada', () => {
    // Y base y total valen lo mismo, que es lo único honesto que se puede
    // decir. Lo que no se hace es inventarle un 21 %.
    const d = desglosa({ total: 253 });
    assert.equal(d.base, 253);
    assert.equal(d.total, 253);
    assert.equal(d.cuota, 0);
    assert.equal(d.tipo, null);
    assert.equal(d.desglosada, false);
  });

  test('una factura intracomunitaria no lleva IVA dentro: su total es la base', () => {
    // Dividir 890 € entre 1,21 sería inventarse un IVA que la factura no
    // tiene, y decir que el transporte costó 735,54 cuando costó 890.
    const d = desglosa({ total: 890, iva: 21, regimen: 'intracomunitario' });
    assert.equal(d.base, 890);
    assert.equal(d.total, 890);
    // La cuota existe, pero se autoliquida: se repercute y se deduce a la vez.
    assert.equal(d.cuota, 186.9);
  });

  test('y una exenta no tiene cuota ninguna', () => {
    const d = desglosa({ total: 1420, iva: 0, regimen: 'exento' });
    assert.equal(d.base, 1420);
    assert.equal(d.cuota, 0);
    assert.equal(d.total, 1420);
  });

  test('al 0 % sí está desglosada: es un tipo, no un hueco', () => {
    const d = desglosa({ base: 99.77, iva: 0 });
    assert.equal(d.desglosada, true);
    assert.equal(d.cuota, 0);
    assert.equal(d.total, 99.77);
  });

  test('y los céntimos no se van', () => {
    // Sumar en coma flotante deja 1754.7700000000002, y eso acaba impreso.
    assert.equal(desglosa({ base: 30.25, iva: 21 }).total, 36.6);
  });
});

describe('lo que nos cuesta de verdad', () => {
  test('la base, no el total: el IVA se deduce', () => {
    // 890 € de transporte español cuestan 735,54. Los 154,46 restantes son un
    // préstamo a Hacienda, no coste.
    assert.equal(loQueNosCuesta({ total: 890, iva: 21, que: 'nuestro' }), 735.54);
  });

  test('un suplido no cuesta nada: es dinero del cliente', () => {
    // Contarlo como coste nuestro infla el coche y hunde el margen.
    assert.equal(loQueNosCuesta({ total: 1420, iva: 0, que: 'suplido' }), 0);
  });

  test('pero sí sale de la cuenta', () => {
    // Son dos preguntas distintas: qué nos cuesta y qué se paga.
    assert.equal(loQueSePaga({ total: 1420, iva: 0, que: 'suplido' }), 1420);
  });

  test('y sin desglosar cuesta lo que pone, que es lo prudente', () => {
    assert.equal(loQueNosCuesta({ total: 253 }), 253);
  });
});

describe('cuando los tres números se contradicen', () => {
  test('se avisa al teclearlo', () => {
    // Y no en el cierre del trimestre, que es cuando ya no hay quien mire la
    // factura.
    const aviso = noCuadra({ base: 400, iva: 21, total: 500 });
    assert.ok(aviso);
    assert.match(aviso, /484/);
  });

  test('con un céntimo de margen no se avisa', () => {
    // Una factura con diez líneas redondeadas no cuadra al céntimo, y eso no
    // es un error.
    assert.equal(noCuadra({ base: 400, iva: 21, total: 484.01 }), null);
  });

  test('y sin los tres, no hay nada que contradecir', () => {
    assert.equal(noCuadra({ base: 400, iva: 21 }), null);
    assert.equal(noCuadra({ total: 484 }), null);
  });
});

describe('lo que se supone por defecto', () => {
  test('un suplido no lleva IVA', () => {
    // Una tasa de la DGT o el impuesto de matriculación son dinero público, no
    // un servicio que nadie nos venda.
    assert.equal(ivaPorDefecto('suplido'), 0);
    assert.equal(ivaPorDefecto('nuestro'), 21);
  });

  test('y el régimen lo decide dónde está el proveedor', () => {
    // Un transporte alemán con ROI viene sin IVA y se autoliquida aquí; el
    // mismo transporte español lleva su 21 % deducible.
    assert.equal(regimenPorDefecto('DE307265811'), 'intracomunitario');
    assert.equal(regimenPorDefecto('ESB88835145'), 'nacional');
    assert.equal(regimenPorDefecto('B88700448'), 'nacional');
  });

  test('sin saber de dónde es, nacional', () => {
    // Es lo que más hay, y equivocarse hacia ahí se ve en la factura.
    assert.equal(regimenPorDefecto(''), 'nacional');
    assert.equal(regimenPorDefecto(null), 'nacional');
  });
});

describe('la cuenta de un coche', () => {
  /*
   * El Kia, con los regímenes que le tocan de verdad.
   *
   * El perito y el transportista del primer viaje son alemanes con ROI: sus
   * facturas vienen sin IVA. El transportista del segundo y la gestoría son
   * españoles: llevan su 21 % dentro. Y las tasas y el impuesto no llevan
   * ninguno.
   */
  const DEL_KIA = [
    { total: 289, iva: 21, que: 'nuestro' as const, regimen: 'intracomunitario' as const },
    { total: 890, iva: 21, que: 'nuestro' as const, regimen: 'intracomunitario' as const },
    { total: 484, iva: 21, que: 'nuestro' as const, regimen: 'nacional' as const },
    { total: 119.07, iva: 21, que: 'nuestro' as const, regimen: 'nacional' as const },
    { total: 1420, iva: 0, que: 'suplido' as const, regimen: 'exento' as const },
    { total: 154.6, iva: 0, que: 'suplido' as const, regimen: 'exento' as const },
  ];

  test('separa lo nuestro de lo que solo pasa', () => {
    const c = cuenta(DEL_KIA);
    assert.equal(c.suplidos, 1574.6);
    // 289 + 890 tal cual (sin IVA dentro) + 400 + 98,4 (quitado el 21 %).
    assert.equal(c.nuestro, 1677.4);
  });

  test('el IVA de lo intracomunitario no se soporta: se autoliquida', () => {
    // Entra y sale. Contarlo como soportado dice que hay un crédito con
    // Hacienda que no existe.
    const c = cuenta(DEL_KIA);
    const soloNacional = cuenta(DEL_KIA.filter((l) => l.regimen === 'nacional'));
    assert.equal(c.ivaSoportado, soloNacional.ivaSoportado);
    assert.equal(c.ivaSoportado, 104.67);
  });

  test('y lo que sale de la cuenta es todo, con el IVA español dentro', () => {
    assert.equal(cuenta(DEL_KIA).pagado, 3356.67);
  });

  test('las líneas sin desglosar se cuentan y se dicen', () => {
    // Un coste con seis líneas sin IVA conocido no es un coste: es una
    // estimación, y quien lo mira tiene que saberlo sin ir a buscarlo.
    const c = cuenta([{ total: 253 }, { total: 890, iva: 21 }]);
    assert.equal(c.sinDesglosar, 1);
    assert.match(comoSeCuenta(c), /no dice su IVA/);
  });

  test('y con todo desglosado no se dice nada de eso', () => {
    assert.doesNotMatch(comoSeCuenta(cuenta(DEL_KIA)), /no dice/);
    assert.match(comoSeCuenta(cuenta(DEL_KIA)), /suplidos, que son del cliente/);
  });

  test('una lista vacía es una cuenta a cero, no un fallo', () => {
    assert.deepEqual(cuenta([]), {
      nuestro: 0, suplidos: 0, ivaSoportado: 0, pagado: 0, sinDesglosar: 0,
    });
    assert.deepEqual(cuenta(null), {
      nuestro: 0, suplidos: 0, ivaSoportado: 0, pagado: 0, sinDesglosar: 0,
    });
  });
});
