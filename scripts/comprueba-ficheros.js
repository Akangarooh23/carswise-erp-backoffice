/**
 * Lo que no debe entrar en el garaje de un cliente.
 *
 * Los ficheros de un IDCar acaban en un bucket público de Supabase: lo que se
 * suba se sirve desde una dirección nuestra. Antes se aceptaba cualquier cosa.
 *
 * Todo lo de aquí se rechaza antes de tocar nada: ni se sube ni se guarda fila.
 *
 * Necesita la API levantada y las claves en .env.
 *   node scripts/comprueba-ficheros.js
 */
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
/**
 * Un valor del .env.
 *
 * Se queda con la última línea que lo define, que es lo que hace dotenv: con una
 * variable repetida, la aplicación y esto leían cosas distintas.
 *
 * Y quita las comillas de fuera. Una contraseña con una almohadilla o un espacio
 * hay que escribirla entrecomillada —si no, dotenv la corta por la mitad—, y sin
 * quitarlas aquí se intentaba entrar con las comillas dentro de la contraseña.
 */
const clave = (n) => {
  const lineas = env.split(/\r?\n/).filter((x) => x.startsWith(n + '='));
  const bruto = (lineas.length ? lineas[lineas.length - 1] : '').slice(n.length + 1).trim();
  return bruto.replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1');
};
const API = process.env.API_URL || 'http://localhost:4000/api';

/**
 * Con qué cuenta entra un comprobador.
 *
 * Estaba escrito 'admin@carswise.es' en cinco de ellos, y esa cuenta se eliminó
 * al crear las de los CEOs. Desde entonces los cinco decían «no se ha podido
 * entrar en la API» pasara lo que pasara: parecía un problema de la API y era
 * una cuenta que ya no existe. Un comprobador que no puede pasar nunca es peor
 * que no tenerlo, porque se lee su MAL y se busca en otro sitio.
 */
const correoAdmin = () => clave('ERP_ADMIN_EMAIL') || 'apicazo@popcar.tech';


let mal = 0;
const ok = (t, b, extra = '') => { if (!b) mal++; console.log((b ? '  OK  ' : '  MAL ') + t + (extra ? '  · ' + extra : '')); };

(async () => {
  const respuestaLogin = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: correoAdmin(), password: clave('ERP_ADMIN_PASSWORD') }),
  });
  const codigoLogin = respuestaLogin.status;
  const { token } = await respuestaLogin.json().catch(() => ({}));
  if (!token) { console.log(codigoLogin === 429
      ? '  MAL  demasiados intentos seguidos: la API los limita a 10 cada 15 minutos. Espera un rato o reinicia la API.'
      : '  MAL  no se ha podido entrar en la API como ' + correoAdmin() + ' (' + codigoLogin + ') — revisa ERP_ADMIN_EMAIL y ERP_ADMIN_PASSWORD en .env'); process.exit(1); }
  const cab = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const guion = Buffer.from('<script>alert(1)</script>').toString('base64');

  const rechazables = [
    ['una página web', { file_type: 'document', file_name: 'nota.html', file_mime_type: 'text/html', file_content_base64: guion }],
    ['un SVG, que lleva guion dentro', { file_type: 'photo', file_name: 'logo.svg', file_mime_type: 'image/svg+xml', file_content_base64: guion }],
    ['un ejecutable', { file_type: 'document', file_name: 'x.exe', file_mime_type: 'application/x-msdownload', file_content_base64: guion }],
    ['un .html declarado como PDF', { file_type: 'document', file_name: 'nota.html', file_mime_type: 'application/pdf', file_content_base64: guion }],
    ['un fichero sin nombre', { file_type: 'photo', file_name: '', file_mime_type: 'image/png', file_content_base64: guion }],
    ['algo que no cabe', { file_type: 'photo', file_name: 'foto.png', file_mime_type: 'image/png', file_content_base64: 'A'.repeat(5 * 1024 * 1024) }],
  ];

  for (const [que, cuerpo] of rechazables) {
    const r = await fetch(API + '/idcars/veh-1778144236925/files', {
      method: 'POST', headers: cab, body: JSON.stringify(cuerpo),
    });
    const j = await r.json().catch(() => ({}));
    // 400 si lo para la comprobación, 413 si el cuerpo ni cabe en la petición.
    ok('rechaza ' + que, r.status === 400 || r.status === 413, j.detail || j.error || r.status);
    ok('  y lo explica en una frase', typeof j.detail === 'string' && j.detail.endsWith('.'), j.detail || '(sin motivo)');
  }

  const sinSesion = await fetch(API + '/idcars/veh-1778144236925/files', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_type: 'photo', file_name: 'foto.png', file_mime_type: 'image/png', file_content_base64: guion }),
  });
  ok('sin sesión no se puede subir', sinSesion.status === 401);

  console.log(mal ? '\n' + mal + ' FALLOS' : '\ntodo correcto');
  process.exit(mal ? 1 : 0);
})();
