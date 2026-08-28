/**
 * El markdown que usan los documentos de `docs/`, y solo ese.
 *
 * No es un intérprete de markdown completo ni pretende serlo: entiende lo que
 * escribimos —títulos, párrafos, listas, tablas, citas, separadores, negrita,
 * `código` y enlaces— y nada más. Traer una librería para esto habría metido
 * una dependencia y un intérprete de HTML arbitrario en una pantalla que solo
 * enseña ficheros nuestros.
 *
 * Devuelve una estructura, no HTML: quien pinta decide cómo, y esto se puede
 * probar sin navegador.
 */

export type Trozo =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'fuerte'; texto: string }
  | { tipo: 'codigo'; texto: string }
  | { tipo: 'enlace'; texto: string; url: string };

/** Quién hace el paso. Da el color de la caja, para verlo de un vistazo. */
export type Actor = 'cliente' | 'sistema' | 'correo' | 'erp' | 'trabajador';

export type Paso =
  | { tipo: 'paso'; actor: Actor; trozos: Trozo[] }
  | { tipo: 'pregunta'; trozos: Trozo[] }
  | { tipo: 'ramas'; ramas: { caso: string; accion: string; resultado: Trozo[] }[] };

export type Bloque =
  | { tipo: 'titulo'; nivel: 1 | 2 | 3; trozos: Trozo[] }
  | { tipo: 'parrafo'; trozos: Trozo[] }
  | { tipo: 'lista'; puntos: Trozo[][] }
  | { tipo: 'tabla'; cabecera: Trozo[][]; filas: Trozo[][][] }
  | { tipo: 'cita'; trozos: Trozo[] }
  | { tipo: 'flujo'; pasos: Paso[] }
  | { tipo: 'separador' };

const ACTORES: Actor[] = ['cliente', 'sistema', 'correo', 'erp', 'trabajador'];

/**
 * Parte una línea en trozos con formato.
 *
 * Se recorre en un solo paso y por orden de aparición, no aplicando una
 * sustitución detrás de otra: así `**texto con `código` dentro**` no se rompe, y
 * nada de lo que venga del documento acaba interpretado como etiqueta.
 */
export function trozos(linea: string): Trozo[] {
  const fuera: Trozo[] = [];
  let suelto = '';
  const suelta = () => {
    if (suelto) { fuera.push({ tipo: 'texto', texto: suelto }); suelto = ''; }
  };

  for (let i = 0; i < linea.length; i++) {
    const resto = linea.slice(i);

    const enlace = /^\[([^\]]+)\]\(([^)]+)\)/.exec(resto);
    if (enlace) {
      suelta();
      fuera.push({ tipo: 'enlace', texto: enlace[1], url: enlace[2] });
      i += enlace[0].length - 1;
      continue;
    }

    const negrita = /^\*\*([^*]+)\*\*/.exec(resto);
    if (negrita) {
      suelta();
      fuera.push({ tipo: 'fuerte', texto: negrita[1] });
      i += negrita[0].length - 1;
      continue;
    }

    const codigo = /^`([^`]+)`/.exec(resto);
    if (codigo) {
      suelta();
      fuera.push({ tipo: 'codigo', texto: codigo[1] });
      i += codigo[0].length - 1;
      continue;
    }

    suelto += linea[i];
  }
  suelta();
  return fuera;
}

/** Las celdas de una fila de tabla, sin las barras de los extremos. */
function celdas(linea: string): string[] {
  return linea.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

const esSeparadorDeTabla = (l: string) => /^\s*\|?[\s:-]*-[\s|:-]*$/.test(l) && l.includes('-');

export function interpreta(fuente: string): Bloque[] {
  const lineas = fuente.replace(/\r\n/g, '\n').split('\n');
  const fuera: Bloque[] = [];
  let i = 0;

  while (i < lineas.length) {
    const l = lineas[i];

    if (!l.trim()) { i++; continue; }

    if (/^---+\s*$/.test(l)) { fuera.push({ tipo: 'separador' }); i++; continue; }

    // Un flujo: cajas encadenadas, para ver de un vistazo quién hace qué.
    //
    //   :::flujo
    //   cliente: elige día y hora
    //   ? ¿puede ese día?
    //   rama Sí | Confirmar | queda confirmada
    //   :::
    if (/^:::\s*flujo\s*$/.test(l.trim())) {
      i++;
      const pasos: Paso[] = [];
      let ramas: { caso: string; accion: string; resultado: Trozo[] }[] = [];
      const cierraRamas = () => {
        if (ramas.length) { pasos.push({ tipo: 'ramas', ramas }); ramas = []; }
      };

      while (i < lineas.length && !/^:::\s*$/.test(lineas[i].trim())) {
        const linea = lineas[i].trim();
        i++;
        if (!linea) continue;

        const rama = /^rama\s+([^|]+)\|([^|]+)\|(.*)$/.exec(linea);
        if (rama) {
          ramas.push({ caso: rama[1].trim(), accion: rama[2].trim(), resultado: trozos(rama[3].trim()) });
          continue;
        }
        cierraRamas();

        if (linea.startsWith('?')) {
          pasos.push({ tipo: 'pregunta', trozos: trozos(linea.replace(/^\?\s*/, '')) });
          continue;
        }

        const paso = /^([a-záéíóúñ]+)\s*:\s*(.*)$/i.exec(linea);
        if (paso && ACTORES.includes(paso[1].toLowerCase() as Actor)) {
          pasos.push({ tipo: 'paso', actor: paso[1].toLowerCase() as Actor, trozos: trozos(paso[2]) });
          continue;
        }
        // Una línea que no encaja se enseña igual, como paso del sistema: es
        // mejor que se vea rara a que desaparezca sin que nadie se entere.
        pasos.push({ tipo: 'paso', actor: 'sistema', trozos: trozos(linea) });
      }
      cierraRamas();
      i++; // el ::: de cierre
      fuera.push({ tipo: 'flujo', pasos });
      continue;
    }

    const titulo = /^(#{1,3})\s+(.*)$/.exec(l);
    if (titulo) {
      fuera.push({ tipo: 'titulo', nivel: titulo[1].length as 1 | 2 | 3, trozos: trozos(titulo[2]) });
      i++;
      continue;
    }

    // Tabla: una fila con barras seguida de la línea de guiones.
    if (l.includes('|') && i + 1 < lineas.length && esSeparadorDeTabla(lineas[i + 1])) {
      const cabecera = celdas(l).map(trozos);
      i += 2;
      const filas: Trozo[][][] = [];
      while (i < lineas.length && lineas[i].includes('|') && lineas[i].trim()) {
        filas.push(celdas(lineas[i]).map(trozos));
        i++;
      }
      fuera.push({ tipo: 'tabla', cabecera, filas });
      continue;
    }

    if (/^\s*[-*]\s+/.test(l)) {
      const puntos: Trozo[][] = [];
      while (i < lineas.length && /^\s*[-*]\s+/.test(lineas[i])) {
        // Un punto puede seguir en la línea de abajo si va sangrada.
        let texto = lineas[i].replace(/^\s*[-*]\s+/, '');
        i++;
        while (i < lineas.length && /^\s{2,}\S/.test(lineas[i]) && !/^\s*[-*]\s+/.test(lineas[i])) {
          texto += ' ' + lineas[i].trim();
          i++;
        }
        puntos.push(trozos(texto));
      }
      fuera.push({ tipo: 'lista', puntos });
      continue;
    }

    if (/^>\s?/.test(l)) {
      fuera.push({ tipo: 'cita', trozos: trozos(l.replace(/^>\s?/, '')) });
      i++;
      continue;
    }

    // Párrafo: hasta la línea en blanco, uniendo los saltos como hace markdown.
    let parrafo = l.trim();
    i++;
    while (
      i < lineas.length && lineas[i].trim() &&
      !/^(#{1,3})\s/.test(lineas[i]) && !/^---+\s*$/.test(lineas[i]) &&
      !/^\s*[-*]\s+/.test(lineas[i]) && !/^>\s?/.test(lineas[i]) &&
      !(lineas[i].includes('|') && i + 1 < lineas.length && esSeparadorDeTabla(lineas[i + 1]))
    ) {
      parrafo += ' ' + lineas[i].trim();
      i++;
    }
    fuera.push({ tipo: 'parrafo', trozos: trozos(parrafo) });
  }

  return fuera;
}

/** El primer título de nivel 1, que es como se llama el documento. */
export function tituloDe(fuente: string, siNoHay: string): string {
  const m = /^#\s+(.+)$/m.exec(fuente.replace(/\r\n/g, '\n'));
  return m ? m[1].trim() : siNoHay;
}
