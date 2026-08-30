import { useCallback, useEffect, useState } from 'react';
import { api, descargaConSesion } from '../api/client.js';

/**
 * Los papeles de algo: de una solicitud, de un pedido, de un trámite o de un
 * transporte.
 *
 * Estaba dentro de la pantalla de Importaciones y solo servía para solicitudes.
 * Los papeles no son de una solicitud: son del coche, y aparecen en sitios
 * distintos según el momento —la factura llega con el pedido, la ficha técnica la
 * devuelve la gestoría—.
 *
 * Cuando se le dice de qué origen es, enseña además **lo que falta por reunir**.
 * Eso es lo que de verdad hacía falta: un coche alemán no se matricula sin su
 * ficha ni sin el COC, y eso hay que verlo antes de tenerlo aparcado, no el día
 * que la gestoría lo pide.
 */

export interface Documento {
  id: string;
  papel: string;
  nombre: string;
  tipo: string;
  tamano: number;
  subido_por: string;
  created_at: string;
}

interface PapelEsperado {
  papel: string;
  porQue: string;
  imprescindible: boolean;
}

function pesa(bytes: number): string {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export default function Documentos({ ambito, id, origen }: {
  ambito: 'lead' | 'pedido' | 'tramite' | 'transporte';
  id: string;
  /** Si se dice, sale la lista de lo que falta según a quién se le compró. */
  origen?: string;
}) {
  const [lista, setLista] = useState<Documento[] | null>(null);
  const [faltan, setFaltan] = useState<PapelEsperado[]>([]);
  const [esperados, setEsperados] = useState<PapelEsperado[]>([]);
  const [papel, setPapel] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [fallo, setFallo] = useState('');

  const carga = useCallback(async () => {
    const qs = origen ? `?origen=${encodeURIComponent(origen)}` : '';
    const r = await api.get<Documento[]>(`/documentos/${ambito}/${id}${qs}`);
    setLista(r.ok && Array.isArray(r.data) ? r.data : []);
    setFaltan(((r as unknown as { faltan?: PapelEsperado[] }).faltan) ?? []);
  }, [ambito, id, origen]);

  useEffect(() => { void carga(); }, [carga]);

  useEffect(() => {
    if (!origen) { setEsperados([]); return; }
    void api.get<PapelEsperado[]>(`/documentos/esperados/${origen}`).then((r) => {
      if (r.ok && Array.isArray(r.data)) setEsperados(r.data);
    });
  }, [origen]);

  async function sube(fichero: File) {
    setFallo('');
    setSubiendo(true);
    try {
      const base64 = await new Promise<string>((listo, falla) => {
        const lector = new FileReader();
        lector.onload = () => listo(String(lector.result).split(',')[1] ?? '');
        lector.onerror = () => falla(new Error('no se ha podido leer'));
        lector.readAsDataURL(fichero);
      });
      const r = await api.post<Documento>(`/documentos/${ambito}/${id}`, {
        nombre: fichero.name, tipo: fichero.type, papel, contenido_base64: base64,
      });
      if (!r.ok) {
        setFallo(r.error === 'fichero_no_valido'
          ? 'Ese fichero no vale: solo imágenes o PDF, hasta 3 MB.'
          : 'No se ha podido guardar.');
      } else {
        setPapel('');
        await carga();
      }
    } catch {
      setFallo('No se ha podido leer el fichero.');
    }
    setSubiendo(false);
  }

  async function quita(doc: Documento) {
    if (!window.confirm(`¿Quitar «${doc.nombre}»? Se borra también del almacén.`)) return;
    const r = await api.delete(`/documentos/${ambito}/${id}/${doc.id}`);
    if (!r.ok) { setFallo('No se ha podido quitar.'); return; }
    await carga();
  }

  return (
    <div className="mt-4 pt-4 border-t border-brand-100">
      <div className="text-xs font-semibold text-brand-500 mb-1.5">Documentos</div>
      <p className="text-[11px] text-brand-400 mb-2">
        Del expediente, para el equipo. El cliente no los ve en su panel.
      </p>

      {/* Lo que falta, primero: es la pregunta que hay que poder contestar de un
          vistazo. Lo imprescindible en rojo, que no es lo mismo que conveniente. */}
      {faltan.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
          <div className="text-[11px] font-bold text-amber-800 mb-1">Faltan por reunir</div>
          <ul className="space-y-0.5">
            {faltan.map((p) => (
              <li key={p.papel} className="text-[11px] leading-snug">
                <span className={p.imprescindible ? 'font-bold text-red-700' : 'text-amber-800'}>
                  {p.papel}
                </span>
                <span className="text-amber-700/80"> — {p.porQue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {origen && faltan.length === 0 && esperados.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800">
          ✓ Están todos los papeles que se esperan de este origen
        </div>
      )}

      {lista === null ? (
        <p className="text-[11px] text-brand-300">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="text-[11px] text-brand-300">Todavía no hay ninguno.</p>
      ) : (
        <ul className="space-y-1.5 mb-2">
          {lista.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-[12px]">
              <button
                onClick={() => { void descargaConSesion(`/documentos/${ambito}/${id}/${d.id}`, d.nombre).catch(() => setFallo('No se ha podido abrir.')); }}
                className="flex-1 text-left text-brand-600 underline underline-offset-2 truncate"
                title={d.nombre}
              >
                {d.papel || d.nombre}
              </button>
              <span className="text-[10px] text-brand-400 shrink-0">{pesa(d.tamano)}</span>
              <button onClick={() => void quita(d)} className="text-[10px] text-red-600 hover:underline shrink-0">
                quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Qué papel es, antes de elegir el fichero: subir sin decirlo no tapa
          ningún hueco, y entonces la lista de lo que falta no sirve de nada. */}
      {esperados.length > 0 && (
        <select
          value={papel}
          onChange={(e) => setPapel(e.target.value)}
          className="w-full mb-2 px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white"
        >
          <option value="">Qué papel es… (o ninguno de la lista)</option>
          {esperados.map((p) => <option key={p.papel} value={p.papel}>{p.papel}</option>)}
        </select>
      )}

      <label className="inline-block px-3 py-1.5 text-xs font-bold text-brand-600 border border-brand-200 rounded-lg cursor-pointer hover:bg-brand-50">
        {subiendo ? 'Subiendo…' : 'Añadir documento'}
        <input
          type="file"
          className="hidden"
          disabled={subiendo}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void sube(f); }}
        />
      </label>
      {fallo && <p className="text-[11px] text-red-600 mt-1.5">{fallo}</p>}
    </div>
  );
}
