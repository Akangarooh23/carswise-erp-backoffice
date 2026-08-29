/**
 * El formulario de un vehículo.
 *
 * Lo usan tres sitios —crear, editar y la ficha de renting— y por eso ya estaba
 * suelto dentro de la pantalla. Aquí deja de ocupar trescientas líneas en medio
 * del fichero que hay que leer para entender otra cosa.
 */

import type { VoOffer, RentingPricesJson } from '../../types/index.js';
import { INPUT_CLS, LABEL_CLS, FUELS, RENTING_KM_OPTIONS, RENTING_DURATIONS } from './constantes.js';
import { getRentingPrices } from './rejilla.js';

interface FormFieldsProps {
  form: Partial<VoOffer>;
  setForm: React.Dispatch<React.SetStateAction<Partial<VoOffer>>>;
  idPrefix: string;
  onSetPrimary?: (newUrls: string[]) => void;
}

export default function VehicleFormFields({ form, setForm, idPrefix, onSetPrimary }: FormFieldsProps) {
  function onText(key: keyof VoOffer) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }
  function onNum(key: keyof VoOffer) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: Number(e.target.value) }));
  }
  function onBool(key: keyof VoOffer) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.checked }));
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={LABEL_CLS}>Título *</label>
        <input className={INPUT_CLS} value={form.title ?? ''} onChange={onText('title')} placeholder="Volkswagen Golf 1.6 TDI Comfortline" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={LABEL_CLS}>Marca *</label>
          <input className={INPUT_CLS} value={form.brand ?? ''} onChange={onText('brand')} placeholder="Volkswagen" />
        </div>
        <div>
          <label className={LABEL_CLS}>Modelo *</label>
          <input className={INPUT_CLS} value={form.model ?? ''} onChange={onText('model')} placeholder="Golf" />
        </div>
        <div>
          <label className={LABEL_CLS}>Versión</label>
          <input className={INPUT_CLS} value={form.version ?? ''} onChange={onText('version')} placeholder="1.6 TDI Comfortline" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label className={LABEL_CLS}>Año *</label>
          <input type="number" className={INPUT_CLS} value={form.year ?? ''} onChange={onNum('year')} />
        </div>
        <div>
          <label className={LABEL_CLS}>P. Compra (€) *</label>
          <input type="number" className={INPUT_CLS} value={form.price ?? ''} onChange={onNum('price')} />
        </div>
        <div>
          <label className={LABEL_CLS}>P. Venta (€)</label>
          <input type="number" className={INPUT_CLS} value={(form.sale_price as number | null | undefined) ?? ''} onChange={onNum('sale_price')} placeholder={form.price ? String(Math.round((Number(form.price) + 1250) * 100) / 100) : '—'} />
        </div>
        <div>
          <label className={LABEL_CLS}>Kilómetros</label>
          <input type="number" className={INPUT_CLS} value={form.mileage ?? ''} onChange={onNum('mileage')} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label className={LABEL_CLS}>Combustible</label>
          <select className={INPUT_CLS} value={form.fuel ?? ''} onChange={onText('fuel')}>
            <option value="">—</option>
            {FUELS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Transmisión</label>
          <select className={INPUT_CLS} value={form.transmission ?? ''} onChange={onText('transmission')}>
            <option value="">—</option>
            <option value="Manual">Manual</option>
            <option value="Automático">Automático</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Potencia</label>
          <input className={INPUT_CLS} value={form.power ?? ''} onChange={onText('power')} placeholder="90 CV" />
        </div>
        <div>
          <label className={LABEL_CLS}>Cilindrada (cc)</label>
          <input type="number" className={INPUT_CLS} value={form.displacement ?? ''} onChange={onNum('displacement')} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {form.available_for_purchase !== false && (
          <div>
            <label className={LABEL_CLS}>Color</label>
            <input className={INPUT_CLS} value={form.color ?? ''} onChange={onText('color')} placeholder="Blanco" />
          </div>
        )}
        <div>
          <label className={LABEL_CLS}>Ubicación (display)</label>
          <input className={INPUT_CLS} value={form.location ?? ''} onChange={onText('location')} placeholder="Madrid" />
        </div>
        <div>
          <label className={LABEL_CLS}>Campa / Código interno</label>
          <input className={INPUT_CLS} value={form.internal_location ?? ''} onChange={onText('internal_location')} placeholder="CARPIO" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Vendedor</label>
          <input className={INPUT_CLS} value={form.seller ?? ''} onChange={onText('seller')} placeholder="PopCar" />
        </div>
        <div>
          <label className={LABEL_CLS}>Tipo de vendedor</label>
          <select className={INPUT_CLS} value={form.seller_type ?? ''} onChange={onText('seller_type')}>
            <option value="">Sin especificar</option>
            <option value="professional">Profesional</option>
            <option value="particular">Particular</option>
            <option value="concesionario">Concesionario</option>
            <option value="importador">Importador</option>
          </select>
        </div>
      </div>
      {/* Cómo se le llama.

          A quien tiene el coche hay que llamarle a mano en cada visita: el
          sistema no le avisa nunca. Su teléfono no estaba en ninguna parte —de
          un concesionario se sacaba de su anuncio, y de un ex-renting o de un
          coche nuestro, de la cabeza de quien lo supiera—.

          Se rellena una vez por vendedor, no por coche: los 95 de Astara llevan
          el mismo. Esto es de uso interno y no sale en el marketplace. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Teléfono de quien vende</label>
          <input className={INPUT_CLS} value={form.seller_phone ?? ''} onChange={onText('seller_phone')}
                 placeholder="600 000 000" />
          <p className="text-[11px] text-brand-300 mt-1">Solo lo ve el equipo. Sale en la Agenda al llevar una visita.</p>
        </div>
        <div>
          <label className={LABEL_CLS}>Persona por la que preguntar</label>
          <input className={INPUT_CLS} value={form.seller_contact ?? ''} onChange={onText('seller_contact')}
                 placeholder="Sergio, de ventas" />
        </div>
      </div>
      <div>
        <label className={LABEL_CLS}>Fotos (hasta 10 URLs)</label>

        {/* Thumbnail grid — click "Hacer principal" to move a photo to position 0 */}
        {(form.image_urls ?? []).filter(u => u.trim()).length > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-3">
            {(form.image_urls ?? []).filter(u => u.trim()).map((url, idx) => (
              <div key={url + idx} className={`relative group aspect-square rounded-lg overflow-hidden bg-brand-100 border-2 transition-colors ${idx === 0 ? 'border-amber-400' : 'border-transparent hover:border-brand-300'}`}>
                <img
                  src={url}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                />
                {idx === 0 ? (
                  <div className="absolute top-1 left-1 bg-amber-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none">
                    Principal
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const newUrls = [url, ...(form.image_urls ?? []).filter(u => u !== url)];
                      setForm(f => ({ ...f, image_urls: newUrls, image_url: newUrls[0] ?? '' }));
                      onSetPrimary?.(newUrls);
                    }}
                    className="absolute top-1 left-1 bg-white/90 text-brand-400 text-[9px] font-medium px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-50 hover:text-amber-700 whitespace-nowrap"
                  >
                    Principal
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {(form.image_urls?.length ? form.image_urls : ['']).map((url, idx) => (
          <div key={idx} className="flex gap-2 mb-2 items-center">
            <span className="text-xs text-brand-300 w-4 shrink-0">{idx + 1}</span>
            <input
              className={INPUT_CLS}
              value={url}
              onChange={(e) => {
                const next = [...(form.image_urls ?? [''])];
                next[idx] = e.target.value;
                setForm((f) => ({ ...f, image_urls: next, image_url: next[0] ?? '' }));
              }}
              placeholder={idx === 0 ? 'https://... (foto principal)' : `https://... (foto ${idx + 1})`}
            />
            {(form.image_urls?.length ?? 0) > 1 && (
              <button type="button" onClick={() => {
                const next = (form.image_urls ?? []).filter((_, i) => i !== idx);
                setForm((f) => ({ ...f, image_urls: next, image_url: next[0] ?? '' }));
              }} className="text-red-400 hover:text-red-600 text-lg font-bold shrink-0 leading-none">✕</button>
            )}
          </div>
        ))}
        {(form.image_urls?.length ?? 0) < 10 && (
          <button type="button"
            onClick={() => setForm((f) => ({ ...f, image_urls: [...(f.image_urls ?? ['']), ''] }))}
            className="text-xs text-acento-texto hover:text-brand-600 font-medium">
            + Añadir foto
          </button>
        )}
      </div>
      <div>
        <label className={LABEL_CLS}>URL del anuncio original</label>
        <input className={INPUT_CLS} value={form.source_url ?? ''} onChange={onText('source_url')} placeholder="https://..." />
      </div>
      <div>
        <label className={LABEL_CLS}>Descripción</label>
        <textarea className={`${INPUT_CLS} resize-none`} rows={3} value={form.description ?? ''} onChange={onText('description')} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={LABEL_CLS}>Garantía (meses)</label>
          <input type="number" className={INPUT_CLS} value={form.warranty_months ?? 0} onChange={onNum('warranty_months')} min={0} />
        </div>
        <div>
          <label className={LABEL_CLS}>Puntuación portal</label>
          <input type="number" className={INPUT_CLS} value={form.portal_score ?? 80} onChange={onNum('portal_score')} min={0} max={100} />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input type="checkbox" id={`${idPrefix}-gs`} checked={form.has_guarantee_seal ?? false} onChange={onBool('has_guarantee_seal')} className="rounded" />
          <label htmlFor={`${idPrefix}-gs`} className="text-sm text-brand-500">Sello garantía</label>
        </div>
      </div>
      {/* Modalidad */}
      <div className="border border-brand-200 rounded-xl p-4 space-y-3 bg-brand-50">
        <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide">Modalidad de venta</p>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input type="checkbox" id={`${idPrefix}-purchase`} checked={form.available_for_purchase ?? true} onChange={onBool('available_for_purchase')} className="rounded" />
            <label htmlFor={`${idPrefix}-purchase`} className="text-sm font-medium text-brand-500">Disponible para compra</label>
          </div>
          {(form.available_for_purchase ?? true) && (
            <p className="ml-6 text-xs text-brand-300">El precio de compra se indica en el campo "Precio (€)" de arriba.</p>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id={`${idPrefix}-renting`} checked={form.renting_available ?? false} onChange={onBool('renting_available')} className="rounded" />
            <label htmlFor={`${idPrefix}-renting`} className="text-sm font-medium text-brand-500">Disponible para renting</label>
          </div>
          {form.renting_available && (
            <div className="ml-6 space-y-3">
              <p className="text-xs text-brand-300">Cuota mensual (€/mes) por plazo y km/año. La columna 15.000 km se usa como precio de referencia en el listado.</p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-1.5 text-brand-400 font-medium">Plazo</th>
                      {RENTING_KM_OPTIONS.map(km => (
                        <th key={km} className={`text-center p-1.5 font-medium whitespace-nowrap ${km === 15000 ? 'text-acento-texto' : 'text-brand-400'}`}>
                          {(km / 1000).toFixed(0)}.000 km
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RENTING_DURATIONS.map((dur) => {
                      const prices = getRentingPrices(form);
                      const row = (prices[dur] as (number | null)[] | null) ?? new Array(RENTING_KM_OPTIONS.length).fill(null);
                      return (
                        <tr key={dur} className="border-t border-brand-100">
                          <td className="p-1.5 font-semibold text-brand-400 whitespace-nowrap">{dur.replace('m', ' meses')}</td>
                          {RENTING_KM_OPTIONS.map((km, ki) => {
                            const isStd = km === 15000;
                            return (
                              <td key={km} className={`p-1 ${isStd ? 'bg-acento-tenue' : ''}`}>
                                <input
                                  type="number"
                                  className={`w-full px-2 py-1 text-xs border rounded text-center focus:outline-none focus:ring-1 focus:ring-acento ${isStd ? 'border-acento font-semibold' : 'border-brand-200'}`}
                                  value={row[ki] ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? null : Number(e.target.value);
                                    setForm((f) => {
                                      const current = getRentingPrices(f);
                                      const arr = [...((current[dur] as (number | null)[] | null) ?? new Array(RENTING_KM_OPTIONS.length).fill(null))] as (number | null)[];
                                      arr[ki] = val;
                                      const updated: RentingPricesJson = { ...current, km_options: RENTING_KM_OPTIONS, [dur]: arr };
                                      const sync: Partial<VoOffer> = { renting_prices_json: updated, renting_km_year: 15000 };
                                      if (isStd) (sync as Record<string, unknown>)[`renting_${dur}`] = val;
                                      return { ...f, ...sync };
                                    });
                                  }}
                                  placeholder="—"
                                  min={0}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-brand-100 pt-3">
                <label className={LABEL_CLS}>Fee PopCar (€) <span className="text-brand-300 font-normal">— importe que CarsWise factura al proveedor por cada contrato de renting firmado</span></label>
                <input
                  type="number"
                  className={`${INPUT_CLS} max-w-[180px]`}
                  value={form.carswise_fee ?? 400}
                  onChange={onNum('carswise_fee')}
                  min={0}
                  step={10}
                  placeholder="400"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id={`${idPrefix}-active`} checked={form.is_active ?? true} onChange={onBool('is_active')} className="rounded" />
        <label htmlFor={`${idPrefix}-active`} className="text-sm font-medium text-brand-500">Publicado en marketplace</label>
      </div>
    </div>
  );
}
