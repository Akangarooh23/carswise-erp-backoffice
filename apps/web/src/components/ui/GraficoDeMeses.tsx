/**
 * Doce meses de ingresos, gastos y margen.
 *
 * Un número suelto —«19.937 € este año»— no dice si el negocio sube, baja o
 * vive de un mes bueno de junio. La forma sí, y la forma solo se ve en una
 * serie. Por eso el panel abre con la cifra y sigue con el dibujo: la cifra
 * contesta cuánto y el dibujo contesta cómo va.
 *
 * Hecho a mano en SVG y sin librería. Una de gráficos son doscientos kilobytes
 * y una dependencia que actualizar para dibujar veinticuatro rectángulos y una
 * línea, y aquí no hace falta ni zoom ni animación ni ejes logarítmicos.
 *
 * ## Cómo se lee
 *
 * Barra negra el ingreso, barra gris el gasto, y encima la línea amarilla del
 * margen, que es lo que queda. Cuando la línea baja del eje, ese mes se perdió
 * dinero, y se ve sin leer ningún número.
 */

export interface MesDelGrafico {
  /** `2026-09`. */
  mes: string;
  ingresos: number;
  gastos: number;
  margen: number;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function nombreDelMes(mes: string): string {
  const n = Number(String(mes).slice(5, 7));
  return MESES_CORTOS[n - 1] ?? '';
}

/** `16685.95` → `16,7 k`. Un eje con todos los ceros no se lee. */
function corto(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) {
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: a >= 10000 ? 0 : 1 })
      .format(n / 1000) + ' k';
  }
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n);
}

const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

// El lienzo es fijo y el SVG escala solo: así las proporciones no dependen del
// ancho de la pantalla y el texto no se estira.
const ANCHO = 720;
const ALTO = 240;
const MARGEN = { arriba: 14, abajo: 26, izquierda: 46, derecha: 8 };

export default function GraficoDeMeses({ meses }: { meses: readonly MesDelGrafico[] }) {
  if (!meses.length) return null;

  const dentroAncho = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const dentroAlto = ALTO - MARGEN.arriba - MARGEN.abajo;

  const techo = Math.max(...meses.map((m) => Math.max(m.ingresos, m.gastos, m.margen)), 0);
  const suelo = Math.min(...meses.map((m) => m.margen), 0);
  // Sin datos el eje sería de cero a cero y todo caería sobre la misma línea.
  const recorrido = techo - suelo || 1;

  const y = (v: number) => MARGEN.arriba + dentroAlto * (1 - (v - suelo) / recorrido);
  const anchoDelMes = dentroAncho / meses.length;
  const anchoBarra = Math.min(14, (anchoDelMes - 6) / 2);
  const centro = (i: number) => MARGEN.izquierda + anchoDelMes * (i + 0.5);

  const cero = y(0);
  // Cuatro rayas y las de verdad: siempre el cero, para que un mes en pérdidas
  // se vea cruzando una línea y no por el color.
  const rayas = [...new Set([suelo, suelo + recorrido / 3, suelo + (recorrido * 2) / 3, techo, 0])]
    .filter((v) => v >= suelo && v <= techo);

  const linea = meses.map((m, i) => `${centro(i)},${y(m.margen)}`).join(' ');

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full h-auto" role="img"
           aria-label={`Ingresos, gastos y margen de ${meses.length} meses`}>
        {rayas.map((v) => (
          <g key={v}>
            <line x1={MARGEN.izquierda} x2={ANCHO - MARGEN.derecha} y1={y(v)} y2={y(v)}
                  stroke={v === 0 ? '#C9C7C0' : '#E4E4DF'} strokeWidth={v === 0 ? 1 : 1}
                  strokeDasharray={v === 0 ? undefined : '3 3'} />
            <text x={MARGEN.izquierda - 6} y={y(v) + 3.5} textAnchor="end"
                  fontSize="9.5" fill="#96968F" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {corto(v)}
            </text>
          </g>
        ))}

        {meses.map((m, i) => {
          const x = centro(i);
          return (
            <g key={m.mes}>
              {/* El título nativo: pasar el ratón por encima da la cifra exacta
                  sin tener que montar un tooltip que en un móvil no se abre. */}
              <title>
                {`${nombreDelMes(m.mes)} ${m.mes.slice(0, 4)} · ingresos ${euros(m.ingresos)} · gastos ${euros(m.gastos)} · margen ${euros(m.margen)}`}
              </title>
              <rect x={x - anchoBarra - 1} y={y(m.ingresos)} width={anchoBarra}
                    height={Math.max(0, cero - y(m.ingresos))} fill="#111111" rx="1.5" />
              <rect x={x + 1} y={y(m.gastos)} width={anchoBarra}
                    height={Math.max(0, cero - y(m.gastos))} fill="#C9C7C0" rx="1.5" />
              <text x={x} y={ALTO - 8} textAnchor="middle" fontSize="10" fill="#96968F">
                {nombreDelMes(m.mes)}
              </text>
            </g>
          );
        })}

        <polyline points={linea} fill="none" stroke="#FFC400" strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" />
        {meses.map((m, i) => (
          <circle key={m.mes} cx={centro(i)} cy={y(m.margen)} r="3"
                  fill="#FFC400" stroke="#111111" strokeWidth="1" />
        ))}
      </svg>

      <figcaption className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-brand-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-brand-600" /> ingresos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-brand-200" /> gastos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-[3px] rounded-full bg-acento" /> margen
        </span>
        <span className="text-brand-300">todo sin IVA</span>
      </figcaption>
    </figure>
  );
}
