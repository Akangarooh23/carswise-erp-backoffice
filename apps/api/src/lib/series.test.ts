/**
 * Los identificadores de serie no se repiten, ni cuando hay prisa.
 *
 * Había dos formas de sacar el siguiente —contratos y facturas de proveedor— y
 * las dos contaban filas. `COUNT(*) + 1` da el número correcto solo mientras no
 * se borre nada: en cuanto falta uno, el siguiente repite uno ya usado. La
 * clave primaria impide guardar el repetido, así que el fallo no sale como dos
 * filas iguales sino como un error de base de datos en la cara de quien estaba
 * creando algo.
 *
 * Aquí se prueba lo que se puede razonar sin base de datos: el formato y el
 * reintento. La consulta que lee el último emitido se prueba contra Postgres en
 * scripts/comprueba-contratos.js.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prefijoAnual, conNumero, guardaConIdUnico } from './series.js';

/** Un error como el que devuelve Postgres cuando la clave ya existe. */
const claveRepetida = () => Object.assign(new Error('duplicate key'), { code: '23505' });

describe('cómo se numera una serie', () => {
  test('el prefijo lleva la serie y el año', () => {
    assert.equal(prefijoAnual('PROV', 2026), 'PROV-2026-');
    assert.equal(prefijoAnual('PC-RENT', 2026), 'PC-RENT-2026-');
  });

  test('el primero es el 001', () => {
    assert.equal(conNumero('PROV-2026-', 0), 'PROV-2026-001');
  });

  test('va detrás del último emitido, no del número de filas', () => {
    // Siete emitidos de los que se borró uno: quedan seis filas, pero el
    // siguiente es el ocho.
    assert.equal(conNumero('PROV-2026-', 7), 'PROV-2026-008');
  });

  test('pasar de mil crece en vez de repetirse', () => {
    assert.equal(conNumero('PROV-2026-', 999), 'PROV-2026-1000');
  });
});

describe('cuando dos crean a la vez', () => {
  test('el que pierde vuelve a pedir número', async () => {
    let pedidos = 0;
    const guardados: string[] = [];
    const { id } = await guardaConIdUnico(
      async () => `PROV-2026-${String(++pedidos).padStart(3, '0')}`,
      async (id) => {
        // El primer intento choca, como si otro se hubiera llevado el número.
        if (pedidos === 1) throw claveRepetida();
        guardados.push(id);
        return 'guardado';
      }
    );
    assert.equal(id, 'PROV-2026-002');
    assert.deepEqual(guardados, ['PROV-2026-002'], 'solo se guarda una vez');
  });

  test('se pide un número nuevo en cada intento, no el mismo', async () => {
    const intentados: string[] = [];
    let n = 0;
    await guardaConIdUnico(
      async () => `PROV-2026-${String(++n).padStart(3, '0')}`,
      async (id) => { intentados.push(id); if (n < 3) throw claveRepetida(); }
    );
    assert.deepEqual(intentados, ['PROV-2026-001', 'PROV-2026-002', 'PROV-2026-003']);
  });

  test('a la tercera se rinde en vez de girar sin fin', async () => {
    let n = 0;
    await assert.rejects(
      () => guardaConIdUnico(async () => `PROV-2026-00${++n}`, async () => { throw claveRepetida(); }),
      /duplicate key/
    );
    assert.equal(n, 3);
  });

  test('un error que no es de clave repetida se propaga tal cual', async () => {
    // Si la base está caída o falta un campo, reintentar no arregla nada y
    // esconder el error hace que el problema salga más tarde y peor.
    let intentos = 0;
    await assert.rejects(
      () => guardaConIdUnico(
        async () => { intentos++; return 'PROV-2026-001'; },
        async () => { throw new Error('column "foo" does not exist'); }
      ),
      /column "foo"/
    );
    assert.equal(intentos, 1, 'no se reintenta lo que no se arregla reintentando');
  });

  test('si sale bien a la primera, se guarda una vez y ya', async () => {
    let veces = 0;
    const { id, resultado } = await guardaConIdUnico(
      async () => 'PROV-2026-001',
      async () => { veces++; return 42; }
    );
    assert.equal(id, 'PROV-2026-001');
    assert.equal(resultado, 42);
    assert.equal(veces, 1);
  });
});
