/**
 * Lo que se le enseña a quien va a mandar un correo a un proveedor.
 *
 * Los tres que salen de aquí —la factura al vendedor, la recogida al
 * transportista y el encargo a la gestoría— van a gente de fuera y con nuestro
 * nombre. Un correo no se desenvía, así que antes de salir se ve entero.
 *
 * **Lo que se puede cambiar: a quién, el asunto y una línea que añadir.** El
 * cuerpo se ve pero no se edita, y no es por no complicarse: cada uno de esos
 * correos existe por una frase concreta —«la factura a nombre del cliente, no de
 * PopCar», «preguntar por» en cada punta, «decidnos el importe real del
 * impuesto»— y un cuadro de texto con todo el HTML dentro es la forma más fácil
 * de que un día se borre una de ellas sin querer y el correo salga pareciendo el
 * de siempre.
 *
 * Lo que de verdad hace falta al revisar es lo de este coche en concreto: «el
 * jueves está cerrado», «llamad antes a Miguel». Para eso está la línea.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './ui/Modal.js';
import { lineaDeAdjuntos, type IdiomaDelCorreo } from '../lib/lo-que-va-adjunto.js';

/** Un papel del expediente que se puede adjuntar. */
export interface PapelDisponible {
  id: string;
  papel: string;
  nombre: string;
  tamano: number;
  /** De qué cajón sale: el expediente, el pedido o el tramo. */
  de?: string;
}

/** Cómo se llama cada cajón en la pantalla. */
const DE_DONDE: Record<string, string> = {
  lead: 'del expediente',
  pedido: 'del pedido',
  transporte: 'del transporte',
};

export interface VistaDelCorreo {
  para: string;
  subject: string;
  html: string;
  papeles?: PapelDisponible[];
  /** En qué idioma está, para anunciar los adjuntos en el suyo. */
  idioma?: IdiomaDelCorreo;
  /**
   * Entre cuáles se puede elegir, si se puede elegir.
   *
   * Solo los del transportista lo traen: al vendedor alemán se le escribe en
   * alemán y no hay nada que decidir. Sin esta lista no se enseña el selector,
   * que es como no ofrecer una opción que no existe.
   */
  idiomas?: IdiomaDelCorreo[];
  /**
   * Qué correo es, para saber cuándo es otro y cuándo es el mismo.
   *
   * Cambiar de idioma trae un correo nuevo del servidor, pero sigue siendo el
   * mismo encargo: lo que se haya escrito a mano y los papeles marcados tienen
   * que seguir ahí. Sin esta clave, elegir «Alemán» borraba las dos cosas sin
   * decirlo, y eso se descubre cuando el correo ya ha salido.
   */
  clave?: string;
}

/** Cómo se llama cada idioma en la pantalla, que es española. */
const SE_LLAMA: Record<string, string> = { es: 'Español', de: 'Alemán', en: 'Inglés' };

/** «230 kB», «1,4 MB». Se enseña porque es como se distingue un adjunto de otro. */
function pesa(bytes: number): string {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} kB`;
  return `${(n / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
}

export default function RevisarCorreo({ vista, enviando, error, onEnviar, onCambiarIdioma, onCerrar }: {
  vista: VistaDelCorreo | null;
  enviando: boolean;
  error: string;
  onEnviar: (cambios: { para: string; asunto: string; nota: string; adjuntos: string[]; idioma?: string }) => void;
  /**
   * Volver a pedir el correo en otro idioma.
   *
   * Se pide entero al servidor en vez de traducir aquí: el cuerpo lo escribe
   * quien lo manda, y una traducción hecha en la pantalla sería otro texto
   * distinto del que sale, que es justo lo que este cuadro existe para evitar.
   */
  onCambiarIdioma?: (idioma: string) => void;
  onCerrar: () => void;
}) {
  const [para, setPara] = useState('');
  const [asunto, setAsunto] = useState('');
  const [nota, setNota] = useState('');
  /**
   * Los papeles marcados. Empieza **vacío**, siempre.
   *
   * Adjuntar por defecto es lo que hace que un día salga el DNI del cliente
   * anterior. Eso no es una errata: es un incidente de protección de datos, y
   * no se corrige con otro correo.
   */
  const [marcados, setMarcados] = useState<string[]>([]);

  /**
   * Al abrir uno nuevo, sus datos.
   *
   * Sin esto, el segundo correo que se revisa sale con el asunto del primero.
   * Pero **cambiar de idioma no es abrir otro**: trae el cuerpo y el asunto
   * nuevos y conserva lo escrito a mano y los papeles marcados, que es lo que
   * ha puesto quien está delante.
   */
  const claveAnterior = useRef<string | null>(null);
  useEffect(() => {
    const clave = vista?.clave ?? null;
    const esOtro = clave === null || clave !== claveAnterior.current;
    claveAnterior.current = clave;
    setPara(vista?.para ?? '');
    setAsunto(vista?.subject ?? '');
    if (esOtro) {
      setNota('');
      setMarcados([]);
    }
  }, [vista]);

  /**
   * Lo que va adjunto, dicho en el cuerpo.
   *
   * Se calcula aquí con la misma función que usa el correo al salir, así que
   * la vista previa enseña la frase de verdad y no una aproximación. Un
   * adjunto que el cuerpo no menciona es un adjunto que no se abre —y al
   * revés: si el cuerpo dice que va la factura y no va, se ve antes de
   * mandarlo, que es justo para lo que sirve este cuadro.
   */
  const dicho = useMemo(() => lineaDeAdjuntos(
    (vista?.papeles ?? []).filter((p) => marcados.includes(p.id)),
    vista?.idioma ?? 'es'
  ), [vista, marcados]);

  if (!vista) return null;

  return (
    <Modal open={true} title="Antes de mandarlo" onClose={onCerrar} size="lg">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3">
          <label className="text-[11px] text-brand-400">
            Para
            <input value={para} onChange={(e) => setPara(e.target.value)}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
          {/*
            * En qué idioma sale.
            *
            * Al cambiarlo se pide el correo entero otra vez, con el asunto y
            * todo: media traducción se nota más que ninguna. Lo que se haya
            * escrito en «algo que añadir» se conserva, porque eso lo escribe
            * quien está aquí y no se traduce solo.
            */}
          {vista.idiomas && vista.idiomas.length > 1 && onCambiarIdioma && (
            <div className="text-[11px] text-brand-400">
              En qué idioma sale
              <div className="flex gap-1.5 mt-0.5">
                {vista.idiomas.map((i) => (
                  <button key={i} onClick={() => onCambiarIdioma(i)} disabled={enviando}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border disabled:opacity-50 ${
                            (vista.idioma ?? 'es') === i
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-white text-brand-500 border-brand-200 hover:bg-brand-50'}`}>
                    {SE_LLAMA[i] ?? i}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="text-[11px] text-brand-400">
            Asunto
            <input value={asunto} onChange={(e) => setAsunto(e.target.value)}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
          <label className="text-[11px] text-brand-400">
            Algo que añadir
            <span className="text-brand-300"> · lo de este coche en concreto, si hay algo</span>
            <textarea value={nota} rows={3} placeholder="El jueves está cerrado, llamad antes a Miguel…"
                      onChange={(e) => setNota(e.target.value)}
                      className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
        </div>

        {/*
          * Los papeles del expediente, para elegir cuáles van.
          *
          * Con su nombre y su peso: dos PDF de 200 kB llamados «documento.pdf»
          * no se distinguen de otra forma, y el que se equivoca lo hace ahí.
          */}
        {vista.papeles && vista.papeles.length > 0 && (
          <div>
            <div className="text-[11px] text-brand-400 mb-1">
              Papeles de este coche
              <span className="text-brand-300"> · ninguno va si no lo marcas</span>
            </div>
            <div className="border border-brand-200 rounded-lg divide-y divide-brand-100">
              {vista.papeles.map((d) => (
                <label key={d.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={marcados.includes(d.id)}
                         onChange={(e) => setMarcados((m) => (e.target.checked
                           ? [...m, d.id]
                           : m.filter((x) => x !== d.id)))} />
                  <span className="text-sm text-brand-600 flex-1 truncate">{d.nombre}</span>
                  {d.papel && <span className="text-[10px] text-brand-300">{d.papel}</span>}
                  {/* De qué cajón sale: los del pedido y los del expediente se
                      llaman parecido y se confunden. */}
                  {d.de && <span className="text-[10px] text-brand-300">{DE_DONDE[d.de] ?? d.de}</span>}
                  <span className="text-[10px] text-brand-300 tabular-nums">{pesa(d.tamano)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/*
          * El correo, tal cual va a salir.
          *
          * Se pinta dentro de un marco con fondo blanco para que se vea que es
          * el correo y no la pantalla. Lo que se marca arriba aparece aquí en el
          * momento y con la misma función que lo escribe al salir: si la frase
          * de los adjuntos solo se viera al mandarlo, esto sería una
          * aproximación, y una aproximación revisada no es una revisión.
          *
          * Lo único que no se pinta es la línea que se añade a mano, que va
          * antes de la despedida y se dice ahí arriba.
          */}
        <div>
          <div className="text-[11px] text-brand-400 mb-1">
            Así va a salir
            {nota.trim() ? <span className="text-brand-300"> · tu línea se añade antes de la despedida</span> : null}
          </div>
          <div className="border border-brand-200 rounded-lg bg-white p-4 max-h-[42vh] overflow-y-auto"
               dangerouslySetInnerHTML={{ __html: vista.html + dicho }} />
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => onEnviar({ para: para.trim(), asunto: asunto.trim(), nota, adjuntos: marcados, idioma: vista.idioma })}
                  disabled={enviando || !para.trim()}
                  className="px-4 py-2 text-sm font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
            {enviando ? 'Mandando…' : marcados.length
              ? `Mandarlo con ${marcados.length} ${marcados.length === 1 ? 'papel' : 'papeles'}`
              : 'Mandarlo'}
          </button>
          <button onClick={onCerrar} disabled={enviando}
                  className="px-4 py-2 text-sm font-semibold text-brand-500 border border-brand-200 rounded-lg hover:bg-brand-100 disabled:opacity-50">
            Ahora no
          </button>
        </div>
      </div>
    </Modal>
  );
}
