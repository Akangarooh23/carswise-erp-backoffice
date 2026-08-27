/**
 * Intenta romper el explorador de datos.
 *
 * Es la pantalla que más superficie abre —cualquier tabla, cualquier columna,
 * exportable— y la única donde el nombre de una tabla llega desde fuera. Lo que
 * hay que comprobar no es que funcione, sino que no se pueda torcer: inyectar
 * SQL por el nombre de la tabla, del orden o del filtro, y sacar contraseñas o
 * sesiones.
 *
 * Las listas de lo que se oculta se prueban aparte, sin base de datos, en
 * routes/datos.test.ts. Esto comprueba la ruta viva.
 *
 * Necesita la API levantada y las claves en .env.
 *   node scripts/comprueba-datos.js
 */
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const clave = (n) => (env.split(/\r?\n/).find((x) => x.startsWith(n + '=')) || '').slice(n.length + 1).trim();
const API = process.env.API_URL || 'http://localhost:4000/api';

let mal = 0;
const ok = (t, b, extra = '') => { if (!b) mal++; console.log((b ? '  OK  ' : '  MAL ') + t + (extra ? '  · ' + extra : '')); };

(async () => {
  const { token } = await (await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@carswise.es', password: clave('ERP_ADMIN_PASSWORD') }),
  })).json();
  if (!token) { console.log('  MAL  no se ha podido entrar en la API'); process.exit(1); }
  const cab = { Authorization: 'Bearer ' + token };

  // ── Funciona ──────────────────────────────────────────────────────────────
  let r = await fetch(API + '/datos/tablas', { headers: cab });
  let j = await r.json();
  ok('lista las tablas', r.ok && (j.data?.length ?? 0) > 50, (j.data?.length ?? 0) + ' tablas');

  r = await fetch(API + '/datos/moveadvisor_users?limit=3', { headers: cab });
  j = await r.json();
  ok('abre una tabla', r.ok && Array.isArray(j.data), (j.data?.length ?? 0) + ' filas de ' + j.total);
  ok('sin columnas de contraseña ni token', !/password|token|hash|secret/i.test((j.columnas ?? []).join(',')));

  // ── Las llaves no se enseñan ──────────────────────────────────────────────
  for (const t of ['erp_staff_passwords', 'erp_refresh_tokens', 'moveadvisor_sessions', 'erp_password_resets']) {
    r = await fetch(API + '/datos/' + t + '?limit=1', { headers: cab });
    ok('la tabla ' + t + ' no se abre', r.status === 404);
  }
  r = await fetch(API + '/datos/tablas', { headers: cab });
  j = await r.json();
  ok('ni aparece en la lista', !(j.data ?? []).map((x) => x.tabla).includes('erp_staff_passwords'));

  // ── Inyección por el nombre de la tabla ───────────────────────────────────
  for (const malo of [
    'moveadvisor_users"; DROP TABLE erp_staff; --',
    "moveadvisor_users' OR '1'='1",
    'pg_shadow',
    'pg_authid',
    '../../etc/passwd',
    'moveadvisor_users UNION SELECT * FROM erp_staff_passwords',
  ]) {
    r = await fetch(API + '/datos/' + encodeURIComponent(malo) + '?limit=1', { headers: cab });
    ok('rechaza la tabla «' + malo.slice(0, 30) + '…»', r.status === 404);
  }

  // ── Inyección por el orden y por el filtro ────────────────────────────────
  r = await fetch(API + '/datos/moveadvisor_users?orden=' + encodeURIComponent('email; DROP TABLE erp_staff') + '&limit=1', { headers: cab });
  ok('un orden inventado no rompe: cae a la primera columna', r.ok);

  r = await fetch(API + '/datos/moveadvisor_users?f_email=' + encodeURIComponent("' OR 1=1 --") + '&limit=5', { headers: cab });
  j = await r.json();
  ok('el filtro con comillas se trata como texto', r.ok && j.total === 0, 'encontradas: ' + j.total);

  r = await fetch(API + '/datos/moveadvisor_users?f_password=x&limit=1', { headers: cab });
  ok('no se puede filtrar por una columna oculta', r.ok && !/password/i.test(JSON.stringify(j.columnas ?? [])));

  // ── Y todo sigue en su sitio ──────────────────────────────────────────────
  r = await fetch(API + '/datos/erp_staff?limit=1', { headers: cab });
  ok('erp_staff sigue existiendo tras los intentos', r.ok);

  // ── Sin sesión y sin permiso, nada ────────────────────────────────────────
  r = await fetch(API + '/datos/moveadvisor_users?limit=1');
  ok('sin sesión no se puede mirar', r.status === 401);

  console.log(mal ? '\n' + mal + ' FALLOS' : '\ntodo correcto');
  process.exit(mal ? 1 : 0);
})();
