/**
 * El manual: cómo funciona cada flujo y qué hay que hacer en el ERP.
 *
 * Los documentos se leen de `docs/` del repositorio, no de una copia ni de la
 * base: lo que lee un trabajador es el mismo fichero que se mantiene junto al
 * código. Si fueran dos sitios, al mes serían dos cosas distintas, y un manual
 * que miente es peor que no tener manual.
 *
 * Se empaquetan al construir, así que la pantalla no llama a la API y funciona
 * aunque el servidor esté caído.
 *
 * Añadir un documento es dejar un `.md` en `docs/`: aparece solo, con el título
 * que lleve dentro. En desarrollo hay que reiniciar `npm run dev` la primera
 * vez, porque `docs/` queda fuera de lo que vigila Vite y no se entera de un
 * fichero nuevo. Al construir sí entra siempre.
 */
import { useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader.js';
import Icono from '../components/ui/Icono.js';
import { interpreta, tituloDe, type Bloque, type Trozo, type Paso } from '../lib/markdown.js';

const FICHEROS = import.meta.glob('../../../../docs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const DOCUMENTOS = Object.entries(FICHEROS)
  .map(([ruta, fuente]) => {
    const fichero = ruta.replace(/^.*\//, '');
    return { fichero, titulo: tituloDe(fuente, fichero), fuente };
  })
  .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));

function Trozos({ trozos }: { trozos: Trozo[] }) {
  return (
    <>
      {trozos.map((t, i) => {
        if (t.tipo === 'fuerte') return <strong key={i} className="font-semibold text-brand-600">{t.texto}</strong>;
        if (t.tipo === 'codigo') return <code key={i} className="font-mono text-[0.9em] bg-brand-50 border border-brand-100 rounded px-1 py-0.5 text-brand-500">{t.texto}</code>;
        if (t.tipo === 'enlace') return <a key={i} href={t.url} className="text-acento-texto underline underline-offset-2">{t.texto}</a>;
        return <span key={i}>{t.texto}</span>;
      })}
    </>
  );
}

/**
 * Quién hace cada paso, y de qué color se ve.
 *
 * El color no decora: dice de un vistazo si algo lo hace el cliente, lo hace
 * solo el sistema, es un correo que sale, o hay una persona detrás. Eso último
 * es lo que importa al leer un flujo — dónde hace falta alguien.
 */
const ACTOR = {
  cliente:    { rotulo: 'Cliente',    caja: 'bg-blue-50 border-blue-200',       texto: 'text-blue-800' },
  sistema:    { rotulo: 'Automático', caja: 'bg-brand-50 border-brand-200',     texto: 'text-brand-500' },
  correo:     { rotulo: 'Correo',     caja: 'bg-violet-50 border-violet-200',   texto: 'text-violet-800' },
  erp:        { rotulo: 'En el ERP',  caja: 'bg-emerald-50 border-emerald-200', texto: 'text-emerald-800' },
  trabajador: { rotulo: 'Una persona', caja: 'bg-acento-tenue border-acento',   texto: 'text-acento-texto' },
} as const;

/** La flecha entre dos cajas. */
function Flecha() {
  return (
    <div className="flex justify-center py-1.5" aria-hidden="true">
      <svg width="14" height="18" viewBox="0 0 14 18" className="text-brand-300">
        <path d="M7 0 V13 M2.5 9 L7 13.5 L11.5 9" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Flujo({ pasos }: { pasos: Paso[] }) {
  return (
    <div className="my-6 max-w-3xl">
      {pasos.map((p, i) => (
        <div key={i}>
          {i > 0 && <Flecha />}

          {p.tipo === 'paso' && (
            <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${ACTOR[p.actor].caja}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wide shrink-0 mt-0.5 w-20 ${ACTOR[p.actor].texto}`}>
                {ACTOR[p.actor].rotulo}
              </span>
              <span className="text-[14px] text-brand-600 leading-snug"><Trozos trozos={p.trozos} /></span>
            </div>
          )}

          {p.tipo === 'pregunta' && (
            <div className="rounded-xl border border-brand-300 border-dashed bg-white px-4 py-3 text-center">
              <span className="text-[14px] font-semibold text-brand-600"><Trozos trozos={p.trozos} /></span>
            </div>
          )}

          {/* Las salidas van en columnas, una al lado de otra: puestas en fila
              se leen como pasos seguidos, y son alternativas. */}
          {p.tipo === 'ramas' && (
            <div className="grid gap-3 sm:grid-cols-3">
              {p.ramas.map((r, j) => (
                <div key={j} className="rounded-xl border border-brand-200 bg-white overflow-hidden flex flex-col">
                  <div className="px-3 py-1.5 bg-brand-50 border-b border-brand-100 text-[11px] font-bold uppercase tracking-wide text-brand-400">
                    {r.caso}
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5">
                    <div className="inline-block rounded-md bg-acento-tenue border border-acento px-2 py-0.5 text-[12px] font-bold text-acento-texto">
                      {r.accion}
                    </div>
                    <p className="text-[13px] text-brand-500 leading-snug"><Trozos trozos={r.resultado} /></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Contenido({ bloques }: { bloques: Bloque[] }) {
  return (
    <div className="space-y-4">
      {bloques.map((b, i) => {
        if (b.tipo === 'titulo') {
          if (b.nivel === 1) return <h1 key={i} className="text-2xl font-bold text-brand-600 mt-2"><Trozos trozos={b.trozos} /></h1>;
          if (b.nivel === 2) return <h2 key={i} className="text-lg font-bold text-brand-600 mt-8 pb-1 border-b border-brand-100"><Trozos trozos={b.trozos} /></h2>;
          return <h3 key={i} className="text-[15px] font-bold text-brand-500 mt-6"><Trozos trozos={b.trozos} /></h3>;
        }
        if (b.tipo === 'separador') return <hr key={i} className="border-brand-100 my-8" />;
        if (b.tipo === 'flujo') return <Flujo key={i} pasos={b.pasos} />;
        if (b.tipo === 'cita') {
          return (
            <blockquote key={i} className="border-l-2 border-acento pl-4 text-[14px] text-brand-400 italic">
              <Trozos trozos={b.trozos} />
            </blockquote>
          );
        }
        if (b.tipo === 'lista') {
          return (
            <ul key={i} className="space-y-1.5 pl-1">
              {b.puntos.map((p, j) => (
                <li key={j} className="flex gap-2.5 text-[14.5px] text-brand-500 leading-relaxed">
                  <span className="text-acento-texto mt-[7px] shrink-0 w-1 h-1 rounded-full bg-acento-texto" />
                  <span><Trozos trozos={p} /></span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.tipo === 'tabla') {
          return (
            // Las tablas de estos documentos son anchas; que ruede la tabla y
            // no la página, o en un móvil no se puede leer nada.
            <div key={i} className="overflow-x-auto rounded-xl border border-brand-200">
              <table className="w-full text-[13.5px] border-collapse">
                <thead>
                  <tr className="bg-brand-50">
                    {b.cabecera.map((c, j) => (
                      <th key={j} className="text-left font-semibold text-brand-500 px-3 py-2 border-b border-brand-200 whitespace-nowrap">
                        <Trozos trozos={c} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.filas.map((fila, j) => (
                    <tr key={j} className="border-b border-brand-100 last:border-0 align-top">
                      {fila.map((c, k) => (
                        <td key={k} className="px-3 py-2 text-brand-500"><Trozos trozos={c} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={i} className="text-[14.5px] text-brand-500 leading-relaxed max-w-3xl"><Trozos trozos={b.trozos} /></p>;
      })}
    </div>
  );
}

export default function ManualPage() {
  const [abierto, setAbierto] = useState(DOCUMENTOS[0]?.fichero ?? '');
  const doc = DOCUMENTOS.find((d) => d.fichero === abierto) ?? DOCUMENTOS[0];
  const bloques = useMemo(() => (doc ? interpreta(doc.fuente) : []), [doc]);

  // Los títulos de segundo nivel hacen de índice: estos documentos son largos y
  // se consultan por un apartado concreto, no se leen de arriba abajo.
  const apartados = useMemo(
    () => bloques.filter((b) => b.tipo === 'titulo' && b.nivel === 2)
      .map((b) => (b as { trozos: Trozo[] }).trozos.map((t) => ('texto' in t ? t.texto : '')).join('')),
    [bloques]
  );

  if (!doc) {
    return (
      <div className="space-y-5">
        <PageHeader title="Manual" subtitle="Cómo funciona cada flujo y qué hacer en el ERP" />
        <div className="rounded-xl border border-brand-200 bg-white px-6 py-10 text-center">
          <p className="text-brand-500 font-semibold mb-1">Todavía no hay ningún documento</p>
          <p className="text-[13px] text-brand-300">Se leen de la carpeta <code className="font-mono">docs/</code> del repositorio.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Manual" subtitle="Cómo funciona cada flujo y qué hacer en el ERP" />

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <nav className="w-full lg:w-64 shrink-0 lg:sticky lg:top-4 space-y-4">
          {DOCUMENTOS.length > 1 && (
            <ul className="rounded-xl border border-brand-200 bg-white overflow-hidden divide-y divide-brand-100">
              {DOCUMENTOS.map((d) => (
                <li key={d.fichero}>
                  <button
                    onClick={() => setAbierto(d.fichero)}
                    className={`w-full text-left px-4 py-2.5 text-[13.5px] transition-colors ${
                      d.fichero === abierto ? 'bg-acento-tenue font-semibold text-acento-texto' : 'text-brand-500 hover:bg-brand-50'
                    }`}
                  >
                    {d.titulo}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {apartados.length > 0 && (
            <div className="rounded-xl border border-brand-200 bg-white px-4 py-3">
              <p className="text-[11px] font-bold text-brand-300 uppercase tracking-wide mb-2">En este documento</p>
              <ul className="space-y-1.5">
                {apartados.map((a) => (
                  <li key={a} className="text-[13px] text-brand-400 leading-snug flex gap-2">
                    <Icono nombre="documento" tam={13} />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>

        <article className="flex-1 min-w-0 rounded-xl border border-brand-200 bg-white px-6 py-6 sm:px-8 sm:py-7">
          <Contenido bloques={bloques} />
        </article>
      </div>
    </div>
  );
}
