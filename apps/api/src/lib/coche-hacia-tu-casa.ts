/**
 * Decirle al cliente que el coche sale **ahora sí** hacia su casa.
 *
 * Es el gemelo del otro. Cuando el coche salió de Alemania se le escribió lo
 * contrario —«no va a tu domicilio todavía»— porque iba a Zaragoza a
 * matricularse, y esa frase le ha estado sujetando la expectativa varias
 * semanas. Si ahora no le llega nada, el segundo viaje ocurre entero en
 * silencio: aparece un camión en su calle sin avisar, o —lo normal— llama él
 * preguntando por un coche que ya está en la carretera.
 *
 * Dice tres cosas y en este orden: **ya está matriculado** —que es la noticia,
 * la parte lenta ha terminado—, **sale hacia tu dirección** y **llega el día
 * tal**. Y después lo único que se le pide: que haya alguien.
 *
 * Porque a diferencia del primer viaje, aquí sí tiene que hacer algo. La
 * entrega se firma, y un camión que llega a una casa vacía se vuelve con el
 * coche dentro y el viaje se paga igual.
 *
 * Sin fechas inventadas, como el otro: si no hay día estimado, se dice que se
 * le llama para cerrarlo. Un plazo puesto para rellenar el hueco se convierte
 * en la fecha que nos van a reclamar.
 */
import { plantilla, parrafo, datos, esc, boton } from './correo.js';

export interface DatosDelViajeACasa {
  /** Cómo se llama, para el saludo. */
  nombre?: string | null;
  vehiculo?: string | null;
  /** La española, que es la novedad: sale de este viaje. */
  matricula?: string | null;
  /** Su dirección, la que puso al pedirlo. */
  destino?: string | null;
  /** Cuándo estima llegar el transportista. */
  llegadaEstimada?: string | null;
  /** Quién conduce y en qué teléfono, si nos lo han dado. */
  conductor?: string | null;
  telefonoConductor?: string | null;
  /** A dónde mirar para ver el estado. */
  panel: string;
}

/** «21 de septiembre de 2026», o vacío. */
function enFecha(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function correoDeCocheHaciaTuCasa(d: DatosDelViajeACasa): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const subject = `Tu coche sale hacia tu casa${coche ? ` — ${coche}` : ''}`;
  const cuando = enFecha(d.llegadaEstimada);
  const destino = String(d.destino ?? '').trim();
  const matricula = String(d.matricula ?? '').trim();
  const quien = String(d.conductor ?? '').trim();
  const tel = String(d.telefonoConductor ?? '').trim();

  const punto = (texto: string) =>
    `<li style="margin-bottom:6px;font-size:14px;line-height:1.55;color:#2A2A28">${texto}</li>`;

  /*
   * Lo que se le entrega, dicho antes de que llegue el camión.
   *
   * Es la lista de una importación, sin contrato de compraventa nuestro ni
   * factura del coche: esos son del concesionario alemán. Decirlo antes evita
   * la pregunta del día de la entrega, que es el peor momento para hacerla.
   */
  const loQueLlega =
    '<ul style="margin:8px 0 18px 0;padding-left:20px">' +
    punto('El <strong>permiso de circulación</strong> y la <strong>ficha técnica</strong> españoles.') +
    punto('Todas las <strong>llaves</strong> y el libro de mantenimiento.') +
    punto('La <strong>factura de nuestro servicio</strong>.') +
    '</ul>';

  return {
    subject,
    html: plantilla({
      titulo: 'Tu coche sale hacia tu casa',
      cuerpo:
        parrafo(`Hola <strong>${esc(d.nombre) || 'cliente'}</strong>,`) +
        // La noticia primero: lo que llevaba semanas bloqueado ya está hecho.
        parrafo(
          matricula
            ? `Tu ${coche ? `<strong>${esc(coche)}</strong>` : 'coche'} ya está matriculado en España, ` +
              `con la matrícula <strong>${esc(matricula)}</strong>, y sale hacia tu dirección.`
            : `Tu ${coche ? `<strong>${esc(coche)}</strong>` : 'coche'} ya está matriculado en España ` +
              'y sale hacia tu dirección.'
        ) +
        datos(
          ([
            destino ? ['Va a', esc(destino)] : null,
            cuando ? ['Llega el', esc(cuando)] : null,
            quien ? ['Lo lleva', esc([quien, tel].filter(Boolean).join(' · '))] : null,
          ].filter(Boolean) as [string, string][])
        ) +
        /*
         * Y lo único que se le pide, dicho como se le pide algo: claro y una
         * sola vez. La entrega se firma, y un camión que llega a una casa vacía
         * se vuelve con el coche dentro.
         */
        parrafo(
          '<strong>Esta vez sí hace falta que estés.</strong> El transportista llama antes de ' +
          'llegar, y en la entrega hay que revisar el coche y firmar. Si ese día no puedes, ' +
          'dínoslo cuanto antes y lo movemos.'
        ) +
        parrafo('<strong>Con el coche te llega</strong>') +
        loQueLlega +
        (cuando
          ? parrafo(
              'El día es el que nos ha dado el transportista y puede moverse por tráfico o por ' +
              'una carga anterior. Si cambia, te avisamos.', 14
            )
          : parrafo(
              'En cuanto el transportista nos confirme el día, te llamamos para cerrarlo. No te ' +
              'damos una fecha antes de tenerla.', 14
            )) +
        boton('Ver cómo va mi coche', d.panel),
    }),
  };
}
