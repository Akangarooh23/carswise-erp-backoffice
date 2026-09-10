/**
 * Abrir el encargo de venta desde el lead que lo pidió.
 *
 * Entre el lead y el encargo hay una llamada. El lead llega de la web con el
 * coche escrito a mano —«Volkswagen T-Roc R line 2022»— y eso no es un IDCar:
 * el IDCar lo crea el cliente en su cuenta, porque es quien sube las fotos, los
 * papeles y el informe.
 *
 * Sin esto, ese rato acaba en «búscalo tú en IDCars»: hay que salir del lead,
 * buscar el coche por el correo, abrir el encargo y volver — y el lead se queda
 * pendiente para siempre porque nadie se acuerda de cerrarlo.
 *
 * Lo que se enseña es la lista de **sus** coches, con cuál ya tiene encargo. Si
 * no tiene ninguno, eso también hay que verlo: es lo que hay que pedirle en la
 * llamada.
 */
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client.js';

interface Candidato {
  id: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  encargo_id: string | null;
}

const comoSeLlama = (c: Candidato) => {
  const nombre = [c.brand, c.model, c.year].filter(Boolean).join(' ');
  const matricula = String(c.plate ?? '').trim();
  if (nombre && matricula) return `${nombre} · ${matricula}`;
  return nombre || matricula || c.id;
};

export default function AbrirEncargo({
  leadId, email, cocheQuePidio, cocheElegido,
}: {
  leadId: string;
  email: string;
  /** Lo que escribió en el formulario, para poder comparar con sus IDCars. */
  cocheQuePidio?: string;
  /**
   * Cuál de sus coches eligió él, si había entrado.
   *
   * Cuando viene, no hay nada que adivinar: «Volkswagen T-Roc R line 2022»
   * escrito a mano no identifica un IDCar, y quien tiene que adivinarlo es el
   * que coge el teléfono, que es justo quien menos lo sabe.
   */
  cocheElegido?: string;
}) {
  const [coches, setCoches] = useState<Candidato[] | null>(null);
  const [fallo, setFallo] = useState('');
  const [abriendo, setAbriendo] = useState('');

  const carga = useCallback(async () => {
    try {
      const r = await api.get<Candidato[]>(`/encargos/candidatos?email=${encodeURIComponent(email)}`);
      if (!r.ok) { setFallo('No se han podido leer sus coches.'); return; }
      setCoches(r.data);
    } catch (e) {
      setFallo((e as Error).message);
    }
  }, [email]);

  useEffect(() => { void carga(); }, [carga]);

  async function abre(vehicleId: string) {
    setAbriendo(vehicleId);
    setFallo('');
    try {
      const r = await api.post(`/encargos`, { vehicle_id: vehicleId, lead_id: leadId });
      if (!r.ok) {
        setFallo(r.error === 'ya_tiene_un_encargo_vivo'
          ? 'Ese coche ya tiene un encargo abierto.'
          : 'No se ha podido abrir el encargo.');
        return;
      }
      await carga();
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setAbriendo('');
    }
  }

  if (!coches) return null;

  return (
    <div className="col-span-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-3">
      <p className="text-[11px] font-bold text-violet-700 uppercase tracking-wide mb-2">
        Encargo de venta
      </p>

      {/*
        * Si eligió el coche de su lista, no hay nada que adivinar y se dice.
        * Si lo escribió a mano —porque no había entrado— se enseña lo que
        * escribió, para poder compararlo con sus IDCars.
        */}
      {cocheElegido ? (
        <p className="text-xs text-violet-800 mb-2">
          Eligió este coche de los suyos. <strong>No hay que adivinar cuál es.</strong>
        </p>
      ) : cocheQuePidio ? (
        <p className="text-xs text-violet-800 mb-2">
          Escribió que quería vender <strong>{cocheQuePidio}</strong>. Lo puso a mano,
          así que confírmale cuál de estos es.
        </p>
      ) : null}

      {coches.length === 0 ? (
        /*
         * Sin coches en su cuenta no hay nada que abrir, y decirlo es la mitad
         * del trabajo: lo que hay que pedirle en la llamada es justo que suba
         * el coche.
         */
        <p className="text-xs text-violet-800">
          Todavía no ha subido ningún coche a su cuenta. Hasta que lo haga no se le
          puede abrir el encargo: en la llamada, pídele que entre en su panel y lo
          suba como IDCar con sus fotos y sus papeles.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {[...coches]
            .sort((a, b) => Number(b.id === cocheElegido) - Number(a.id === cocheElegido))
            .map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3">
              <a
                href={`/idcars/${c.id}`}
                className={`text-[13px] text-violet-900 underline underline-offset-2 ${
                  c.id === cocheElegido ? 'font-bold' : ''
                }`}
              >
                {comoSeLlama(c)}
                {c.id === cocheElegido && <span className="ml-1.5">← el que eligió</span>}
              </a>
              {c.encargo_id ? (
                <span className="shrink-0 text-[11px] font-semibold text-violet-600">Ya tiene encargo</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void abre(c.id)}
                  disabled={abriendo !== ''}
                  className="shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-md
                             border border-violet-300 text-violet-700 bg-white
                             hover:bg-violet-100 disabled:opacity-50"
                >
                  {abriendo === c.id ? 'Abriendo…' : 'Abrir encargo'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {fallo && <p className="text-[11px] text-red-600 mt-2">{fallo}</p>}
    </div>
  );
}
