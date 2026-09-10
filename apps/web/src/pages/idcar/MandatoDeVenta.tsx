/**
 * El mandato de gestión de venta, dentro del encargo.
 *
 * No es una puerta de publicar —un coche sin mandato firmado se anuncia igual—
 * sino de **cobrar**: sin él no se le puede facturar nada, ni los 299 € de la
 * gestión ni los 150 € de la cancelación.
 *
 * Antes esto no existía y `firmado_at` se escribía sola al abrir el encargo. De
 * esa fecha colgaba todo lo que le cobramos y detrás no había nada que enseñar
 * el día que alguien discutiera la factura.
 *
 * El **porqué** está en el manual de ejecución «Flujo particular — Nosotros lo
 * vendemos por ti».
 */
import { useState } from 'react';
import { api, descargaConSesion } from '../../api/client.js';
import Icono from '../../components/ui/Icono.js';

export interface ComoSeFirma {
  clave: string;
  nombre: string;
}

const cuando = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';

/** Hoy, en el formato que espera un <input type="date">. */
function hoy(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function MandatoDeVenta({
  encargoId,
  mandatoId,
  firmado,
  firmadoAt,
  firmaComo,
  porQueNo,
  comoSeFirma,
  alGuardar,
}: {
  encargoId: string;
  mandatoId: string | null;
  firmado: boolean;
  firmadoAt: string | null;
  firmaComo: string | null;
  porQueNo: string;
  comoSeFirma: ComoSeFirma[];
  /** Para releer el encargo: la firma mueve el plazo y lo que se le factura. */
  alGuardar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy());
  const [como, setComo] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState('');

  async function descarga() {
    setFallo('');
    try {
      await descargaConSesion(
        `/encargos/${encargoId}/mandato`,
        `mandato-${(mandatoId ?? 'sin-numero').toLowerCase()}.doc`,
      );
    } catch (e) {
      setFallo((e as Error).message);
    }
  }

  async function apunta() {
    if (!como) { setFallo('Falta decir cómo nos consta que lo firmó.'); return; }
    setGuardando(true);
    setFallo('');
    try {
      const r = await api.post(`/encargos/${encargoId}/firmado`, {
        firmado_at: fecha, firma_como: como, firma_nota: nota.trim(),
      });
      if (!r.ok) {
        setFallo(r.error === 'fecha_en_el_futuro'
          ? 'Esa fecha es futura. Los 30 días se contarían mal.'
          : r.error ?? 'No se ha podido guardar.');
        return;
      }
      setAbierto(false);
      alGuardar();
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const nombreDeLaFirma = comoSeFirma.find((c) => c.clave === firmaComo)?.nombre ?? '';

  return (
    <div className={`mt-4 rounded-xl border p-3 ${
      firmado ? 'border-brand-200' : 'border-amber-300 bg-amber-50/50'
    }`}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h4 className="text-[13px] font-semibold text-brand-600 flex items-center gap-1.5">
          <span className={firmado ? 'text-emerald-600' : 'text-amber-600'}>
            <Icono nombre={firmado ? 'comprobado' : 'documento'} tam={15} />
          </span>
          Mandato de gestión de venta
        </h4>
        <div className="flex items-center gap-2">
          {mandatoId && <span className="text-[11.5px] text-brand-400">{mandatoId}</span>}
          <button
            type="button"
            onClick={() => void descarga()}
            className="px-2.5 py-1 text-[11.5px] font-semibold rounded-lg border border-brand-200
                       text-brand-500 hover:bg-brand-50"
          >
            Descargar
          </button>
        </div>
      </div>

      {firmado ? (
        <p className="text-[12.5px] text-brand-500">
          Firmado el <strong>{cuando(firmadoAt)}</strong>
          {nombreDeLaFirma && ` · ${nombreDeLaFirma.toLowerCase()}`}
        </p>
      ) : (
        <>
          {/*
            * Se dice lo que se pierde, no solo que falta.
            *
            * «Falta el mandato» se lee como papeleo y se deja para luego. Lo que
            * de verdad pasa es que si ese coche se vende mañana, los 299 € no se
            * pueden facturar.
            */}
          <p className="text-[12.5px] text-amber-800 mb-2.5">
            {porQueNo || 'Todavía no ha firmado el mandato'}. Sin él no se le puede
            facturar nada, ni aunque el coche se venda.
          </p>

          {!abierto ? (
            <button
              type="button"
              onClick={() => setAbierto(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300
                         text-amber-800 bg-white hover:bg-amber-50"
            >
              Ya lo ha firmado
            </button>
          ) : (
            <div className="rounded-lg bg-white border border-brand-200 p-2.5">
              <div className="flex items-end gap-2 flex-wrap mb-2">
                <div>
                  <label className="block text-[11px] text-brand-300 mb-1" htmlFor="firma-fecha">
                    Cuándo lo firmó
                  </label>
                  <input
                    id="firma-fecha"
                    type="date"
                    max={hoy()}
                    value={fecha}
                    onChange={(ev) => setFecha(ev.target.value)}
                    className="px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-acento"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="block text-[11px] text-brand-300 mb-1" htmlFor="firma-como">
                    Cómo nos consta
                  </label>
                  <select
                    id="firma-como"
                    value={como}
                    onChange={(ev) => setComo(ev.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-acento"
                  >
                    <option value="">Elige una</option>
                    {comoSeFirma.map((c) => (
                      <option key={c.clave} value={c.clave}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              <input
                value={nota}
                onChange={(ev) => setNota(ev.target.value)}
                placeholder="Dónde está el papel, o de qué correo viene"
                className="w-full px-2.5 py-1.5 text-[13px] border border-brand-200 rounded-lg mb-2
                           focus:outline-none focus:ring-2 focus:ring-acento"
              />
              {/*
                * Los 30 días cuentan desde la fecha que se ponga aquí, no desde
                * hoy. Se dice porque es lo que hace que apuntarlo tarde no
                * regale un mes de penalización.
                */}
              <p className="text-[11.5px] text-brand-400 mb-2">
                Los 30 días de la penalización cuentan desde esa fecha.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void apunta()}
                  disabled={guardando}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-acento text-white
                             hover:opacity-90 disabled:opacity-50"
                >
                  {guardando ? 'Guardando…' : 'Guardar la firma'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAbierto(false); setFallo(''); }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-200
                             text-brand-500 hover:bg-brand-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {fallo && <p className="text-[12px] text-rose-600 mt-2">{fallo}</p>}
    </div>
  );
}
