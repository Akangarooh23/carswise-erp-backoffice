/**
 * Dónde está anunciado este coche fuera de casa.
 *
 * Publicar en coches.net lo hace una persona a mano y retirarlo también. Eso no
 * se automatiza aquí: lo que se arregla es que **nadie se acuerde de
 * retirarlo**, que es lo que pasó con el Kia Sorento —entregado el 1 de
 * septiembre y publicado una semana después—.
 *
 * Y esta vez es peor que en el escaparate: el teléfono de ese anuncio es el
 * nuestro, así que las llamadas por un coche vendido las cogemos nosotros.
 *
 * El **porqué** está en el manual de ejecución «Flujo particular — Nosotros lo
 * vendemos por ti».
 */
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import Icono from '../../components/ui/Icono.js';

export interface Anuncio {
  id: string;
  portal: string;
  url: string;
  publicado_at: string | null;
  publicado_por: string;
  retirado_at: string | null;
  retirado_por: string;
}

interface LoDeLosPortales {
  anuncios: Anuncio[];
  portales: string[];
  matricula: string;
  enlaces: { portal: string; url: string }[];
}

const cuando = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '–';

export default function AnunciosDePortal({ vehicleId }: { vehicleId: string }) {
  const [datos, setDatos] = useState<LoDeLosPortales | null>(null);
  const [portal, setPortal] = useState('');
  const [url, setUrl] = useState('');
  const [guardando, setGuardando] = useState('');
  const [copiado, setCopiado] = useState('');
  const [fallo, setFallo] = useState('');

  const carga = useCallback(async () => {
    try {
      const r = await api.get<LoDeLosPortales>(`/anuncios-portal/coche/${vehicleId}`);
      if (!r.ok) { setFallo('No se han podido leer los anuncios.'); return; }
      setDatos(r.data);
    } catch (e) {
      setFallo((e as Error).message);
    }
  }, [vehicleId]);

  useEffect(() => { void carga(); }, [carga]);

  async function apunta() {
    if (!portal) { setFallo('Elige el portal.'); return; }
    setGuardando('nuevo');
    setFallo('');
    try {
      const r = await api.post('/anuncios-portal', { vehicle_id: vehicleId, portal, url: url.trim() });
      if (!r.ok) { setFallo(r.error ?? 'No se ha podido apuntar.'); return; }
      setPortal('');
      setUrl('');
      await carga();
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setGuardando('');
    }
  }

  async function retira(id: string) {
    setGuardando(id);
    setFallo('');
    try {
      const r = await api.post(`/anuncios-portal/${id}/retirar`, {});
      if (!r.ok) { setFallo(r.error ?? 'No se ha podido marcar como retirado.'); return; }
      await carga();
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setGuardando('');
    }
  }

  /**
   * Copiar el enlace, que es lo único que se hace con él.
   *
   * En coches.net no se puede enlazar: se pega texto. Un enlace que hay que
   * seleccionar a mano de una pantalla se copia mal —se deja fuera un carácter
   * y la UTM se pierde sin que nadie lo vea—.
   */
  async function copia(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(texto);
      window.setTimeout(() => setCopiado(''), 2000);
    } catch {
      setFallo('No se ha podido copiar. Selecciónalo a mano.');
    }
  }

  if (!datos) return null;
  const puestos = datos.anuncios.filter((a) => !a.retirado_at);

  return (
    <div className="mt-4 rounded-xl border border-brand-200 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h4 className="text-[13px] font-semibold text-brand-600 flex items-center gap-1.5">
          <span className={puestos.length ? 'text-emerald-600' : 'text-brand-300'}>
            <Icono nombre="tabla" tam={15} />
          </span>
          Anuncios en portales
        </h4>
        {puestos.length > 0 && (
          <span className="text-[11.5px] text-brand-400">
            {puestos.length === 1 ? 'puesto en 1 portal' : `puesto en ${puestos.length} portales`}
          </span>
        )}
      </div>

      {/*
        * El enlace que hay que pegar, ya montado con su UTM.
        *
        * Se da hecho y no se pide que se escriba: escrita a mano, la fuente
        * sale unas veces «coches.net» y otras «Coches.net», y en el informe son
        * dos filas distintas que nadie suma. Sin UTM, el comprador que llega
        * del portal entra como «directo» y no hay forma de saber si el portal
        * trae gente o solo cuesta dinero.
        */}
      {datos.enlaces.length > 0 ? (
        <div className="rounded-lg bg-brand-50 px-2.5 py-2 mb-3">
          <p className="text-[11.5px] text-brand-500 mb-1.5">
            Pega este enlace en el anuncio. Lleva dentro de dónde viene, que es lo
            que después dice si el portal trae compradores.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {datos.enlaces.map((e) => (
              <button
                key={e.portal}
                type="button"
                onClick={() => void copia(e.url)}
                title={e.url}
                className="px-2.5 py-1 text-[11.5px] font-semibold rounded-lg border
                           border-brand-200 bg-white text-brand-600 hover:bg-brand-100"
              >
                {copiado === e.url ? '✓ copiado' : `Copiar el de ${e.portal}`}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /*
         * Sin matrícula no hay enlace corto que dar: `/v/` a secas no lleva a
         * ningún sitio. Se dice, en vez de enseñar un botón que no funciona.
         */
        <p className="text-[12px] text-brand-400 mb-3">
          Este coche no tiene matrícula, así que todavía no hay enlace corto que pegar.
        </p>
      )}

      {datos.anuncios.length > 0 && (
        <ul className="mb-3">
          {datos.anuncios.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-1.5
                                      border-b border-brand-100 last:border-0">
              <span className="min-w-0 flex-1">
                <span className={`block text-[13px] ${a.retirado_at ? 'text-brand-400' : 'text-brand-600 font-medium'}`}>
                  {a.portal}
                  {a.retirado_at && <span className="ml-1.5 text-[11.5px]">· retirado</span>}
                </span>
                <span className="block text-[11.5px] text-brand-400 truncate">
                  {a.retirado_at
                    ? `Lo quitó ${a.retirado_por || 'alguien'} el ${cuando(a.retirado_at)}`
                    : `Lo puso ${a.publicado_por || 'alguien'} el ${cuando(a.publicado_at)}`}
                </span>
              </span>
              {!a.retirado_at && (
                <button
                  type="button"
                  onClick={() => void retira(a.id)}
                  disabled={guardando !== ''}
                  className="shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-lg border
                             border-brand-200 text-brand-500 hover:bg-brand-50 disabled:opacity-50"
                >
                  {guardando === a.id ? 'Guardando…' : 'Ya lo he quitado'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-[11px] text-brand-300 mb-1" htmlFor="anu-portal">
            Apuntar dónde está
          </label>
          <select
            id="anu-portal"
            value={portal}
            onChange={(ev) => setPortal(ev.target.value)}
            className="px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-acento"
          >
            <option value="">Elige el portal…</option>
            {datos.portales.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label className="block text-[11px] text-brand-300 mb-1" htmlFor="anu-url">
            Enlace del anuncio
          </label>
          {/*
            * Se exige, y no es burocracia: es por donde se entra a borrarlo.
            * «Está en Milanuncios» sin la dirección obliga a buscarlo entre los
            * anuncios de la cuenta el día que haya que quitarlo, que es justo
            * el día en que nadie tiene tiempo.
            */}
          <input
            id="anu-url"
            value={url}
            onChange={(ev) => setUrl(ev.target.value)}
            placeholder="https://www.coches.net/…"
            className="w-full px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-acento"
          />
        </div>
        <button
          type="button"
          onClick={() => void apunta()}
          disabled={guardando !== ''}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-200
                     text-brand-500 hover:bg-brand-50 disabled:opacity-50"
        >
          {guardando === 'nuevo' ? 'Guardando…' : 'Apuntar'}
        </button>
      </div>

      {fallo && <p className="text-[12px] text-rose-600 mt-2">{fallo}</p>}
    </div>
  );
}
