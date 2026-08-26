import { DESTINOS } from './PaletaComandos.js';
import type { Role } from '../../types/index.js';

/**
 * La chuleta de atajos, con «?».
 *
 * Un atajo que nadie conoce no ahorra tiempo a nadie. Esta pantalla existe para
 * que se puedan descubrir sin tener que leer documentacion ni preguntar.
 */

const GENERALES: [string, string][] = [
  ['Ctrl K', 'Ir a cualquier sección'],
  ['g + letra', 'Ir directo, sin abrir nada'],
  ['/', 'Saltar al buscador de la pantalla'],
  ['?', 'Ver esta ayuda'],
  ['Esc', 'Cerrar lo que esté abierto'],
  ['Tab', 'Recorrer los botones de la pantalla'],
];

function Tecla({ children }: { children: string }) {
  return (
    <kbd className="inline-block min-w-[26px] text-center font-mono text-[11px] font-semibold
                    text-brand-500 bg-white border border-brand-200 rounded px-1.5 py-0.5
                    shadow-[0_1px_0_theme(colors.brand.200)]">
      {children}
    </kbd>
  );
}

export default function AyudaAtajos({
  abierta, cerrar, rol,
}: { abierta: boolean; cerrar: () => void; rol: Role }) {
  if (!abierta) return null;
  const conAtajo = DESTINOS.filter((d) => d.atajo && d.roles.includes(rol));

  return (
    <div
      className="fixed inset-0 z-[100] bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4"
      onClick={cerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Atajos de teclado"
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-brand-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-brand-100 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold text-brand-600">Atajos de teclado</h2>
          <p className="text-[12px] text-brand-300">
            Cierra con <Tecla>Esc</Tecla>
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6 px-6 py-5">
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-brand-300 mb-3">General</h3>
            <ul className="space-y-2">
              {GENERALES.map(([t, q]) => (
                <li key={t} className="flex items-center gap-3 text-[13px] text-brand-500">
                  <span className="w-[76px] shrink-0">
                    {t.split(' ').map((k) => <Tecla key={k}>{k}</Tecla>)}
                  </span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-brand-300 mb-3">
              Ir directo · pulsa <Tecla>g</Tecla> y luego
            </h3>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
              {conAtajo.map((d) => (
                <li key={d.a} className="flex items-center gap-2 text-[13px] text-brand-500">
                  <Tecla>{d.atajo!}</Tecla>
                  <span className="truncate">{d.nombre}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="px-6 py-3 border-t border-brand-100 bg-brand-50 text-[12px] text-brand-300">
          Ninguno funciona mientras escribes en un campo: si estás tecleando una
          matrícula, una «m» es una «m».
        </p>
      </div>
    </div>
  );
}
