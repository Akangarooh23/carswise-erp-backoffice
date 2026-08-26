/**
 * Los iconos del ERP.
 *
 * Antes eran emoji: 🚗 👤 📅. Se veian distintos en cada ordenador —no es lo
 * mismo un emoji en Windows que en un Mac—, no se pueden tenir del color de la
 * marca, y a un trabajador le dicen «esto lo montaron deprisa».
 *
 * Van dibujados aqui, en SVG, y no desde una libreria: son veintitantos, no
 * justifican una dependencia mas, y asi heredan el color del texto con
 * `currentColor` sin pelearse con nadie.
 *
 * Todos comparten rejilla de 24, trazo de 1,75 y esquinas redondeadas. Esa
 * coherencia es la mitad de que un juego de iconos parezca profesional.
 */

export type NombreIcono =
  | 'panel' | 'usuarios' | 'coche' | 'calendario' | 'llave-inglesa'
  | 'ticket' | 'llave' | 'megafono' | 'documento' | 'embudo'
  | 'grafico' | 'taller' | 'tarjeta' | 'edificio' | 'escudo'
  | 'equipo' | 'tabla' | 'historial' | 'servicio' | 'ojo'
  | 'informe' | 'estrella' | 'diamante' | 'reloj' | 'aviso'
  | 'comprobado' | 'euro' | 'bandeja' | 'salir' | 'buscar'
  | 'sobre' | 'telefono' | 'descargar' | 'subir' | 'refrescar'
  | 'imagen' | 'carpeta' | 'lapiz' | 'rayo' | 'bateria'
  | 'surtidor' | 'bidon';

/** Cada entrada es el interior de un <svg viewBox="0 0 24 24">. */
const TRAZOS: Record<NombreIcono, string> = {
  panel:          'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  usuarios:       'M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 11.5a3 3 0 0 0 0-6M21 20v-1a3.5 3.5 0 0 0-2.5-3.4',
  coche:          'M5 17h14M6.5 17v1.5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V17M20.5 17v1.5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V17M3.5 17v-4l2-5a1.5 1.5 0 0 1 1.4-1h10.2a1.5 1.5 0 0 1 1.4 1l2 5v4zM4 13h16M7.5 15h1M15.5 15h1',
  calendario:     'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8.5 3v4M15.5 3v4',
  'llave-inglesa':'M14.5 6.5a4 4 0 0 0 5 5l-8 8a2.8 2.8 0 0 1-4-4l8-8a4 4 0 0 0-1-1z',
  ticket:         'M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5V10a2 2 0 0 0 0 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5V14a2 2 0 0 0 0-4zM12 7v2M12 13v2',
  llave:          'M15.5 4a4.5 4.5 0 1 1-4.3 5.8L4 17v3h3v-2h2v-2h2l1.7-1.7A4.5 4.5 0 0 1 15.5 4M16.5 8.5h.01',
  megafono:       'M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1zM17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11',
  documento:      'M6 3.5h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1zM13 3.5V9h5M8.5 13h7M8.5 16.5h7',
  embudo:         'M4 5h16l-6 7v6.5l-4 2V12z',
  grafico:        'M4 20V4M4 20h16M7.5 16l3.5-4.5 3 2.5 5-6.5',
  taller:         'M6.5 3.5 9 6l-2 2-2.5-2.5A3.5 3.5 0 0 0 9 10l7.5 7.5a2 2 0 1 1-2.8 2.8L6 12.8A3.5 3.5 0 0 0 6.5 3.5M15 5.5 19 3l2 2-2.5 4-2-2z',
  tarjeta:        'M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5zM3.5 10h17M7 14.5h3',
  edificio:       'M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M14 9h4a1 1 0 0 1 1 1v10M3 20h18M8 8h3M8 12h3M8 16h3M16.5 13h.5M16.5 16.5h.5',
  escudo:         'M12 3.5 5 6v5.5c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6zM9 12l2 2 4-4',
  equipo:         'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3.5 20v-1.5A3.5 3.5 0 0 1 7 15h4a3.5 3.5 0 0 1 3.5 3.5V20M16 5.5a3 3 0 0 1 0 6M17 15h.5a3.5 3.5 0 0 1 3 3.5V20',
  tabla:          'M3.5 6A1.5 1.5 0 0 1 5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18zM3.5 9h17M3.5 14h17M9.5 9v10.5M15 9v10.5',
  historial:      'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 5v4h4M12 7.5V12l3 2',
  servicio:       'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8',
  ojo:            'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  informe:        'M6 3.5h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM9 8.5h6M9 12h6M9 15.5h3',
  estrella:       'm12 4 2.5 5.2 5.5.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.5-.8z',
  diamante:       'm12 3 5 5-5 13-5-13zM7 8h10M12 3 9 8M12 3l3 5',
  reloj:          'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5.2l3.4 2',
  aviso:          'M12 3.5 2.5 20h19zM12 10v4.5M12 17.2h.01',
  comprobado:     'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8 12.2l2.7 2.8L16 9.5',
  euro:           'M17.5 6.2A7 7 0 1 0 17.5 17.8M4 10.5h9M4 13.5h9',
  bandeja:        'M3.5 13.5 6 5.5h12l2.5 8v5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1zM3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5',
  salir:          'M9 4.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H9M15 8l4 4-4 4M19 12H9',
  buscar:         'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  sobre:          'M3.5 7A1.5 1.5 0 0 1 5 5.5h14A1.5 1.5 0 0 1 20.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17zM3.5 7.5 12 13l8.5-5.5',
  telefono:       'M7 3.5H4.8a1.5 1.5 0 0 0-1.5 1.7c.5 4 2.2 7.5 4.8 10.1s6.2 4.3 10.1 4.8a1.5 1.5 0 0 0 1.7-1.5V16a1.5 1.5 0 0 0-1.3-1.5l-2.4-.3a1.5 1.5 0 0 0-1.4.6l-.8 1a12 12 0 0 1-5.3-5.3l1-.8a1.5 1.5 0 0 0 .6-1.4l-.3-2.4A1.5 1.5 0 0 0 7 3.5z',
  descargar:      'M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4 17v2.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V17',
  subir:          'M12 15V4M7.5 8 12 3.5 16.5 8M4 17v2.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V17',
  refrescar:      'M20 12a8 8 0 1 1-2.5-5.8M20.5 3.5v4.5H16',
  imagen:         'M3.5 6A1.5 1.5 0 0 1 5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18zM8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M3.5 16l4.5-4.5 4 4 3-2.5 5 4.5',
  carpeta:        'M3.5 6.5a1 1 0 0 1 1-1h4l2 2.5h8a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1z',
  lapiz:          'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17zM14.5 5.5l4 4',
  rayo:           'M13.5 3 5 13.5h6L10.5 21 19 10.5h-6z',
  bateria:        'M3.5 8.5A1.5 1.5 0 0 1 5 7h11a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 17H5a1.5 1.5 0 0 1-1.5-1.5zM20 10.5v3M6.5 10.5v3M10 10.5v3',
  surtidor:       'M5 20V5.5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 13 5.5V20M3.5 20h11M6.5 7.5h5v3.5h-5zM13 9h3.5a1 1 0 0 1 1 1v6a1.5 1.5 0 0 0 3 0v-6l-2-3',
  bidon:          'M12 20.5c3 0 5.5-2.3 5.5-5.2 0-3.8-5.5-11.8-5.5-11.8S6.5 11.5 6.5 15.3c0 2.9 2.5 5.2 5.5 5.2z',
};

export interface PropsIcono {
  nombre: NombreIcono;
  /** Lado en pixeles. El trazo se mantiene proporcional. */
  tam?: number;
  className?: string;
  /** Si el icono dice algo que el texto de al lado no dice, ponle titulo. */
  titulo?: string;
}

export default function Icono({ nombre, tam = 18, className = '', titulo }: PropsIcono) {
  const d = TRAZOS[nombre];
  if (!d) return null;
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
