/**
 * Lo que el perito vio roto, partida por partida.
 *
 * Dos formas de meterlo porque hay dos formas de recibirlo: **a mano**, cuando
 * son tres golpes que te cuenta por teléfono, y **pegado de una hoja**, cuando
 * el informe viene con veinte partidas. Teclear veinte a mano es donde se
 * pierden las tres últimas.
 *
 * Lo pegado **se enseña antes de guardarse**. Veinte partidas mal leídas en la
 * base son veinte borrados a mano; una vista previa es un vistazo. Es la misma
 * idea que la revisión de los correos: nada que cueste deshacer sale sin que
 * alguien lo haya visto.
 *
 * Y el total dice siempre cuántas van **sin valorar**. Un perito lista un golpe
 * y no siempre le pone precio; si esas partidas se cuentan como cero, el total
 * va corto justo en los coches peores, que son los que más caro salen si el
 * precio de reacondicionamiento se queda por debajo.
 */
import { useState } from 'react';
import { PARTIDAS_HABITUALES, resumenDeDanos, comoSeCuenta, type Dano } from '../lib/danos.js';

const eur = (n: unknown) =>
  (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';

interface LoLeido {
  danos: { pieza: string; coste: number | null; notas: string | null }[];
  malas: string[];
  /** Los puntos que venían a 0 €: revisados y sin daño. */
  revisadosSinDano?: number;
}

export default function DanosDelCoche({
  danos, guardando, onApuntar, onCorregir, onQuitar, onPegar, onGuardarPegado,
}: {
  danos: Dano[];
  guardando: boolean;
  onApuntar: (d: { pieza: string; coste: string; notas: string }) => void;
  onCorregir: (danoId: string, d: Record<string, string>) => void;
  onQuitar: (danoId: string) => void;
  onPegar: (texto: string) => Promise<unknown>;
  onGuardarPegado: (texto: string) => void;
}) {
  const [nuevo, setNuevo] = useState({ pieza: '', coste: '', notas: '' });
  const [pegando, setPegando] = useState(false);
  const [texto, setTexto] = useState('');
  const [leido, setLeido] = useState<LoLeido | null>(null);
  const [leyendo, setLeyendo] = useState(false);

  const r = resumenDeDanos(danos);

  function apunta() {
    if (!nuevo.pieza.trim()) return;
    onApuntar(nuevo);
    setNuevo({ pieza: '', coste: '', notas: '' });
  }

  async function lee() {
    setLeyendo(true);
    try {
      const respuesta = await onPegar(texto) as { ok?: boolean; data?: LoLeido } & LoLeido;
      const d = (respuesta?.data ?? respuesta) as LoLeido;
      setLeido({
        danos: d?.danos ?? [],
        malas: d?.malas ?? [],
        revisadosSinDano: d?.revisadosSinDano ?? 0,
      });
    } finally {
      setLeyendo(false);
    }
  }

  function guardaLoPegado() {
    onGuardarPegado(texto);
    setTexto('');
    setLeido(null);
    setPegando(false);
  }

  return (
    <div className="mt-4 pt-3 border-t border-brand-200">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-semibold text-brand-600">Los daños que vio</div>
        <button onClick={() => { setPegando((v) => !v); setLeido(null); }}
                className="text-[11px] text-brand-400 underline underline-offset-2">
          {pegando ? 'meterlos a mano' : 'pegar de una hoja'}
        </button>
      </div>

      {danos.length > 0 && (
        <div className="mb-2 rounded-lg border border-brand-200 divide-y divide-brand-100">
          {danos.map((d) => (
            <div key={d.id} className="flex items-center gap-2 px-2 py-1.5">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-brand-600 truncate">{d.pieza}</div>
                {d.notas && <div className="text-[11px] text-brand-300 truncate">{d.notas}</div>}
              </div>
              {/*
                * El importe se corrige aquí mismo: es lo que más cambia cuando
                * llega el informe de verdad. Vacío vuelve a ser «sin valorar»,
                * no un cero.
                */}
              <input
                defaultValue={d.coste === null || d.coste === '' ? '' : String(d.coste)}
                inputMode="decimal" placeholder="sin valorar"
                onBlur={(e) => {
                  const antes = d.coste === null || d.coste === '' ? '' : String(d.coste);
                  if (e.target.value.trim() !== antes) onCorregir(d.id, { coste: e.target.value });
                }}
                className="w-24 px-2 py-1 text-[13px] text-right border border-brand-200 rounded" />
              <button onClick={() => onQuitar(d.id)} disabled={guardando}
                      title="Quitar esta partida"
                      className="text-brand-300 hover:text-red-600 text-base leading-none px-1">×</button>
            </div>
          ))}
        </div>
      )}

      <div className={`text-[13px] font-bold mb-2 ${r.sinValorar ? 'text-amber-700' : 'text-brand-600'}`}>
        {comoSeCuenta(r)}
      </div>
      {r.cuantas > 0 && (
        <div className="text-[11px] text-brand-300 mb-2">
          Es lo que estima el perito, no un presupuesto de taller: se repara aquí,
          con otros precios. Sirve para no quedarse corto al dar el
          reacondicionamiento.
        </div>
      )}

      {!pegando ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input list="partidas-habituales" value={nuevo.pieza} placeholder="Qué pieza"
                   onChange={(e) => setNuevo((d) => ({ ...d, pieza: e.target.value }))}
                   onKeyDown={(e) => { if (e.key === 'Enter') apunta(); }}
                   className="col-span-2 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            <input value={nuevo.coste} inputMode="decimal" placeholder="Coste"
                   onChange={(e) => setNuevo((d) => ({ ...d, coste: e.target.value }))}
                   onKeyDown={(e) => { if (e.key === 'Enter') apunta(); }}
                   className="px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </div>
          {/* La lista es una ayuda, no una jaula: se puede escribir cualquier otra. */}
          <datalist id="partidas-habituales">
            {PARTIDAS_HABITUALES.map((x) => <option key={x} value={x} />)}
          </datalist>
          <button onClick={apunta} disabled={guardando || !nuevo.pieza.trim()}
                  className="w-full px-4 py-2 text-sm font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-40">
            Añadir la partida
          </button>
          <div className="text-[11px] text-brand-300">
            Sin coste también se puede: verlo y no valorarlo es lo normal.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea value={texto} rows={5}
                    placeholder={'Pega aquí las columnas del Excel:\nParagolpes delantero\t480\nFaro izquierdo\t610,50'}
                    onChange={(e) => { setTexto(e.target.value); setLeido(null); }}
                    className="w-full px-3 py-2 text-sm font-mono border border-brand-200 rounded-lg" />
          {!leido ? (
            <button onClick={() => void lee()} disabled={leyendo || !texto.trim()}
                    className="w-full px-4 py-2 text-sm font-bold text-brand-600 border border-brand-300 rounded-lg hover:bg-brand-50 disabled:opacity-40">
              {leyendo ? 'Leyendo…' : 'Ver lo que se ha entendido'}
            </button>
          ) : (
            <>
              <div className="rounded-lg border border-brand-200 divide-y divide-brand-100 max-h-52 overflow-y-auto">
                {leido.danos.map((d, i) => (
                  <div key={`${d.pieza}-${i}`} className="flex items-center gap-2 px-2 py-1 text-[13px]">
                    <span className="flex-1 truncate text-brand-600">{d.pieza}</span>
                    <span className={d.coste === null ? 'text-amber-700 text-[11px]' : 'text-brand-500'}>
                      {d.coste === null ? 'sin valorar' : eur(d.coste)}
                    </span>
                  </div>
                ))}
              </div>
              {/*
                * Lo que ha entrado, y lo que no.
                *
                * Lo que manda el perito es una lista de comprobación de once
                * puntos, y daños hay dos. Si nueve líneas desaparecen sin
                * decir por qué, parece que se ha perdido algo.
                */}
              {(leido.revisadosSinDano ?? 0) > 0 && (
                <div className="text-[11px] text-brand-400">
                  {leido.revisadosSinDano} punto{leido.revisadosSinDano === 1 ? '' : 's'} más
                  {leido.revisadosSinDano === 1 ? ' venía' : ' venían'} a 0 €: revisados y sin daño,
                  no se guardan como partidas.
                </div>
              )}
              {leido.malas.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                  <strong>{leido.malas.length} línea{leido.malas.length === 1 ? '' : 's'} sin entender</strong>, y no
                  se van a guardar: {leido.malas.slice(0, 3).join(' · ')}
                  {leido.malas.length > 3 ? '…' : ''}
                </div>
              )}
              <button onClick={guardaLoPegado} disabled={guardando || !leido.danos.length}
                      className="w-full px-4 py-2 text-sm font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-40">
                Guardar {leido.danos.length} partida{leido.danos.length === 1 ? '' : 's'}
              </button>
            </>
          )}
          <div className="text-[11px] text-brand-300">
            Vale lo copiado de Excel, un CSV con punto y coma, o «pieza importe» por línea.
            La cabecera se salta sola.
          </div>
        </div>
      )}
    </div>
  );
}
