import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../store/auth.js';
import Icono from '../ui/Icono.js';
import GraficoDeMeses from '../ui/GraficoDeMeses.js';
import Reparto from '../ui/Reparto.js';
import type { Finanzas as Datos, Tramo } from '../../types/index.js';

/**
 * Cómo va la empresa, que es con lo que tiene que abrir un panel.
 *
 * Abría con «total usuarios» y «plan premium». Eso no dice si el negocio gana
 * dinero, y es la primera pregunta que se le hace a un ERP por la mañana.
 *
 * ## Lo que no se suma, y por qué
 *
 * Tres cosas que parecen ingreso y no lo son. Están fuera del número grande y
 * dichas aparte, cada una con su nombre, porque quien lo mira tiene que saber
 * que se han dejado fuera:
 *
 * - **El IVA.** Cobrar 3.630 € es ingresar 3.000. Los otros 630 son de Hacienda.
 * - **Los suplidos.** Los 16.890 € del coche pasan por la cuenta y salen. Sumar
 *   eso convierte una operación de 3.000 € en una de 21.500 y no hemos ganado
 *   un euro más.
 * - **Lo comprometido.** Una factura que sabemos que va a llegar no es un gasto
 *   todavía, pero va a serlo, y por eso se dice.
 *
 * El bloque va partido en dos —las cifras arriba, el reparto más abajo— porque
 * en la página hay usuarios en medio. Los dos leen la **misma** respuesta: dos
 * peticiones con el mismo periodo pueden contestar cosas distintas si algo
 * entra entre medias, y entonces la suma del reparto no cuadra con el total.
 */

const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n || 0);

const TRAMOS: { clave: Tramo; nombre: string }[] = [
  { clave: 'mes', nombre: 'Este mes' },
  { clave: 'trimestre', nombre: 'Este trimestre' },
  { clave: 'anio', nombre: 'Este año' },
];

/** Lo que se pide una vez y leen los dos bloques. */
export function useFinanzas() {
  /*
   * Las cuentas son solo del administrador, como el fichero del asesor.
   *
   * Sin esto, quien lleva soporte o ventas abre el panel y lo primero que ve
   * es un error en rojo todas las mañanas —el endpoint le contesta que no—.
   * Un bloque que no le toca no se enseña roto: no se enseña.
   */
  const puede = useAuth().user?.role === 'admin';
  const [tramo, setTramo] = useState<Tramo>('anio');
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    if (!puede) { setCargando(false); return; }
    // Al cambiar de pestaña deprisa, la respuesta vieja puede llegar la última
    // y pintar los números del tramo anterior.
    let vigente = true;
    setCargando(true);
    api.get<Datos>(`/dashboard/finanzas?tramo=${tramo}`)
      .then((r) => {
        if (!vigente) return;
        if (r.ok) { setDatos(r.data); setFallo(''); }
        else setFallo('No se pudieron cargar las cuentas');
      })
      .catch(() => { if (vigente) setFallo('No se pudieron cargar las cuentas'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [tramo, puede]);

  return { tramo, setTramo, datos, cargando, fallo, puede };
}

export type Cuentas = ReturnType<typeof useFinanzas>;

/**
 * Cuánto ha cambiado, dicho con su signo y con su color.
 *
 * En los gastos, subir es malo. Pintar de verde todo lo que sube haría que un
 * +40 % de gasto se leyera como una buena noticia durante el medio segundo que
 * dura mirar una tarjeta, que es justo el tiempo que se le dedica.
 */
function Cambio({ pct, subirEsBueno, contra }: {
  pct: number | null; subirEsBueno: boolean; contra: string;
}) {
  // Sin base anterior no hay porcentaje: pasar de 0 € a 3.000 € no es +100 %,
  // es que antes no había con qué comparar.
  if (pct === null) return <span className="text-brand-300">sin comparación con {contra}</span>;

  const sube = pct > 0;
  const plano = Math.abs(pct) < 0.05;
  const bien = plano ? null : sube === subirEsBueno;
  const color = bien === null ? 'text-brand-300' : bien ? 'text-emerald-700' : 'text-red-600';

  /*
   * Pasado el 900 %, en veces.
   *
   * Septiembre contra agosto salía «+36.920 %», que es exacto y no lo lee
   * nadie: son 3.058 € contra 8 €. «×38» se entiende de un vistazo y dice lo
   * mismo. Debajo de ahí el porcentaje es la forma en la que se piensa.
   */
  const texto = plano
    ? 'igual'
    : Math.abs(pct) >= 900
      ? `×${Math.round(pct / 100 + 1).toLocaleString('es-ES')}`
      : `${sube ? '+' : ''}${pct.toLocaleString('es-ES')} %`;

  return (
    <span className={color}>
      <span className="font-semibold tabular-nums">{texto}</span>
      <span className="text-brand-300"> vs {contra}</span>
    </span>
  );
}

/**
 * Una cifra de las grandes.
 *
 * El margen se colorea y los demás no. Colorear los cuatro haría que ninguno
 * destacara, y de los cuatro este es el único cuyo signo cambia lo que hay que
 * hacer al día siguiente.
 */
function Cifra({ etiqueta, valor, pie, cambio, tono = 'neutro', a }: {
  etiqueta: string; valor: string; pie?: string;
  /** La variación contra el tramo anterior, si se sabe. */
  cambio?: ReactNode;
  tono?: 'neutro' | 'bien' | 'mal'; a?: string;
}) {
  const color = tono === 'bien' ? 'text-emerald-700' : tono === 'mal' ? 'text-red-600' : 'text-brand-600';
  const dentro = (
    <div className="bg-white rounded-xl border border-brand-200 shadow-sm px-5 py-4 h-full">
      <p className="text-[11px] font-bold uppercase tracking-wider text-brand-300">{etiqueta}</p>
      <p className={`mt-1.5 font-display text-[27px] leading-none font-extrabold tabular-nums ${color}`}>
        {valor}
      </p>
      {cambio && <p className="mt-1.5 text-[11px] leading-snug">{cambio}</p>}
      {pie && <p className="mt-1 text-[11px] text-brand-300 leading-snug">{pie}</p>}
    </div>
  );
  return a
    ? <Link to={a} className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-acento">{dentro}</Link>
    : dentro;
}

export default function Finanzas({ cuentas }: { cuentas: Cuentas }) {
  const { tramo, setTramo, datos, cargando, fallo, puede } = cuentas;
  if (!puede) return null;

  const cabecera = (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300">
        Situación financiera
        {datos && <span className="ml-2 normal-case font-semibold text-brand-400">· {datos.periodo.etiqueta}</span>}
      </h2>
      <div className="flex rounded-lg border border-brand-200 bg-white p-0.5">
        {TRAMOS.map((t) => (
          <button key={t.clave} type="button" onClick={() => setTramo(t.clave)}
                  aria-pressed={tramo === t.clave}
                  className={'px-3 py-1 text-xs font-semibold rounded-md transition-colors ' +
                    (tramo === t.clave ? 'bg-brand-600 text-white' : 'text-brand-400 hover:text-brand-600')}>
            {t.nombre}
          </button>
        ))}
      </div>
    </div>
  );

  if (fallo)  return <section>{cabecera}<p className="text-sm text-red-600">{fallo}</p></section>;
  if (!datos) return <section>{cabecera}<p className="text-sm text-brand-300">Cargando las cuentas…</p></section>;

  const { margen, margenPorcentaje } = datos;
  const antes = datos.anterior;

  return (
    <section className={cargando ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {cabecera}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Cifra etiqueta="Ingresos" valor={euros(datos.ingresos)}
               cambio={antes && <Cambio pct={antes.cambioIngresos} subirEsBueno contra={antes.etiqueta} />}
               pie="facturado sin IVA" a="/contabilidad" />
        <Cifra etiqueta="Gastos" valor={euros(datos.gastos)}
               cambio={antes && <Cambio pct={antes.cambioGastos} subirEsBueno={false} contra={antes.etiqueta} />}
               pie={datos.comprometido > 0
                 ? `y ${euros(datos.comprometido)} comprometidos sin factura`
                 : 'facturas recibidas, sin IVA'}
               a="/provider-billing" />
        <Cifra etiqueta="Margen" valor={euros(margen)}
               tono={margen > 0 ? 'bien' : margen < 0 ? 'mal' : 'neutro'}
               cambio={antes && <Cambio pct={antes.cambioMargen} subirEsBueno contra={antes.etiqueta} />}
               pie={margenPorcentaje === null
                 ? 'sin ingresos en el periodo'
                 : `${margenPorcentaje.toLocaleString('es-ES')} % de los ingresos`} />
        <Cifra etiqueta="Dinero de terceros" valor={euros(datos.suplidos)}
               cambio={antes && <Cambio pct={antes.cambioSuplidos} subirEsBueno contra={antes.etiqueta} />}
               pie="suplidos: entra y sale, no es nuestro" />
      </div>

      {datos.sinAutorepercusion > 0 && (
        /*
         * No mueve el margen —lo autorepercutido se deduce a la vez— pero sí
         * el 349, y el sitio donde alguien lo va a ver es este.
         */
        <Link to="/provider-billing"
              className="mt-3 flex items-center gap-2 rounded-lg border border-acento bg-acento-tenue px-3 py-2 text-[12px] font-semibold text-acento-texto hover:border-acento-oscuro">
          <Icono nombre="aviso" tam={15} />
          {datos.sinAutorepercusion === 1
            ? 'Una factura de la UE no dice a qué tipo se autorepercute, y sin eso no sale el 349'
            : `${datos.sinAutorepercusion} facturas de la UE no dicen a qué tipo se autorepercuten, y sin eso no sale el 349`}
        </Link>
      )}

      {datos.sinDesglosar > 0 && (
        // El número de arriba deja de ser exacto y hay que decirlo donde está
        // el número, no en una pantalla aparte.
        <Link to="/contabilidad"
              className="mt-3 flex items-center gap-2 rounded-lg border border-acento bg-acento-tenue px-3 py-2 text-[12px] font-semibold text-acento-texto hover:border-acento-oscuro">
          <Icono nombre="aviso" tam={15} />
          {datos.sinDesglosar === 1
            ? 'Una factura no dice su IVA, así que estas cifras son aproximadas'
            : `${datos.sinDesglosar} facturas no dicen su IVA, así que estas cifras son aproximadas`}
        </Link>
      )}

      <div className="mt-4 bg-white rounded-xl border border-brand-200 shadow-sm p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-brand-300">Los últimos doce meses</h3>
          <span className="text-[11px] text-brand-300">
            el gráfico va a doce meses aunque arriba se mire otro tramo
          </span>
        </div>
        <GraficoDeMeses meses={datos.meses} />
      </div>
    </section>
  );
}

/**
 * Y de dónde sale cada euro.
 *
 * Va suelto para poder ponerlo donde toca en la página: primero cómo va la
 * empresa, luego quién la usa, y luego de dónde viene el dinero.
 */
export function DeDondeViene({ cuentas }: { cuentas: Cuentas }) {
  const { datos, cargando, puede } = cuentas;
  if (!puede || !datos) return null;

  return (
    <section className={cargando ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-3">
        De dónde viene y a dónde va
        <span className="ml-2 normal-case font-semibold text-brand-400">· {datos.periodo.etiqueta}</span>
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Reparto titulo="Ingresos por línea de negocio" trozos={datos.porLinea} tono="acento"
                 a="/contabilidad" vacio="No se ha facturado nada en este periodo." />
        <Reparto titulo="Gastos por concepto" trozos={datos.porConcepto}
                 a="/provider-billing" vacio="No ha llegado ninguna factura de proveedor en este periodo." />
      </div>
    </section>
  );
}
