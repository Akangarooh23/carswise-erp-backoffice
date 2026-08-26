/**
 * Saca a fichero cada correo que manda el ERP, para poder mirarlos.
 *
 * No es una prueba: es la forma de ver lo que le llega al cliente sin
 * mandárselo. Se ejecuta con `npx tsx src/lib/muestra-correos.ts <carpeta>`.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { plantilla, parrafo, datos, aviso, boton, enlace, MARCA } from './correo.js';

const salida = process.argv[2] || '.';
mkdirSync(salida, { recursive: true });

const PANEL = `${MARCA.sitioUrl}/panel/solicitudes`;

const CORREOS: [string, string][] = [
  ['cita', plantilla({
    titulo: 'Tu cita está lista',
    cuerpo:
      parrafo('Hola <strong>Ana Picazo</strong>,') +
      parrafo('Hemos gestionado tu solicitud de visita para el vehículo <strong>Volkswagen T-Roc 1.5 TSI Sport</strong>.') +
      datos([['Fecha', 'martes, 8 de septiembre de 2026'], ['Hora', '17:30'],
             ['Dirección', 'Calle Alcalá 120, Madrid'], ['Pregunta por', 'Javier Ruiz']]) +
      aviso('Confirma la cita para asegurar el turno',
            'Si no la confirmas, el turno puede asignarse a otro cliente.') +
      boton('Confirmar la cita', PANEL) +
      parrafo('Si necesitas cancelar o cambiar la fecha, también se hace desde ahí.', 14),
  })],
  ['contrato-renting', plantilla({
    titulo: 'Tu contrato de renting está activo',
    cuerpo:
      parrafo('Hola <strong>Ana Picazo</strong>,') +
      parrafo('El contrato de renting de <strong>Volkswagen T-Roc 1.5 TSI Sport</strong> ha quedado formalizado.') +
      datos([['Nº de contrato', 'PC-RENT-2026-014'], ['Color', 'Gris urano'],
             ['Duración', '48 meses'], ['Km/año incluidos', '15.000 km'],
             ['Cuota mensual', '389 €/mes'], ['Inicio', '1 de septiembre de 2026'],
             ['Fin previsto', '1 de septiembre de 2030']]) +
      parrafo('El vehículo ya aparece en tu garaje digital. Desde ahí puedes guardar documentos, registrar incidencias y llevar el historial de mantenimiento.') +
      boton('Ver mi vehículo en renting', `${MARCA.sitioUrl}/panel/vehiculos`),
  })],
  ['contrasena', plantilla({
    titulo: 'Recuperación de contraseña',
    cuerpo:
      parrafo('Hola <strong>Ana</strong>,') +
      parrafo('Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>PopCar ERP</strong>.') +
      boton('Restablecer la contraseña', 'https://ejemplo/reset?token=…') +
      parrafo('El enlace vale durante una hora. Si no has pedido el cambio, ignora este correo: la contraseña no se toca.', 14),
  })],
  ['factura', plantilla({
    titulo: 'Tu factura está lista',
    cuerpo:
      parrafo('Adjuntamos la factura <strong>SUBS-2026-0042</strong>.') +
      parrafo(`El detalle está en tu panel: <a href="${MARCA.sitioUrl}/panel" style="color:#111111;font-weight:600">${MARCA.sitio}/panel</a>`, 14),
  })],
  ['descartado', plantilla({
    titulo: 'Gracias por tu tiempo',
    cuerpo:
      parrafo('Hola <strong>Ana Picazo</strong>,') +
      parrafo('Entendemos que <strong>Jaguar S-TYPE 2.7D V6</strong> no era lo que buscabas. Encontrar el coche adecuado lleva su tiempo.') +
      boton('Ver más vehículos', MARCA.sitioUrl) +
      parrafo('Si nos cuentas qué necesitas, te ayudamos a acotar la búsqueda.', 14),
  })],
  ['idcar', plantilla({
    titulo: 'Tu IDCar ya está en tu garaje',
    cuerpo:
      parrafo('Hola <strong>Ana Picazo</strong>,') +
      parrafo('Hemos creado la ficha digital de <strong>Volkswagen T-Roc</strong> en tu garaje.') +
      parrafo('Desde el IDCar puedes:') +
      '<ul style="margin:0 0 18px 0;padding-left:20px;font-size:14px;line-height:1.8;color:#2A2A28">' +
        '<li>Guardar documentos: ficha técnica, permiso de circulación, ITV</li>' +
        '<li>Registrar el mantenimiento y las reparaciones</li>' +
        '<li>Gestionar el seguro del vehículo</li>' +
      '</ul>' +
      boton('Ver mi IDCar', `${MARCA.sitioUrl}/panel/vehiculos`),
  })],
];

for (const [nombre, html] of CORREOS) writeFileSync(`${salida}/${nombre}.html`, html, 'utf8');
console.log(`${CORREOS.length} correos en ${salida}`);
