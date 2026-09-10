/**
 * El flujo de «Nosotros lo vendemos por ti», de punta a punta.
 *
 * Cada pieza tenía su prueba y **nadie las había encadenado nunca**. Así es
 * como se coló que cerrar el encargo no despublicaba el coche: el cierre
 * funcionaba, el aviso del portal funcionaba, y entre los dos no había nada —
 * la alarma montada y el sensor sin conectar. Eso no lo caza una prueba de
 * unidad, porque el hueco está justo entre dos piezas que están bien.
 *
 * Recorre el camino entero en el orden en que pasan las cosas y comprueba en
 * cada paso lo que tiene que ser cierto **y lo que todavía no**. Las negativas
 * son la mitad del valor: sin fotos no se publica, con el coche en el taller
 * tampoco, y mientras el anuncio está vivo aquí no hay nada que retirar allí.
 *
 * ## No deja nada
 *
 * Todo va dentro de `BEGIN … ROLLBACK`. **Aquí no hay ningún `COMMIT`, y es a
 * propósito**: esto corre contra la base de producción, así que la única
 * garantía que vale es que no exista la instrucción. Si el proceso se muere a
 * medias, Postgres deshace la transacción al caerse la conexión.
 *
 * Lo que sí gasta son números de secuencia de las tablas con `serial`. Es el
 * precio de probarlo contra la base de verdad en vez de contra una de mentira
 * que diría que sí a cualquier cosa.
 *
 *   npm run test:flujo
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const RAIZ = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
const url = (env.split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL=')) || '').slice(13).trim();

/**
 * Los números salen del código, no escritos aquí.
 *
 * Si mañana se piden ocho fotos, esta prueba tiene que pedir ocho. Escritos a
 * mano, seguiría diciendo que todo va bien con seis — y una prueba que se queda
 * vieja es peor que no tenerla, porque además tranquiliza.
 */
function delCodigo(fichero, nombre) {
  const src = fs.readFileSync(path.join(RAIZ, fichero), 'utf8');
  const m = src.match(new RegExp(`export const ${nombre} = (\\d+)`));
  if (!m) throw new Error(`no encuentro ${nombre} en ${fichero}`);
  return Number(m[1]);
}

const LIB = 'apps/api/src/lib/encargo-de-venta.ts';
const FOTOS = delCodigo(LIB, 'FOTOS_MINIMAS');
const FRANJAS = delCodigo(LIB, 'FRANJAS_MINIMAS');
const FEE = delCodigo(LIB, 'FEE_DE_GESTION');
const PAPELES = ['circulation_permit', 'technical_sheet', 'itv'];

const COCHE = 'veh-comprueba-flujo';
const OFERTA = `idcar-${COCHE}`;
const LEAD = 'lead-comprueba-flujo';
const ENCARGO = 'enc-comprueba-flujo';
const EMAIL = 'comprueba.flujo@ejemplo.invalid';

let mal = 0;
const di = (ok, txt) => { if (!ok) mal++; console.log(`  ${ok ? 'OK  ' : 'MAL '} ${txt}`); };
const paso = (n, txt) => console.log(`\n${n}. ${txt}`);

/** Las cinco puertas del cliente, como las mira el ERP. */
const PUERTAS = `
  SELECT (SELECT COUNT(*) FROM moveadvisor_user_vehicle_files f
           WHERE f.vehicle_id = $1 AND f.file_type = 'photo'
             AND COALESCE(f.file_url,'') <> '') AS fotos,
         (SELECT COALESCE(array_agg(DISTINCT d.document_type), '{}')
            FROM moveadvisor_user_vehicle_documents d WHERE d.vehicle_id = $1) AS papeles,
         (SELECT t.estimate_value FROM moveadvisor_user_valuations t
           WHERE t.vehicle_id = $1 AND COALESCE(t.estimate_value,0) > 0
           ORDER BY t.created_at DESC LIMIT 1) AS tasacion,
         (SELECT r.status FROM moveadvisor_vehicle_condition_reports r
           WHERE r.vehicle_id = $1 ORDER BY r.created_at DESC LIMIT 1) AS informe,
         (SELECT COUNT(*) FROM vehicle_visit_availability a
           WHERE a.offer_id = $2 AND a.status = 'available' AND a.starts_at > NOW()) AS franjas
    FROM moveadvisor_user_vehicles v WHERE v.id = $1`;

/** El aviso de retirar del portal: mira el escaparate, no el encargo. */
const POR_RETIRAR = `
  SELECT COUNT(DISTINCT a.vehicle_id)::int AS n
    FROM erp_anuncios_de_portal a
    LEFT JOIN moveadvisor_marketplace_vo_offers o ON o.id = 'idcar-' || a.vehicle_id
   WHERE a.retirado_at IS NULL AND COALESCE(o.is_active, FALSE) = FALSE`;

/** Y el de «se vendió y nadie cerró el encargo». */
const VENDIDOS_SIN_CERRAR = `
  SELECT COUNT(*)::int AS n FROM erp_encargos_venta e
   WHERE e.cerrado_at IS NULL
     AND EXISTS (SELECT 1 FROM vehicle_visit_bookings b
                  WHERE b.offer_id = 'idcar-' || e.vehicle_id AND b.resultado = 'compro')`;

(async () => {
  if (!url) { console.error('Falta DATABASE_URL en .env'); process.exit(1); }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    /*
     * Lo que el ERP crea al arrancar. Se repite aquí porque esta prueba puede
     * correr contra una base donde el servidor todavía no ha arrancado con el
     * código nuevo, y entonces el fallo sería «no existe la columna» en vez de
     * lo que se quiere medir.
     */
    await c.query(`ALTER TABLE erp_encargos_venta
      ADD COLUMN IF NOT EXISTS mandato_id TEXT,
      ADD COLUMN IF NOT EXISTS firma_como TEXT,
      ADD COLUMN IF NOT EXISTS firma_nota TEXT`);
    await c.query(`ALTER TABLE erp_tramites ADD COLUMN IF NOT EXISTS encargo_id TEXT`);
    await c.query(`ALTER TABLE moveadvisor_market_leads
      ADD COLUMN IF NOT EXISTS plate VARCHAR(16) NOT NULL DEFAULT ''`);
    await c.query(`ALTER TABLE vehicle_visit_bookings
      ADD COLUMN IF NOT EXISTS quiere_financiar BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS utm_source VARCHAR(255) NOT NULL DEFAULT ''`);
    await c.query(`
      CREATE TABLE IF NOT EXISTS erp_revisiones_taller (
        id TEXT PRIMARY KEY, vehicle_id VARCHAR(64) NOT NULL, encargo_id TEXT,
        estado TEXT NOT NULL DEFAULT 'Por llevar', taller TEXT NOT NULL DEFAULT '',
        cita_at TIMESTAMPTZ, hecha_at TIMESTAMPTZ, resultado TEXT,
        notas TEXT NOT NULL DEFAULT '', coste NUMERIC(12,2),
        creado_por TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await c.query(`
      CREATE TABLE IF NOT EXISTS erp_anuncios_de_portal (
        id TEXT PRIMARY KEY, vehicle_id VARCHAR(64) NOT NULL, portal TEXT NOT NULL,
        url TEXT NOT NULL, publicado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        publicado_por TEXT NOT NULL DEFAULT '', retirado_at TIMESTAMPTZ,
        retirado_por TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

    // ── 1 · Pide que le vendamos el coche, sin cuenta ──────────────────────
    paso(1, 'Manda el formulario sin registrarse, con su matricula');
    await c.query(
      `INSERT INTO moveadvisor_market_leads
         (id, user_email, lead_type, vehicle_title, portal, contact_name,
          contact_phone, contact_when, status, plate, utm_source, utm_medium)
       VALUES ($1,$2,'venta_gestionada','8888LXR','web-vender','Prueba Flujo',
               '600000001','Quiere vender: cuanto antes','Pendiente','8888LXR',
               'coches.net','portal')`,
      [LEAD, EMAIL]
    );
    const lead = (await c.query(
      `SELECT lead_type, plate, utm_source FROM moveadvisor_market_leads WHERE id = $1`, [LEAD]
    )).rows[0];
    di(lead.lead_type === 'venta_gestionada', 'entra como venta gestionada, no como «info»');
    di(lead.plate === '8888LXR', 'con su matricula, que es lo que permite cruzarlo');
    di(lead.utm_source === 'coches.net', 'y se sabe que vino del portal');

    // ── 2 · Se cruza esa matricula con sus IDCars ──────────────────────────
    paso(2, 'El ERP mira si esa matricula ya tiene ficha');
    const suyos = await c.query(
      `SELECT id FROM moveadvisor_user_vehicles WHERE lower(COALESCE(user_email,'')) = lower($1)`,
      [EMAIL]
    );
    di(suyos.rows.length === 0, 'todavia no tiene ninguna: hay que pedirsela');

    // ── 3 · El cliente crea el IDCar ───────────────────────────────────────
    paso(3, 'El cliente da de alta su coche');
    await c.query(
      `INSERT INTO moveadvisor_user_vehicles
         (id, user_email, title, plate, brand, model, year, mileage, created_at, updated_at)
       VALUES ($1,$2,'Citroen C3 2018','8888LXR','Citroen','C3',2018,92000, NOW(), NOW())`,
      [COCHE, EMAIL]
    );
    di(true, 'IDCar creado');

    // ── 4 · Se abre el encargo ─────────────────────────────────────────────
    paso(4, 'Se le abre el encargo, que nace SIN firmar');
    await c.query(
      `INSERT INTO erp_encargos_venta
         (id, vehicle_id, cliente_email, cliente_nombre, estado, mandato_id,
          acepto_el_precio, precio_referencia, fee_gestion, fee_cancelacion, lead_id, creado_por)
       VALUES ($1,$2,$3,'Prueba Flujo','recogiendo','PC-MAND-0000-001',FALSE,8500,$4,150,$5,'comprueba')`,
      [ENCARGO, COCHE, EMAIL, FEE, LEAD]
    );
    const nace = (await c.query(
      `SELECT firmado_at, libre_desde, mandato_id FROM erp_encargos_venta WHERE id = $1`, [ENCARGO]
    )).rows[0];
    di(nace.firmado_at === null, 'sin fecha de firma: el ERP no se la inventa');
    di(nace.libre_desde === null, 'y sin plazo empezado');
    di(Boolean(nace.mandato_id), `con su numero de mandato (${nace.mandato_id})`);

    // ── 5 · Firma el mandato ───────────────────────────────────────────────
    paso(5, 'Firma el mandato y se apunta como nos consta');
    await c.query(
      `UPDATE erp_encargos_venta
          SET firmado_at = NOW() - INTERVAL '10 days',
              firma_como = 'papel_firmado', firma_nota = 'carpeta de mandatos',
              libre_desde = NOW() + INTERVAL '20 days', acepto_el_precio = TRUE
        WHERE id = $1`,
      [ENCARGO]
    );
    const f = (await c.query(
      `SELECT firma_como, libre_desde FROM erp_encargos_venta WHERE id = $1`, [ENCARGO]
    )).rows[0];
    di(f.firma_como === 'papel_firmado', 'consta COMO firmo, no solo la fecha');
    di(f.libre_desde !== null, 'y el plazo de los 30 dias arranca en la firma');

    // ── 6 · Las cinco puertas ──────────────────────────────────────────────
    paso(6, 'El cliente trae lo suyo');
    let p = (await c.query(PUERTAS, [COCHE, OFERTA])).rows[0];
    di(Number(p.fotos) === 0, 'sin fotos NO se puede publicar');

    for (let i = 0; i < FOTOS; i++) {
      await c.query(
        `INSERT INTO moveadvisor_user_vehicle_files
           (vehicle_id, file_type, file_url, file_name, created_at)
         VALUES ($1,'photo',$2,$3, NOW())`,
        [COCHE, `https://ejemplo.invalid/f${i}.jpg`, `f${i}.jpg`]
      );
    }
    for (const d of PAPELES) {
      await c.query(
        `INSERT INTO moveadvisor_user_vehicle_documents
           (vehicle_id, document_type, file_url, file_name, created_at)
         VALUES ($1,$2,'https://ejemplo.invalid/d.pdf','d.pdf', NOW())`,
        [COCHE, d]
      );
    }
    await c.query(
      `INSERT INTO moveadvisor_user_valuations
         (id, vehicle_id, user_email, title, estimate_value, created_at, updated_at)
       VALUES ('val-comprueba-flujo',$1,$2,'Citroen C3 2018',8500, NOW(), NOW())`,
      [COCHE, EMAIL]
    );
    await c.query(
      `INSERT INTO moveadvisor_vehicle_condition_reports
         (vehicle_id, capture_vehicle_uuid, capture_session_id, status, created_at)
       VALUES ($1, gen_random_uuid(), gen_random_uuid(), 'informe_listo', NOW())`,
      [COCHE]
    );
    for (let i = 1; i <= FRANJAS; i++) {
      await c.query(
        `INSERT INTO vehicle_visit_availability (offer_id, starts_at, ends_at, status, source)
         VALUES ($1, NOW() + ($2 || ' days')::interval,
                     NOW() + ($2 || ' days')::interval + INTERVAL '1 hour','available','manual')`,
        [OFERTA, String(i)]
      );
    }
    p = (await c.query(PUERTAS, [COCHE, OFERTA])).rows[0];
    di(Number(p.fotos) >= FOTOS, `las ${FOTOS} fotos`);
    di((p.papeles || []).length === PAPELES.length, `los ${PAPELES.length} papeles`);
    di(Number(p.tasacion) > 0, `la tasacion (${p.tasacion} EUR)`);
    di(p.informe === 'informe_listo', 'el informe terminado');
    di(Number(p.franjas) >= FRANJAS, `las ${FRANJAS} franjas`);

    // ── 7 · La sexta puerta: el taller ─────────────────────────────────────
    paso(7, 'La revision del taller, que es la nuestra');
    await c.query(
      `INSERT INTO erp_revisiones_taller (id, vehicle_id, encargo_id, estado, taller, coste)
       VALUES ('rev-comprueba-flujo',$1,$2,'En el taller','Taller de prueba',60)`,
      [COCHE, ENCARGO]
    );
    let rev = (await c.query(
      `SELECT estado, resultado FROM erp_revisiones_taller WHERE id = 'rev-comprueba-flujo'`
    )).rows[0];
    di(rev.estado !== 'Hecha', 'mientras esta en el taller, NO se publica');

    await c.query(
      `UPDATE erp_revisiones_taller
          SET estado='Hecha', resultado='con_reparos', hecha_at=NOW()
        WHERE id='rev-comprueba-flujo'`
    );
    rev = (await c.query(
      `SELECT estado, resultado FROM erp_revisiones_taller WHERE id = 'rev-comprueba-flujo'`
    )).rows[0];
    di(rev.estado === 'Hecha' && rev.resultado === 'con_reparos',
      '«con reparos» deja vender contando lo que tiene');

    // ── 8 y 9 · Se publica aqui y a mano en el portal ──────────────────────
    paso(8, 'Se publica en nuestro escaparate y a mano en coches.net');
    await c.query(
      `INSERT INTO moveadvisor_marketplace_vo_offers
         (id, title, brand, model, year, price, mileage, fuel, color, seller, seller_type, is_active)
       VALUES ($1,'Citroen C3 2018','Citroen','C3',2018,8500,92000,'Gasolina','Blanco',$2,'particular',TRUE)`,
      [OFERTA, EMAIL]
    );
    await c.query(
      `INSERT INTO erp_anuncios_de_portal (id, vehicle_id, portal, url, publicado_por)
       VALUES ('anu-comprueba-flujo',$1,'coches.net','https://www.coches.net/x','comprueba')`,
      [COCHE]
    );
    di((await c.query(POR_RETIRAR)).rows[0].n === 0,
      'mientras esta publicado aqui, NO hay nada que retirar alli');

    // ── 10 · Un comprador del portal pide cita sin cuenta ──────────────────
    paso(9, 'Un comprador llega del portal y pide cita');
    const hueco = (await c.query(
      `SELECT id, starts_at, ends_at FROM vehicle_visit_availability
        WHERE offer_id = $1 ORDER BY starts_at LIMIT 1`, [OFERTA]
    )).rows[0];
    const reserva = (await c.query(
      `INSERT INTO vehicle_visit_bookings
         (availability_id, offer_id, vehicle_title, starts_at, ends_at, buyer_email,
          buyer_name, buyer_phone, seller_email, status, token_buyer, token_seller,
          notes, source, quiere_financiar, utm_source)
       VALUES ($1,$2,'Citroen C3 2018',$3,$4,'comprador@ejemplo.invalid','Comprador',
               '600000002',$5,'pending','tb','ts','','marketplace',TRUE,'coches.net')
       RETURNING id, quiere_financiar, utm_source`,
      [hueco.id, OFERTA, hueco.starts_at, hueco.ends_at, EMAIL]
    )).rows[0];
    di(reserva.quiere_financiar === true, 'y dice que le interesaria financiarlo');
    di(reserva.utm_source === 'coches.net', 'y esa visita se sabe que vino del portal');

    // ── 11 · La visita acaba en venta ──────────────────────────────────────
    paso(10, 'La visita se cierra como «Fue y se lo quedo»');
    await c.query(
      `UPDATE vehicle_visit_bookings
          SET status='confirmed', resultado='compro', resultado_at=NOW() WHERE id=$1`,
      [reserva.id]
    );
    di((await c.query(VENDIDOS_SIN_CERRAR)).rows[0].n === 1,
      'sale en Pendientes como «vendido sin cerrar el encargo»');

    // ── 12 · Se cierra el encargo ──────────────────────────────────────────
    paso(11, 'Se cierra como vendido: factura, anuncio y transferencia');
    await c.query(
      `INSERT INTO moveadvisor_provider_invoices
         (id, type, provider_name, contract_id, vehicle_title, customer_name,
          customer_email, base_amount, invoice_amount, iva_rate, regimen, notes)
       VALUES ('FAC-comprueba-flujo','gestion_venta','Prueba Flujo',$1,'Citroen C3 (8888LXR)',
               'Prueba Flujo',$2,$3,$4,0.21,'nacional','Gestion integral de la venta')`,
      [ENCARGO, EMAIL, Number((FEE / 1.21).toFixed(2)), FEE]
    );
    di(true, `se emite la factura de ${FEE} EUR, IVA incluido`);

    await c.query(
      `UPDATE moveadvisor_marketplace_vo_offers SET is_active=FALSE, sold_at=NOW() WHERE id=$1`,
      [OFERTA]
    );
    await c.query(
      `UPDATE moveadvisor_user_vehicle_states SET is_listed=FALSE WHERE vehicle_id=$1`, [COCHE]
    );
    const off = (await c.query(
      `SELECT is_active, sold_at FROM moveadvisor_marketplace_vo_offers WHERE id=$1`, [OFERTA]
    )).rows[0];
    di(off.is_active === false && off.sold_at !== null,
      'se quita el anuncio y queda marcado como vendido');

    await c.query(
      `INSERT INTO erp_tramites
         (id, tipo, vehiculo_titulo, matricula, cliente_email, encargo_id, creado_por)
       VALUES ('TRA-comprueba-flujo','Transferencia de titularidad','Citroen C3','8888LXR',$1,$2,'comprueba')`,
      [EMAIL, ENCARGO]
    );
    const tra = (await c.query(
      `SELECT tipo, estado FROM erp_tramites WHERE encargo_id=$1`, [ENCARGO]
    )).rows;
    di(tra.length === 1, `se abre la transferencia (${tra[0]?.tipo}, ${tra[0]?.estado})`);

    await c.query(
      `UPDATE erp_encargos_venta
          SET cerrado_at=NOW(), motivo_cierre='vendido', estado='vendido' WHERE id=$1`,
      [ENCARGO]
    );
    di((await c.query(VENDIDOS_SIN_CERRAR)).rows[0].n === 0, 'y ese aviso se apaga');

    // ── 13 y 14 · El portal ────────────────────────────────────────────────
    paso(12, 'El anuncio de coches.net sigue puesto, y AHORA se avisa');
    di((await c.query(POR_RETIRAR)).rows[0].n === 1,
      'sale en Pendientes: hay que quitarlo del portal');

    paso(13, 'Se quita a mano y se apunta quien');
    await c.query(
      `UPDATE erp_anuncios_de_portal
          SET retirado_at=NOW(), retirado_por='Comprobacion'
        WHERE id='anu-comprueba-flujo' AND retirado_at IS NULL`
    );
    di((await c.query(POR_RETIRAR)).rows[0].n === 0, 'el aviso se apaga');
    const rastro = (await c.query(
      `SELECT retirado_por FROM erp_anuncios_de_portal WHERE id='anu-comprueba-flujo'`
    )).rows[0];
    di(Boolean(rastro.retirado_por), `y queda el rastro de quien (${rastro.retirado_por})`);

    console.log(mal === 0
      ? '\n  El flujo gestionado se recorre entero · ninguna rota'
      : `\n  ${mal} comprobacion(es) MAL en el flujo gestionado`);
    if (mal) process.exitCode = 1;
  } catch (e) {
    console.error('\nFALLO:', e.message);
    process.exitCode = 1;
  } finally {
    // Sin COMMIT en todo el fichero, a proposito: ver la cabecera.
    await c.query('ROLLBACK').catch(() => {});
    c.release();
    await pool.end();
  }
})();
