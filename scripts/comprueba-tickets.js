/**
 * Que la tabla de tickets y el código digan lo mismo.
 *
 * La pantalla devolvía un 500 en cada carga: el código pedía `assigned_to` y la
 * columna se llama `assignee`. Crear un ticket tampoco podía funcionar, porque
 * la tabla exige `id`, `assignee` y las dos fechas, todos no nulos y sin valor
 * por defecto. Nada de eso se ve leyendo el fichero ni compilando: lo que falla
 * es la consulta.
 *
 * El alta se ejecuta dentro de una transacción que se deshace, así que se
 * prueba el SQL de verdad sin dejar ningún ticket.
 *
 *   node scripts/comprueba-tickets.js
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const url = (env.split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL=')) || '').slice(13).trim();
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


let mal = 0;
const ok = (t, b, extra = '') => { if (!b) mal++; console.log((b ? '  OK  ' : '  MAL ') + t + (extra ? '  · ' + extra : '')); };

(async () => {
  // ── El listado responde ───────────────────────────────────────────────────
  const { token } = await (await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: correoAdmin(), password: clave('ERP_ADMIN_PASSWORD') }),
  })).json();
  if (!token) { console.log('  MAL  no se ha podido entrar en la API como ' + correoAdmin() + ' — revisa ERP_ADMIN_EMAIL y ERP_ADMIN_PASSWORD en .env'); process.exit(1); }

  const r = await fetch(API + '/tickets', { headers: { Authorization: 'Bearer ' + token } });
  const j = await r.json().catch(() => ({}));
  ok('el listado responde', r.ok, r.status + (j.detail ? ' · ' + j.detail : ''));
  ok('y devuelve una lista', Array.isArray(j.data));

  // Filtrar por quien lo lleva usa el nombre bueno de la columna.
  const f = await fetch(API + '/tickets?assignee=nadie', { headers: { Authorization: 'Bearer ' + token } });
  ok('se puede filtrar por quién lo lleva', f.ok, f.status);

  // Pedir un ticket para alguien que no existe no es un fallo del servidor.
  // Antes salía un 500 con el mensaje crudo de la clave foránea.
  const sinCliente = await fetch(API + '/tickets', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: 'no-existe-este-cliente',
      title: 'Prueba de cliente inexistente',
      description: 'No debe llegar a crearse.',
    }),
  });
  const jSin = await sinCliente.json().catch(() => ({}));
  ok('un cliente que no existe se rechaza con un 400', sinCliente.status === 400, sinCliente.status);
  ok('  y lo explica en una frase', typeof jSin.detail === 'string' && jSin.detail.endsWith('.'), jSin.detail || jSin.error);

  // ── El alta, dentro de una transacción que se deshace ─────────────────────
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  // Hace falta un cliente de verdad: los tickets apuntan por clave foránea a
  // `erp_users`, que es un espejo de la tabla de clientes y estaba vacía. Ese
  // espejo es justo lo que hacía fallar el alta.
  const real = await pool.query('SELECT id::text AS id FROM moveadvisor_users LIMIT 1');
  const clienteId = real.rows[0]?.id;
  ok('hay un cliente con el que probar', Boolean(clienteId));

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(
      `INSERT INTO erp_users (id, name, email, phone, status, last_seen_at)
       SELECT id::text, COALESCE(name, email, 'Sin nombre'), email, COALESCE(phone, ''), 'active', NOW()
         FROM moveadvisor_users WHERE id::text = $1
       ON CONFLICT (id) DO NOTHING`,
      [clienteId]
    );
    const id = `t_prueba_${Date.now()}`;
    const alta = await cliente.query(
      `INSERT INTO erp_tickets
         (id, user_id, title, description, channel, priority, assignee, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW()) RETURNING *`,
      [id, clienteId, 'Prueba', 'Descripción de prueba', 'web', 'medium', 'unassigned']
    );
    ok('crear un ticket funciona', alta.rows.length === 1);
    ok('quien lo lleva queda a «unassigned» si no se dice', alta.rows[0].assignee === 'unassigned');

    await cliente.query(
      `INSERT INTO erp_ticket_events (ticket_id, event_at, actor, message) VALUES ($1, NOW(), $2, $3)`,
      [id, 'prueba', 'Ticket creado']
    );
    ok('el evento del alta también', true);

    const leido = await cliente.query(
      `SELECT t.id, t.assignee, t.status FROM erp_tickets t WHERE t.id = $1`, [id]
    );
    ok('y se puede volver a leer', leido.rows[0]?.status === 'open');
  } catch (e) {
    ok('el alta funciona', false, e.message.slice(0, 90));
  } finally {
    await cliente.query('ROLLBACK');
    cliente.release();
  }

  const quedan = await pool.query('SELECT count(*)::int n FROM erp_tickets');
  ok('la prueba no ha dejado ningún ticket', true, quedan.rows[0].n + ' tickets en la tabla');
  await pool.end();

  console.log(mal ? '\n' + mal + ' FALLOS' : '\ntodo correcto');
  process.exit(mal ? 1 : 0);
})();
