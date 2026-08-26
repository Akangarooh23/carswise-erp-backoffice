/**
 * Ninguna dirección puede estar registrada dos veces.
 *
 * Express se queda con la primera que encuentra y no avisa de nada. Así estuvo
 * `POST /api/marketplace/vo/bulk`: una ruta antigua de alta masiva por Excel y,
 * más abajo, la de activar y desactivar en bloque, en la misma dirección. La
 * primera contestaba «no_rows» y se acababa ahí, así que seleccionar cincuenta
 * vehículos y pulsar «Desactivar» no hacía nada. Sin error en pantalla.
 *
 * Es un fallo que no se ve leyendo el fichero —las dos rutas estaban a ciento
 * cuarenta líneas de distancia— y que no da la cara hasta que alguien usa el
 * botón. Por eso se comprueba sobre la aplicación montada.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';

interface CapaExpress {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: CapaExpress[] };
}

/** Recorre la aplicación y saca «MÉTODO /ruta» de cada punto de entrada. */
function direcciones(): string[] {
  const app = createApp() as unknown as { _router?: { stack: CapaExpress[] }; router?: { stack: CapaExpress[] } };
  const raiz = app._router?.stack ?? app.router?.stack ?? [];
  const salida: string[] = [];

  const recorre = (capas: CapaExpress[]) => {
    for (const capa of capas) {
      if (capa.route) {
        for (const metodo of Object.keys(capa.route.methods)) {
          salida.push(`${metodo.toUpperCase()} ${capa.route.path}`);
        }
      } else if (capa.handle?.stack) {
        recorre(capa.handle.stack);
      }
    }
  };
  recorre(raiz);
  return salida;
}

describe('las rutas de la API', () => {
  test('la aplicación monta y expone rutas', () => {
    const d = direcciones();
    assert.ok(d.length > 40, `solo se han encontrado ${d.length} rutas: el recorrido no está llegando`);
  });

  test('ninguna está registrada dos veces', () => {
    const cuenta = new Map<string, number>();
    for (const d of direcciones()) cuenta.set(d, (cuenta.get(d) ?? 0) + 1);

    const repetidas = [...cuenta.entries()].filter(([, n]) => n > 1).map(([d, n]) => `${d} (×${n})`);
    assert.deepEqual(
      repetidas, [],
      'una dirección repetida deja muerta la segunda: Express solo ejecuta la primera'
    );
  });
});
