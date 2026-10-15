/**
 * Todos los papeles del coche, en cajones.
 *
 * Están repartidos en ocho tablas y dos almacenes porque cada uno cuelga del
 * momento que lo produjo: el mandato de su encargo, el informe del perito de
 * su visita, la factura de su mantenimiento. Eso está bien y no se toca —con
 * dos revisiones, «el informe» sin saber de cuál es no significa nada—.
 *
 * Lo que faltaba era poder mirarlos todos juntos. Hasta hoy, contestar
 * «enséñame todo lo del 5228HNS» pedía abrir cuatro pantallas y saber de
 * antemano dónde mirar, y lo que no se encuentra se vuelve a pedir: ya ha
 * pasado con una póliza subida dos veces.
 *
 * ## Por qué sale quién lo ve
 *
 * Porque hoy no lo ha elegido nadie. Las fotos están en el almacén público
 * porque son el anuncio, y la póliza y las facturas están ahí también, con el
 * nombre y la matrícula de una persona, solo porque se subieron por la misma
 * puerta. Mientras eso siga así, lo menos que puede hacer esta pantalla es no
 * disimularlo.
 */
import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';

interface Papel {
  id: string;
  cajon: string;
  nombre: string;
  tipo: string;
  tamano: number;
  cuando: string | null;
  deQue: string;
  donde: 'publico' | 'privado' | 'fuera';
  comoSeAbre: string;
  loVeElCliente: boolean;
}

interface Expediente {
  vehicle_id: string;
  papeles: Papel[];
  porCajon: Record<string, number>;
}

function pesa(bytes: number): string {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function elDia(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
}

/**
 * Dónde vive, dicho para quien no sabe lo que es un bucket.
 *
 * «Público» con su aviso: no es una etiqueta técnica, es que ese fichero lo
 * abre cualquiera que tenga el enlace, sin entrar en ningún sitio.
 */
const DONDE: Record<Papel['donde'], { texto: string; clase: string; ayuda: string }> = {
  publico: {
    texto: 'Abierto',
    clase: 'bg-amber-50 text-amber-700 border-amber-200',
    ayuda: 'Se abre con el enlace, sin sesión. Es lo que necesita una foto de un anuncio.',
  },
  privado: {
    texto: 'Protegido',
    clase: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ayuda: 'Solo desde aquí, con sesión del ERP.',
  },
  fuera: {
    texto: 'Fuera',
    clase: 'bg-brand-50 text-brand-500 border-brand-200',
    ayuda: 'No lo guardamos nosotros: se pide a donde vive.',
  },
};

export default function ExpedienteDelVehiculo({ vehicleId }: { vehicleId: string }) {
  const [exp, setExp] = useState<Expediente | null>(null);
  const [fallo, setFallo] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    api.get<Expediente>(`/idcars/${vehicleId}/expediente`)
      .then((r) => { if (!vivo) return; if (r.ok) setExp(r.data); else setFallo('No se ha podido reunir el expediente'); })
      .catch(() => { if (vivo) setFallo('Error de conexión'); });
    return () => { vivo = false; };
  }, [vehicleId]);

  if (fallo) return <p className="text-[12px] text-rose-600">{fallo}</p>;
  if (!exp) return <p className="text-[12px] text-brand-300">Reuniendo los papeles…</p>;

  const cajones = Object.keys(exp.porCajon);
  const total = exp.papeles.length;
  /*
   * Los abiertos que no deberían serlo.
   *
   * Las fotos sí: son el anuncio. Lo demás que esté en el almacén público
   * lleva matrícula, nombre o dirección, y ahí no pinta nada.
   *
   * Hoy esto sale a cero, y conviene saber por qué estaba mal antes: el
   * servidor daba por público todo lo que saliera de las tablas del cliente,
   * en vez de mirar la dirección del fichero. Con eso, esta caja avisó de
   * diez papeles abiertos que llevaban tiempo en el cajón privado.
   *
   * Se queda, porque la pregunta sigue siendo buena y ahora la contesta
   * mirando: el día que algo sensible aparezca en el almacén abierto, aquí se
   * ve sin abrir cajón por cajón.
   */
  const sueltos = exp.papeles.filter((p) => p.donde === 'publico' && p.cajon !== 'Fotos').length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-brand-600">Expediente del vehículo</h3>
        <span className="text-[12px] text-brand-400">
          {total === 0 ? 'Todavía no hay ningún papel' : `${total} papeles en ${cajones.filter((c) => exp.porCajon[c] > 0).length} cajones`}
        </span>
      </div>

      {sueltos > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          <strong>{sueltos}</strong> {sueltos === 1 ? 'papel se abre' : 'papeles se abren'} con el enlace, sin sesión.
          Las fotos tienen que ser así porque son el anuncio; una póliza o una factura, no.
        </div>
      )}

      <div className="space-y-1.5">
        {cajones.map((cajon) => {
          const dentro = exp.papeles.filter((p) => p.cajon === cajon);
          const vacio = dentro.length === 0;
          const esteAbierto = abierto === cajon;
          return (
            <div key={cajon} className="rounded-lg border border-brand-100 overflow-hidden">
              {/*
                * Los cajones vacíos salen igual, apagados.
                *
                * Un cajón que no está no se distingue de uno que está vacío, y
                * son cosas distintas: «no hay peritación» es una respuesta, y
                * que la peritación no aparezca por ningún lado es una duda.
                */}
              <button
                type="button"
                disabled={vacio}
                onClick={() => setAbierto(esteAbierto ? null : cajon)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left text-[13px]
                            ${vacio ? 'text-brand-300 cursor-default' : 'text-brand-600 hover:bg-brand-50'}`}
              >
                <span className="font-medium">{cajon}</span>
                <span className="text-[12px] tabular-nums">
                  {vacio ? '—' : `${dentro.length}${esteAbierto ? ' ▴' : ' ▾'}`}
                </span>
              </button>

              {esteAbierto && !vacio && (
                <ul className="divide-y divide-brand-50 border-t border-brand-100">
                  {dentro.map((p) => (
                    <li key={`${p.cajon}-${p.id}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] text-brand-600 truncate">{p.nombre}</div>
                        <div className="text-[11.5px] text-brand-400">
                          {[p.deQue, elDia(p.cuando), pesa(p.tamano)].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <span title={DONDE[p.donde].ayuda}
                            className={`shrink-0 px-1.5 py-0.5 rounded border text-[10.5px] font-semibold ${DONDE[p.donde].clase}`}>
                        {DONDE[p.donde].texto}
                      </span>
                      {/*
                        * Sin enlace no se pinta un botón muerto.
                        *
                        * La tasación es el caso: existe, y su PDF lo sirve una
                        * ruta de PopCar que comprueba que es del cliente que la
                        * pide. Una sesión del ERP no pasa por ahí. Decirlo es
                        * más útil que un botón que no hace nada.
                        */}
                      {p.comoSeAbre ? (
                        <a
                          href={p.donde === 'privado' ? `/api${p.comoSeAbre}` : p.comoSeAbre}
                          target="_blank" rel="noreferrer"
                          className="shrink-0 px-2 py-1 text-[11.5px] font-semibold text-brand-600 border border-brand-200 rounded hover:bg-brand-50"
                        >
                          Abrir
                        </a>
                      ) : (
                        <span className="shrink-0 text-[11px] text-brand-300">En el panel del cliente</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
