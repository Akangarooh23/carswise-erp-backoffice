/**
 * El camino de un coche, de un vistazo.
 *
 * Un expediente cruza cinco pantallas, y hasta ahora saber en qué punto estaba
 * era abrirlas todas y reconstruirlo de memoria. Con un coche se puede; con
 * quince, lo que pasa es que uno se queda parado tres semanas porque nadie se
 * acordó de que el perito no había contestado.
 *
 * Lo que se enseña son cuatro cosas y en este orden: **lo que toca ahora**
 * —arriba y solo—, lo hecho con su fecha, lo que se espera de alguien de fuera
 * con los días que lleva, y lo que aún no toca en gris.
 *
 * Los estados y los plazos salen de `pasos-de-la-importacion`, que es el mismo
 * sitio del que sale el número rojo del menú. Dos cuentas separadas del mismo
 * coche acaban diciendo cosas distintas.
 */
import { useState } from 'react';
import type { Expediente } from '../lib/expedientes-importacion.js';
import {
  pasosDeLaImportacion, loQueToca, loQueSeEspera, loQueFaltaAparte, type Paso,
} from '../lib/pasos-de-la-importacion.js';

const dia = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('es-ES') : '');

const MARCA: Record<string, { icono: string; color: string }> = {
  hecho:     { icono: '✓', color: 'text-emerald-700' },
  toca:      { icono: '●', color: 'text-amber-700' },
  esperando: { icono: '⏳', color: 'text-brand-500' },
  porVenir:  { icono: '○', color: 'text-brand-300' },
};

function Linea({ p }: { p: Paso }) {
  const m = MARCA[p.estado] ?? MARCA.porVenir;
  const esperaLarga = p.estado === 'esperando' && (p.dias ?? 0) >= 1;
  return (
    <div className="flex items-start gap-2 py-1">
      <span className={`text-[12px] leading-5 w-4 shrink-0 ${m.color}`}>{m.icono}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-[12px] leading-5 ${
          p.estado === 'toca' ? 'font-bold text-amber-800'
          : p.estado === 'porVenir' ? 'text-brand-300'
          : 'text-brand-600'}`}>
          {p.titulo}
        </div>
        {(p.cuando || p.detalle || esperaLarga) && (
          <div className="text-[11px] text-brand-400">
            {[
              p.cuando ? dia(p.cuando) : null,
              p.detalle || null,
              esperaLarga ? `${p.dias} ${p.dias === 1 ? 'día' : 'días'} esperando` : null,
            ].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      {p.donde && p.estado === 'toca' && (
        <a href={p.donde} className="text-[11px] text-brand-400 underline underline-offset-2 shrink-0">
          ir →
        </a>
      )}
    </div>
  );
}

export default function CaminoDelCoche({ x }: { x: Expediente }) {
  const [abierto, setAbierto] = useState(false);
  const pasos = pasosDeLaImportacion(x);
  const toca = loQueToca(pasos);
  const espera = loQueSeEspera(pasos);
  const aparte = loQueFaltaAparte(pasos);
  const hechos = pasos.filter((p) => p.estado === 'hecho').length;

  return (
    <div className="mb-4 rounded-xl border border-brand-200 bg-white overflow-hidden">
      {/*
        * Lo que toca, antes que nada.
        *
        * Es la respuesta a «y ahora qué», que es la pregunta con la que se abre
        * un expediente. Si no toca nada nuestro se dice a quién se espera y
        * desde cuándo: no saber si la pelota es tuya es lo que deja un coche
        * parado tres semanas.
        */}
      <div className={`px-3 py-2 ${toca ? 'bg-amber-50 border-b border-amber-200' : 'bg-brand-50 border-b border-brand-200'}`}>
        <div className="text-[10px] uppercase tracking-wide text-brand-400">
          {toca ? 'Ahora toca' : espera ? 'Esperando' : aparte.length ? 'Nada que mueva el coche' : 'Nada pendiente'}
        </div>
        <div className={`text-[13px] font-bold ${toca ? 'text-amber-800' : 'text-brand-600'}`}>
          {toca?.titulo ?? espera?.titulo
            ?? (aparte.length ? 'El coche puede seguir' : 'El expediente está cerrado')}
          {!toca && espera?.dias ? ` · ${espera.dias} ${espera.dias === 1 ? 'día' : 'días'}` : ''}
        </div>
        {/*
          * Y lo que hay que hacer sin que el coche lo espere.
          *
          * Va debajo y en pequeño: la factura del perito hay que pedirla, pero
          * el expediente sigue a transporte y a trámites sin ella. Puesta
          * arriba parecía que había algo parado.
          */}
        {aparte.length > 0 && (
          <div className="text-[11px] text-brand-400 mt-1">
            Además, sin que el coche lo espere: {aparte.map((x) => x.titulo.toLowerCase()).join(' · ')}
          </div>
        )}
      </div>

      <button onClick={() => setAbierto((v) => !v)}
              className="w-full px-3 py-1.5 text-left text-[11px] text-brand-400 hover:bg-brand-50">
        {abierto ? 'Ocultar el camino' : `El camino de este coche · ${hechos} de ${pasos.length} hechos`}
      </button>

      {abierto && (
        <div className="px-3 pb-3 border-t border-brand-100">
          {pasos.map((p) => <Linea key={p.clave} p={p} />)}
        </div>
      )}
    </div>
  );
}
