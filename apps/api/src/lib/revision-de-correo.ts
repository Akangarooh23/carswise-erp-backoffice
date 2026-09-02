/**
 * Lo que se puede tocar de un correo antes de mandarlo.
 *
 * Los tres correos que salen a proveedores —la factura al vendedor, la recogida
 * al transportista y el encargo a la gestoría— se enseñan antes de enviarse. Y
 * se puede cambiar **el destinatario, el asunto y añadir una línea**; el cuerpo
 * no se edita.
 *
 * No es por no complicarse. Cada uno de esos correos existe por una frase
 * concreta: «la factura a nombre del cliente, no de PopCar», «preguntar por» en
 * cada punta, «decidnos el importe real del impuesto». Un cuadro de texto libre
 * con todo el HTML dentro es la forma más fácil de que un día se borre una de
 * esas frases sin darse cuenta y el correo salga pareciendo el de siempre.
 *
 * Lo que de verdad hace falta al revisar es otra cosa: corregir a quién va,
 * ajustar el asunto y **añadir lo de este coche en concreto** —«el jueves está
 * cerrado», «llamad antes a Miguel»—. Eso es lo que se deja.
 */

/** Un correo con pinta de correo. No valida que exista: eso lo dice Resend. */
export function pareceUnCorreo(v: unknown): boolean {
  const s = String(v ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/**
 * El asunto que se manda.
 *
 * Se recorta y se le quitan los saltos de línea: pegado desde otro sitio, un
 * asunto con un salto dentro lo rechaza el servidor de correo y el envío se cae
 * sin que nadie entienda por qué.
 */
export function asuntoLimpio(puesto: unknown, porDefecto: string): string {
  const s = String(puesto ?? '').replace(/[\r\n]+/g, ' ').trim();
  return s ? s.slice(0, 200) : porDefecto;
}

/**
 * La línea que añade quien revisa, convertida en párrafos.
 *
 * Entra como texto plano y sale escapada: lo que se teclea en un cuadro del ERP
 * no puede acabar siendo HTML dentro de un correo que sale con nuestro nombre.
 * Los saltos de línea se respetan porque quien escribe tres renglones espera
 * tres renglones.
 */
export function notaEnParrafos(nota: unknown): string {
  const texto = String(nota ?? '').trim();
  if (!texto) return '';
  const esc = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
