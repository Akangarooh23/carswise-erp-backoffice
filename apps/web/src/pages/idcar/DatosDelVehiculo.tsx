import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';

/**
 * Los datos del coche, y corregirlos.
 *
 * El cliente sube su coche y a veces lo deja a medias —sin cilindrada, sin CO₂—
 * o mal apuntado. Aquí se completa o se corrige, y **lo que se guarda llega al
 * anuncio** si está publicado: es donde lo lee el comprador.
 *
 * Qué campos hay y cómo se leen lo dice el servidor (`/idcars/campos/…`), que es
 * donde está la regla de cada uno. Tenerlos escritos también aquí sería una
 * segunda lista que un día diría otra cosa.
 */

interface Campo {
  clave: string;
  etiqueta: string;
  tipo: 'texto' | 'entero' | 'decimal' | 'fecha' | 'opcion' | 'matricula';
  opciones?: [string, string][];
  unidad?: string;
}

type Vehiculo = Record<string, unknown>;

/*
 * De dónde se lee cada uno para enseñarlo. Los kilómetros y el año se leen de
 * la columna de texto, que es la que escribe el cliente y la que se corrige
 * aquí: la de tipo se rellenaba una vez y podía estar vieja.
 */
const valorDe = (v: Vehiculo, clave: string): string => {
  const x = v[clave];
  if (x === null || x === undefined) return '';
  return String(x).trim();
};

/** Una fecha guardada puede venir con hora: el campo de fecha solo quiere el día. */
const soloElDia = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s);

function comoSeLee(c: Campo, valor: string): string {
  if (!valor) return '';
  if (c.tipo === 'opcion') {
    return c.opciones?.find(([k]) => k === valor.toLowerCase())?.[1] ?? valor;
  }
  if (c.tipo === 'fecha') {
    const d = new Date(`${soloElDia(valor)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? valor : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (c.tipo === 'entero' && c.clave !== 'year') {
    const n = Number(valor.replace(/[^\d]/g, ''));
    const cifra = Number.isFinite(n) ? n.toLocaleString('es-ES') : valor;
    return c.unidad ? `${cifra} ${c.unidad}` : cifra;
  }
  return c.unidad ? `${valor} ${c.unidad}` : valor;
}

export default function DatosDelVehiculo({
  vehicleId,
  vehiculo,
  hayEncargo,
  alGuardar,
}: {
  vehicleId: string;
  vehiculo: Vehiculo;
  /** Con encargo, el precio va por lo firmado y aquí no se toca. */
  hayEncargo: boolean;
  alGuardar: (v: Vehiculo) => void;
}) {
  const [campos, setCampos] = useState<Campo[]>([]);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    void api.get<{ campos: Campo[] }>('/idcars/campos/caracteristicas').then((r) => {
      if (r.ok) setCampos(r.data.campos);
    });
  }, []);

  const visibles = campos.filter((c) => !(hayEncargo && c.clave === 'price'));
  // Los que le faltan, para que se vea qué completar sin abrir el formulario.
  const vacios = visibles.filter((c) => !valorDe(vehiculo, c.clave));

  function empieza() {
    const inicial: Record<string, string> = {};
    for (const c of visibles) {
      const v = valorDe(vehiculo, c.clave);
      inicial[c.clave] = c.tipo === 'fecha' ? soloElDia(v) : c.tipo === 'opcion' ? v.toLowerCase() : v;
    }
    inicial.notes = valorDe(vehiculo, 'notes');
    setForm(inicial);
    setErrores({});
    setAviso(null);
    setEditando(true);
  }

  async function guarda() {
    setGuardando(true);
    setErrores({});
    setAviso(null);
    // Solo lo que ha cambiado: lo que no se toca no se reescribe.
    const cambios: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      const antes = k === 'notes' ? valorDe(vehiculo, k)
        : (() => { const c = visibles.find((x) => x.clave === k); const b = valorDe(vehiculo, k);
            return c?.tipo === 'fecha' ? soloElDia(b) : c?.tipo === 'opcion' ? b.toLowerCase() : b; })();
      if (v.trim() !== antes) cambios[k] = v;
    }
    if (!Object.keys(cambios).length) {
      setEditando(false);
      setGuardando(false);
      return;
    }
    try {
      const r = await api.patch<Vehiculo & { errores?: Record<string, string>; detail?: string }>(
        `/idcars/${vehicleId}`, cambios,
      );
      if (!r.ok) {
        const d = r.data as { errores?: Record<string, string>; detail?: string } | undefined;
        setErrores(d?.errores ?? {});
        setAviso({ ok: false, texto: d?.detail || 'No se ha podido guardar.' });
        return;
      }
      const cuerpo = r as unknown as { anuncio_actualizado?: boolean };
      alGuardar(r.data);
      setEditando(false);
      setAviso({
        ok: true,
        texto: cuerpo.anuncio_actualizado
          ? 'Guardado. El anuncio publicado ya lo enseña.'
          : 'Guardado.',
      });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-brand-600 text-sm">Datos del vehículo</h3>
        {!editando ? (
          <button type="button" onClick={empieza} disabled={!campos.length}
            className="text-xs text-acento-texto font-medium disabled:opacity-50">
            Editar
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => { setEditando(false); setAviso(null); setErrores({}); }}
              className="text-xs text-brand-400 hover:text-brand-500">Cancelar</button>
            <button type="button" onClick={() => void guarda()} disabled={guardando}
              className="text-xs bg-brand-600 text-white px-3 py-1 rounded-md hover:bg-brand-700 disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>

      {aviso && (
        <div className={`mb-3 text-xs font-medium px-3 py-2 rounded-md ${aviso.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {aviso.texto}
        </div>
      )}

      {!editando ? (
        <>
          <dl className="space-y-2 text-sm">
            {visibles.map((c) => {
              const valor = comoSeLee(c, valorDe(vehiculo, c.clave));
              return (
                <div key={c.clave} className="flex justify-between gap-2">
                  <dt className="text-brand-400 shrink-0">{c.etiqueta}</dt>
                  <dd className={`text-right ${valor ? 'text-brand-500' : 'text-brand-300'}`}>{valor || '—'}</dd>
                </div>
              );
            })}
          </dl>
          {vacios.length > 0 && (
            <p className="mt-3 text-[11.5px] text-amber-700 leading-snug">
              Sin rellenar: {vacios.map((c) => c.etiqueta.toLowerCase()).join(', ')}.
            </p>
          )}
          {valorDe(vehiculo, 'notes') && (
            <p className="mt-3 pt-3 border-t border-brand-100 text-xs text-brand-400 whitespace-pre-wrap">
              {valorDe(vehiculo, 'notes')}
            </p>
          )}
        </>
      ) : (
        <div className="space-y-2.5 text-sm">
          {visibles.map((c) => {
            const valor = form[c.clave] ?? '';
            const cambia = (x: string) => setForm((f) => ({ ...f, [c.clave]: x }));
            const clase = `flex-1 min-w-0 border rounded-md px-2 py-1 text-sm text-brand-500 focus:outline-none focus:ring-1 focus:ring-acento ${
              errores[c.clave] ? 'border-red-400' : 'border-brand-200'
            }`;
            // Un valor guardado que no está en la lista se enseña igual, para
            // no borrarlo sin querer al abrir el formulario.
            const opciones = c.opciones ?? [];
            const fuera = c.tipo === 'opcion' && valor && !opciones.some(([k]) => k === valor);
            return (
              <div key={c.clave}>
                <div className="flex items-center gap-2">
                  <label htmlFor={`dv-${c.clave}`} className="text-brand-400 w-28 shrink-0 text-xs">
                    {c.etiqueta}{c.unidad ? ` (${c.unidad})` : ''}
                  </label>
                  {c.tipo === 'opcion' ? (
                    <select id={`dv-${c.clave}`} value={valor} onChange={(e) => cambia(e.target.value)} className={clase}>
                      <option value="">—</option>
                      {fuera && <option value={valor}>{valor} (sin corregir)</option>}
                      {opciones.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  ) : (
                    <input
                      id={`dv-${c.clave}`}
                      type={c.tipo === 'fecha' ? 'date' : 'text'}
                      inputMode={c.tipo === 'entero' ? 'numeric' : c.tipo === 'decimal' ? 'decimal' : undefined}
                      value={valor}
                      onChange={(e) => cambia(e.target.value)}
                      className={clase}
                    />
                  )}
                </div>
                {errores[c.clave] && <p className="text-[11px] text-red-600 mt-0.5 pl-[7.5rem]">{errores[c.clave]}</p>}
              </div>
            );
          })}
          {hayEncargo && (
            <p className="text-[11px] text-brand-300">
              El precio de este coche va por el encargo: se cambia allí y se le vuelve a mandar para que lo firme.
            </p>
          )}
          <div>
            <label htmlFor="dv-notes" className="text-brand-400 text-xs block mb-1">Notas</label>
            <textarea
              id="dv-notes"
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full border border-brand-200 rounded-md px-2 py-1 text-sm text-brand-500 focus:outline-none focus:ring-1 focus:ring-acento resize-none"
            />
            <p className="text-[11px] text-brand-300 mt-1">
              Si el vehículo se publica en el marketplace, esto es lo que se ve como descripción del anuncio.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
