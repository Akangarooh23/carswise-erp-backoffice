/**
 * El trabajo que manda los recordatorios.
 *
 * La regla de a quién le toca vive en `revision-del-taller.ts` y se prueba allí
 * con fechas. Lo que se protege aquí es el **orden**, que es donde se pierden
 * correos: marcar antes de mandar deja a alguien sin recordatorio para siempre y
 * sin que nadie se entere, porque la fila queda diciendo que ya se le avisó.
 *
 * Se lee el fuente: probarlo de verdad pide una base de datos y una cuenta de
 * correo, y lo que aquí se vigila se ve en el fuente.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FUENTE = readFileSync(
  join(import.meta.dirname, 'recuerda-las-citas-del-taller.ts'), 'utf8',
).replace(/\r\n/g, '\n');
const CRON = readFileSync(
  join(import.meta.dirname, '..', 'routes', 'cron.ts'), 'utf8',
).replace(/\r\n/g, '\n');
const VERCEL = readFileSync(
  join(import.meta.dirname, '..', '..', '..', '..', 'vercel.json'), 'utf8',
);

describe('primero se manda y después se marca', () => {
  test('el UPDATE va detrás del envío', () => {
    /*
     * Al revés, un fallo de Resend dejaría la cita marcada como recordada y ese
     * cliente no recibiría nada nunca. Marcar de menos cuesta un reintento en la
     * pasada siguiente; marcar de más cuesta la cita.
     */
    const manda = FUENTE.indexOf('await enviar(');
    const marca = FUENTE.indexOf('recordado_at = NOW()');
    assert.ok(manda > 0 && marca > 0, 'falta alguno de los dos');
    assert.ok(marca > manda, 'se está marcando antes de mandar');
  });

  test('y si el envío falla, no se marca', () => {
    // El `continue` del catch es lo único que separa «se reintenta mañana» de
    // «este no lo recibe nunca».
    const catchDelEnvio = FUENTE.slice(FUENTE.indexOf('await enviar('), FUENTE.indexOf('recordado_at = NOW()'));
    assert.match(catchDelEnvio, /catch[\s\S]*continue;/);
  });

  test('sin correo no se marca tampoco', () => {
    // Marcarlo daría por hecho algo que no ha pasado.
    assert.match(FUENTE, /if \(!correo\) continue;/);
  });

  test('el desvío de pruebas no puede dejarle sin recordatorio', () => {
    // Si `RESEND_TEST_EMAIL` se queda olvidada en producción, el envío sale bien
    // y el cliente no recibe nada.
    assert.match(FUENTE, /alClienteSiempre: true/);
  });
});

describe('y se dispara solo', () => {
  test('hay una tarea programada para esto', () => {
    assert.match(CRON, /'\/cron\/recordatorios-taller'/);
    assert.match(CRON, /recuerdaLasCitasDelTaller\(\)/);
  });

  test('con su puerta, como la otra', () => {
    // Sin `autorizado`, cualquiera con la dirección dispara correos a clientes.
    const ruta = CRON.slice(CRON.indexOf("'/cron/recordatorios-taller'"));
    assert.match(ruta, /if \(!autorizado\(req\)\)/);
  });

  test('y está en el calendario de Vercel', () => {
    /*
     * Escrita y sin programar es el fallo de siempre: la función existe, se
     * prueba, se despliega y no la llama nadie.
     */
    assert.match(VERCEL, /"\/api\/cron\/recordatorios-taller"/);
  });

  test('a una hora en la que se lee el correo', () => {
    // Los KPI se recalculan a las 4 de la madrugada. Un recordatorio a esa hora
    // llega enterrado bajo el correo de la noche.
    const cron = JSON.parse(VERCEL) as { crons: { path: string; schedule: string }[] };
    const mio = cron.crons.find((c) => c.path.includes('recordatorios-taller'));
    assert.ok(mio, 'no está programado');
    const hora = Number(mio.schedule.split(' ')[1]);
    assert.ok(hora >= 6 && hora <= 16, `a las ${hora} UTC no la lee nadie`);
  });
});
