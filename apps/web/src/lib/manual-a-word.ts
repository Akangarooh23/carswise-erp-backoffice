/**
 * Un manual, en un fichero que abre Word.
 *
 * ## Por qué esto es HTML y no un .docx de verdad
 *
 * Word abre HTML como si fuera suyo: respeta negritas, tablas, colores y
 * márgenes, y deja el documento editable. Un `.docx` de verdad es un zip con
 * XML dentro y hace falta una biblioteca para escribirlo — y el paquete de la
 * web ya avisa de que pasa de 500 kB. A cambio de nada: lo que se quiere es
 * mandarle el manual a alguien que no entra al ERP, y eso lo hace igual.
 *
 * La extensión es `.doc` porque es la que hace que Windows lo abra con Word sin
 * preguntar.
 *
 * ## Lo que aquí no puede pasar
 *
 * En pantalla, cada caja del flujo esconde detrás de un clic **en qué pantalla
 * se hace** y **qué se teclea**. En papel no hay clics: si el Word se generara
 * copiando lo que se ve, saldría un manual de ejecución sin ninguna de las dos
 * cosas — justo la mitad que se va a leer con el ERP abierto al lado. Por eso
 * aquí se despliega todo, siempre.
 */
import { ROTULO, type Bloque, type Paso, type Trozo } from './markdown.js';

/**
 * Nada de lo que venga del documento acaba interpretado como etiqueta.
 *
 * Los manuales llevan nombres de tabla y de columna entre acentos graves, y
 * alguno lleva comparaciones con `<`. Sin escapar, un `<b` del texto se lo come
 * Word como marcado y a partir de ahí el documento sale torcido.
 */
export function escapa(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Un trozo de línea con su formato. */
function enLinea(trozos: Trozo[] = []): string {
  return trozos
    .map((t) => {
      const texto = escapa(t.texto);
      if (t.tipo === 'fuerte') return `<b>${texto}</b>`;
      if (t.tipo === 'codigo') return `<span style="font-family:Consolas,monospace;font-size:9.5pt">${texto}</span>`;
      if (t.tipo === 'enlace') return `<a href="${escapa(t.url)}">${texto}</a>`;
      return texto;
    })
    .join('');
}

/** El color del rótulo de cada actor, en el mismo orden de lectura que la web. */
const COLOR: Record<string, string> = {
  cliente: '#1e40af',
  sistema: '#57534e',
  correo: '#5b21b6',
  erp: '#065f46',
  trabajador: '#92400e',
};

const CELDA = 'border:0.5pt solid #d6d3d1;padding:6pt 8pt;vertical-align:top';

/**
 * Una caja del flujo: quién lo hace, qué hace, dónde y con qué datos.
 *
 * Va como fila de tabla y no como recuadro suelto porque las tablas son lo
 * único que Word coloca igual en pantalla y al imprimir.
 */
function laCaja(paso: Paso): string {
  if (paso.tipo === 'pregunta') {
    return `<tr><td colspan="2" style="${CELDA};text-align:center;background:#fafaf9">`
      + `<b>${enLinea(paso.trozos)}</b></td></tr>`;
  }

  if (paso.tipo === 'ramas') {
    const ramas = paso.ramas
      .map((r) => `<p style="margin:0 0 4pt"><b>${escapa(r.caso)}</b> · ${escapa(r.accion)}<br>`
        + `<span style="color:#57534e">${enLinea(r.resultado)}</span></p>`)
      .join('');
    return `<tr><td colspan="2" style="${CELDA}">${ramas}</td></tr>`;
  }

  const rotulo = `<td style="${CELDA};width:80pt;color:${COLOR[paso.actor] ?? '#57534e'};`
    + `font-size:8pt;font-weight:bold;text-transform:uppercase">${escapa(ROTULO[paso.actor])}</td>`;

  // Lo que en pantalla está plegado. En papel se escribe entero.
  const donde = paso.donde
    ? `<p style="margin:4pt 0 0;color:#57534e;font-size:9.5pt">Dónde: ${enLinea(paso.donde)}</p>`
    : '';
  const mete = paso.mete
    ? `<p style="margin:2pt 0 0;color:#78716c;font-size:9.5pt">Se mete: ${enLinea(paso.mete)}</p>`
    : '';

  return `<tr>${rotulo}<td style="${CELDA}">`
    + `<p style="margin:0">${enLinea(paso.trozos)}</p>${donde}${mete}</td></tr>`;
}

function elBloque(b: Bloque): string {
  switch (b.tipo) {
    case 'titulo': {
      const tam = b.nivel === 1 ? '19pt' : b.nivel === 2 ? '14pt' : '11.5pt';
      const arriba = b.nivel === 1 ? '0' : '18pt';
      return `<h${b.nivel} style="font-size:${tam};margin:${arriba} 0 6pt;color:#1c1917">`
        + `${enLinea(b.trozos)}</h${b.nivel}>`;
    }
    case 'parrafo':
      return `<p style="margin:0 0 8pt;line-height:1.45">${enLinea(b.trozos)}</p>`;
    case 'lista':
      return `<ul style="margin:0 0 8pt">`
        + b.puntos.map((p) => `<li style="margin-bottom:3pt">${enLinea(p)}</li>`).join('')
        + `</ul>`;
    case 'cita':
      return `<p style="margin:0 0 8pt;padding:6pt 10pt;border-left:2pt solid #f5b301;`
        + `background:#fafaf9;color:#57534e">${enLinea(b.trozos)}</p>`;
    case 'tabla': {
      const cabecera = b.cabecera
        .map((c) => `<th style="${CELDA};background:#f5f5f4;text-align:left">${enLinea(c)}</th>`)
        .join('');
      const filas = b.filas
        .map((f) => `<tr>${f.map((c) => `<td style="${CELDA}">${enLinea(c)}</td>`).join('')}</tr>`)
        .join('');
      return `<table style="border-collapse:collapse;width:100%;margin:0 0 12pt">`
        + `<tr>${cabecera}</tr>${filas}</table>`;
    }
    case 'flujo':
      return `<table style="border-collapse:collapse;width:100%;margin:0 0 12pt">`
        + b.pasos.map(laCaja).join('')
        + `</table>`;
    case 'separador':
      return `<hr style="border:none;border-top:0.5pt solid #e7e5e4;margin:14pt 0">`;
  }
}

/**
 * El documento entero.
 *
 * Lleva el juego de caracteres declarado porque si no Word se inventa el suyo y
 * los manuales, que están en español, salen llenos de símbolos raros.
 */
export function aWord(titulo: string, bloques: Bloque[]): string {
  const cuerpo = bloques.map(elBloque).join('\n');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" `
    + `xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">`
    + `<head><meta charset="utf-8"><title>${escapa(titulo)}</title>`
    + `<style>@page{size:A4;margin:2cm} body{font-family:Calibri,sans-serif;font-size:11pt;color:#1c1917}`
    + `table{font-size:10.5pt}</style></head>`
    + `<body>${cuerpo}</body></html>`;
}

/**
 * Cómo se llama el fichero que se descarga.
 *
 * El `NFD` parte cada letra acentuada en letra y tilde, y quitar después todo
 * lo que no sea ASCII deja la letra. Sin eso, «Flujo de importación» acabaría
 * con un guion en medio de la palabra.
 */
export function nombreDelFichero(titulo: string): string {
  const limpio = titulo
    .normalize('NFD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${limpio || 'manual'}.doc`;
}

/**
 * Y el fichero.
 *
 * La marca del principio —el BOM— es lo que hace que Word reconozca que el
 * texto viene en UTF-8. Sin ella, y aunque la cabecera lo diga, abre el
 * documento con la codificación del sistema y las tildes salen rotas.
 */
export function elFichero(titulo: string, bloques: Bloque[]): Blob {
  return new Blob(['﻿', aWord(titulo, bloques)], { type: 'application/msword;charset=utf-8' });
}
