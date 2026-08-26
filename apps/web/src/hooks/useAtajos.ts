import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DESTINOS } from '../components/ui/PaletaComandos.js';
import type { Role } from '../types/index.js';

/**
 * Los atajos de teclado del ERP.
 *
 * El cuidado esta en no secuestrar el teclado: si alguien esta escribiendo la
 * matricula de un coche y teclea una «m», no puede irse al Marketplace. Por eso
 * lo primero que hace cada tecla es mirar donde esta el cursor, y si esta en un
 * campo, en un desplegable o en un texto editable, no pasa nada.
 *
 * Ctrl+K es la excepcion: funciona siempre, tambien escribiendo, porque para
 * eso es una combinacion y no una letra suelta.
 *
 *   Ctrl/Cmd + K   abrir «ir a»
 *   g y una letra  ir directo: g l a Leads, g m a Marketplace…
 *   /              saltar al buscador de la pantalla
 *   ?              ver todos los atajos
 *   Esc            cerrar lo que este abierto
 *
 * La «g» espera un segundo a la segunda tecla. Pasado ese tiempo se olvida, que
 * es lo que evita que una «g» perdida se coma la siguiente pulsacion.
 */

const ESPERA_SECUENCIA = 1000;

function escribiendo(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const etiqueta = t.tagName;
  return (
    etiqueta === 'INPUT' ||
    etiqueta === 'TEXTAREA' ||
    etiqueta === 'SELECT' ||
    t.isContentEditable === true
  );
}

export function useAtajos(rol: Role) {
  const [paleta, setPaleta] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const navegar = useNavigate();
  const esperandoG = useRef(false);
  const reloj = useRef<number | undefined>(undefined);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K funciona siempre, tambien escribiendo.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaleta((v) => !v);
        return;
      }
      if (e.key === 'Escape') { setPaleta(false); setAyuda(false); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (escribiendo(e)) return;

      // Segunda tecla de la secuencia «g …».
      if (esperandoG.current) {
        esperandoG.current = false;
        window.clearTimeout(reloj.current);
        const d = DESTINOS.find((x) => x.atajo === e.key.toLowerCase() && x.roles.includes(rol));
        if (d) { e.preventDefault(); navegar(d.a); }
        return;
      }

      if (e.key === 'g') {
        esperandoG.current = true;
        reloj.current = window.setTimeout(() => { esperandoG.current = false; }, ESPERA_SECUENCIA);
        return;
      }

      if (e.key === '/') {
        // El buscador de la pantalla, sea cual sea.
        const b = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[placeholder*="uscar" i], input[aria-label*="uscar" i]'
        );
        if (b) { e.preventDefault(); b.focus(); b.select(); }
        return;
      }

      if (e.key === '?') { e.preventDefault(); setAyuda((v) => !v); }
    };

    window.addEventListener('keydown', alPulsar);
    return () => {
      window.removeEventListener('keydown', alPulsar);
      window.clearTimeout(reloj.current);
    };
  }, [navegar, rol]);

  return {
    paleta, abrirPaleta: () => setPaleta(true), cerrarPaleta: () => setPaleta(false),
    ayuda, cerrarAyuda: () => setAyuda(false),
  };
}
