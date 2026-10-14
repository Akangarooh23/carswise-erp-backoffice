/**
 * El expediente del coche: lo que no puede perderse al reunirlo.
 *
 * Esto nació de una pregunta que no se podía contestar: «enséñame todo lo del
 * 5228HNS». Los papeles están en ocho tablas y dos almacenes, y para verlos
 * había que abrir cuatro pantallas sabiendo de antemano dónde mirar. Lo que no
 * se encuentra se vuelve a pedir, y ya pasó con una póliza subida dos veces.
 *
 * Lo que se protege aquí son las tres formas de estropearlo, y ninguna da
 * error cuando ocurre:
 *
 * 1. **Que un cajón desaparezca.** Si una consulta se cae y el cajón se queda
 *    vacío sin decirlo, el expediente afirma que ese coche no tiene mandato.
 * 2. **Que esto empiece a servir ficheros.** Es un índice. El día que además
 *    descargue, es una puerta nueva a la póliza de alguien, sin el control de
 *    la que ya existe.
 * 3. **Que se deje de decir quién ve cada papel.** Hoy la póliza y las
 *    facturas están en el almacén público sin que nadie lo decidiera. Mientras
 *    siga así, lo mínimo es no disimularlo.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAJONES, cuenta, elDia, type PapelDelCoche } from './expediente-del-vehiculo.js';

const FUENTE = readFileSync(new URL('./expediente-del-vehiculo.ts', import.meta.url), 'utf8');

const papel = (x: Partial<PapelDelCoche>): PapelDelCoche => ({
  id: '1', cajon: 'Otros', nombre: 'x', tipo: '', tamano: 0,
  cuando: null, deQue: '', donde: 'privado', comoSeAbre: '', loVeElCliente: false,
  ...x,
});

describe('los cajones', () => {
  test('están los que pediría cualquiera que busque algo', () => {
    for (const c of ['Fotos', 'Papeles del coche', 'Informe de estado', 'Peritación', 'Mandato', 'Tasación', 'Seguro', 'Mantenimiento']) {
      assert.ok((CAJONES as readonly string[]).includes(c), `falta el cajón ${c}`);
    }
  });

  test('y «Otros», que es el que impide que algo se pierda', () => {
    /*
     * Sin él, un papel de un tipo que nadie previó no cae en ningún cajón y
     * desaparece de la lista. Un nombre feo es mejor que no estar.
     */
    assert.ok((CAJONES as readonly string[]).includes('Otros'));
    assert.equal(CAJONES[CAJONES.length - 1], 'Otros', '«Otros» va al final');
  });

  test('los vacíos se cuentan igual', () => {
    /*
     * Un cajón que no aparece no se distingue de uno vacío, y son cosas
     * distintas: «no hay peritación» es una respuesta; que la peritación no
     * salga por ningún lado es una duda.
     */
    const n = cuenta([papel({ cajon: 'Mandato' })]);
    assert.equal(n['Mandato'], 1);
    assert.equal(n['Peritación'], 0, 'un cajón vacío tiene que salir con cero');
    assert.equal(Object.keys(n).length, CAJONES.length);
  });
});

describe('lo que este fichero NO hace', () => {
  test('no sirve ficheros: solo dice dónde están', () => {
    /*
     * Es un índice. El día que además descargue, hay una puerta más a la
     * póliza de alguien, y una que no pasa por la ruta que ya comprueba de
     * quién es cada papel.
     */
    assert.ok(!/supabase|createClient|storage|signedUrl|download/i.test(FUENTE),
      'el reunidor ha empezado a tocar el almacén');
  });

  test('y no escribe nada', () => {
    // Reunir es leer. Un INSERT aquí sería un efecto escondido en algo que se
    // llama cada vez que alguien abre un IDCar.
    assert.ok(!/\b(INSERT|UPDATE|DELETE)\b/.test(FUENTE), 'el reunidor escribe en la base');
  });
});

describe('cada consulta se cae sola', () => {
  test('las ocho llevan su catch', () => {
    /*
     * Una tabla que falla deja su cajón vacío; sin el `catch`, tira el
     * expediente entero y esconde los otros siete. Un expediente a medias se
     * ve —el cajón está vacío—; uno que no carga, no.
     */
    const consultas = (FUENTE.match(/query<Record<string, unknown>>\(/g) ?? []).length;
    const catches = (FUENTE.match(/\.catch\(vacio\)/g) ?? []).length;
    assert.equal(catches, consultas, `${consultas} consultas y ${catches} catch`);
    assert.ok(consultas >= 7, 'se han perdido fuentes por el camino');
  });
});

describe('quién ve cada papel', () => {
  test('los del ERP no los ve el cliente, y se dice', () => {
    /*
     * Están en el cajón privado y el cliente no tiene puerta. El día que la
     * tenga esto deja de ser una constante — y será una decisión, no un
     * descuido.
     */
    assert.match(FUENTE, /loVeElCliente: false/);
  });

  test('«dónde está» y «quién lo ve» son dos cosas', () => {
    /*
     * Ésta es la razón de que esto sea una vista y no una carpeta: una
     * carpeta solo sabe dónde está. Las fotos tienen que ser públicas porque
     * son el anuncio; el informe del perito lleva la dirección de casa de una
     * persona. Lo que varía por documento es quién puede verlo.
     */
    assert.match(FUENTE, /donde: Donde|donde: 'publico'/);
    assert.match(FUENTE, /loVeElCliente: boolean/);
  });
});

describe('de qué momento es cada papel', () => {
  test('un día con palabras, y sin año', () => {
    // Dentro del expediente de un coche el año se sobreentiende, y ponerlo
    // hace que la línea no quepa. El año completo va en `cuando`.
    assert.equal(elDia('2026-10-05T10:00:00Z'), '5 de octubre');
  });

  test('una fecha rota no inventa nada', () => {
    assert.equal(elDia('lo que sea'), '');
    assert.equal(elDia(null), '');
    assert.equal(elDia(undefined), '');
  });
});
