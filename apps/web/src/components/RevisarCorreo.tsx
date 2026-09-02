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
import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal.js';

export interface VistaDelCorreo {
  para: string;
  subject: string;
  html: string;
}

export default function RevisarCorreo({ vista, enviando, error, onEnviar, onCerrar }: {
  vista: VistaDelCorreo | null;
  enviando: boolean;
  error: string;
  onEnviar: (cambios: { para: string; asunto: string; nota: string }) => void;
  onCerrar: () => void;
}) {
  const [para, setPara] = useState('');
  const [asunto, setAsunto] = useState('');
  const [nota, setNota] = useState('');

  // Al abrir uno nuevo, sus datos. Sin esto, el segundo correo que se revisa
  // sale con el asunto del primero.
  useEffect(() => {
    setPara(vista?.para ?? '');
    setAsunto(vista?.subject ?? '');
    setNota('');
  }, [vista]);

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
          * El correo, tal cual va a salir.
          *
          * Se pinta dentro de un marco con fondo blanco para que se vea que es
          * el correo y no la pantalla. La línea añadida no aparece aquí hasta
          * que se manda; decirlo es más honesto que fingir una vista previa que
          * se recalcula sola y que puede no coincidir con lo que se envía.
          */}
        <div>
          <div className="text-[11px] text-brand-400 mb-1">
            Así va a salir
            {nota.trim() ? <span className="text-brand-300"> · tu línea se añade antes de la despedida</span> : null}
          </div>
          <div className="border border-brand-200 rounded-lg bg-white p-4 max-h-[42vh] overflow-y-auto"
               dangerouslySetInnerHTML={{ __html: vista.html }} />
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => onEnviar({ para: para.trim(), asunto: asunto.trim(), nota })}
                  disabled={enviando || !para.trim()}
                  className="px-4 py-2 text-sm font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
            {enviando ? 'Mandando…' : 'Mandarlo'}
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
