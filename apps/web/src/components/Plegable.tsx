/**
 * Una sección que se abre cuando hace falta.
 *
 * Los paneles enseñan de todo a la vez —el depósito, los correos, la ruta, los
 * papeles, el historial— y con todo abierto hay que bajar dos pantallas para
 * llegar al único campo que toca hoy. Peor todavía: cuando lo que falta está
 * abajo, ni siquiera se ve que falta.
 *
 * La regla es la misma en los dos sitios donde se usa: **abierto lo que tiene
 * algo pendiente, plegado lo que ya está**, y lo plegado enseña en una línea lo
 * que guarda dentro para no tener que abrirlo por curiosidad.
 *
 * Lo que nunca se pliega es lo que dice qué toca ahora. Esconder eso sería
 * cambiar un problema por otro.
 */
import { useState, type ReactNode } from 'react';

export default function Plegable({ titulo, resumen, abiertaPorDefecto = false, children }: {
  titulo: string;
  /** Lo que se ve sin abrirla: una fecha, un número, lo que falta. */
  resumen?: string;
  abiertaPorDefecto?: boolean;
  children: ReactNode;
}) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);

  /*
   * Y se abre sola cuando le llega el turno.
   *
   * Un panel repartido en partes se recorre de arriba abajo: se rellena la
   * primera, se pulsa su botón y **la siguiente tiene que estar delante**. Con
   * el estado fijado solo al montar, quien acaba de mandar un correo se
   * encuentra la misma sección abierta y las de abajo cerradas, y tiene que
   * adivinar cuál toca ahora.
   *
   * Se ajusta durante el render y no en un efecto, para que no se vea el paso
   * intermedio. Y solo cuando el dato cambia de verdad: si alguien la abre o
   * la cierra a mano, se queda como la dejó hasta que le toque el turno a
   * otra.
   */
  const [ultimo, setUltimo] = useState(abiertaPorDefecto);
  if (ultimo !== abiertaPorDefecto) {
    setUltimo(abiertaPorDefecto);
    setAbierta(abiertaPorDefecto);
  }
  return (
    <div className="mt-3 pt-3 border-t border-brand-100">
      <button onClick={() => setAbierta((v) => !v)}
              className="w-full flex items-center gap-2 text-left">
        <span className="text-[11px] text-brand-300 w-3">{abierta ? '▾' : '▸'}</span>
        <span className="text-xs font-semibold text-brand-500 flex-1">{titulo}</span>
        {resumen && !abierta && (
          <span className="text-[11px] text-brand-300 truncate max-w-[55%]">{resumen}</span>
        )}
      </button>
      {abierta && <div className="mt-2">{children}</div>}
    </div>
  );
}
