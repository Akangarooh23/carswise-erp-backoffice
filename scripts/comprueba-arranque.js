/**
 * ¿Siguen abiertas las cuentas de arranque?
 *
 * El ERP nace con cuatro cuentas escritas en el código —admin@carswise.es y
 * tres más—, cada una con su contraseña en una variable de entorno. Sirven para
 * poder entrar la primera vez, cuando todavía no hay nadie dado de alta.
 *
 * El problema es quedarse: son contraseñas de variable de entorno, compartidas,
 * y el registro de actividad solo puede decir «admin», nunca quién. Por eso
 * dejan de valer en cuanto hay un administrador de verdad en erp_staff.
 *
 * Esto lo comprueba por donde se entra, no leyendo el código: intenta entrar con
 * cada una usando su contraseña buena. Mientras haya un administrador dado de
 * alta, las cuatro tienen que dar 401.
 *
 *   node scripts/comprueba-arranque.js [url]
 */
const fs = require('fs');

const API = (process.argv[2] || 'http://localhost:4000/api').replace(/\/$/, '');

for (const linea of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = linea.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const ARRANQUE = [
  ['admin@carswise.es', process.env.ERP_ADMIN_PASSWORD],
  ['support@carswise.es', process.env.ERP_SUPPORT_PASSWORD],
  ['ops@carswise.es', process.env.ERP_OPS_PASSWORD],
  ['sales@carswise.es', process.env.ERP_SALES_PASSWORD],
];

async function entra(email, password) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return r.status;
}

(async () => {
  console.log(`\n  Probando a entrar en ${API}\n`);
  let mal = 0;

  for (const [email, clave] of ARRANQUE) {
    if (!clave) {
      console.log(`  ? ${email.padEnd(22)} sin contraseña en .env, no se puede probar`);
      continue;
    }
    const codigo = await entra(email, clave);
    if (codigo === 401) {
      console.log(`  ✔ ${email.padEnd(22)} cerrada`);
    } else {
      mal++;
      console.log(`  ✖ ${email.padEnd(22)} ABIERTA (${codigo}) — entra con la contraseña de la variable de entorno`);
    }
  }

  console.log(
    mal
      ? `\n  ${mal} cuentas de arranque siguen abiertas. Con administradores de verdad dados de alta no deberían.\n`
      : '\n  Las cuatro cerradas: solo se entra con las cuentas dadas de alta.\n'
  );
  process.exit(mal ? 1 : 0);
})();
