/**
 * La tarea diaria, y quién puede dispararla.
 *
 * Es la primera de este proyecto, y no lleva sesión: quien la llama es Vercel.
 * Así que la puerta es lo único que hay, y una puerta escrita al revés no se
 * nota — sigue funcionando, solo que también para los demás. Pasó una vez en
 * PopCar: la condición estaba invertida y no tener la variable configurada
 * dejaba la dirección abierta sin avisar.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { autorizado, puedeEscribir } from './cron.js';

const conCabeceras = (headers: Record<string, string>) => ({ headers });

describe('quién puede disparar la tarea', () => {
  test('con el secreto puesto, hace falta el secreto', () => {
    process.env.CRON_SECRET = 'secreto-de-mentira';
    assert.equal(autorizado(conCabeceras({ authorization: 'Bearer secreto-de-mentira' })), true);
    assert.equal(autorizado(conCabeceras({ authorization: 'Bearer otro' })), false);
    assert.equal(autorizado(conCabeceras({})), false);
  });

  test('y entonces hacerse pasar por Vercel no vale', () => {
    // Si bastara el agente, el secreto no serviría de nada: cualquiera lo copia.
    process.env.CRON_SECRET = 'secreto-de-mentira';
    assert.equal(autorizado(conCabeceras({ 'user-agent': 'vercel-cron/1.0' })), false);
  });

  test('sin secreto configurado, solo la llamada de Vercel', () => {
    process.env.CRON_SECRET = '';
    assert.equal(autorizado(conCabeceras({ 'user-agent': 'vercel-cron/1.0' })), true);
    assert.equal(autorizado(conCabeceras({ 'user-agent': 'curl/8.4.0' })), false);
    assert.equal(autorizado(conCabeceras({})), false);
  });

  test('un secreto de espacios cuenta como no puesto, no como secreto', () => {
    // Si contara como secreto, nadie podría dispararla y la tarea moriría en
    // silencio: el número se quedaría viejo y nadie sabría por qué.
    process.env.CRON_SECRET = '   ';
    assert.equal(autorizado(conCabeceras({ 'user-agent': 'vercel-cron/1.0' })), true);
  });
});

describe('cómo está montada', () => {
  const FUENTE = readFileSync(new URL('./cron.ts', import.meta.url), 'utf8');
  const VERCEL = JSON.parse(readFileSync(new URL('../../../../vercel.json', import.meta.url), 'utf8'));

  test('la puerta va antes que nada', () => {
    // El `autorizado` tiene que ser lo primero del manejador. Detrás de una
    // consulta de ocho segundos, la dirección sirve para tumbar la base sin
    // haber entrado.
    const cuerpo = FUENTE.slice(FUENTE.indexOf("cronRouter.get('/cron/kpis'"));
    const puerta = cuerpo.indexOf('if (!autorizado(req))');
    const trabajo = cuerpo.indexOf('recalcula');
    assert.ok(puerta > 0 && puerta < trabajo, 'se trabaja antes de comprobar quién llama');
  });

  test('está en el cron de Vercel, o no la dispara nadie', () => {
    const kpis = (VERCEL.crons ?? []).find((c: { path: string }) => c.path === '/api/cron/kpis');
    assert.ok(kpis, 'la ruta existe pero no está programada');
    assert.match(kpis.schedule, /^\S+ \S+ \S+ \S+ \S+$/);
  });

  test('y corre de madrugada', () => {
    /*
     * Las dos consultas son caras —ocho segundos sobre 798.000 anuncios y uno
     * sobre 2,5 GB— y de día compiten con quien está trabajando. La hora es
     * UTC, así que las 4 son las 6 aquí en verano: después de los rastreadores
     * y antes de que nadie abra el panel.
     */
    const kpis = (VERCEL.crons ?? []).find((c: { path: string }) => c.path === '/api/cron/kpis');
    const hora = Number(String(kpis.schedule).split(' ')[1]);
    assert.ok(hora >= 2 && hora <= 6, `corre a las ${hora} UTC, que es horario de trabajo`);
  });

  test('las dos consultas van una detrás de otra, no a la vez', () => {
    // Lanzarlas juntas es pedirle a la base las dos cosas caras al mismo
    // tiempo, de noche, mientras corren los rastreadores.
    assert.ok(!/Promise\.all/.test(FUENTE), 'se lanzan a la vez');
  });

  test('no devuelve los números, solo qué se ha recalculado', () => {
    // Es una tarea, no una consulta. Las cifras se miran donde se enseñan, con
    // su fecha al lado.
    assert.match(FUENTE, /portales_parados: Boolean\(parados\)/);
    assert.match(FUENTE, /precio_contra_el_mercado: Boolean\(precios\)/);
  });
});

describe('lo que escribe pide el secreto de verdad', () => {
  const FUENTE = readFileSync(new URL('./cron.ts', import.meta.url), 'utf8');

  /*
   * Mientras aquí solo se recalculaban números, la puerta débil daba igual: lo
   * peor que conseguía quien se colara era que las cifras estuvieran más
   * frescas. Vencer un encargo retira el anuncio de un cliente y le manda un
   * correo. Un agente de navegador se copia escribiéndolo, así que eso no puede
   * depender de él.
   */
  const conSecreto = (valor: string, auth?: string) => {
    const antes = process.env.CRON_SECRET;
    process.env.CRON_SECRET = valor;
    try {
      return puedeEscribir({ headers: auth ? { authorization: auth } : {} });
    } finally {
      if (antes === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = antes;
    }
  };

  test('con el secreto correcto, sí', () => {
    assert.equal(conSecreto('abc', 'Bearer abc'), true);
  });

  test('con el secreto equivocado, no', () => {
    assert.equal(conSecreto('abc', 'Bearer otro'), false);
  });

  test('y SIN secreto configurado, tampoco', () => {
    // Aquí es donde se separa de `autorizado`: esa deja pasar a Vercel por su
    // agente, y para escribir eso no basta.
    assert.equal(conSecreto('', 'Bearer lo-que-sea'), false);
    assert.equal(
      autorizado({ headers: { 'user-agent': 'vercel-cron/1.0' } }), true,
      'la de recalcular sí deja pasar a Vercel: si no, esta prueba no compara nada',
    );
    assert.equal(puedeEscribir({ headers: { 'user-agent': 'vercel-cron/1.0' } }), false);
  });

  test('el barrido de encargos está detrás de esa puerta', () => {
    assert.match(FUENTE, /puedeEscribir\(req\)\s*\?\s*await venceLoQueTocaHoy\(\)/);
  });

  test('y cuando no corre se dice, en vez de contestar cero', () => {
    // Un cero se lee como «no había nada que vencer». Callarlo haría creer que
    // se está barriendo cuando no.
    assert.match(FUENTE, /sin CRON_SECRET no se vence nada/);
  });
});
