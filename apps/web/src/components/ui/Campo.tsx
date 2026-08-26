import { useId } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

/**
 * Los campos de formulario del ERP.
 *
 * Existen sobre todo por un numero: hay 169 <input> en la aplicacion y solo 6
 * `htmlFor`. Es decir, casi ciento cincuenta etiquetas estan al lado de su
 * campo pero no unidas a el.
 *
 * Eso no es un detalle de accesibilidad abstracto: hacer clic en la palabra
 * «Provincia» no lleva al campo. En una pantalla de alta de datos son cientos
 * de clics fallidos a la semana. Y para quien use lector de pantalla, un
 * formulario asi es sencillamente inservible.
 *
 * Aqui la union se hace sola con useId(), asi que no hay forma de olvidarla.
 */

interface Comun {
  etiqueta: string;
  /** Explicacion breve bajo el campo. */
  ayuda?: string;
  /** Si hay error, se dice aqui y el campo queda marcado. */
  error?: string;
  requerido?: boolean;
  className?: string;
}

function Envoltorio({
  id, etiqueta, ayuda, error, requerido, className = '', children,
}: Comun & { id: string; children: ReactNode }) {
  const idAyuda = ayuda ? id + '-ayuda' : undefined;
  const idError = error ? id + '-error' : undefined;
  return (
    <div className={'flex flex-col gap-1.5 ' + className}>
      <label htmlFor={id} className="text-[13px] font-semibold text-brand-500">
        {etiqueta}
        {requerido && <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>}
      </label>
      {children}
      {ayuda && !error && (
        <p id={idAyuda} className="text-[12px] text-brand-300 leading-snug">{ayuda}</p>
      )}
      {error && (
        <p id={idError} className="text-[12px] text-red-600 leading-snug" role="alert">{error}</p>
      )}
    </div>
  );
}

const CAJA =
  'h-10 w-full rounded-lg border bg-white px-3 text-sm text-brand-600 ' +
  'placeholder:text-brand-300 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-acento focus:border-acento ' +
  'disabled:bg-brand-50 disabled:text-brand-300 disabled:cursor-not-allowed';

const borde = (error?: string) => (error ? 'border-red-400' : 'border-brand-200');

// ── Texto, numero, fecha… ────────────────────────────────────────────────────
export interface PropsCampo extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>, Comun {}

export function Campo({ etiqueta, ayuda, error, requerido, className, ...resto }: PropsCampo) {
  const id = useId();
  return (
    <Envoltorio id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} requerido={requerido} className={className}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? id + '-error' : ayuda ? id + '-ayuda' : undefined}
        required={requerido}
        className={CAJA + ' ' + borde(error)}
        {...resto}
      />
    </Envoltorio>
  );
}

// ── Desplegable ──────────────────────────────────────────────────────────────
export interface PropsSelector extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>, Comun {
  opciones: { valor: string; texto: string }[];
  /** Texto de la opcion vacia. Si no se pasa, no hay opcion vacia. */
  vacio?: string;
}

export function Selector({
  etiqueta, ayuda, error, requerido, className, opciones, vacio, ...resto
}: PropsSelector) {
  const id = useId();
  return (
    <Envoltorio id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} requerido={requerido} className={className}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? id + '-error' : ayuda ? id + '-ayuda' : undefined}
        required={requerido}
        className={CAJA + ' ' + borde(error) + ' pr-8'}
        {...resto}
      >
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>{o.texto}</option>
        ))}
      </select>
    </Envoltorio>
  );
}

// ── Texto largo ──────────────────────────────────────────────────────────────
export interface PropsArea extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>, Comun {}

export function Area({ etiqueta, ayuda, error, requerido, className, rows = 3, ...resto }: PropsArea) {
  const id = useId();
  return (
    <Envoltorio id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} requerido={requerido} className={className}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? id + '-error' : ayuda ? id + '-ayuda' : undefined}
        required={requerido}
        className={CAJA.replace('h-10', 'min-h-20 py-2') + ' ' + borde(error)}
        {...resto}
      />
    </Envoltorio>
  );
}
