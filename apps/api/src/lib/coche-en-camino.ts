/**
 * Decirle al cliente que su coche ya viene, y **adónde**.
 *
 * Es el correo que evita la llamada del día siguiente. Un cliente que lee «tu
 * coche va de camino» entiende que llega a su puerta esta semana, y lo que
 * ocurre es otra cosa: el camión va a **Zaragoza**, allí se matricula en España
 * —impuesto, DGT e ITV de homologación—, y solo después se queda para la
 * entrega. Entre lo que él imagina y lo que pasa hay varias semanas, y ese
 * hueco se llena de llamadas y de desconfianza.
 *
 * Así que el correo dice tres cosas en este orden: **ha salido**, **va a
 * Zaragoza y no a tu casa**, y **lo que queda por delante**. Y una cuarta que
 * es la que de verdad tranquiliza: que no tiene que hacer nada.
 *
 * No lleva fechas inventadas. Si hay una fecha de entrega dada, se repite tal
 * cual —es la que él tiene en la cabeza— y se dice que es una estimación. Si no
 * hay, no se pone ninguna: un plazo puesto para rellenar el hueco se convierte
 * en la fecha que nos van a reclamar.
 */
import { plantilla, parrafo, datos, esc, boton } from './correo.js';

export interface DatosDelEnCamino {
  /** Cómo se llama, para el saludo. */
  nombre?: string | null;
  vehiculo?: string | null;
  /** La fecha que ya le dimos, si le dimos alguna. */
  entregaEstimada?: string | null;
  /** Adónde va el camión: nuestra nave, no su casa. */
  destino?: string | null;
  /** A dónde mirar para ver el estado. */
  panel: string;
}

/** «11 de septiembre de 2026», o vacío. */
function enFecha(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function correoDeCocheEnCamino(d: DatosDelEnCamino): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const subject = `Tu coche ya viene de camino${coche ? ` — ${coche}` : ''}`;
  const cuando = enFecha(d.entregaEstimada);
  const destino = String(d.destino ?? '').trim() || 'Zaragoza';

  const paso = (n: string, texto: string) =>
    `<tr><td style="padding:3px 10px 3px 0;font-size:14px;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(n)}</td>` +
    `<td style="padding:3px 0;font-size:14px;line-height:1.5;color:#2A2A28">${texto}</td></tr>`;

  const loQueQueda =
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0">' +
    paso('1', 'El viaje desde Alemania.') +
    paso('2', 'La <strong>matriculación española</strong>: el impuesto, la DGT y la ITV de homologación. Es la parte más lenta, y hasta que no está el coche no puede circular a tu nombre.') +
    paso('3', 'La <strong>preparación</strong> y la revisión antes de dártelo.') +
    paso('4', 'Te llamamos para <strong>quedar para la entrega</strong>.') +
    '</table>';

  return {
    subject,
    html: plantilla({
      titulo: 'Tu coche ya viene de camino',
      cuerpo:
        parrafo(`Hola <strong>${esc(d.nombre) || 'cliente'}</strong>,`) +
        parrafo(
          coche
            ? `Tu <strong>${esc(coche)}</strong> ya ha salido de Alemania.`
            : 'Tu coche ya ha salido de Alemania.'
        ) +
        // Lo primero de la caja es el destino, no la fecha: es el dato que se
        // malinterpreta, y en una caja de datos es lo que se lee sin leer.
        datos(
          ([
            ['Va a', `${esc(destino)}, a nuestras instalaciones`],
            cuando ? ['Te lo esperamos para', esc(cuando)] : null,
          ].filter(Boolean) as [string, string][])
        ) +
        parrafo(
          `<strong>No va a tu domicilio todavía.</strong> El camión lo deja en ${esc(destino)}, ` +
          'porque el coche viene con matrícula alemana y aquí tiene que matricularse antes de ' +
          'poder salir a la carretera a tu nombre.'
        ) +
        parrafo('<strong>Lo que queda por delante</strong>') +
        loQueQueda +
        (cuando
          ? parrafo(
              'La fecha es la que te dimos y sigue siendo una estimación: los plazos de un ' +
              'coche que viene de Alemania se mueven. Si cambia, te avisamos.', 14
            )
          : parrafo(
              'En cuanto sepamos el día en que lo tendrás, te lo decimos. No te damos una ' +
              'fecha antes de tenerla.', 14
            )) +
        parrafo('<strong>No tienes que hacer nada ahora.</strong> Nosotros nos ocupamos de todo y te vamos contando.') +
        boton('Ver cómo va mi coche', d.panel),
    }),
  };
}
