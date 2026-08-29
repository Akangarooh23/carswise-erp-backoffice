/**
 * Llama a todas las rutas de lectura y mira cuáles se rompen.
 *
 * La pantalla de tickets llevaba devolviendo un 500 en cada carga porque el
 * código pedía una columna con un nombre y la tabla la tenía con otro. Eso no
 * se ve leyendo el fichero, no lo pilla el compilador y no lo pilla ninguna
 * prueba de lógica: lo que falla es la consulta, y solo lo dice la base.
 *
 * Es el fallo que más veces ha aparecido en este proyecto —`plan_type` por
 * `plan_id`, `fuel_type` por `fuel`, `assigned_to` por `assignee`—, así que la
 * forma de encontrar el siguiente es preguntar a las sesenta.
 *
 * Solo GET: no escribe nada. A las rutas con identificador se les pasa uno que
 * no existe, así que un 404 es la respuesta correcta y esperada.
 *
 *   node scripts/comprueba-rutas.js
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
const clave = (n) => (env.split(/\r?\n/).find((x) => x.startsWith(n + '=')) || '').slice(n.length + 1).trim();
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


/** Con qué se rellena cada parámetro de la dirección. */
const EJEMPLO = {
  id: 'no-existe', leadId: 'no-existe', unitId: 'no-existe', vehicleId: 'no-existe',
  ticketId: 'no-existe', fileId: 'no-existe', tabla: 'moveadvisor_users',
};

(async () => {
  const { token } = await (await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: correoAdmin(), password: clave('ERP_ADMIN_PASSWORD') }),
  })).json();
  if (!token) { console.log('  MAL  no se ha podido entrar en la API como ' + correoAdmin() + ' — revisa ERP_ADMIN_EMAIL y ERP_ADMIN_PASSWORD en .env'); process.exit(1); }
  const cab = { Authorization: 'Bearer ' + token };

  const dir = path.join(RAIZ, 'apps', 'api', 'src', 'routes');
  const rutas = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/Router\.get\(\s*'([^']+)'/g)) rutas.push([f, m[1]]);
  }

  let rotas = 0;
  for (const [f, ruta] of rutas) {
    const camino = ruta.replace(/:([a-zA-Z]+)/g, (_, p) => EJEMPLO[p] ?? 'no-existe');
    let estado = 0;
    let detalle = '';
    try {
      const r = await fetch(API + camino, { headers: cab });
      estado = r.status;
      if (estado >= 500) detalle = ((await r.json().catch(() => ({}))).detail || '').slice(0, 90);
    } catch (e) {
      estado = -1;
      detalle = e.message.slice(0, 70);
    }
    if (estado >= 500 || estado === -1) {
      rotas++;
      console.log('  ROTA  ' + String(estado).padEnd(5) + f.padEnd(24) + camino + '   ' + detalle);
    }
  }

  console.log('\n  ' + rutas.length + ' rutas de lectura · ' + (rotas || 'ninguna') + (rotas ? ' rotas' : ' rota'));
  process.exit(rotas ? 1 : 0);
})();
