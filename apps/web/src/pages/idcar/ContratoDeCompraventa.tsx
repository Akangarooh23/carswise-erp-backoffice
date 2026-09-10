/**
 * El contrato de compraventa, en la ficha del coche que se acaba de vender.
 *
 * En el mandato que el cliente firmó pone que hacemos el contrato y la
 * transferencia. La transferencia sale sola al cerrar; el contrato hay que
 * imprimirlo y darlo a firmar, y aquí es donde se hace.
 *
 * ## Los huecos no bloquean
 *
 * Faltan datos que el ERP no tiene: los DNI, los domicilios y el bastidor. Se
 * rellenan aquí cuando se tengan, pero **el documento se puede descargar
 * igual**, con la línea en blanco para escribirla a mano.
 *
 * Es la misma razón por la que el cierre no los pedía: cerrar emite una factura
 * y no puede quedarse esperando a que alguien encuentre un carné. Un hueco se
 * rellena con un bolígrafo; un cierre que no se puede hacer se queda abierto
 * para siempre.
 */
import { useState } from 'react';
import { api, descargaConSesion } from '../../api/client.js';
import Icono from '../../components/ui/Icono.js';

export interface Cerrado {
  id: string;
  motivo_cierre: string;
  cerrado_at: string;
  cliente_nombre: string;
  contrato_id: string | null;
  vendedor_dni: string | null;
  vendedor_domicilio: string | null;
  comprador_nombre: string | null;
  comprador_dni: string | null;
  comprador_domicilio: string | null;
  bastidor: string | null;
  precio_venta: string | null;
}

export default function ContratoDeCompraventa({
  cerrado, falta, alGuardar,
}: {
  cerrado: Cerrado;
  /** Lo que habría que escribir a mano si se imprime ahora. */
  falta: string[];
  alGuardar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState('');
  const [d, setD] = useState({
    vendedor_dni: cerrado.vendedor_dni ?? '',
    vendedor_domicilio: cerrado.vendedor_domicilio ?? '',
    comprador_nombre: cerrado.comprador_nombre ?? '',
    comprador_dni: cerrado.comprador_dni ?? '',
    comprador_domicilio: cerrado.comprador_domicilio ?? '',
    bastidor: cerrado.bastidor ?? '',
    precio_venta: cerrado.precio_venta ?? '',
  });

  const pon = (k: keyof typeof d) => (ev: React.ChangeEvent<HTMLInputElement>) =>
    setD((x) => ({ ...x, [k]: ev.target.value }));

  async function descarga() {
    setFallo('');
    try {
      await descargaConSesion(
        `/encargos/${cerrado.id}/contrato`,
        `contrato-${(cerrado.contrato_id ?? 'sin-numero').toLowerCase()}.doc`,
      );
    } catch (e) {
      setFallo((e as Error).message);
    }
  }

  async function guarda() {
    setGuardando(true);
    setFallo('');
    try {
      const r = await api.patch(`/encargos/${cerrado.id}/contrato`, {
        ...d,
        precio_venta: d.precio_venta === '' ? undefined : Number(d.precio_venta),
      });
      if (!r.ok) { setFallo('No se ha podido guardar.'); return; }
      setAbierto(false);
      alGuardar();
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = (k: keyof typeof d, etiqueta: string, ejemplo: string) => (
    <div className="min-w-0 flex-1">
      <label className="block text-[11px] text-brand-300 mb-1" htmlFor={`cv-${k}`}>{etiqueta}</label>
      <input
        id={`cv-${k}`}
        value={d[k]}
        onChange={pon(k)}
        placeholder={ejemplo}
        className="w-full px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                   focus:outline-none focus:ring-2 focus:ring-acento"
      />
    </div>
  );

  return (
    <div className="mt-4 rounded-xl border border-brand-200 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h4 className="text-[13px] font-semibold text-brand-600 flex items-center gap-1.5">
          <span className={falta.length ? 'text-amber-600' : 'text-emerald-600'}>
            <Icono nombre={falta.length ? 'documento' : 'comprobado'} tam={15} />
          </span>
          Contrato de compraventa
        </h4>
        <div className="flex items-center gap-2">
          {cerrado.contrato_id && (
            <span className="text-[11.5px] text-brand-400">{cerrado.contrato_id}</span>
          )}
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

      {/*
        * Lo que falta se dice, y se dice que no impide imprimirlo.
        *
        * Sin la segunda mitad, esto se lee como un error y alguien se queda
        * esperando a tenerlo todo para dar el contrato — que es justo lo que no
        * hay que hacer: el comprador está delante.
        */}
      {falta.length > 0 ? (
        <p className="text-[12.5px] text-amber-800 mb-2.5">
          Si lo imprimes ahora habrá que escribir a mano {falta.join('; ')}. Sale con
          la línea en blanco: no hace falta tenerlo todo para dárselo a firmar.
        </p>
      ) : (
        <p className="text-[12.5px] text-brand-500 mb-2.5">
          Está completo. Se imprime por duplicado y firman los dos.
        </p>
      )}

      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-200
                     text-brand-500 hover:bg-brand-50"
        >
          {falta.length ? 'Rellenar lo que falta' : 'Corregir los datos'}
        </button>
      ) : (
        <div className="rounded-lg bg-brand-50 p-2.5">
          <p className="text-[11px] font-bold text-brand-400 uppercase tracking-wide mb-1.5">Vende</p>
          <div className="flex gap-2 flex-wrap mb-2.5">
            {campo('vendedor_dni', 'DNI', '00000000T')}
            {campo('vendedor_domicilio', 'Domicilio', 'Calle, número, ciudad')}
          </div>

          <p className="text-[11px] font-bold text-brand-400 uppercase tracking-wide mb-1.5">Compra</p>
          {/*
            * El nombre llega solo de la visita que acabó en venta, pero se
            * puede cambiar: quien vino a verlo y quien firma no siempre son la
            * misma persona.
            */}
          <div className="flex gap-2 flex-wrap mb-2.5">
            {campo('comprador_nombre', 'Nombre', 'El de la visita, si es el mismo')}
            {campo('comprador_dni', 'DNI', '11111111H')}
          </div>
          <div className="flex gap-2 flex-wrap mb-2.5">
            {campo('comprador_domicilio', 'Domicilio', 'Calle, número, ciudad')}
          </div>

          <p className="text-[11px] font-bold text-brand-400 uppercase tracking-wide mb-1.5">El coche y el precio</p>
          <div className="flex gap-2 flex-wrap mb-2.5">
            {campo('bastidor', 'Bastidor', 'Está en la ficha técnica')}
            {campo('precio_venta', 'Precio de venta', '8500')}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void guarda()}
              disabled={guardando}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-acento text-white
                         hover:opacity-90 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
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

      {fallo && <p className="text-[12px] text-rose-600 mt-2">{fallo}</p>}
    </div>
  );
}
