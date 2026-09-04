/**
 * Lo que se le manda al asesor contable.
 *
 * Esta pantalla **no lleva la contabilidad**. Los libros los lleva él con su
 * programa, y hacerlos aquí también sería garantizar que las dos versiones
 * difieren y que un día hay que decidir cuál vale.
 *
 * Lo que hace es el puente, que hoy es un correo con unos PDF y alguien
 * tecleando. Al teclear se pierde una factura, y un transporte alemán de 890 €
 * entra con 154,46 € de IVA que nadie soportó.
 *
 * Y por eso enseña **lo que falta** antes que los números: un fichero con
 * huecos le llega a él y vuelve en forma de correo dos días después.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';

interface Apunte {
  numero: string;
  fecha: string;
  sentido: 'emitida' | 'recibida';
  contraparte: string;
  nif?: string | null;
  concepto?: string | null;
  vehiculo?: string | null;
  base?: number | string | null;
  iva?: number | string | null;
  total?: number | string | null;
  regimen?: string | null;
  que?: string | null;
  pendiente?: boolean;
}

interface Trimestre {
  anio: number;
  trimestre: number;
  desde: string;
  hasta: string;
  resumen: {
    repercutido: number; soportado: number; intracomunitario: number;
    aIngresar: number; suplidos: number; sinDesglosar: number; pendientes: number;
  };
  falta: string[];
  apuntes: Apunte[];
}

const eur = (v: unknown) =>
  `${(Number(v) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const REGIMEN: Record<string, string> = {
  nacional: 'España',
  intracomunitario: 'UE',
  exento: 'Exento',
};

export default function ContabilidadPage() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [trimestre, setTrimestre] = useState(Math.floor(hoy.getMonth() / 3) + 1);
  const [datos, setDatos] = useState<Trimestre | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const carga = useCallback(async () => {
    setCargando(true);
    setError('');
    const r = await api.get<Trimestre>(`/contabilidad?anio=${anio}&trimestre=${trimestre}`);
    if (r.ok && r.data) setDatos(r.data);
    else setError(r.error || 'No se ha podido cargar el trimestre.');
    setCargando(false);
  }, [anio, trimestre]);

  useEffect(() => { void carga(); }, [carga]);

  const r = datos?.resumen;

  return (
    <div>
      <PageHeader
        title="Contabilidad"
        subtitle="Lo que hay que mandarle al asesor de cada trimestre"
      />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}
                className="px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white">
          {[hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))}
                className="px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white">
          {[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}º trimestre</option>)}
        </select>
        {datos && (
          <span className="text-[11px] text-brand-400">
            del {datos.desde.split('-').reverse().join('/')} al {datos.hasta.split('-').reverse().join('/')}
          </span>
        )}
        <a href={`/api/contabilidad/fichero?anio=${anio}&trimestre=${trimestre}`}
           className="ml-auto px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
          Descargar para el asesor
        </a>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}

      {/*
        * Lo que falta, antes que los números.
        *
        * Un fichero con huecos le llega al asesor y vuelve en forma de correo
        * dos días después. Es más barato decirlo aquí.
        */}
      {datos && datos.falta.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="text-[13px] font-bold text-amber-800">Antes de mandarlo</div>
          <div className="text-[12px] text-amber-700 mt-0.5">
            Hay {datos.falta.join(' y ')}. Se puede mandar igual, pero eso es lo que
            va a preguntar.
          </div>
        </div>
      )}

      {cargando ? (
        <div className="text-sm text-brand-400 py-8 text-center">Cargando el trimestre…</div>
      ) : r ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {([
              ['IVA repercutido', eur(r.repercutido), 'de lo que hemos facturado'],
              ['IVA soportado', eur(r.soportado), 'de facturas españolas, se deduce'],
              ['A ingresar', eur(r.aIngresar), r.aIngresar >= 0 ? 'sale a pagar' : 'sale a devolver'],
              ['Suplidos', eur(r.suplidos), 'dinero de terceros, fuera del IVA'],
            ] as [string, string, string][]).map(([titulo, valor, pie]) => (
              <div key={titulo} className="px-4 py-3 rounded-xl border border-brand-200 bg-white">
                <div className="text-2xl font-bold text-brand-600">{valor}</div>
                <div className="text-xs font-semibold text-brand-500">{titulo}</div>
                <div className="text-[11px] text-brand-400 mt-0.5">{pie}</div>
              </div>
            ))}
          </div>

          {/*
            * El intracomunitario, aparte y con su explicación.
            *
            * Se repercute y se deduce a la vez: no mueve lo que hay que
            * ingresar, pero va en sus casillas del modelo y sin él no sale el
            * 349. Sin esta frase, quien lo mira piensa que falta cuadrar algo.
            */}
          {r.intracomunitario > 0 && (
            <div className="mb-6 px-4 py-3 rounded-xl border border-brand-200 bg-brand-50/40">
              <div className="text-[13px] font-bold text-brand-600">
                Adquisiciones intracomunitarias: {eur(r.intracomunitario)}
              </div>
              <div className="text-[12px] text-brand-500 mt-0.5">
                Se repercute y se deduce a la vez, así que no mueve lo que hay que
                ingresar. Va en sus casillas del modelo, y de aquí sale el 349.
              </div>
            </div>
          )}

          <h2 className="text-sm font-bold text-brand-600 mb-2">
            Las facturas del trimestre <span className="font-normal text-brand-400">· {datos.apuntes.length}</span>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white">
            <table className="w-full text-[12px]">
              <thead className="text-[10px] uppercase tracking-wide text-brand-400 border-b border-brand-100">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Fecha</th>
                  <th className="text-left font-semibold px-3 py-2">Número</th>
                  <th className="text-left font-semibold px-3 py-2">Quién</th>
                  <th className="text-left font-semibold px-3 py-2">Concepto</th>
                  <th className="text-right font-semibold px-3 py-2">Base</th>
                  <th className="text-right font-semibold px-3 py-2">IVA</th>
                  <th className="text-right font-semibold px-3 py-2">Total</th>
                  <th className="text-left font-semibold px-3 py-2">Régimen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {datos.apuntes.map((a, i) => (
                  <tr key={`${a.numero}-${i}`} className={a.pendiente ? 'opacity-50' : ''}>
                    <td className="px-3 py-1.5 text-brand-500 whitespace-nowrap">
                      {String(a.fecha ?? '').slice(0, 10).split('-').reverse().join('/')}
                    </td>
                    <td className="px-3 py-1.5 text-brand-600 font-medium whitespace-nowrap">
                      {a.numero}
                      {a.pendiente && <span className="ml-1 text-[10px] text-amber-700">· esperada</span>}
                    </td>
                    <td className="px-3 py-1.5 text-brand-500">
                      {a.contraparte}
                      <span className={`ml-1.5 text-[10px] font-bold ${a.sentido === 'emitida' ? 'text-emerald-700' : 'text-brand-400'}`}>
                        {a.sentido === 'emitida' ? '↑' : '↓'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-brand-400 max-w-[220px] truncate">{a.concepto}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-brand-600">{a.base != null ? eur(a.base) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-brand-500">
                      {a.iva != null && a.iva !== '' ? `${Number(a.iva)}%` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-brand-600">{eur(a.total)}</td>
                    <td className="px-3 py-1.5 text-brand-400">{REGIMEN[a.regimen ?? 'nacional'] ?? a.regimen}</td>
                  </tr>
                ))}
                {datos.apuntes.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-brand-300">
                    Ninguna factura en este trimestre.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-brand-400 mt-3">
            El fichero se descarga y se le adjunta. No sale solo por correo a
            propósito: quien lo manda tiene que haber mirado antes lo que falta.
          </p>
        </>
      ) : null}
    </div>
  );
}
