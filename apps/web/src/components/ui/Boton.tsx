import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Icono, { type NombreIcono } from './Icono.js';

/**
 * El boton del ERP.
 *
 * Antes no habia ninguno: cada pantalla escribia sus clases a mano, y por eso
 * conviven cinco estilos distintos de boton y el azul aparece 303 veces suelto
 * por el codigo. Con esta pieza, cambiar el color de la marca es tocar un
 * fichero en vez de trescientos sitios.
 *
 * Las variantes no son decorativas, dicen que hacer:
 *
 *   acento      la accion principal de la pantalla. Amarillo con letra negra.
 *               Una por pantalla; si hay dos, ninguna destaca.
 *   primario    acciones importantes que no son LA accion. Negro sobre blanco.
 *   secundario  lo habitual: guardar un filtro, exportar, abrir algo.
 *   fantasma    cancelar, cerrar, volver. No debe pesar.
 *   peligro     borrar. Rojo, y siempre detras de una confirmacion.
 *
 * El amarillo va con texto negro siempre. Es la regla de la marca y ademas la
 * unica forma de que se lea: amarillo con blanco encima no llega al contraste
 * minimo ni de lejos.
 */

type Variante = 'acento' | 'primario' | 'secundario' | 'fantasma' | 'peligro';
type Tamano = 'sm' | 'md';

export interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tam?: Tamano;
  icono?: NombreIcono;
  /** Deshabilita y muestra que esta trabajando. */
  cargando?: boolean;
  /** Ocupa todo el ancho disponible. */
  ancho?: boolean;
  children?: ReactNode;
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold ' +
  'transition-colors select-none whitespace-nowrap ' +
  // El foco se ve. Sin esto no se puede recorrer el ERP con el teclado, que es
  // justo lo que hace rapido a quien lo usa ocho horas.
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-acento focus-visible:ring-offset-white ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const VARIANTES: Record<Variante, string> = {
  acento:     'bg-acento text-brand-700 hover:bg-acento-oscuro',
  primario:   'bg-brand-600 text-white hover:bg-brand-700',
  secundario: 'bg-white text-brand-600 border border-brand-200 hover:bg-brand-50',
  fantasma:   'bg-transparent text-brand-400 hover:bg-brand-50 hover:text-brand-600',
  peligro:    'bg-red-600 text-white hover:bg-red-700',
};

const TAMANOS: Record<Tamano, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
};

export default function Boton({
  variante = 'secundario',
  tam = 'md',
  icono,
  cargando = false,
  ancho = false,
  className = '',
  disabled,
  children,
  ...resto
}: PropsBoton) {
  return (
    <button
      type="button"
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={[BASE, VARIANTES[variante], TAMANOS[tam], ancho ? 'w-full' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...resto}
    >
      {cargando ? (
        <svg
          className="animate-spin shrink-0"
          width={tam === 'sm' ? 14 : 16}
          height={tam === 'sm' ? 14 : 16}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ) : icono ? (
        <Icono nombre={icono} tam={tam === 'sm' ? 14 : 16} className="shrink-0" />
      ) : null}
      {children}
    </button>
  );
}
