import { useEffect, useRef, useState } from 'react';
import Icono from './Icono.js';

/**
 * Lo que se espera antes de buscar.
 *
 * No es un número elegido a ojo: es el mismo que ya usa `MarketplacePage` para sus
 * filtros de columna, cuatro veces, en el mismo fichero donde **no** retardaba el
 * buscador. Alguien vio la necesidad y la cubrió a medias; esto cierra la otra mitad.
 */
export const RETARDO_MS = 350;

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * El buscador, que ya no pide una vez por tecla.
 *
 * ## Lo que pasaba
 *
 * Esto llamaba a `onChange` en cada pulsación, y las **seis** pantallas que lo usan
 * mandan ese texto al servidor como dependencia de un efecto: `ConsentimientosPage`,
 * `UsersPage`, `TicketsPage`, `AppointmentsPage`, `IdCarsPage` y `MarketplacePage`.
 *
 * Escribir «garcia» eran **seis consultas paginadas** contra Neon. Y ninguna se puede
 * cancelar, porque `api.get` no tiene `AbortController`, así que las seis se ejecutan
 * enteras y **gana la última que llega**, que no tiene por qué ser la de «garcia».
 *
 * Lo que ve quien lo usa: el cuadro dice «garcia» y la lista es la de «ga». Y como el
 * `finally` de la primera respuesta apaga la rueda, **parece que ya terminó**.
 *
 * En `ConsentimientosPage` eso no es un parpadeo: la pregunta es si una persona aceptó
 * el tratamiento de sus datos, y enseñar la fila de otra es una respuesta equivocada a
 * una pregunta legal.
 *
 * ## Lo que esto arregla, y lo que no
 *
 * Arregla el volumen: de seis peticiones a una. Y con ella, casi todo el adelantamiento,
 * porque para que dos se crucen hay que teclear otra letra **y** que la respuesta tarde
 * más de 350 ms.
 *
 * **No lo elimina.** Mientras `api.get` no sepa cancelar, dos respuestas pueden seguir
 * llegando al revés si el servidor va lento. El arreglo completo es un `AbortController`
 * en el cliente, o un contador de peticiones en cada pantalla —como el que ya usa
 * `BuscarCochePage` de PopCar: `const mio = ++peticion.current`—. Queda dicho aquí para
 * que no se dé por cerrado.
 */
export function SearchInput({ value, onChange, placeholder = 'Buscar…', className = '' }: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  /*
   * Lo que se ve y lo que se ha mandado son dos cosas distintas.
   *
   * El campo tiene que responder a cada tecla —si no, se escribe a trompicones— y el
   * servidor no. Así que el texto vive aquí y sube con retardo.
   */
  const [texto, setTexto] = useState(value);

  /*
   * El manejador, en un `ref`.
   *
   * Los padres lo pasan como función anónima, así que cambia de identidad en cada
   * repintado. Metido en las dependencias del efecto, el temporizador se reiniciaría en
   * cada repintado y la búsqueda podría no salir nunca.
   */
  const alCambiar = useRef(onChange);
  useEffect(() => { alCambiar.current = onChange; });

  /*
   * Si el padre cambia el valor por su cuenta, manda él.
   *
   * Pasa de verdad: «limpiar filtros» pone `q` a vacío desde fuera. Sin esto, el campo
   * seguiría enseñando lo que había.
   */
  useEffect(() => { setTexto(value); }, [value]);

  useEffect(() => {
    if (texto === value) return undefined;
    const t = setTimeout(() => alCambiar.current(texto), RETARDO_MS);
    return () => clearTimeout(t);
  }, [texto, value]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300"><Icono nombre="buscar" tam={15} /></span>
      <input
        ref={ref}
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        /*
         * Intro busca ya.
         *
         * Quien escribe y pulsa Intro espera que pase algo **ahora**. Esperarle 350 ms
         * más después de haberlo pedido explícitamente es justo lo que hace que un
         * retardo se sienta como lentitud en vez de como que va solo.
         */
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            alCambiar.current(e.currentTarget.value);
          }
        }}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 text-sm border border-brand-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-acento focus:border-transparent"
      />
    </div>
  );
}
