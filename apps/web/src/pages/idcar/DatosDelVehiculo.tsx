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

/** Lo que devuelve el lector de la ficha técnica. Nada de esto se guarda solo. */
interface Diferencia {
  clave: string;
  etiqueta: string;
  ahora: string;
  segunLaFicha: string;
  corrige: boolean;
}
/** Una versión que ese motor puede tener, sacada de nuestros anuncios. */
interface Candidata {
  version: string;
  anuncios: number;
  cv: number | null;
  desde: number | null;
  hasta: number | null;
}

interface LaFicha {
  documento: string;
  confianza: string;
  versiones?: Candidata[];
  version_actual?: string;
  /** Por qué no se pudo leer. Vacío cuando se leyó bien. */
  fallo?: string;
  diferencias: Diferencia[];
  avisos: string[];
  no_lo_trae: string[];
  no_es_una_ficha?: boolean;
  detail?: string;
}

/**
 * Por qué no se ha podido leer, en una frase que diga qué hacer.
 *
 * Sin esto, una lectura fallida llegaba con la lista de diferencias vacía y la
 * pantalla decía «todo coincide, no hay nada que corregir» — que es lo
 * contrario de lo que pasa, y el peor sitio donde equivocarse: quien lo lee da
 * por comprobado un coche que no se ha mirado.
 */
function porQueNoSeHaLeido(fallo: string): string {
  if (fallo === 'sin_lector') return 'Falta configurar la clave del lector de fichas técnicas (GEMINI_API_KEY).';
  if (fallo === 'sin_fichero' || fallo === 'no_se_ha_podido_bajar') return 'No hemos podido abrir el documento subido.';
  if (fallo === 'fichero_vacio') return 'El documento subido está vacío.';
  if (fallo === 'fichero_demasiado_grande') return 'El documento pesa demasiado para leerlo.';
  if (fallo === 'no_se_ha_podido_leer') return 'El lector no ha podido con ese documento. Puede estar borroso o cortado.';
  return `No se ha podido leer la ficha técnica (${fallo}).`;
}

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

  /*
   * Lo que dice la ficha técnica.
   *
   * Se lee cuando alguien lo pide, no al abrir la pantalla: cada lectura es una
   * llamada al lector y la mayoría de las veces nadie va a corregir nada.
   */
  const [leyendo, setLeyendo] = useState(false);
  const [ficha, setFicha] = useState<LaFicha | null>(null);
  const [aplicar, setAplicar] = useState<Record<string, boolean>>({});

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

  /** Pedir que se lea la ficha técnica subida. */
  async function leeLaFicha() {
    setLeyendo(true);
    setAviso(null);
    setFicha(null);
    try {
      const r = await api.post<LaFicha & { detail?: string }>(`/idcars/${vehicleId}/ficha-tecnica/leer`, {});
      if (!r.ok) {
        const d = r.data as { detail?: string } | undefined;
        setAviso({ ok: false, texto: d?.detail || 'No se ha podido leer la ficha técnica.' });
        return;
      }
      setFicha(r.data);
      // Vienen marcadas las que corrigen algo: es lo que se venía a hacer. Las
      // que ya coinciden se enseñan para poder decir que se han comprobado.
      const marcadas: Record<string, boolean> = {};
      for (const d of r.data.diferencias) marcadas[d.clave] = d.corrige;
      setAplicar(marcadas);
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setLeyendo(false);
    }
  }

  /**
   * Poner una de las versiones que su motor puede tener.
   *
   * Escribe por el mismo sitio que todo lo demás. Es un clic aparte y no una
   * casilla más de la tabla porque es **elegir entre varias**, no aceptar o
   * rechazar un dato: el motor no distingue acabados, así que aquí decide la
   * persona con lo que sepa del coche.
   */
  async function ponLaVersion(version: string) {
    setGuardando(true);
    setAviso(null);
    try {
      const r = await api.patch<Vehiculo & { detail?: string }>(`/idcars/${vehicleId}`, { version });
      if (!r.ok) {
        const d = r.data as { detail?: string } | undefined;
        setAviso({ ok: false, texto: d?.detail || 'No se ha podido guardar.' });
        return;
      }
      alGuardar(r.data);
      setFicha((f) => (f ? { ...f, version_actual: version } : f));
      setAviso({ ok: true, texto: `Versión puesta: ${version}.` });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  /** Llevar al coche lo elegido de la ficha. Escribe el mismo sitio que «Guardar». */
  async function aplicaLaFicha() {
    const cambios: Record<string, string> = {};
    for (const d of ficha?.diferencias ?? []) {
      if (aplicar[d.clave] && d.corrige) cambios[d.clave] = d.segunLaFicha;
    }
    if (!Object.keys(cambios).length) { setFicha(null); return; }

    setGuardando(true);
    setAviso(null);
    try {
      const r = await api.patch<Vehiculo & { detail?: string }>(`/idcars/${vehicleId}`, cambios);
      if (!r.ok) {
        const d = r.data as { detail?: string } | undefined;
        setAviso({ ok: false, texto: d?.detail || 'No se ha podido guardar.' });
        return;
      }
      const cuerpo = r as unknown as { anuncio_actualizado?: boolean };
      alGuardar(r.data);
      setFicha(null);
      const cuantos = Object.keys(cambios).length;
      setAviso({
        ok: true,
        texto: `${cuantos === 1 ? 'Un dato corregido' : `${cuantos} datos corregidos`} con la ficha técnica.` +
          (cuerpo.anuncio_actualizado ? ' El anuncio publicado ya lo enseña.' : ''),
      });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setGuardando(false);
    }
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
          <div className="flex gap-3">
            {/*
              * Leer la ficha técnica en vez de teclearla.
              *
              * El cliente copia el número que ve sin saber la unidad: en el
              * T-Roc puso «110 CV» de un coche que en su propia versión dice
              * «110 kW», que son 150. El papel lo dice sin opinión.
              */}
            <button type="button" onClick={() => void leeLaFicha()} disabled={leyendo || guardando}
              className="text-xs text-brand-400 hover:text-brand-600 font-medium disabled:opacity-50">
              {leyendo ? 'Leyendo la ficha…' : 'Leer la ficha técnica'}
            </button>
            <button type="button" onClick={empieza} disabled={!campos.length}
              className="text-xs text-acento-texto font-medium disabled:opacity-50">
              Editar
            </button>
          </div>
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

      {ficha && <PanelDeLaFicha
        ficha={ficha}
        aplicar={aplicar}
        setAplicar={setAplicar}
        guardando={guardando}
        alAplicar={() => void aplicaLaFicha()}
        alPonerVersion={(v) => void ponLaVersion(v)}
        alCerrar={() => setFicha(null)}
      />}

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

/**
 * Lo que dice la ficha técnica, al lado de lo que hay puesto.
 *
 * Las dos columnas juntas, y una casilla por fila. Nada se guarda hasta que
 * alguien pulsa: un OCR que pisa datos porque cree haber leído bien es peor que
 * no tenerlo — el error que mete no lo revisa nadie, porque ya viene
 * «comprobado».
 */
function PanelDeLaFicha({
  ficha, aplicar, setAplicar, guardando, alAplicar, alPonerVersion, alCerrar,
}: {
  ficha: LaFicha;
  aplicar: Record<string, boolean>;
  setAplicar: (f: (x: Record<string, boolean>) => Record<string, boolean>) => void;
  guardando: boolean;
  alAplicar: () => void;
  alPonerVersion: (v: string) => void;
  alCerrar: () => void;
}) {
  const corrigen = ficha.diferencias.filter((d) => d.corrige);
  const coinciden = ficha.diferencias.filter((d) => !d.corrige);
  const marcados = corrigen.filter((d) => aplicar[d.clave]).length;

  return (
    <div className="mb-4 border border-brand-200 rounded-lg p-3 bg-brand-50/50">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand-600">Lo que dice la ficha técnica</p>
          {ficha.documento && (
            <p className="text-[11px] text-brand-300 truncate">{ficha.documento}</p>
          )}
        </div>
        <button type="button" onClick={alCerrar} className="text-brand-300 hover:text-brand-500 text-sm leading-none">×</button>
      </div>

      {ficha.fallo ? (
        <p className="text-[11.5px] text-red-700 leading-snug">
          {porQueNoSeHaLeido(ficha.fallo)} No se ha comprobado ningún dato del coche.
        </p>
      ) : ficha.no_es_una_ficha ? (
        <p className="text-[11.5px] text-amber-700 leading-snug">
          {ficha.detail ?? 'De ese documento no sale ningún dato de ficha técnica.'}
        </p>
      ) : (
        <>
          {ficha.confianza === 'baja' && (
            <p className="mb-2 text-[11.5px] text-amber-700 leading-snug">
              El documento se lee mal. Repasa cada dato antes de aplicarlo.
            </p>
          )}

          {corrigen.length === 0 ? (
            <p className="text-[11.5px] text-emerald-700 leading-snug">
              Todo lo que trae la ficha coincide con lo que hay puesto. No hay nada que corregir.
            </p>
          ) : (
            <table className="w-full text-[11.5px] mb-2">
              <thead>
                <tr className="text-brand-300 text-left">
                  <th className="font-normal w-6" />
                  <th className="font-normal">Dato</th>
                  <th className="font-normal">Ahora</th>
                  <th className="font-normal">La ficha dice</th>
                </tr>
              </thead>
              <tbody>
                {corrigen.map((d) => (
                  <tr key={d.clave} className="border-t border-brand-100">
                    <td className="py-1">
                      <input
                        type="checkbox"
                        id={`fic-${d.clave}`}
                        checked={Boolean(aplicar[d.clave])}
                        onChange={(e) => setAplicar((x) => ({ ...x, [d.clave]: e.target.checked }))}
                      />
                    </td>
                    <td className="py-1">
                      <label htmlFor={`fic-${d.clave}`} className="text-brand-500">{d.etiqueta}</label>
                    </td>
                    {/* Lo vacío se dice, no se deja en blanco: «—» es «no había nada». */}
                    <td className="py-1 text-brand-400">{d.ahora || '—'}</td>
                    <td className="py-1 text-brand-600 font-medium">{d.segunLaFicha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {coinciden.length > 0 && (
            <p className="text-[11px] text-brand-300 leading-snug mb-2">
              Comprobados y correctos: {coinciden.map((d) => d.etiqueta.toLowerCase()).join(', ')}.
            </p>
          )}

          {ficha.avisos.map((a) => (
            <p key={a} className="text-[11px] text-amber-700 leading-snug mb-1">{a}</p>
          ))}

          {/*
            * Las versiones que ese motor puede tener.
            *
            * La versión no viene en ningún papel del coche y es lo que decide
            * con qué coches se compara el suyo al tasarlo. Estas salen de
            * nuestros propios anuncios cruzando la cilindrada y los kilovatios
            * de la ficha — que son, además, los anuncios contra los que se le
            * compara.
            *
            * Se ofrecen, no se eligen: cilindrada y potencia no distinguen
            * acabados, y poner una por él seria cambiar su error por el
            * nuestro, que viene con pinta de comprobado.
            */}
          {(ficha.versiones?.length ?? 0) > 0 && (
            <div className="mt-3 pt-2 border-t border-brand-100">
              <p className="text-[11.5px] font-semibold text-brand-600 mb-0.5">
                Versiones con este motor
              </p>
              <p className="text-[11px] text-brand-300 leading-snug mb-1.5">
                De nuestros anuncios, cruzando la cilindrada y los kilovatios de la ficha.
                El motor no distingue acabados: elige la que sea.
              </p>
              <ul className="space-y-0.5">
                {(ficha.versiones ?? []).map((v) => {
                  const suya = comoSeCompara(v.version) === comoSeCompara(ficha.version_actual);
                  return (
                    <li key={v.version} className="flex items-center gap-2 text-[11.5px]">
                      <button
                        type="button"
                        disabled={guardando || suya}
                        onClick={() => alPonerVersion(v.version)}
                        className={`text-left ${suya ? 'text-brand-400' : 'text-acento-texto hover:underline'} disabled:no-underline`}
                      >
                        {v.version}
                      </button>
                      <span className="text-brand-300">
                        {v.cv ? `${v.cv} CV · ` : ''}{v.anuncios} anuncios
                        {v.desde && v.hasta ? ` · ${v.desde === v.hasta ? v.desde : `${v.desde}-${v.hasta}`}` : ''}
                        {suya ? ' · la que tiene puesta' : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {ficha.no_lo_trae.length > 0 && (
            <p className="text-[11px] text-brand-300 leading-snug">
              La ficha técnica no lleva: {ficha.no_lo_trae.map((x) => x.toLowerCase()).join(', ')}. Eso se pone a mano.
            </p>
          )}

          {corrigen.length > 0 && (
            <div className="flex items-center gap-3 mt-3">
              <button
                type="button"
                onClick={alAplicar}
                disabled={guardando || marcados === 0}
                className="text-xs bg-brand-600 text-white px-3 py-1 rounded-md hover:bg-brand-700 disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : marcados === 1 ? 'Corregir 1 dato' : `Corregir ${marcados} datos`}
              </button>
              <span className="text-[11px] text-brand-300">Solo se cambia lo que dejes marcado.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Dos versiones son la misma si se leen igual.
 *
 * «1.5 TSI Advance DSG7» y «1.5 TSI Advance DSG-7» son la misma versión escrita
 * por dos portales distintos. Sin esto, la que ya tiene puesta le saldría como
 * una opción nueva, y eso hace dudar del resto de la lista.
 *
 * Gemela de `comoSeCompara` en `lib/versiones-posibles.ts`, que es la que hace
 * el mismo trabajo en la consulta.
 */
function comoSeCompara(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
