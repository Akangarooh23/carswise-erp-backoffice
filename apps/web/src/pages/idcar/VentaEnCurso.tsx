import { useState } from 'react';
import { api } from '../../api/client.js';

/**
 * La venta en curso: el comprador ha dicho «quiero comprarlo».
 *
 * Arriba del encargo y no abajo: mientras hay una venta abierta es lo único
 * que importa de ese coche. Enseña quién compra —con lo que hace falta para el
 * contrato— y el paso en que está, con el botón que le toca:
 *
 *   · Financiación en estudio → «Aprobada» o «Denegada».
 *   · Denegada → «Lo paga él» o anular.
 *   · Esperando el ingreso → «Ha entrado el dinero», con el importe.
 *   · Con el dinero dentro → la gestoría, y cuando sale, «Cambio de nombre hecho».
 *   · Hecho el cambio → «Pagar al vendedor», que es lo que suelta el dinero.
 *   · Pagado → «El comprador se ha llevado el coche».
 *
 * Un botón por paso y nunca dos: el orden lo decide el servidor y aquí solo se
 * enseña el que toca. Poner todos y dejar que el servidor rechace los demás
 * sería invitar a pulsarlos.
 */

export interface LaVentaEnCurso {
  paso:
    | 'financiacion_en_estudio' | 'financiacion_denegada' | 'esperando_ingreso'
    | 'toca_la_gestoria' | 'gestoria_en_curso' | 'toca_liberar' | 'toca_entregar' | 'entregado'
    | null;
  que_toca: string;
  iniciada_at: string | null;
  comprador: { nombre: string; dni: string; domicilio: string; email: string; telefono: string };
  financia: boolean;
  financiacion: { estado: string | null; entidad: string; importe: number | null; decidida_at: string | null };
  precio: number | null;
}

const euros = (n: number | null) =>
  n ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : '–';

const TONO: Record<string, string> = {
  financiacion_en_estudio: 'bg-amber-50 text-amber-800 border-amber-200',
  financiacion_denegada: 'bg-red-50 text-red-700 border-red-200',
  esperando_ingreso: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  toca_la_gestoria: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  gestoria_en_curso: 'bg-brand-50 text-brand-600 border-brand-200',
  toca_liberar: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  toca_entregar: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  entregado: 'bg-brand-50 text-brand-500 border-brand-200',
};

export default function VentaEnCurso({
  encargoId,
  venta,
  alCambiar,
}: {
  encargoId: string;
  venta: LaVentaEnCurso;
  alCambiar: () => void;
}) {
  const [modo, setModo] = useState<'' | 'aprobar' | 'anular' | 'ingreso'>('');
  const [ingreso, setIngreso] = useState('');
  const [referencia, setReferencia] = useState('');
  const [entidad, setEntidad] = useState('');
  const [importe, setImporte] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState('');

  async function manda(ruta: string, cuerpo: Record<string, unknown>) {
    setEnviando(true);
    setFallo('');
    try {
      const r = await api.post(`/encargos/${encargoId}/venta/${ruta}`, cuerpo);
      if (!r.ok) { setFallo(r.error ?? 'No se ha podido guardar.'); return; }
      setModo('');
      alCambiar();
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const c = venta.comprador;
  const f = venta.financiacion;
  const boton = 'px-3 py-1.5 text-xs font-semibold rounded-lg border disabled:opacity-50';

  return (
    <div className="mb-4 rounded-xl border-2 border-acento bg-acento-tenue/40 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-brand-600 text-sm">Venta en curso</h3>
          <p className="text-[12px] text-brand-400 mt-0.5">
            {c.nombre || 'El comprador'} ha dicho que lo compra por {euros(venta.precio)}
            {venta.iniciada_at ? ` · ${new Date(venta.iniciada_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}` : ''}.
            El anuncio está reservado.
          </p>
        </div>
        {venta.paso && (
          <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${TONO[venta.paso] ?? ''}`}>
            {venta.que_toca}
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
        {([
          ['Comprador', c.nombre],
          ['DNI / NIE', c.dni],
          ['Domicilio', c.domicilio],
          ['Correo', c.email],
          ['Teléfono', c.telefono],
          ['Financiación', !venta.financia && f.estado !== 'denegada' && f.estado !== 'sin_financiacion'
            ? 'No financia'
            : f.estado === 'aprobada' ? `Aprobada · ${f.entidad}${f.importe ? ` · ${euros(f.importe)}` : ''}`
            : f.estado === 'denegada' ? 'Denegada'
            : f.estado === 'sin_financiacion' ? 'Denegada · lo paga él'
            : 'En estudio'],
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="text-brand-300 w-24 shrink-0">{k}</dt>
            <dd className="text-brand-600 min-w-0 break-words">{v || '–'}</dd>
          </div>
        ))}
      </dl>

      {fallo && <p className="text-xs text-red-600 mt-2">{fallo}</p>}

      <div className="mt-3 flex flex-wrap gap-2 items-end">
        {venta.paso === 'financiacion_en_estudio' && modo !== 'aprobar' && (
          <>
            <button type="button" className={`${boton} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}
                    disabled={enviando} onClick={() => setModo('aprobar')}>
              La entidad la ha aprobado
            </button>
            <button type="button" className={`${boton} border-red-200 text-red-700 hover:bg-red-50`} disabled={enviando}
                    onClick={() => { if (window.confirm('¿La entidad ha denegado la financiación? Le escribimos al comprador para preguntarle si lo paga él.')) void manda('financiacion', { resultado: 'denegada' }); }}>
              La ha denegado
            </button>
          </>
        )}

        {modo === 'aprobar' && (
          <>
            <div>
              <label className="block text-[11px] text-brand-300 mb-1" htmlFor="venta-entidad">Entidad</label>
              <input id="venta-entidad" value={entidad} onChange={(e) => setEntidad(e.target.value)}
                     className="w-44 px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg" placeholder="Nombre de la entidad" />
            </div>
            <div>
              <label className="block text-[11px] text-brand-300 mb-1" htmlFor="venta-importe">Importe financiado (€)</label>
              <input id="venta-importe" inputMode="numeric" value={importe} onChange={(e) => setImporte(e.target.value)}
                     className="w-32 px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg" placeholder="12000" />
            </div>
            <button type="button" className={`${boton} border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700`}
                    disabled={enviando || !entidad.trim()}
                    onClick={() => void manda('financiacion', { resultado: 'aprobada', entidad, importe: Number(importe.replace(/[^\d]/g, '')) || null })}>
              {enviando ? 'Guardando…' : 'Guardar aprobada'}
            </button>
            <button type="button" className="text-xs text-brand-400" onClick={() => setModo('')}>Cancelar</button>
          </>
        )}

        {venta.paso === 'financiacion_denegada' && (
          <button type="button" className={`${boton} border-emerald-300 text-emerald-700 hover:bg-emerald-50`} disabled={enviando}
                  onClick={() => void manda('sin-financiar', {})}>
            Lo paga él entero
          </button>
        )}

        {venta.paso === 'esperando_ingreso' && modo !== 'ingreso' && (
          <button type="button" className={`${boton} border-emerald-300 text-emerald-700 hover:bg-emerald-50`} disabled={enviando}
                  onClick={() => { setIngreso(venta.precio ? String(venta.precio) : ''); setModo('ingreso'); }}>
            Ha entrado el dinero
          </button>
        )}

        {modo === 'ingreso' && (
          <div className="w-full flex flex-wrap items-end gap-2">
            <div className="w-40">
              <label className="block text-[11px] text-brand-300 mb-1" htmlFor="venta-ingreso">Cuánto ha entrado (€)</label>
              <input id="venta-ingreso" inputMode="decimal" value={ingreso} onChange={(e) => setIngreso(e.target.value)}
                     className="w-full px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] text-brand-300 mb-1" htmlFor="venta-ref">Referencia (opcional)</label>
              <input id="venta-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)}
                     className="w-full px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg" placeholder="La del proveedor de pagos" />
            </div>
            <button type="button" className={`${boton} border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700`} disabled={enviando}
                    onClick={() => void manda('ingreso', { importe: Number(ingreso.replace(',', '.')), referencia })}>
              {enviando ? 'Guardando…' : 'Apuntar el ingreso'}
            </button>
            <button type="button" className="text-xs text-brand-400" onClick={() => setModo('')}>Cancelar</button>
          </div>
        )}

        {venta.paso === 'toca_la_gestoria' && (
          <button type="button" className={`${boton} border-emerald-300 text-emerald-700 hover:bg-emerald-50`} disabled={enviando}
                  onClick={() => void manda('gestoria', {})}>
            Mandar la gestoría
          </button>
        )}

        {venta.paso === 'gestoria_en_curso' && (
          <button type="button" className={`${boton} border-emerald-300 text-emerald-700 hover:bg-emerald-50`} disabled={enviando}
                  onClick={() => void manda('gestoria-hecha', {})}>
            El cambio de nombre ya está hecho
          </button>
        )}

        {venta.paso === 'toca_liberar' && (
          <>
            <button type="button" className={`${boton} border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700`} disabled={enviando}
                    onClick={() => void manda('liberar', {})}>
              Pagar al vendedor
            </button>
            {/* El reparto, escrito antes de pulsar: es dinero de otro y quien lo
                suelta tiene que ver cuánto sale y cuánto se queda. */}
            <p className="text-[12px] text-brand-400 w-full">
              De {euros(venta.precio)} salen {euros(venta.precio ? venta.precio - 299 : null)} para el vendedor; 299 € son nuestros.
            </p>
          </>
        )}

        {venta.paso === 'toca_entregar' && (
          <button type="button" className={`${boton} border-emerald-300 text-emerald-700 hover:bg-emerald-50`} disabled={enviando}
                  onClick={() => void manda('entregado', {})}>
            El comprador se ha llevado el coche
          </button>
        )}

        {venta.paso === 'entregado' && (
          <p className="text-[12px] text-brand-400">
            Operación terminada. Queda cerrar el encargo como vendido y emitir los 299 €.
          </p>
        )}

        {modo === '' && venta.paso !== 'entregado' && (
          <button type="button" className={`${boton} ml-auto border-brand-200 text-brand-400 hover:bg-brand-50`} disabled={enviando}
                  onClick={() => setModo('anular')}>
            Anular la venta
          </button>
        )}

        {modo === 'anular' && (
          <div className="w-full flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-[11px] text-brand-300 mb-1" htmlFor="venta-motivo">Motivo (se lo decimos a los dos)</label>
              <input id="venta-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                     className="w-full px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg" placeholder="Por ejemplo: no le han dado la financiación" />
            </div>
            <button type="button" className={`${boton} border-red-300 bg-red-600 text-white hover:bg-red-700`} disabled={enviando}
                    onClick={() => void manda('anular', { motivo })}>
              {enviando ? 'Anulando…' : 'Anular y volver a publicar'}
            </button>
            <button type="button" className="text-xs text-brand-400" onClick={() => setModo('')}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}
