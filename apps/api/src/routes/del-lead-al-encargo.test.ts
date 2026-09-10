/**
 * Del lead al encargo, que es la costura entre las dos mitades.
 *
 * Un lead de la web llega con el coche escrito a mano —«Volkswagen T-Roc R line
 * 2022»— y eso no es un IDCar: el IDCar lo crea el cliente en su cuenta, porque
 * es quien sube las fotos, los papeles y el informe. Entre una cosa y la otra
 * hay una llamada.
 *
 * Sin esta costura, ese rato acaba en «búscalo tú en IDCars»: hay que salir del
 * lead, buscar el coche por el correo, abrir el encargo y volver — y el lead se
 * queda pendiente para siempre porque nadie se acuerda de cerrarlo.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'utf8')
    .replace(/\r\n/g, '\n');

const RUTA = leer('./encargos.ts');
const BLOQUE = leer('../../../web/src/pages/leads/AbrirEncargo.tsx');
const LEADS = leer('../../../web/src/pages/LeadsPage.tsx');

describe('sus coches, buscados por correo', () => {
  const CANDIDATOS = RUTA.slice(RUTA.indexOf("'/encargos/candidatos'"));

  test('se busca por el correo y no por el identificador de usuario', () => {
    /*
     * Quien deja el formulario de la web puede no tener cuenta todavía. El
     * correo es lo único que hay a los dos lados.
     */
    assert.match(CANDIDATOS, /lower\(COALESCE\(v\.user_email, ''\)\) = \$1/);
    assert.match(CANDIDATOS, /lower\(COALESCE\(u\.email, ''\)\) = \$1/);
  });

  test('y sin correo no se busca nada', () => {
    // Sin la condición, la consulta devolvería todos los coches de todos.
    assert.match(CANDIDATOS, /if \(!email\)[\s\S]{0,120}falta_el_correo/);
  });

  test('solo los encargos abiertos cuentan como «ya tiene»', () => {
    /*
     * Uno cerrado deja el coche libre otra vez: el mismo señor puede volver el
     * año que viene con el mismo coche. Sin esto, un coche que ya se vendió
     * una vez no se podría volver a encargar nunca.
     */
    assert.match(CANDIDATOS, /LEFT JOIN erp_encargos_venta e\s*\n\s*ON e\.vehicle_id = v\.id AND e\.cerrado_at IS NULL/);
  });
});

describe('de dónde salió el encargo', () => {
  test('se guarda el lead', () => {
    // Sin esto no hay forma de saber que ese lead se convirtió, ni de contar
    // cuántos encargos entran por la web.
    assert.match(RUTA, /ADD COLUMN IF NOT EXISTS lead_id TEXT/);
    assert.match(RUTA, /fee_gestion, fee_cancelacion, lead_id, creado_por/);
  });

  test('y la pantalla lo manda', () => {
    assert.match(BLOQUE, /\{ vehicle_id: vehicleId, lead_id: leadId \}/);
  });
});

describe('lo que se ve en el lead', () => {
  test('el bloque sale solo en los leads de venta gestionada', () => {
    assert.match(LEADS, /selected\.appointment_type === 'venta_gestionada' && \(/);
  });

  test('si no ha subido ningún coche, se dice qué pedirle', () => {
    /*
     * Es la mitad del trabajo: una lista vacía sin explicación deja a quien
     * llama sin saber qué falta. Lo que hay que pedirle es justo que suba el
     * coche.
     */
    assert.match(BLOQUE, /Todavía no ha subido ningún coche/);
    assert.match(BLOQUE, /pídele que entre en su panel/);
  });

  test('se distingue si eligió el coche o lo escribió a mano', () => {
    /*
     * Son dos cosas distintas y quien está al teléfono tiene que saber en cuál
     * está. Si lo eligió de su lista, el identificador es un dato y no hay nada
     * que confirmar. Si lo escribió, «Volkswagen T-Roc R line 2022» es una
     * suposición: puede tener tres coches y ese texto no identifica ninguno.
     */
    assert.match(BLOQUE, /cocheElegido \?/);
    assert.match(BLOQUE, /No hay que adivinar cuál es/);
    assert.match(BLOQUE, /Lo puso a mano,\s*\n?\s*así que confírmale cuál de estos es/);
  });

  test('y el que dijo sale el primero y marcado', () => {
    // Con tres coches, el suyo tiene que estar donde se mira primero.
    assert.match(BLOQUE, /\.sort\(\(a, b\) => Number\(esElQueDijo\(b\)\) - Number\(esElQueDijo\(a\)\)\)/);
    assert.match(BLOQUE, /← el que dijo/);
  });

  test('y da igual si lo eligió de la lista o dijo la matrícula', () => {
    /*
     * Dos maneras de saber cuál es su coche y una sola respuesta. Si solo se
     * mirara `cocheElegido`, el que llega sin cuenta y escribe la matrícula
     * tendría su coche perdido entre los otros tres, que es justo el caso en
     * el que más falta hace verlo.
     */
    assert.match(BLOQUE, /c\.id === cocheElegido\) \|\| \(Boolean\(elSuyo\)/);
    assert.match(BLOQUE, /llana\(c\.plate\) === llana\(matricula\)/);
  });

  test('y si esa matrícula no es de ninguno, se dice y se le puede mandar el alta', () => {
    /*
     * Es distinto de «no tiene coches»: puede tener tres y querer vender un
     * cuarto que no ha subido. Sin esto, en la llamada se le ofrecerían los que
     * sí tiene y el que quiere vender no estaría en la lista.
     */
    assert.match(BLOQUE, /matricula && !elSuyo &&/);
    assert.match(BLOQUE, /alta-del-coche/);
  });

  test('un coche que ya tiene encargo no ofrece abrirle otro', () => {
    assert.match(BLOQUE, /c\.encargo_id \?[\s\S]{0,200}Ya tiene encargo/);
  });
});
