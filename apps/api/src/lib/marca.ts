/**
 * La marca del ERP, en un solo sitio.
 *
 * Estaba repartida: el dominio dentro de `correo.ts`, otra vez a mano en las
 * dos esquinas de la factura en PDF, y una tercera como valor por defecto de
 * `PUBLIC_SITE_URL`. Cuando la web paso de popcar.tech a popcar.com.es, ninguna
 * de las tres se entero.
 *
 * Esto es el gemelo de `lib/marca.js` del repositorio de la web. Son dos
 * repositorios y dos despliegues distintos, asi que no pueden compartir
 * fichero; lo que si tienen que compartir es el valor.
 */

/** Donde vive la web publica. Se puede cambiar con PUBLIC_SITE_URL. */
export const SITIO = 'www.popcar.com.es';
export const SITIO_URL = 'https://www.popcar.com.es';

/**
 * El dominio anterior. Sigue sirviendo y redirige al nuevo con un 308, y hay
 * correos ya enviados con enlaces suyos que tienen que seguir abriendo.
 */
export const DOMINIO_ANTERIOR = 'popcar.tech';

/**
 * El espacio de nombres de los UID de calendario. NO sigue a la marca.
 *
 * Un UID no es una direccion, es un identificador estable: es lo que hace que
 * reenviar una cita actualice la del calendario del cliente en vez de crear
 * una segunda. Las citas confirmadas antes del cambio de dominio llevan este
 * valor, asi que moverlo les daria un UID distinto al reenviarse y el cliente
 * acabaria con la cita duplicada.
 *
 * Nadie lo ve. No se cambia aunque cambie el dominio de la web.
 */
export const DOMINIO_UID = 'popcar.tech';

/**
 * El unico buzon de la casa que recibe de verdad.
 *
 * No lleva el dominio de la web a proposito. Ninguno de los dominios de la web
 * tiene registro MX —ni popcar.com.es, ni popcar.tech—, asi que una direccion
 * suya se ve bien y no llega a ninguna parte. Este vive en el Microsoft 365 de
 * popcarmobility.com, que si tiene MX, y esta verificado en Resend para enviar.
 */
export const CORREO_CONTACTO = 'hola@popcarmobility.com';

export const NOMBRE = 'PopCar';
export const RAZON_SOCIAL = 'PopCar Mobility S.L.';
