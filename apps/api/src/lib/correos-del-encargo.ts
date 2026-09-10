/**
 * Lo que se le escribe al cliente cuyo coche vendemos.
 *
 * Del encargo en adelante no salía **ningún** correo. Los del comprador sí
 * funcionaban —el enlace de confirmación, el calendario—, pero al dueño del
 * coche no se le escribía nunca: ni para mandarle el mandato, ni cuando su
 * anuncio se publicaba, ni al cerrar. Todo era teléfono, y lo que no se dice
 * por teléfono no queda dicho.
 *
 * ## Qué se manda y qué no
 *
 * Tres. No es una lista corta por prudencia: es que **cada correo de más hace
 * que se lean menos los de verdad**, y los tres que hay son los que le piden
 * algo o le cuentan algo que no puede saber por su cuenta.
 *
 *   1. **El mandato**, para que lo firme. Es el que desbloquea poder cobrar.
 *   2. **Su anuncio ya está publicado**, con el enlace. Lleva días trayendo
 *      papeles y fotos sin ver nada a cambio.
 *   3. **Cómo acabó**, con lo que se le factura si se le factura algo.
 *
 * Lo que no se manda: nada de «te faltan tres cosas». Reclamar lo que falta es
 * una llamada —hay que convencerle, no informarle— y un correo automático
 * pidiendo papeles se lee como una gestoría.
 *
 * ## Los importes vienen dados, no se calculan aquí
 *
 * El del cierre recibe el importe ya hecho, el mismo que va a la factura. Si
 * este fichero lo recalculara, un día el correo diría una cifra y la factura
 * otra — y el que lo descubre es el cliente.
 */
import { plantilla, parrafo, datos, boton, aviso, esc } from './correo.js';
import { DIAS_HASTA_SALIR_GRATIS } from './encargo-de-venta.js';
import { COMO_ACABO, type Motivo } from './cierre-del-encargo.js';

/** Los euros, con el punto de los miles puesto a mano y no por el ICU. */
function euros(n: number): string {
  const entero = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}${entero} €`;
}

const elCoche = (marca: string, modelo: string, matricula: string) =>
  [marca, modelo].filter(Boolean).join(' ') || matricula || 'tu coche';

export interface DatosDelCorreo {
  cliente_nombre: string;
  marca: string;
  modelo: string;
  matricula: string;
}

/**
 * El mandato, para que lo firme.
 *
 * Va con el documento adjunto y dice **las tres cosas que decide**: que no
 * compramos el coche, qué se paga si se vende y qué se paga si se va. Un correo
 * que solo dijera «firma esto» obligaría a abrir el adjunto para saber a qué se
 * está diciendo que sí, y la mitad no lo abre.
 */
export function elCorreoDelMandato(
  d: DatosDelCorreo & { mandato_id: string; precio: number | null; fee_gestion: number; fee_cancelacion: number },
): { subject: string; html: string } {
  const coche = elCoche(d.marca, d.modelo, d.matricula);
  return {
    subject: `Tu mandato para vender ${coche}`,
    html: plantilla({
      titulo: 'Nos encargamos de vender tu coche',
      cuerpo:
        parrafo(`Hola <strong>${esc(d.cliente_nombre) || 'buenas'}</strong>,`) +
        parrafo(`Te adjuntamos el mandato para que lo firmes. Es el papel donde nos `
          + `encargas la venta de <strong>${esc(coche)}</strong>. Puedes devolverlo firmado `
          + `contestando a este correo.`) +
        datos([
          ['Nº de mandato', esc(d.mandato_id)],
          ['Vehículo', esc(coche)],
          ['Matrícula', esc(d.matricula) || '—'],
          ...(d.precio ? ([['Precio de salida', euros(d.precio)]] as [string, string][]) : []),
        ]) +
        parrafo('<strong>Lo que dice, en tres líneas:</strong>') +
        parrafo(`El coche sigue siendo tuyo y no lo compramos en ningún momento: lo `
          + `enseñas tú, en tu casa y a tus horas. Nosotros ponemos el anuncio, atendemos `
          + `las llamadas, filtramos y organizamos las visitas.`) +
        parrafo(`<strong>Si se vende con nosotros</strong>, son ${euros(d.fee_gestion)}, `
          + `IVA incluido. No pagas nada por adelantado: si no se vende, no pagas esto.`) +
        parrafo(`<strong>Si decides retirarlo</strong>, ${euros(d.fee_cancelacion)} de `
          + `cancelación, que dejan de aplicarse a los ${DIAS_HASTA_SALIR_GRATIS} días si `
          + `aceptas por escrito el precio de salida que te proponemos.`) +
        aviso('El encargo no caduca',
          'No hay fecha de vencimiento: se mantiene hasta que el coche se vende o hasta '
          + 'que tú decidas retirarlo, y puedes retirarlo cuando quieras.'),
    }),
  };
}

/**
 * Su anuncio ya está publicado.
 *
 * Es el correo que lleva esperando: ha traído papeles, fotos, un informe y sus
 * horas, y hasta ahora la única señal de que servía para algo era que dejáramos
 * de llamarle.
 *
 * Lleva el enlace porque lo primero que hace cualquiera es ir a mirarlo, y
 * además así puede mandárselo a quien quiera.
 */
export function elCorreoDePublicado(
  d: DatosDelCorreo & { url: string | null; precio: number | null },
): { subject: string; html: string } {
  const coche = elCoche(d.marca, d.modelo, d.matricula);
  return {
    subject: `Ya está publicado: ${coche}`,
    html: plantilla({
      titulo: 'Tu coche ya está anunciado',
      cuerpo:
        parrafo(`Hola <strong>${esc(d.cliente_nombre) || 'buenas'}</strong>,`) +
        parrafo(`<strong>${esc(coche)}</strong> ya está publicado`
          + `${d.precio ? ` a ${euros(d.precio)}` : ''}. A partir de ahora las llamadas `
          + `entran por nosotros: filtramos y solo te pasamos las visitas que valen la pena.`) +
        (d.url ? boton('Ver tu anuncio', d.url) : '') +
        /*
         * Y lo que tiene que hacer él, que es una sola cosa.
         *
         * Las visitas caen en las franjas que él eligió, y esas franjas se
         * gastan. Es lo único que puede hacer que el anuncio deje de servir sin
         * que se entere.
         */
        aviso('Deja huecos libres',
          'Las visitas se piden en las horas que tú marcaste. Según se van reservando, '
          + 'quedan menos: si se acaban, el anuncio sigue puesto pero ya nadie puede pedir '
          + 'cita. Puedes añadir más cuando quieras desde tu panel.') +
        /*
         * Aquí no va el teléfono, y no es un olvido.
         *
         * El número vive en PopCar —en sus dos `marca.js`, con una prueba que
         * los compara—. Escribirlo aquí sería una tercera copia en otro repo,
         * sin nada que vigile que no se separe, y así es exactamente como la
         * página de Contacto acabó enseñando un número de relleno. La respuesta
         * a este correo llega al mismo sitio.
         */
        parrafo('Cualquier cosa, contesta a este correo.'),
    }),
  };
}

/**
 * Cómo acabó el encargo.
 *
 * El importe llega **hecho** —el mismo que va a la factura— y puede ser cero:
 * la mayoría de los que se van pasados los 30 días no deben nada, y ese correo
 * también hay que mandarlo. Que se cierre en silencio es lo que hace que un
 * cliente llame tres semanas después preguntando si le vamos a cobrar.
 */
export function elCorreoDelCierre(
  d: DatosDelCorreo & { motivo: Motivo; importe: number; concepto: string },
): { subject: string; html: string } {
  const coche = elCoche(d.marca, d.modelo, d.matricula);
  const vendido = d.motivo === 'vendido';

  const cuerpoDelDinero = d.importe > 0
    ? datos([['Concepto', esc(d.concepto)], ['Importe', `${euros(d.importe)} (IVA incluido)`]])
      + parrafo('Te llega la factura por separado.')
    : parrafo('<strong>No hay nada que pagar.</strong> Cerramos el encargo sin cargo alguno.');

  return {
    subject: vendido ? `Vendido: ${coche}` : `Hemos cerrado el encargo de ${coche}`,
    html: plantilla({
      titulo: vendido ? 'Tu coche está vendido' : 'Encargo cerrado',
      cuerpo:
        parrafo(`Hola <strong>${esc(d.cliente_nombre) || 'buenas'}</strong>,`) +
        parrafo(vendido
          ? `<strong>${esc(coche)}</strong> se ha vendido. Retiramos el anuncio y cerramos `
            + `el encargo.`
          : `Hemos cerrado el encargo de <strong>${esc(coche)}</strong> `
            + `(${esc(COMO_ACABO[d.motivo]).toLowerCase()}) y retirado el anuncio.`) +
        cuerpoDelDinero +
        parrafo(vendido
          ? 'Gracias por confiarnos la venta.'
          : 'Si más adelante quieres volver a intentarlo, aquí estamos.'),
    }),
  };
}
