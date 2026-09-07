/**
 * La marca, del lado del navegador del ERP.
 *
 * Es un gemelo de `apps/api/src/lib/marca.ts`. No es un descuido: `apps/api` y
 * `apps/web` son dos paquetes distintos y no hay un `packages/` compartido, asi
 * que la pantalla no puede importar el fichero del servidor.
 *
 * Lo comprueba `npm run test:marca`, que compara los dos y falla si dicen cosas
 * distintas.
 */

/** Donde vive la web publica de cara al cliente, no el ERP. */
export const SITIO_URL = 'https://www.popcar.com.es';

/** El marketplace, que es a donde llevan casi todos los enlaces de aqui. */
export const MARKETPLACE_URL = `${SITIO_URL}/marketplace-vo`;
