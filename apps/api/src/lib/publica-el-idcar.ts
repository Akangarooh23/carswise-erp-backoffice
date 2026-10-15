/**
 * Publicar un IDCar en el marketplace de particulares.
 *
 * Esto vivía dentro de la ruta del botón «Publicar», y ahí no podía
 * reutilizarse: cuando el cliente firma el precio de salida, el coche tiene
 * que salir **solo**, sin que nadie se acuerde de volver a entrar y pulsar.
 *
 * Y si no sale, no es solo que tarde: los enlaces que el ERP da para pegar en
 * coches.net o Wallapop apuntan a la ficha pública del coche, y esa ficha solo
 * existe mientras el anuncio está activo. Sin publicar, el comprador que llega
 * del portal lee «este coche ya no está a la venta» — que encima es mentira,
 * porque no se ha vendido: no ha salido todavía.
 *
 * ## Lo que NO cambia al sacarlo de la ruta
 *
 * Las puertas siguen mandando. Un botón apagado es una pista, no una regla: la
 * promesa de que un anuncio nuestro lleva informe y se puede visitar tiene que
 * sostenerse venga la llamada de donde venga —del botón, del cliente al firmar
 * o de lo que se monte mañana—.
 *
 * Devuelve por qué no se ha podido en vez de contestar por HTTP, para que cada
 * sitio lo cuente como le toca: la pantalla con un error y la firma del cliente
 * con una línea en el registro.
 */
import { query } from '../db/pool.js';
import { porQueNoSePuedePublicar, avisaDeQueSePublico, apuntaQueSePublico, elPrecioAcordadoDe } from '../routes/encargos.js';
import { loQueVaAlAnuncio, type ElAnuncio } from './caracteristicas-del-coche.js';

export type LoQuePasoAlPublicar =
  | { ok: true; offer_id: string }
  | { ok: false; estado: number; error: string; detail?: string; fields?: string[] };

export async function publicaElIdcar(
  vehicleId: string,
  seller = '',
): Promise<LoQuePasoAlPublicar> {

    const vehicle = await query(
      `SELECT * FROM moveadvisor_user_vehicles WHERE id = $1`,
      [vehicleId]
    ).catch(() => ({ rows: [] }));

    if (!vehicle.rows.length) {
      return { ok: false as const, estado: 404, error: 'idcar_not_found' };
    }
    const v = vehicle.rows[0];

    const { brand, model, year } = v;

    /*
     * Lo que el comprador lee del coche, con las mismas reglas que al corregirlo
     * desde la ficha: el título es marca + modelo + versión y no el alias de su
     * garaje («Prueba»), la potencia con su número, la cilindrada la suya.
     */
    const anuncio = loQueVaAlAnuncio(v);

    /*
     * El precio acordado manda sobre el del panel.
     *
     * Si el coche lo vendemos nosotros, el precio se acuerda con el dueño y él
     * lo firma: ése es el que tiene que salir en el anuncio. El del panel lo
     * escribió él antes de todo esto y puede estar viejo — o vacío, que es lo
     * que dejaba un coche con el papel firmado a 17.900 € sin poder publicarse
     * por «falta el precio».
     *
     * Sin encargo no hay nada que imponer: ese precio es suyo.
     */
    const acordado = await elPrecioAcordadoDe(vehicleId);
    const price = acordado ?? v.price;

    const missing: string[] = [];
    if (!brand?.toString().trim())  missing.push('marca');
    if (!model?.toString().trim())  missing.push('modelo');
    if (!year  || Number(year) < 1900) missing.push('año');
    if (!price || parseFloat(String(price)) <= 0) missing.push('precio');
    if (missing.length) {
      return { ok: false as const, estado: 400, error: 'missing_required_fields', fields: missing,
        detail: `Campos obligatorios sin rellenar: ${missing.join(', ')}` };
    }

    /*
     * Si el coche lo vendemos nosotros, las cuatro puertas mandan.
     *
     * En la pantalla el botón sale apagado, pero un botón apagado es una pista y
     * no una regla: la promesa de que un anuncio nuestro lleva informe y se
     * puede visitar tiene que sostenerse aunque la llamada venga de otro sitio.
     *
     * Sin encargo no se comprueba nada. Un particular que publica su propio
     * IDCar no nos ha encargado la venta y no le pedimos nada.
     */
    const noPuede = await porQueNoSePuedePublicar(vehicleId);
    if (noPuede) {
      return { ok: false as const, estado: 409, error: 'el_encargo_no_esta_listo', detail: noPuede };
    }

    // Get all photo URLs — first one (by upload date) becomes the primary
    const allPhotosResult = await query(
      `SELECT file_url FROM moveadvisor_user_vehicle_files
       WHERE vehicle_id = $1 AND file_type = 'photo' AND file_url != '' ORDER BY created_at ASC LIMIT 20`,
      [vehicleId]
    ).catch(() => ({ rows: [] }));
    const allPhotoUrls = (allPhotosResult.rows as { file_url: string }[]).map(r => r.file_url);
    const imageUrl  = allPhotoUrls[0] || '';
    const imageUrls = JSON.stringify(allPhotoUrls);

    const offerId = `idcar-${vehicleId}`;
    // Quien vende: el que diga quien llama y, si no, el dueño del IDCar.
    const quienVende = seller || v.user_email || 'particular';
    const priceNum = parseFloat(String(price || 0)) || 0;

    const existing = await query(`SELECT id, image_url, image_urls FROM moveadvisor_marketplace_vo_offers WHERE id = $1`, [offerId]);

    if (existing.rows.length) {
      // Preserve a manually chosen primary photo (set via "Hacer principal") if it's still in the photo list
      const savedPrimary: string = existing.rows[0].image_url || '';
      let resolvedImageUrl = imageUrl;
      let resolvedImageUrls = imageUrls;
      if (savedPrimary && allPhotoUrls.includes(savedPrimary)) {
        // Keep the manually chosen primary at the front
        const reordered = [savedPrimary, ...allPhotoUrls.filter((u: string) => u !== savedPrimary)];
        resolvedImageUrl  = savedPrimary;
        resolvedImageUrls = JSON.stringify(reordered);
      }

      await llevaLasCaracteristicasAlAnuncio(vehicleId, anuncio);
      await query(
        `UPDATE moveadvisor_marketplace_vo_offers SET
          price = $1, image_url = $2, image_urls = $3,
          seller_type = 'particular', is_active = TRUE, updated_at = NOW()
         WHERE id = $4`,
        [priceNum, resolvedImageUrl, resolvedImageUrls, offerId]
      );
    } else {
      await query(
        `INSERT INTO moveadvisor_marketplace_vo_offers
           (id, title, brand, model, version, year, price, mileage, fuel, color, description,
            image_url, image_urls, seller, seller_type, location, power, displacement,
            transmission, body_type, doors, seats,
            has_guarantee_seal, portal_score, warranty_months,
            available_for_purchase, renting_available, renting_km_year,
            has_stock_management, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'particular',$15,
                 $16,$17,$18,$19,$20,$21, FALSE, 0, 0, TRUE, FALSE, 0, FALSE, TRUE, NOW(), NOW())`,
        [
          offerId,
          anuncio.title || `${brand} ${model} ${year}`,
          anuncio.brand, anuncio.model, anuncio.version,
          anuncio.year, priceNum, anuncio.mileage,
          anuncio.fuel, anuncio.color, anuncio.description,
          imageUrl, imageUrls, quienVende,
          anuncio.location,
          // Antes aquí iban «CV» a secas y, en la cilindrada, el CO₂.
          anuncio.power, anuncio.displacement,
          anuncio.transmission, anuncio.body_type, anuncio.doors, anuncio.seats,
        ]
      );
    }

    /*
     * Y si el coche es de un encargo, que ha pasado lo que decía el mandato.
     *
     * Se apunta en el encargo y no se mira la oferta: la oferta puede existir de
     * antes —el dueño la publicó él mismo meses atrás— y entonces el correo de
     * «ya está anunciado» no salía nunca, y los 30 días no tendrían desde dónde
     * contar. Solo la primera vez del encargo.
     *
     * Esperado: en Vercel lo que no se espera se corta, y así se perdía el
     * correo. Con su `catch`, porque el anuncio ya está publicado.
     */
    if (acordado !== null) {
      await query(
        `UPDATE moveadvisor_user_vehicles SET price = $2, updated_at = NOW() WHERE id = $1`,
        [vehicleId, String(priceNum)]
      ).catch((e) => console.error('[idcars] precio del coche:', (e as Error).message));
    }
    const primeraVez = await apuntaQueSePublico(vehicleId)
      .catch((e) => { console.error('[idcars] sin apuntar la publicación:', (e as Error).message); return false; });
    if (primeraVez) {
      await avisaDeQueSePublico(vehicleId, offerId, priceNum)
        .catch((e) => console.error('[idcars] sin avisar de la publicación:', (e as Error).message));
    }

    return { ok: true as const, offer_id: offerId };
}

/**
 * Las características del anuncio, puestas al día con lo que hay en el coche.
 *
 * Todo menos el precio, las fotos y si está activo: el precio de un encargo va
 * por lo firmado y las fotos se leen vivas. Si el coche no está publicado no hay
 * fila y no pasa nada. Devuelve si había anuncio.
 */
export async function llevaLasCaracteristicasAlAnuncio(vehicleId: string, a: ElAnuncio): Promise<boolean> {
  const r = await query(
    `UPDATE moveadvisor_marketplace_vo_offers SET
       title = $2, brand = $3, model = $4, version = $5, year = $6, mileage = $7,
       fuel = $8, color = $9, power = $10, displacement = $11, transmission = $12,
       body_type = $13, doors = $14, seats = $15, location = $16, description = $17,
       updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [
      `idcar-${vehicleId}`, a.title, a.brand, a.model, a.version, a.year, a.mileage,
      a.fuel, a.color, a.power, a.displacement, a.transmission,
      a.body_type, a.doors, a.seats, a.location, a.description,
    ]
  );
  return r.rows.length > 0;
}
