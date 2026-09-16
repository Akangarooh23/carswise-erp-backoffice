/**
 * La cita del taller, partida en día y hora y vuelta a juntar.
 *
 * En la base es un instante —`cita_at`, TIMESTAMPTZ— y en la pantalla son dos
 * casillas, porque así es como se dice una cita: «el martes a las diez». Lo que
 * vive aquí es el paso de una cosa a la otra, y vive fuera del componente para
 * poder probarlo: es donde se esconden los fallos de hora, que no se ven
 * mirando la pantalla porque el navegador los disimula.
 *
 * Todo se parte y se junta **en la hora del navegador**, que es la de quien lo
 * escribe. Usar la cadena ISO en crudo pondría las 10:00 de Madrid como las
 * 08:00, y en una cita de primera hora, del día anterior.
 */

/** Dos cifras, que es como las quiere `<input type="date">`. */
const dos = (n: number) => String(n).padStart(2, '0');

/** De lo guardado a las dos casillas. Sin cita, las dos vacías. */
export function partirLaCita(iso: string | null | undefined): { dia: string; hora: string } {
  if (!iso) return { dia: '', hora: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { dia: '', hora: '' };
  return {
    dia: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`,
    hora: `${dos(d.getHours())}:${dos(d.getMinutes())}`,
  };
}

/**
 * Y de las dos casillas a lo que se guarda.
 *
 * Sin día no hay cita: devuelve `null` y la ficha se queda sin fecha, que es la
 * verdad mientras el taller no conteste.
 *
 * Sin hora sí hay cita. Se apunta el día y se queda a las 00:00 — lo que no se
 * hace es ponerle una hora de oficina por defecto: el correo le diría al cliente
 * «a las 09:00» sin que nadie lo haya dicho, y a esa hora no le espera nadie.
 * Por eso la pantalla no deja mandarle la cita hasta que hay día, y enseña la
 * hora tal cual esté.
 */
export function juntarLaCita(dia: string, hora: string): string | null {
  if (!dia) return null;
  const d = new Date(`${dia}T${hora || '00:00'}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** El día, como se lee de un vistazo en la ficha. */
export const cuando = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';

/** Y el día con su hora, que es como se cuenta una cita. */
export const cuandoConHora = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString('es-ES', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '–';
