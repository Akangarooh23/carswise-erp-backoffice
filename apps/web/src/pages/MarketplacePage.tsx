import { Fragment, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { Badge } from '../components/ui/Badge.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';
import type { VoOffer, VoUnit, UnitStatus, RentingPricesJson } from '../types/index.js';
import Icono from '../components/ui/Icono.js';

import { fmtPrice, fmtKm, fmtCuota, todayStr, fmtVDate, fmtVTime, V_TIMES } from './marketplace/formato.js';
import {
  TABS, STATUS_FILTERS, EXCEL_HEADERS, EMPTY_FORM, EMPTY_RENTING_FORM,
  INPUT_CLS, LABEL_CLS, FUELS, RENTING_KM_OPTIONS, RENTING_DURATIONS,
  PORTAL_DISPONIBLES, PORTAL_LABELS, portalLabel, type Tab, type RentDuration,
} from './marketplace/constantes.js';
import type {
  PortalOffer, ParticularsOffer, PortalStat, PortalStats, VisitEntry, SlotFormState,
} from './marketplace/tipos.js';
import { getRentingPrices } from './marketplace/rejilla.js';
import {
  parseXlsx, exportXlsx, downloadTemplate, exportParticularsXlsx, exportPortalXlsx,
} from './marketplace/excel.js';
import VehicleFormFields from './marketplace/VehicleFormFields.js';
import VisitsPanel from './marketplace/VisitsPanel.js';

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const [tab, setTab]             = useState<Tab>('vo');
  const [items, setItems]         = useState<VoOffer[]>([]);
  const [portalItems, setPortalItems] = useState<PortalOffer[]>([]);
  const [particularsItems, setParticularsItems] = useState<ParticularsOffer[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [q, setQ]                 = useState('');
  const [portalFilter, setPortalFilter] = useState('');
  const [sellerFilter, setSellerFilter] = useState('');
  const [brands, setBrands]       = useState<string[]>([]);
  const [brand, setBrand]         = useState('');
  const [statusFilter, setStatus] = useState('');
  const [loading, setLoading]     = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [verifiedToday, setVerifiedToday] = useState(0);
  const [verifiable, setVerifiable]       = useState(0);
  const [verifyRunning, setVerifyRunning] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulking, setBulking]         = useState(false);
  const [bulkAviso, setBulkAviso] = useState<string | null>(null);

  const [sortCol, setSortCol]   = useState<string>('');
  const [sortDir, setSortDir]   = useState<'asc'|'desc'>('asc');
  const [colF, setColF] = useState({ brand: '', model: '', version: '', fuel: '', transmission: '', modality: '', year: '', priceMin: '', priceMax: '', salePriceMin: '', salePriceMax: '', estado: '', color: '', cc: '', seller: '', units: '', noImage: '' });
  const [colFOffers,   setColFOffers]   = useState({ brand: '', marca: '', modelo: '', version: '', portal: '', sellerType: '', estado: '', priceMax: '', kmMax: '', year: '', fuel: '', color: '', body: '', trans: '', cvMin: '', doors: '', seats: '', ccMin: '', co2Max: '', etiq: '', trac: '', consMax: '', province: '', city: '' });
  const [colFOffersDeb, setColFOffersDeb] = useState(colFOffers);
  const [portalFilterOpts, setPortalFilterOpts] = useState<{ colors: string[]; bodyTypes: string[]; transmissions: string[]; tractions: string[]; fuels: string[]; portals: string[]; provinces: string[]; cities: string[]; years: number[] }>({ colors: [], bodyTypes: [], transmissions: [], tractions: [], fuels: [], portals: [], provinces: [], cities: [], years: [] });
  const [voFilterOpts, setVoFilterOpts] = useState<{ colors: string[]; fuels: string[]; transmissions: string[]; sellers: string[]; provincias: string[]; portals: string[]; years: number[] }>({ colors: [], fuels: [], transmissions: [], sellers: [], provincias: [], portals: [], years: [] });
  const [colFDeb, setColFDeb] = useState(colF);
  const [colFRenting,  setColFRenting]  = useState({ title: '', brand: '', model: '', version: '', yearMin: '', yearMax: '', kmMin: '', kmMax: '', m12Min: '', m12Max: '', m24Min: '', m24Max: '', m36Min: '', m36Max: '', m48Min: '', m48Max: '', m60Min: '', m60Max: '', status: '' });
  const [colFPart,     setColFPart]     = useState({ brand: '', marca: '', modelo: '', version: '', client: '', priceMin: '', priceMax: '', kmMax: '', year: '', fuel: '', location: '', plate: '' });
  const [colFConc,     setColFConc]     = useState({ brand: '', marca: '', modelo: '', version: '', sellerType: '', seller: '', priceMax: '', kmMax: '', year: '' });
  const [colFRentingDeb, setColFRentingDeb] = useState(colFRenting);
  const [colFPartDeb,    setColFPartDeb]    = useState(colFPart);
  const [colFConcDeb,    setColFConcDeb]    = useState(colFConc);
  const [partFilterOpts, setPartFilterOpts] = useState<{ fuels: string[]; colors: string[]; transmissions: string[]; years: string[] }>({ fuels: [], colors: [], transmissions: [], years: [] });

  // ── Visit availability state ──────────────────────────────────────────────
  const [expandedVisits, setExpandedVisits] = useState<string | null>(null);
  const [visitData, setVisitData]           = useState<Record<string, VisitEntry>>({});
  const [visitSlotForm, setVisitSlotForm]   = useState<SlotFormState>({ date: todayStr(), timeStart: '10:00', timeEnd: '12:00' });
  const [visitSlotAdding, setVisitSlotAdding] = useState(false);
  const [visitSlotMsg, setVisitSlotMsg]       = useState<string | null>(null);

  async function openVisitsPanel(offerId: string) {
    if (expandedVisits === offerId) { setExpandedVisits(null); return; }
    setExpandedVisits(offerId);
    setVisitSlotMsg(null);
    if (!visitData[offerId]) {
      setVisitData((d) => ({ ...d, [offerId]: { slots: [], bookings: [], loading: true } }));
      const [sRes, bRes] = await Promise.all([
        api.get<any>(`/visit-slots?offerId=${encodeURIComponent(offerId)}`),
        api.get<any>(`/visit-bookings?offerId=${encodeURIComponent(offerId)}`),
      ]);
      setVisitData((d) => ({
        ...d,
        [offerId]: { slots: sRes.data?.slots || [], bookings: bRes.data?.bookings || [], loading: false },
      }));
    }
  }

  async function doAddVisitSlot(offerId: string) {
    const { date, timeStart, timeEnd } = visitSlotForm;
    if (!date || timeEnd <= timeStart) { setVisitSlotMsg('Fecha y horas válidas requeridas'); return; }
    setVisitSlotAdding(true); setVisitSlotMsg(null);
    const startsAt = new Date(`${date}T${timeStart}:00`).toISOString();
    const endsAt   = new Date(`${date}T${timeEnd}:00`).toISOString();
    const r = await api.post<any>('/visit-slots', { offerId, startsAt, endsAt, source: 'erp' });
    if (r.ok && r.data?.slot) {
      setVisitData((d) => ({
        ...d,
        [offerId]: { ...(d[offerId] || { bookings: [], loading: false }),
          slots: [...(d[offerId]?.slots || []), r.data.slot].sort((a: any, b: any) => a.starts_at > b.starts_at ? 1 : -1) },
      }));
      setVisitSlotMsg('✓ Franja añadida');
    } else {
      setVisitSlotMsg(r.error || 'Error al añadir');
    }
    setVisitSlotAdding(false);
  }

  /**
   * Quita una franja.
   *
   * Se relee del servidor en vez de quitarla de la pantalla y ya: el borrado no
   * toca las franjas reservadas, así que desaparecía de la vista una franja que
   * seguía existiendo, y quien la quitaba se quedaba creyendo que estaba libre.
   */
  async function doRemoveVisitSlot(offerId: string, slotId: string) {
    await api.delete(`/visit-slots/${slotId}?offerId=${encodeURIComponent(offerId)}`);
    const sRes = await api.get<any>(`/visit-slots?offerId=${encodeURIComponent(offerId)}`);
    if (!sRes.ok) return;
    setVisitData((d) => ({
      ...d,
      [offerId]: { ...(d[offerId] || { bookings: [], loading: false }), slots: sRes.data?.slots || [] },
    }));
  }

  /**
   * Cancela una visita de verdad: al cliente le llega un correo diciéndoselo.
   *
   * Por eso pasa por un diálogo y pide motivo, como en la Agenda. Estaba a un
   * clic y sin motivo: se le podía cancelar la visita a alguien sin querer, y lo
   * que recibía era una cancelación sin explicación ninguna.
   */
  async function doCancelVisitBooking() {
    if (!cancelarCita) return;
    const { offerId, booking } = cancelarCita;
    setCancelandoCita(true);
    const r = await api.post<{ avisado?: boolean }>(`/visit-bookings/${booking.id}/cancel`, { motivo: motivoCita.trim() });
    setCancelandoCita(false);
    setCancelarCita(null);
    setMotivoCita('');
    if (!r.ok) return;
    setVisitData((d) => ({
      ...d,
      [offerId]: { ...(d[offerId] || { slots: [], loading: false }),
        bookings: (d[offerId]?.bookings || []).filter((b: any) => b.id !== booking.id) },
    }));
    // Las franjas cambian al cancelar —la hora vuelve a estar libre—, así que se
    // reeleen en vez de suponerlo.
    const sRes = await api.get<any>(`/visit-slots?offerId=${encodeURIComponent(offerId)}`);
    if (sRes.ok) {
      setVisitData((d) => ({
        ...d,
        [offerId]: { ...(d[offerId] || { bookings: [], loading: false }), slots: sRes.data?.slots || [] },
      }));
    }
  }

  function toggleSort(col: string) {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); return col; }
      setSortDir('asc'); return col;
    });
  }
  function setCol(key: keyof typeof colF, val: string) { setColF((f) => ({ ...f, [key]: val })); }

  const displayItems = useMemo(() => {
    let r = [...items];
    if (colF.brand)        r = r.filter(i => colF.brand === '__empty__' ? isEmpty(i.brand) : (i.brand || '').toLowerCase() === colF.brand.toLowerCase());
    if (colF.model)        r = r.filter(i => (i.model || '').toLowerCase().includes(colF.model.toLowerCase()));
    if (colF.version)      r = r.filter(i => colF.version === '__empty__' ? isEmpty(i.version) : (i.version || '').toLowerCase().includes(colF.version.toLowerCase()));
    if (colF.fuel)         r = r.filter(i => matchEnumCI(colF.fuel, i.fuel));
    if (colF.transmission) r = r.filter(i => colF.transmission === '__empty__' ? isEmpty(i.transmission) : (i.transmission || '').toLowerCase().includes(colF.transmission.toLowerCase()));
    if (colF.year)         r = r.filter(i => matchEnum(colF.year, i.year));
    if (colF.priceMin)     r = r.filter(i => Number(i.price) >= Number(colF.priceMin));
    if (colF.priceMax)     r = r.filter(i => Number(i.price) <= Number(colF.priceMax));
    if (colF.salePriceMin) r = r.filter(i => i.sale_price != null && Number(i.sale_price) >= Number(colF.salePriceMin));
    if (colF.salePriceMax) r = r.filter(i => i.sale_price != null && Number(i.sale_price) <= Number(colF.salePriceMax));
    if (colF.estado === 'active')   r = r.filter(i => i.is_active);
    if (colF.estado === 'inactive') r = r.filter(i => !i.is_active);
    if (colF.color)        r = r.filter(i => colF.color === '__empty__' ? (!i.color && !i.available_colors?.length) : (i.available_colors?.includes(colF.color) || (i.color || '') === colF.color));
    if (colF.cc)           r = r.filter(i => matchMin(colF.cc, (i as any).displacement));
    if (colF.seller)       r = r.filter(i => colF.seller === '__empty__' ? isEmpty(i.seller) : (i.seller || '') === colF.seller);
    if (colF.units === 'stock') r = r.filter(i => (i.units_available ?? 0) > 0);
    if (colF.modality === 'compra')   r = r.filter(i => i.available_for_purchase !== false);
    if (colF.modality === 'renting')  r = r.filter(i => i.renting_available);
    if (colF.modality === 'both')     r = r.filter(i => i.available_for_purchase !== false && i.renting_available);
    if (colF.noImage) r = r.filter(i => !i.image_url && !(i.image_urls?.length));
    if (sortCol) {
      r.sort((a, b) => {
        const av = (a as unknown as Record<string,unknown>)[sortCol] ?? '';
        const bv = (b as unknown as Record<string,unknown>)[sortCol] ?? '';
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'es');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return r;
  }, [items, colF, sortCol, sortDir]);

  const rentingItems = useMemo(() => items.filter(i => i.renting_available), [items]);

  const brandOptions   = useMemo(() => [...new Set(items.map(i => i.brand).filter(Boolean))].sort(), [items]);
  const fuelOptions    = useMemo(() => [...new Set(items.map(i => i.fuel).filter(Boolean))].sort(), [items]);
  const yearOptions    = useMemo(() => [...new Set(items.map(i => i.year).filter(Boolean))].sort((a,b) => (b??0)-(a??0)), [items]);
  const colorOptions   = useMemo(() => [...new Set(items.flatMap(i => i.available_colors ?? []).filter(Boolean))].sort(), [items]);
  const sellerOptions  = useMemo(() => [...new Set(items.map(i => i.seller).filter(Boolean))].sort(), [items]);
  const concYearOpts   = useMemo(() => [...new Set(items.map(i => i.year).filter(Boolean))].sort((a,b) => (b??0)-(a??0)), [items]);
  const concSellerOpts = useMemo(() => [...new Set(items.map(i => i.seller).filter(Boolean))].sort(), [items]);

  // Los nombres de los portales estaban escritos dos veces: aquí, con ocho, y
  // en constantes.ts, con trece. Los cinco que faltaban salían en el filtro como
  // el texto crudo de la base. Ahora hay una sola lista, y portalLabel además
  // sabe qué hacer con un portal que no conozca.

  const isEmpty = (v: any) => v === null || v === undefined || v === '';
  const matchEnum = (val: string, field: any) =>
    val === '__empty__' ? isEmpty(field) : String(field ?? '') === val;
  const matchEnumCI = (val: string, field: any) =>
    val === '__empty__' ? isEmpty(field) : (field||'').toLowerCase() === val.toLowerCase();
  const matchRange = (val: string, field: any) =>
    val === '__empty__' ? !field : Number(field) <= Number(val);
  const matchMin = (val: string, field: any) =>
    val === '__empty__' ? isEmpty(field) : Number(field) >= Number(val);

  const displayPortalItems = useMemo(() => {
    let r = [...portalItems] as any[];
    if (colFOffers.brand)      r = r.filter(i => `${i.brand||''} ${i.model||''}`.toLowerCase().includes(colFOffers.brand.toLowerCase()));
    if (colFOffers.marca)      r = r.filter(i => (i.brand||'').toLowerCase().includes(colFOffers.marca.toLowerCase()));
    if (colFOffers.modelo)     r = r.filter(i => (i.model||'').toLowerCase().includes(colFOffers.modelo.toLowerCase()));
    if (colFOffers.version)    r = r.filter(i => colFOffers.version === '__empty__' ? isEmpty(i.version) : (i.version||'').toLowerCase().includes(colFOffers.version.toLowerCase()));
    if (colFOffers.portal)     r = r.filter(i => matchEnumCI(colFOffers.portal, i.portal));
    if (colFOffers.sellerType) r = r.filter(i => matchEnum(colFOffers.sellerType, i.seller_type));
    if (colFOffers.estado === 'active')   r = r.filter(i => i.is_active !== false);
    if (colFOffers.estado === 'inactive') r = r.filter(i => i.is_active === false);
    if (colFOffers.priceMax)   r = r.filter(i => matchRange(colFOffers.priceMax, i.price));
    if (colFOffers.kmMax)      r = r.filter(i => matchRange(colFOffers.kmMax, i.mileage));
    if (colFOffers.year)       r = r.filter(i => matchEnum(colFOffers.year, i.year));
    if (colFOffers.fuel)       r = r.filter(i => matchEnumCI(colFOffers.fuel, i.fuel));
    if (colFOffers.color)      r = r.filter(i => matchEnumCI(colFOffers.color, i.color));
    if (colFOffers.body)       r = r.filter(i => matchEnumCI(colFOffers.body, i.body_type));
    if (colFOffers.trans)      r = r.filter(i => matchEnumCI(colFOffers.trans, i.transmission));
    if (colFOffers.cvMin)      r = r.filter(i => matchMin(colFOffers.cvMin, i.power_cv));
    if (colFOffers.doors)      r = r.filter(i => matchEnum(colFOffers.doors, i.doors));
    if (colFOffers.seats)      r = r.filter(i => matchEnum(colFOffers.seats, i.seats));
    if (colFOffers.ccMin)      r = r.filter(i => matchMin(colFOffers.ccMin, i.displacement));
    if (colFOffers.co2Max)     r = r.filter(i => matchRange(colFOffers.co2Max, i.co2));
    if (colFOffers.etiq)       r = r.filter(i => matchEnum(colFOffers.etiq, i.environmental_label));
    if (colFOffers.trac)       r = r.filter(i => matchEnumCI(colFOffers.trac, i.traction));
    if (colFOffers.consMax)    r = r.filter(i => matchRange(colFOffers.consMax, i.consumption));
    if (colFOffers.province)   r = r.filter(i => matchEnumCI(colFOffers.province, i.province));
    if (colFOffers.city)       r = r.filter(i => matchEnumCI(colFOffers.city, i.city));
    return r;
  }, [portalItems, colFOffers]);

  const displayRentingItems = useMemo(() => {
    let r = [...rentingItems];
    const cr = colFRenting;
    const gte = (v: string, f: any) => !v || (f != null && Number(f) >= Number(v));
    const lte = (v: string, f: any) => !v || (f != null && Number(f) <= Number(v));
    if (cr.title)  r = r.filter(i => (i.title||'').toLowerCase().includes(cr.title.toLowerCase()));
    if (cr.brand)  r = r.filter(i => (i.brand||'').toLowerCase().includes(cr.brand.toLowerCase()));
    if (cr.model)  r = r.filter(i => (i.model||'').toLowerCase().includes(cr.model.toLowerCase()));
    if (cr.version) r = r.filter(i => cr.version === '__empty__' ? isEmpty(i.version) : (i.version||'').toLowerCase().includes(cr.version.toLowerCase()));
    if (cr.yearMin || cr.yearMax) r = r.filter(i => gte(cr.yearMin, i.year) && lte(cr.yearMax, i.year));
    if (cr.kmMin || cr.kmMax)     r = r.filter(i => gte(cr.kmMin, (i as any).renting_km_year) && lte(cr.kmMax, (i as any).renting_km_year));
    if (cr.m12Min || cr.m12Max)   r = r.filter(i => gte(cr.m12Min, (i as any).renting_12m) && lte(cr.m12Max, (i as any).renting_12m));
    if (cr.m24Min || cr.m24Max)   r = r.filter(i => gte(cr.m24Min, (i as any).renting_24m) && lte(cr.m24Max, (i as any).renting_24m));
    if (cr.m36Min || cr.m36Max)   r = r.filter(i => gte(cr.m36Min, (i as any).renting_36m) && lte(cr.m36Max, (i as any).renting_36m));
    if (cr.m48Min || cr.m48Max)   r = r.filter(i => gte(cr.m48Min, (i as any).renting_48m) && lte(cr.m48Max, (i as any).renting_48m));
    if (cr.m60Min || cr.m60Max)   r = r.filter(i => gte(cr.m60Min, (i as any).renting_60m) && lte(cr.m60Max, (i as any).renting_60m));
    if (cr.status === 'active')   r = r.filter(i => i.is_active);
    if (cr.status === 'inactive') r = r.filter(i => !i.is_active);
    return r;
  }, [rentingItems, colFRenting]);

  const displayPartItems = useMemo(() => {
    let r = [...particularsItems] as any[];
    if (colFPart.brand)    r = r.filter(i => `${i.brand||''} ${i.model||''} ${i.title||''}`.toLowerCase().includes(colFPart.brand.toLowerCase()));
    if (colFPart.marca)    r = r.filter(i => (i.brand||'').toLowerCase().includes(colFPart.marca.toLowerCase()));
    if (colFPart.modelo)   r = r.filter(i => (i.model||'').toLowerCase().includes(colFPart.modelo.toLowerCase()));
    if (colFPart.version)  r = r.filter(i => colFPart.version === '__empty__' ? isEmpty(i.version) : (i.version||'').toLowerCase().includes(colFPart.version.toLowerCase()));
    if (colFPart.client)   r = r.filter(i => `${i.owner_name||''} ${i.user_email||''}`.toLowerCase().includes(colFPart.client.toLowerCase()));
    if (colFPart.priceMin) r = r.filter(i => Number(i.price) >= Number(colFPart.priceMin));
    if (colFPart.priceMax) r = r.filter(i => Number(i.price) <= Number(colFPart.priceMax));
    if (colFPart.kmMax)    r = r.filter(i => matchRange(colFPart.kmMax, i.mileage));
    if (colFPart.year)     r = r.filter(i => matchEnum(colFPart.year, i.year));
    if (colFPart.fuel)     r = r.filter(i => matchEnumCI(colFPart.fuel, i.fuel));
    if (colFPart.location) r = r.filter(i => (i.vehicle_location||'').toLowerCase().includes(colFPart.location.toLowerCase()));
    if (colFPart.plate)    r = r.filter(i => (i.plate||'').toLowerCase().includes(colFPart.plate.toLowerCase()));
    return r;
  }, [particularsItems, colFPart]);

  const displayConcItems = useMemo(() => {
    let r = [...items];
    if (colFConc.brand)      r = r.filter(i => `${i.brand||''} ${i.model||''} ${i.title||''}`.toLowerCase().includes(colFConc.brand.toLowerCase()));
    if (colFConc.marca)      r = r.filter(i => (i.brand||'').toLowerCase().includes(colFConc.marca.toLowerCase()));
    if (colFConc.modelo)     r = r.filter(i => (i.model||'').toLowerCase().includes(colFConc.modelo.toLowerCase()));
    if (colFConc.version)    r = r.filter(i => colFConc.version === '__empty__' ? isEmpty(i.version) : (i.version||'').toLowerCase().includes(colFConc.version.toLowerCase()));
    if (colFConc.sellerType) r = r.filter(i => matchEnum(colFConc.sellerType, i.seller_type));
    if (colFConc.seller)     r = r.filter(i => (i.seller||'').toLowerCase().includes(colFConc.seller.toLowerCase()));
    if (colFConc.priceMax)   r = r.filter(i => matchRange(colFConc.priceMax, i.sale_price ?? i.price));
    if (colFConc.kmMax)      r = r.filter(i => matchRange(colFConc.kmMax, i.mileage));
    if (colFConc.year)       r = r.filter(i => matchEnum(colFConc.year, i.year));
    return r;
  }, [items, colFConc]);

  const [editOffer, setEditOffer] = useState<VoOffer | null>(null);
  const [editForm, setEditForm]   = useState<Partial<VoOffer>>({});
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');
  const [primaryMsg, setPrimaryMsg] = useState('');
  const [units, setUnits]           = useState<VoUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [newUnit, setNewUnit]       = useState({ color: '', quantity: '1' });
  const [addingUnit, setAddingUnit] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<Partial<VoOffer>>(EMPTY_FORM);
  const [creating, setCreating]     = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<VoOffer | null>(null);
  // Cancelar una visita le escribe al cliente. No puede pasar de un clic.
  const [cancelarCita, setCancelarCita] = useState<{ offerId: string; booking: any } | null>(null);
  const [motivoCita, setMotivoCita] = useState('');
  const [cancelandoCita, setCancelandoCita] = useState(false);
  const [deleting, setDeleting]         = useState(false);

  const [imageEditOffer, setImageEditOffer] = useState<VoOffer | null>(null);
  const [imageUrls, setImageUrls]           = useState<string[]>(['']);
  const [savingImages, setSavingImages]     = useState(false);

  const [portalEditOffer, setPortalEditOffer] = useState<any | null>(null);
  const [portalEditForm,  setPortalEditForm]  = useState<Record<string,any>>({});
  const [portalDetailLoading, setPortalDetailLoading] = useState(false);
  const portalEditIdRef = useRef<string>('');
  const [savingPortal,    setSavingPortal]    = useState(false);
  const [savePortalError, setSavePortalError] = useState('');
  const [savePortalOk,    setSavePortalOk]    = useState(false);

  const [particEditOffer, setParticEditOffer] = useState<any | null>(null);
  const [particEditForm,  setParticEditForm]  = useState<Record<string, any>>({});
  const [savingPartic,    setSavingPartic]    = useState(false);
  const [savePartError,   setSavePartError]   = useState('');
  const [savePartOk,      setSavePartOk]      = useState(false);

  const [showImport, setShowImport]         = useState(false);
  const [importRows, setImportRows]         = useState<Record<string, string>[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting]           = useState(false);
  const [importResult, setImportResult] = useState<{
    filas_recibidas?: number; offers_created?: number; offers_updated?: number;
    units_added?: number; inserted?: number; errors: number;
    rechazadas?: { numero: number; motivo: string }[];
    repetidas?: { numero: number; motivo: string }[];
    errorDetails?: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<string[]>('/marketplace/brands').then((r) => { if (r.ok) setBrands(r.data); });
  }, []);

  // Opciones de los desplegables de filtro (valores de TODA la BD, no de la página cargada)
  useEffect(() => {
    api.get<typeof portalFilterOpts>('/marketplace/offers/filter-options').then((r) => { if (r.ok && r.data) setPortalFilterOpts(r.data); });
  }, []);

  // Debounce de los filtros de columna de ofertas (evita recargar en cada tecla)
  useEffect(() => {
    const t = setTimeout(() => setColFOffersDeb(colFOffers), 350);
    return () => clearTimeout(t);
  }, [colFOffers]);

  // Opciones + debounce de filtros VO (VO Empresas / Renting / Concesionarios)
  useEffect(() => {
    api.get<typeof voFilterOpts>('/marketplace/vo/filter-options').then((r) => { if (r.ok && r.data) setVoFilterOpts(r.data); });
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setColFDeb(colF), 350);
    return () => clearTimeout(t);
  }, [colF]);
  useEffect(() => { const t = setTimeout(() => setColFRentingDeb(colFRenting), 350); return () => clearTimeout(t); }, [colFRenting]);
  useEffect(() => { const t = setTimeout(() => setColFPartDeb(colFPart), 350); return () => clearTimeout(t); }, [colFPart]);
  useEffect(() => { const t = setTimeout(() => setColFConcDeb(colFConc), 350); return () => clearTimeout(t); }, [colFConc]);
  useEffect(() => {
    api.get<typeof partFilterOpts>('/marketplace/particulares/filter-options').then((r) => { if (r.ok && r.data) setPartFilterOpts(r.data); });
  }, []);

  // Lo ultimo que devolvio cada combinacion de pestana y filtros. Vive lo que
  // dure la pantalla abierta: el problema era la espera al ir y venir entre
  // pestanas, no tener datos de hace horas.
  const memoriaPestanas = useRef<Map<string, { filas?: VoOffer[]; portales?: PortalOffer[]; total: number }>>(new Map());

  const load = useCallback(async (p: number) => {
    // Si ya se miro esta combinacion, se ensena al instante y se refresca
    // por detras. Sin parpadeo de «Cargando…» al volver a una pestana.
    const llave = JSON.stringify([tab, p, q, brand, statusFilter, portalFilter, sellerFilter,
      colFOffersDeb, colFDeb, colFRentingDeb, colFPartDeb, colFConcDeb]);
    const guardado = memoriaPestanas.current.get(llave);
    if (guardado) {
      if (guardado.filas) setItems(guardado.filas);
      if (guardado.portales) setPortalItems(guardado.portales);
      setTotal(guardado.total);
    } else {
      setLoading(true);
    }
    if (tab === 'vo' || tab === 'renting' || tab === 'concesionarios') {
      const params = new URLSearchParams({ page: String(p), limit: '500' });
      if (q)            params.set('q', q);
      if (brand)        params.set('brand', brand);
      if (statusFilter) params.set('is_active', statusFilter);
      if (tab === 'vo')             params.set('available_for_purchase', 'true');
      if (tab === 'renting')        params.set('renting_available', 'true');
      if (tab === 'concesionarios') params.set('seller_type', 'concesionario,importador');
      if (tab === 'vo') {
        const cf = colFDeb;
        if (cf.brand && cf.brand !== '__empty__') params.set('brand', cf.brand);
        if (cf.model)                              params.set('model', cf.model);
        if (cf.version && cf.version !== '__empty__') params.set('version', cf.version);
        if (cf.fuel && cf.fuel !== '__empty__')    params.set('fuel', cf.fuel);
        if (cf.transmission && cf.transmission !== '__empty__') params.set('transmission', cf.transmission);
        if (cf.year && cf.year !== '__empty__')    params.set('year', cf.year);
        if (cf.priceMin)     params.set('price_min', cf.priceMin);
        if (cf.priceMax)     params.set('price_max', cf.priceMax);
        if (cf.salePriceMin) params.set('sale_price_min', cf.salePriceMin);
        if (cf.salePriceMax) params.set('sale_price_max', cf.salePriceMax);
        if (cf.estado === 'active')   params.set('is_active', 'true');
        if (cf.estado === 'inactive') params.set('is_active', 'false');
        if (cf.cc && cf.cc !== '__empty__')        params.set('cc_min', cf.cc);
      }
      if (tab === 'renting') {
        const cf = colFRentingDeb;
        if (cf.brand)  params.set('bm', cf.brand);
        if (cf.model)  params.set('model', cf.model);
        if (cf.status === 'active')   params.set('is_active', 'true');
        if (cf.status === 'inactive') params.set('is_active', 'false');
      }
      if (tab === 'concesionarios') {
        const cf = colFConcDeb;
        if (cf.brand)   params.set('bm', cf.brand);
        if (cf.marca)   params.set('brand_like', cf.marca);
        if (cf.modelo)  params.set('model', cf.modelo);
        if (cf.version && cf.version !== '__empty__') params.set('version', cf.version);
        if (cf.seller)  params.set('seller', cf.seller);
        if (cf.sellerType && cf.sellerType !== '__empty__') params.set('seller_type', cf.sellerType);
        if (cf.priceMax && cf.priceMax !== '__empty__') params.set('price_max', cf.priceMax);
        if (cf.kmMax && cf.kmMax !== '__empty__')       params.set('km_max', cf.kmMax);
        if (cf.year && cf.year !== '__empty__')         params.set('year', cf.year);
      }
      const res = await api.get<VoOffer[]>(`/marketplace/vo?${params}`);
      if (res.ok) {
        setItems(res.data);
        setTotal(res.meta?.total ?? 0);
        memoriaPestanas.current.set(llave, { filas: res.data, total: res.meta?.total ?? 0 });
      }
    } else if (tab === 'particulares') {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (q) params.set('q', q);
      const cf = colFPartDeb;
      if (cf.brand)    params.set('bm', cf.brand);
      if (cf.marca)    params.set('brand', cf.marca);
      if (cf.modelo)   params.set('model', cf.modelo);
      if (cf.version && cf.version !== '__empty__')  params.set('version', cf.version);
      if (cf.client)   params.set('client', cf.client);
      if (cf.fuel && cf.fuel !== '__empty__')         params.set('fuel', cf.fuel);
      if (cf.year && cf.year !== '__empty__')         params.set('year', cf.year);
      if (cf.priceMin)  params.set('price_min', cf.priceMin);
      if (cf.priceMax)  params.set('price_max', cf.priceMax);
      if (cf.kmMax && cf.kmMax !== '__empty__')       params.set('km_max', cf.kmMax);
      if (cf.location)  params.set('location', cf.location);
      if (cf.plate)     params.set('plate', cf.plate);
      const res = await api.get<ParticularsOffer[]>(`/marketplace/particulares?${params}`);
      if (res.ok) { setParticularsItems(res.data); setTotal(res.meta?.total ?? 0); }
    } else if (tab === 'offers' || tab === 'exportacion') {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      // 'offers' = marketplace nacional (ES); 'exportacion' = importación de coches DE.
      params.set('country', tab === 'exportacion' ? 'DE' : 'ES');
      if (q) params.set('q', q);
      const cf = colFOffersDeb;
      const portalVal = cf.portal || portalFilter;
      const sellerVal = cf.sellerType || sellerFilter;
      if (portalVal) params.set('portal', portalVal);
      if (sellerVal) params.set('seller_type', sellerVal);
      if (cf.brand)    params.set('bm', cf.brand);
      if (cf.marca)    params.set('brand', cf.marca);
      if (cf.modelo)   params.set('model', cf.modelo);
      if (cf.version && cf.version !== '__empty__')  params.set('version', cf.version);
      if (cf.year)     params.set('year', cf.year);
      if (cf.fuel)     params.set('fuel', cf.fuel);
      if (cf.priceMax) params.set('price_max', cf.priceMax);
      if (cf.kmMax)    params.set('km_max', cf.kmMax);
      if (cf.color)    params.set('color', cf.color);
      if (cf.body)     params.set('body_type', cf.body);
      if (cf.trans)    params.set('transmission', cf.trans);
      if (cf.cvMin)    params.set('cv_min', cf.cvMin);
      if (cf.doors)    params.set('doors', cf.doors);
      if (cf.seats)    params.set('seats', cf.seats);
      if (cf.ccMin)    params.set('cc_min', cf.ccMin);
      if (cf.co2Max)   params.set('co2_max', cf.co2Max);
      if (cf.etiq)     params.set('etiq', cf.etiq);
      if (cf.trac)     params.set('traction', cf.trac);
      if (cf.consMax)  params.set('cons_max', cf.consMax);
      if (cf.province) params.set('province', cf.province);
      if (cf.city)     params.set('city', cf.city);
      if (cf.estado === 'active')   params.set('active', 'true');
      if (cf.estado === 'inactive') params.set('active', 'false');
      const res = await api.get<PortalOffer[]>(`/marketplace/offers?${params}`);
      if (res.ok) {
        setPortalItems(res.data);
        const m = res.meta as { total?: number; verifiable?: number; verified_today?: number } | undefined;
        setTotal(m?.total ?? 0);
        setVerifiable(m?.verifiable ?? 0);
        setVerifiedToday(m?.verified_today ?? 0);
        memoriaPestanas.current.set(llave, { portales: res.data, total: m?.total ?? 0 });
      }
    }
    setLoading(false);
  }, [tab, q, brand, statusFilter, portalFilter, sellerFilter, colFOffersDeb, colFDeb, colFRentingDeb, colFPartDeb, colFConcDeb]);

  // Lanza el verificador de vivo/muerto (lote grande) en segundo plano vía la API local.
  const verificarAhora = useCallback(async () => {
    if (verifyRunning) return;
    setVerifyRunning(true);
    try {
      // batch alto = LIMIT cubre TODAS las verificables (~395k) en una sola corrida (~5 h).
      const res = await api.post<{ started?: boolean; alreadyRunning?: boolean; batch?: number }>(
        '/marketplace/verify-liveness/run', { batch: 1000000 });
      if (res.ok) {
        if (res.data?.alreadyRunning) window.alert('Ya hay una verificación en curso.');
        else window.alert('Verificación COMPLETA lanzada en segundo plano (todas las ofertas). Tarda ~5 h; el contador "verificadas hoy" irá subiendo hasta ~100% — refresca la página cada rato. No hace falta volver a pulsar.');
      } else {
        window.alert('No se pudo lanzar la verificación.');
      }
    } finally {
      setVerifyRunning(false);
    }
  }, [verifyRunning]);

  // Genera el informe de portales (en vivo) como PDF y lo descarga directamente.
  const descargarInforme = useCallback(async () => {
    setReportLoading(true);
    try {
      const res = await api.get<PortalStats>('/marketplace/portal-stats');
      if (!res.ok) { window.alert('No se pudo generar el informe. Inténtalo de nuevo.'); return; }
      const data = res.data;
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const fmt = (n: number) => Number(n || 0).toLocaleString('es-ES');
      const M = 40;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9); doc.setTextColor(30, 91, 123);
      doc.text('CARSWISE · INTELIGENCIA DE MERCADO', M, 46);
      doc.setFontSize(21); doc.setTextColor(20, 27, 35);
      doc.text('Informe de portales', M, 72);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10); doc.setTextColor(90, 102, 115);
      const dt = new Date(data.generatedAt);
      const fecha = dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) +
        ' · ' + dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      doc.text(`${fmt(data.marketTotal + data.voTotal)} vehículos en total · generado ${fecha}`, M, 90);

      const drawTable = (title: string, rows: PortalStat[], total: number, startY: number): number => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 27, 35);
        doc.text(title, M, startY);
        const body = rows.map((r) => {
          const disp = PORTAL_DISPONIBLES[r.portal];
          return [portalLabel(r.portal), disp ? fmt(disp) : '—', fmt(r.total), fmt(r.active), fmt(r.published_cw ?? 0), fmt(r.updated_last_day)];
        });
        const act = rows.reduce((a, r) => a + r.active, 0);
        const pub = rows.reduce((a, r) => a + (r.published_cw || 0), 0);
        const upd = rows.reduce((a, r) => a + (r.updated_last_day || 0), 0);
        autoTable(doc, {
          startY: startY + 10,
          margin: { left: M, right: M },
          head: [['Portal', 'En la web', 'Obtenidos', 'Activos', 'Publicados PopCar', 'Últ. 24h']],
          body,
          foot: [['Total', '', fmt(total), fmt(act), fmt(pub), fmt(upd)]],
          theme: 'grid',
          styles: { fontSize: 9.5, cellPadding: 5, lineColor: [227, 232, 237], lineWidth: 0.5, textColor: [20, 27, 35] },
          headStyles: { fillColor: [251, 252, 253], textColor: [138, 149, 161], fontStyle: 'bold' },
          footStyles: { fillColor: [251, 252, 253], textColor: [20, 27, 35], fontStyle: 'bold' },
          columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
          didParseCell: (d) => {
            // "Publicados PopCar": verde si >0 (lo tenemos en popcar.tech)
            if (d.section === 'body' && d.column.index === 4) {
              const n = parseInt(String(d.cell.raw).replace(/\D/g, ''), 10) || 0;
              if (n > 0) { d.cell.styles.textColor = [30, 91, 123]; d.cell.styles.fontStyle = 'bold'; }
            }
            // "Últ. 24h": verde si hubo actualización, rojo si 0 (portal sin refrescar)
            if (d.section === 'body' && d.column.index === 5) {
              const n = parseInt(String(d.cell.raw).replace(/\D/g, ''), 10) || 0;
              d.cell.styles.textColor = n > 0 ? [46, 125, 91] : [178, 58, 58];
              d.cell.styles.fontStyle = 'bold';
            }
          },
        });
        return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      };

      let y = drawTable('Portales de mercado', data.market, data.marketTotal, 118);
      if (data.import && data.import.length) {
        y = drawTable('Importación (DE, publicada en PopCar)', data.import, data.importTotal ?? 0, y + 34);
      }
      drawTable('Concesionarios VO', data.vo, data.voTotal, y + 34);

      doc.save('PopCar-Informe-Portales.pdf');
    } catch {
      window.alert('No se pudo generar el informe. Inténtalo de nuevo.');
    } finally {
      setReportLoading(false);
    }
  }, []);

  // Tras cambiar algo, lo guardado es el estado anterior: se olvida y se pide.
  const recargar = useCallback((p: number) => { memoriaPestanas.current.clear(); load(p); }, [load]);

  useEffect(() => { setPage(1); load(1); setSelectedIds(new Set()); }, [tab, q, brand, statusFilter, portalFilter, sellerFilter, load]);
  useEffect(() => { load(page); }, [page, load]);

  async function bulkAction(action: 'activate' | 'deactivate') {
    if (selectedIds.size === 0) return;
    setBulking(true);
    setBulkAviso(null);
    const cuantos = selectedIds.size;
    const r = await api.post<{ updated?: number }>('/marketplace/vo/bulk', { action, ids: [...selectedIds] });
    if (r.ok) {
      const n = (r as { updated?: number }).updated ?? cuantos;
      setSelectedIds(new Set());
      setBulkAviso(`${n} ${n === 1 ? 'vehículo' : 'vehículos'} ${action === 'activate' ? 'activados' : 'desactivados'}`);
      recargar(page);
    } else {
      // Si falla, la selección se queda puesta: es lo que permite reintentar.
      setBulkAviso('No se ha podido cambiar el estado. Inténtalo de nuevo.');
    }
    setBulking(false);
  }

  async function openEdit(offer: VoOffer) {
    // Sync image_url with image_urls on load: use image_urls[0] as authoritative primary,
    // or if image_urls is empty but image_url exists, migrate it into the array so it's visible.
    const urls = Array.isArray(offer.image_urls) && offer.image_urls.length > 0
      ? offer.image_urls
      : (offer.image_url ? [offer.image_url] : []);
    const syncedImageUrl = urls[0] ?? '';
    setEditOffer(offer);
    setEditForm({ ...offer, image_urls: urls, image_url: syncedImageUrl });
    setPrimaryMsg('');
    setUnits([]);
    setNewUnit({ color: '', quantity: '1' });
    setLoadingUnits(true);
    const res = await api.get<VoUnit[]>(`/marketplace/vo/${offer.id}/units`);
    if (res.ok) setUnits(res.data);
    setLoadingUnits(false);
  }

  async function addUnit() {
    if (!editOffer || !newUnit.color) return;
    setAddingUnit(true);
    const qty = Math.max(1, Math.min(50, Number(newUnit.quantity) || 1));
    for (let i = 0; i < qty; i++) {
      const res = await api.post<VoUnit>(`/marketplace/vo/${editOffer.id}/units`, {
        color: newUnit.color, mileage: 0,
      });
      if (res.ok) setUnits((u) => [...u, res.data]);
    }
    setNewUnit({ color: '', quantity: '1' });
    setAddingUnit(false);
  }

  async function changeUnitStatus(unitId: string, status: UnitStatus) {
    const res = await api.patch<VoUnit>(`/marketplace/vo/units/${unitId}`, { status });
    if (res.ok) setUnits((u) => u.map((x) => x.id === unitId ? res.data : x));
  }

  async function deleteUnit(unitId: string) {
    const res = await api.delete(`/marketplace/vo/units/${unitId}`);
    if (res.ok) setUnits((u) => u.filter((x) => x.id !== unitId));
  }

  async function saveEdit() {
    if (!editOffer) return;
    setSaving(true);
    setSaveError('');
    const ALLOWED = new Set(['title','brand','model','version','transmission','year','price','sale_price','mileage','fuel','power',
      'displacement','color','location','internal_location','seller','description','image_url','source_url',
      'warranty_months','has_guarantee_seal','portal_score','is_active','seller_type',
      'available_for_purchase','renting_available','renting_km_year',
      'renting_12m','renting_24m','renting_36m','renting_48m','renting_60m',
      'renting_prices_json','image_urls','carswise_fee']);
    const NUMERIC = new Set(['year','price','sale_price','mileage','displacement','warranty_months','portal_score',
      'renting_km_year','renting_12m','renting_24m','renting_36m','renting_48m','renting_60m','carswise_fee']);
    const payload = Object.fromEntries(
      Object.entries(editForm)
        .filter(([k]) => ALLOWED.has(k))
        .map(([k, v]) => {
          if (NUMERIC.has(k)) {
            // null/empty numeric = send null (clears the field); NaN values are dropped
            if (v === null || v === undefined || v === '') return [k, null];
            const n = Number(v);
            return [k, Number.isNaN(n) ? undefined : n];
          }
          return [k, v ?? null]; // undefined → null for string/bool fields
        })
        .filter(([, v]) => v !== undefined)
    );
    const res = await api.patch<{ detail?: unknown }>(`/marketplace/vo/${editOffer.id}`, payload);
    if (res.ok) { setEditOffer(null); recargar(page); }
    else setSaveError(JSON.stringify((res as { detail?: unknown }).detail ?? res, null, 2));
    setSaving(false);
  }

  // Construye el formulario con TODOS los campos editables de la oferta.
  function portalFormFromOffer(o: any): Record<string, any> {
    return {
      title:               o.title ?? '',
      brand:               o.brand ?? '',
      model:               o.model ?? '',
      version:             o.version ?? '',
      year:                o.year ?? '',
      price:               o.price ?? '',
      mileage:             o.mileage ?? '',
      fuel:                o.fuel ?? '',
      color:               o.color ?? '',
      transmission:        o.transmission ?? '',
      power_cv:            o.power_cv ?? '',
      power_kw:            o.power_kw ?? '',
      doors:               o.doors ?? '',
      seats:               o.seats ?? '',
      body_type:           o.body_type ?? '',
      environmental_label: o.environmental_label ?? '',
      traction:            o.traction ?? '',
      displacement:        o.displacement ?? '',
      co2:                 o.co2 ?? '',
      consumption:         o.consumption ?? '',
      warranty_months:     o.warranty_months ?? '',
      next_itv:            o.next_itv ?? '',
      monthly_price:       o.monthly_price ?? '',
      finance_price:       o.finance_price ?? '',
      seller_type:         o.seller_type ?? '',
      dealer_name:         o.dealer_name ?? '',
      location:            o.location ?? '',
      province:            o.province ?? '',
      city:                o.city ?? '',
      listing_type:        o.listing_type ?? '',
      portal:              o.portal ?? '',
      url:                 o.url ?? '',
      image_url:           o.image_url ?? '',
      image_urls:          Array.isArray(o.images) ? o.images.filter(Boolean) : (o.image_url ? [o.image_url] : []),
      is_active:           o.is_active ?? null,
    };
  }

  async function openPortalEdit(item: any) {
    portalEditIdRef.current = item.id;
    setPortalEditOffer(item);
    setPortalEditForm(portalFormFromOffer(item)); // instantáneo con los datos del listado
    setSavePortalError('');
    setSavePortalOk(false);
    // Trae la ficha completa (etiqueta, cilindrada, consumo, ITV, precios, provincia…)
    setPortalDetailLoading(true);
    try {
      const res = await api.get<any>(`/marketplace/offers/${encodeURIComponent(item.id)}`);
      if (res.ok && res.data && portalEditIdRef.current === item.id) {
        setPortalEditOffer((prev: any) => (prev && prev.id === item.id ? { ...prev, ...res.data } : prev));
        setPortalEditForm(portalFormFromOffer(res.data));
      }
    } catch { /* si falla la ficha, se queda con los datos del listado */ }
    finally { setPortalDetailLoading(false); }
  }

  async function savePortalEdit() {
    if (!portalEditOffer) return;
    setSavingPortal(true);
    setSavePortalError('');
    setSavePortalOk(false);
    // Coerción por tipo de columna → nunca envía texto a una columna numérica (no da error)
    const INT = new Set(['year','mileage','power_cv','power_kw','doors','seats','warranty_months']);
    const DEC = new Set(['price','monthly_price','finance_price','consumption']);
    const gallery = Array.isArray(portalEditForm.image_urls) ? portalEditForm.image_urls.filter((u: string) => u && String(u).trim()) : [];
    const values: Record<string, unknown> = Object.fromEntries(
      Object.entries(portalEditForm).filter(([k]) => k !== 'image_urls').map(([k, v]) => {
        if (k === 'is_active') {
          if (typeof v === 'boolean') return [k, v];
          if (v === 'true')  return [k, true];
          if (v === 'false') return [k, false];
          return [k, null];
        }
        if (v === '' || v === null || v === undefined) return [k, null];
        if (INT.has(k)) { const n = Math.trunc(Number(String(v).replace(',', '.'))); return [k, Number.isFinite(n) ? n : null]; }
        if (DEC.has(k)) { const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.')); return [k, Number.isFinite(n) ? n : null]; }
        return [k, v];
      })
    );
    // Galería: image_urls (UI) → images (JSON en BD, columna text) + image_url (1ª foto)
    values.images = JSON.stringify(gallery);
    values.image_url = gallery[0] ?? '';
    const res = await api.patch<{ ok: boolean; detail?: unknown }>(
      `/marketplace/offers/${encodeURIComponent(portalEditOffer.id)}`,
      values
    );
    if (res.ok) {
      setSavePortalOk(true);
      setPortalItems((prev: any[]) => prev.map((i: any) => i.id === portalEditOffer.id ? { ...i, ...values } : i));
      setTimeout(() => setPortalEditOffer(null), 800);
    } else {
      setSavePortalError(JSON.stringify((res as any).detail ?? res, null, 2));
    }
    setSavingPortal(false);
  }

  // Importación: publicar/despublicar un coche DE al cliente (bloquea la auto-selección: import_locked)
  async function toggleImportPublish(item: any) {
    const next = !item.import_published;
    const values = { import_published: next, import_locked: true };
    setPortalItems((prev: any[]) => prev.map((i: any) => i.id === item.id ? { ...i, ...values } : i));
    const res = await api.patch(`/marketplace/offers/${encodeURIComponent(item.id)}`, values);
    if (!res.ok) { // revertir si falla
      setPortalItems((prev: any[]) => prev.map((i: any) => i.id === item.id ? { ...i, import_published: item.import_published, import_locked: item.import_locked } : i));
    }
  }

  function openPartEdit(item: any) {
    setParticEditOffer(item);
    setParticEditForm({
      title: item.title ?? '', brand: item.brand ?? '', model: item.model ?? '', version: item.version ?? '',
      year: item.year ?? '', mileage: item.mileage ?? '', fuel: item.fuel ?? '', color: item.color ?? '',
      price: item.price ?? '', cv: item.cv ?? '', transmission_type: item.transmission_type ?? '',
      vehicle_location: item.vehicle_location ?? '', plate: item.plate ?? '', notes: item.notes ?? '',
    });
    setSavePartError(''); setSavePartOk(false);
  }

  async function savePartEdit() {
    if (!particEditOffer) return;
    setSavingPartic(true); setSavePartError(''); setSavePartOk(false);
    const values = Object.fromEntries(Object.entries(particEditForm).map(([k, v]) => [k, v === '' ? null : v]));
    const res = await api.patch<{ ok: boolean; detail?: unknown }>(
      `/marketplace/particulares/${encodeURIComponent(particEditOffer.id)}`, values
    );
    if (res.ok) {
      setSavePartOk(true);
      setParticularsItems((prev: any[]) => prev.map((i: any) => i.id === particEditOffer.id ? { ...i, ...values } : i));
      setTimeout(() => setParticEditOffer(null), 800);
    } else {
      setSavePartError(JSON.stringify((res as any).detail ?? res, null, 2));
    }
    setSavingPartic(false);
  }

  async function toggleActive(offer: VoOffer) {
    await api.patch(`/marketplace/vo/${offer.id}`, { is_active: !offer.is_active });
    recargar(page);
  }

  async function toggleParticular(item: ParticularsOffer) {
    await api.patch(`/marketplace/particulares/${item.id}/state`, { state: 'owned' });
    recargar(page);
  }

  async function saveCreate() {
    setCreating(true);
    const res = await api.post('/marketplace/vo', createForm);
    if (res.ok) { setShowCreate(false); setCreateForm(EMPTY_FORM); setPage(1); recargar(1); }
    setCreating(false);
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await api.delete(`/marketplace/vo/${deleteTarget.id}`);
    if (res.ok) { setDeleteTarget(null); recargar(page); }
    setDeleting(false);
  }

  async function saveImages() {
    if (!imageEditOffer) return;
    setSavingImages(true);
    const cleanUrls = imageUrls.filter(u => u.trim());
    const res = await api.patch(`/marketplace/vo/${imageEditOffer.id}`, { image_urls: cleanUrls });
    if (res.ok) { setImageEditOffer(null); recargar(page); }
    setSavingImages(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => setImportRows(parseXlsx(ev.target?.result as ArrayBuffer));
    reader.readAsArrayBuffer(file);
  }

  async function doImport() {
    if (!importRows.length) return;
    setImporting(true);
    const res = await api.post<NonNullable<typeof importResult>>(
      '/marketplace/vo/bulk-with-units', { rows: importRows }
    );
    if (res.ok) {
      setImportResult(res.data);
      setImportRows([]); setImportFileName('');
      if (fileRef.current) fileRef.current.value = '';
      setPage(1); recargar(1);
    }
    setImporting(false);
  }

  async function doExport() {
    const params = new URLSearchParams({ export: '1', page: '1', available_for_purchase: 'true' });
    if (q)            params.set('q', q);
    if (brand)        params.set('brand', brand);
    if (statusFilter) params.set('is_active', statusFilter);
    const cf = colF;
    if (cf.brand && cf.brand !== '__empty__') params.set('brand', cf.brand);
    if (cf.model)        params.set('model', cf.model);
    if (cf.version && cf.version !== '__empty__') params.set('version', cf.version);
    if (cf.fuel && cf.fuel !== '__empty__') params.set('fuel', cf.fuel);
    if (cf.transmission && cf.transmission !== '__empty__') params.set('transmission', cf.transmission);
    if (cf.year && cf.year !== '__empty__') params.set('year', cf.year);
    if (cf.priceMin)     params.set('price_min', cf.priceMin);
    if (cf.priceMax)     params.set('price_max', cf.priceMax);
    if (cf.salePriceMin) params.set('sale_price_min', cf.salePriceMin);
    if (cf.salePriceMax) params.set('sale_price_max', cf.salePriceMax);
    if (cf.estado === 'active')   params.set('is_active', 'true');
    if (cf.estado === 'inactive') params.set('is_active', 'false');
    if (cf.cc && cf.cc !== '__empty__') params.set('cc_min', cf.cc);
    const res = await api.get<VoOffer[]>(`/marketplace/vo?${params}`);
    if (res.ok) exportXlsx(res.data);
  }

  async function doExportRenting() {
    const params = new URLSearchParams({ export: '1', page: '1', renting_available: 'true' });
    if (q) params.set('q', q);
    if (brand) params.set('brand', brand);
    if (statusFilter) params.set('is_active', statusFilter);
    const cf = colFRenting;
    if (cf.brand) params.set('bm', cf.brand);
    if (cf.model) params.set('model', cf.model);
    if (cf.status === 'active')   params.set('is_active', 'true');
    if (cf.status === 'inactive') params.set('is_active', 'false');
    const res = await api.get<VoOffer[]>(`/marketplace/vo?${params}`);
    if (res.ok) exportXlsx(res.data);
  }

  async function doExportConcesionarios() {
    const params = new URLSearchParams({ export: '1', page: '1', seller_type: 'concesionario,importador' });
    if (q) params.set('q', q);
    if (brand) params.set('brand', brand);
    if (statusFilter) params.set('is_active', statusFilter);
    const cf = colFConc;
    if (cf.brand)   params.set('bm', cf.brand);
    if (cf.marca)   params.set('brand_like', cf.marca);
    if (cf.modelo)  params.set('model', cf.modelo);
    if (cf.version && cf.version !== '__empty__') params.set('version', cf.version);
    if (cf.seller)  params.set('seller', cf.seller);
    if (cf.sellerType && cf.sellerType !== '__empty__') params.set('seller_type', cf.sellerType);
    if (cf.priceMax && cf.priceMax !== '__empty__') params.set('price_max', cf.priceMax);
    if (cf.kmMax && cf.kmMax !== '__empty__')       params.set('km_max', cf.kmMax);
    if (cf.year && cf.year !== '__empty__')         params.set('year', cf.year);
    const res = await api.get<VoOffer[]>(`/marketplace/vo?${params}`);
    if (res.ok) exportXlsx(res.data);
  }

  async function doExportParticulares() {
    const params = new URLSearchParams({ export: '1', page: '1' });
    if (q) params.set('q', q);
    const cf = colFPart;
    if (cf.brand)   params.set('bm', cf.brand);
    if (cf.marca)   params.set('brand', cf.marca);
    if (cf.modelo)  params.set('model', cf.modelo);
    if (cf.version && cf.version !== '__empty__') params.set('version', cf.version);
    if (cf.client)  params.set('client', cf.client);
    if (cf.fuel && cf.fuel !== '__empty__')       params.set('fuel', cf.fuel);
    if (cf.year && cf.year !== '__empty__')       params.set('year', cf.year);
    if (cf.priceMin) params.set('price_min', cf.priceMin);
    if (cf.priceMax) params.set('price_max', cf.priceMax);
    if (cf.kmMax && cf.kmMax !== '__empty__')     params.set('km_max', cf.kmMax);
    if (cf.location) params.set('location', cf.location);
    if (cf.plate)    params.set('plate', cf.plate);
    const res = await api.get<ParticularsOffer[]>(`/marketplace/particulares?${params}`);
    if (res.ok) exportParticularsXlsx(res.data);
  }

  async function doExportOffers(country: 'ES' | 'DE') {
    const params = new URLSearchParams({ export: '1', page: '1', country });
    if (q) params.set('q', q);
    const cf = colFOffers;
    const portalVal = cf.portal || portalFilter;
    const sellerVal = cf.sellerType || sellerFilter;
    if (portalVal) params.set('portal', portalVal);
    if (sellerVal) params.set('seller_type', sellerVal);
    if (cf.brand)    params.set('bm', cf.brand);
    if (cf.marca)    params.set('brand', cf.marca);
    if (cf.modelo)   params.set('model', cf.modelo);
    if (cf.version && cf.version !== '__empty__')  params.set('version', cf.version);
    if (cf.year)     params.set('year', cf.year);
    if (cf.fuel)     params.set('fuel', cf.fuel);
    if (cf.priceMax) params.set('price_max', cf.priceMax);
    if (cf.kmMax)    params.set('km_max', cf.kmMax);
    if (cf.color)    params.set('color', cf.color);
    if (cf.body)     params.set('body_type', cf.body);
    if (cf.trans)    params.set('transmission', cf.trans);
    if (cf.cvMin)    params.set('cv_min', cf.cvMin);
    if (cf.doors)    params.set('doors', cf.doors);
    if (cf.seats)    params.set('seats', cf.seats);
    if (cf.ccMin)    params.set('cc_min', cf.ccMin);
    if (cf.co2Max)   params.set('co2_max', cf.co2Max);
    if (cf.etiq)     params.set('etiq', cf.etiq);
    if (cf.trac)     params.set('traction', cf.trac);
    if (cf.consMax)  params.set('cons_max', cf.consMax);
    if (cf.province) params.set('province', cf.province);
    if (cf.city)     params.set('city', cf.city);
    if (cf.estado === 'active')   params.set('active', 'true');
    if (cf.estado === 'inactive') params.set('active', 'false');
    const res = await api.get<PortalOffer[]>(`/marketplace/offers?${params}`);
    if (res.ok) {
      const sheetName = country === 'DE' ? 'Importación' : 'Portales';
      const filePrefix = country === 'DE' ? 'importacion' : 'portales';
      exportPortalXlsx(res.data, sheetName, filePrefix);
    }
  }

  return (
    <div>
      <PageHeader
        title="Marketplace"
        subtitle={
          tab === 'renting'
            ? `${rentingItems.length.toLocaleString('es-ES')} ofertas de renting`
            : `${total.toLocaleString('es-ES')} vehículos`
        }
        actions={tab === 'vo' ? (
          <div className="flex gap-2 flex-wrap">
            <button onClick={downloadTemplate}
              className="px-3 py-2 text-xs font-medium text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
              Plantilla Excel
            </button>
            <button onClick={() => { setShowImport(true); setImportResult(null); setImportRows([]); setImportFileName(''); }}
              className="px-3 py-2 text-xs font-medium text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
              Importar Excel
            </button>
            <button onClick={doExport}
              className="px-3 py-2 text-xs font-medium text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
              Exportar Excel
            </button>
            <button onClick={() => { setShowCreate(true); setCreateForm(EMPTY_FORM); }}
              className="px-4 py-2 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700">
              + Añadir vehículo
            </button>
          </div>
        ) : tab === 'renting' ? (
          <div className="flex gap-2 flex-wrap">
            <button onClick={doExportRenting}
              className="px-3 py-2 text-xs font-medium text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
              Exportar Excel
            </button>
            <button onClick={() => { setShowCreate(true); setCreateForm(EMPTY_RENTING_FORM); }}
              className="px-4 py-2 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700">
              + Añadir oferta renting
            </button>
          </div>
        ) : tab === 'concesionarios' ? (
          <button onClick={doExportConcesionarios}
            className="px-3 py-2 text-xs font-medium text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
            Exportar Excel
          </button>
        ) : tab === 'particulares' ? (
          <button onClick={doExportParticulares}
            className="px-3 py-2 text-xs font-medium text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
            Exportar Excel
          </button>
        ) : tab === 'offers' ? (
          <div className="flex items-center gap-3">
            {verifiable > 0 && (
              <span className="text-xs text-brand-400 whitespace-nowrap">
                Verificadas hoy:{' '}
                <b className={
                  verifiedToday / verifiable >= 0.9 ? 'text-emerald-600'
                  : verifiedToday / verifiable >= 0.4 ? 'text-amber-600' : 'text-brand-500'
                }>{verifiedToday.toLocaleString('es-ES')}</b>
                {' / '}{verifiable.toLocaleString('es-ES')} ({Math.round((verifiedToday / verifiable) * 100)}%)
              </span>
            )}
            <button onClick={() => doExportOffers('ES')}
              className="px-3 py-2 text-xs font-medium text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
              Exportar Excel
            </button>
            <button onClick={verificarAhora} disabled={verifyRunning}
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60">
              {verifyRunning ? 'Lanzando…' : 'Verificar todas'}
            </button>
            <button onClick={descargarInforme} disabled={reportLoading}
              className="px-4 py-2 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60">
              {reportLoading ? 'Generando…' : 'Descargar informe PDF'}
            </button>
          </div>
        ) : tab === 'exportacion' ? (
          <button onClick={() => doExportOffers('DE')}
            className="px-3 py-2 text-xs font-medium text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
            Exportar Excel
          </button>
        ) : undefined}
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-brand-100 rounded-lg p-1 w-fit mb-5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t.key ? 'bg-white shadow-sm text-brand-600' : 'text-brand-400 hover:text-brand-500'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar marca, modelo…" className="w-72" />
        {(tab === 'vo' || tab === 'renting') && (
          <>
            <select value={brand} onChange={(e) => setBrand(e.target.value)}
              className="px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-acento">
              <option value="">Todas las marcas</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-acento">
              {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </>
        )}
        {tab === 'offers' && (
          <>
            <select value={portalFilter} onChange={(e) => setPortalFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-acento">
              <option value="">Todos los portales</option>
              <option value="autoscout24">AutoScout24</option>
              <option value="autocasion">Autocasión</option>
              <option value="cochescom">Coches.com</option>
              <option value="cochesnet">Coches.net</option>
              <option value="flexicar">Flexicar</option>
              <option value="autohero">Autohero</option>
              <option value="milanuncios">Milanuncios</option>
              <option value="wallapop">Wallapop</option>
            </select>
            <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-acento">
              <option value="">Particulares y profesionales</option>
              <option value="particular">Solo particulares</option>
              <option value="profesional">Solo profesionales</option>
            </select>
          </>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-brand-300 text-sm">Cargando…</div>
        ) : tab === 'vo' ? (
          items.length === 0 ? (
            <div className="text-center py-12 text-brand-300 text-sm">Sin resultados</div>
          ) : (
            <>
              {/* Active column filters summary */}
              {Object.values(colF).some(Boolean) && (
                <div className="px-4 py-2 border-b border-brand-100 flex items-center gap-2 flex-wrap bg-acento-tenue">
                  <span className="text-xs text-acento-texto font-medium">{displayItems.length} de {items.length} resultados</span>
                  <button onClick={() => setColF({ brand:'', model:'', version:'', fuel:'', transmission:'', modality:'', year:'', priceMin:'', priceMax:'', salePriceMin:'', salePriceMax:'', estado:'', color:'', cc:'', seller:'', units:'', noImage:'' })}
                    className="text-xs text-acento-texto hover:text-brand-600 underline">Limpiar filtros de columna</button>
                </div>
              )}
              <div className="overflow-auto max-h-[72vh]">
              <table className="erp-table w-full">
                <thead>
                  {/* ── Row 1: sortable labels ── */}
                  <tr>
                    <th className="w-10 px-3">
                      <input type="checkbox"
                        checked={displayItems.length > 0 && displayItems.every(i => selectedIds.has(i.id))}
                        onChange={(e) => setSelectedIds(e.target.checked ? new Set(displayItems.map(i => i.id)) : new Set())}
                        className="rounded"
                      />
                    </th>
                    {([
                      { key: 'title',   label: 'Vehículo'    },
                      { key: 'brand',   label: 'Marca'       },
                      { key: 'model',   label: 'Modelo'      },
                      { key: 'version', label: 'Versión'     },
                      { key: 'price',   label: 'P. Compra'   },
                      { key: 'sale_price', label: 'P. Venta' },
                      { key: 'mileage', label: 'Km'          },
                      { key: 'year',    label: 'Año'         },
                      { key: 'fuel',         label: 'Combustible'  },
                      { key: 'transmission', label: 'Cambio'       },
                      { key: 'color',        label: 'Color'        },
                      { key: 'displacement', label: 'Cilindrada'   },
                      { key: 'modalidad',    label: 'Modalidad'    },
                      { key: 'units_available', label: 'Unidades' },
                      { key: 'seller',  label: 'Vendedor'    },
                      { key: 'is_active', label: 'Estado'    },
                    ] as const).map(({ key, label }) => (
                      <th key={key} onClick={() => toggleSort(key)}
                        className="cursor-pointer select-none whitespace-nowrap group">
                        <span className="flex items-center gap-1">
                          {label}
                          <span className={`text-xs transition-colors ${sortCol === key ? 'text-acento-texto' : 'text-brand-300 group-hover:text-brand-300'}`}>
                            {sortCol === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>
                    ))}
                    <th></th>
                  </tr>
                  {/* ── Row 2: column filters ── */}
                  <tr className="bg-brand-50 border-b border-brand-100">
                    {/* Checkbox (alineación) */}
                    <td className="w-10 px-3"></td>
                    {/* Vehículo */}
                    <td className="px-3 py-1.5">
                      <label className="flex items-center gap-1 text-xs text-brand-400 whitespace-nowrap cursor-pointer">
                        <input type="checkbox" checked={!!colF.noImage}
                          onChange={e => setCol('noImage', e.target.checked ? 'yes' : '')} />
                        Sin imagen
                      </label>
                    </td>
                    {/* Marca */}
                    <td className="px-3 py-1.5">
                      <select value={colF.brand} onChange={e => setCol('brand', e.target.value)}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option>
                        <option value="__empty__">(Vacío)</option>
                        {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </td>
                    {/* Modelo */}
                    <td className="px-3 py-1.5">
                      <input value={colF.model} onChange={e => setCol('model', e.target.value)}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1"
                        placeholder="Modelo…" />
                    </td>
                    {/* Versión */}
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 items-center">
                        <input value={colF.version === '__empty__' ? '' : colF.version} onChange={e => setCol('version', e.target.value)}
                          disabled={colF.version === '__empty__'}
                          className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 disabled:bg-slate-100 disabled:text-slate-400"
                          placeholder="Versión…" />
                        <button onClick={() => setCol('version', colF.version === '__empty__' ? '' : '__empty__')}
                          title="Filtrar sin versión"
                          className={`shrink-0 text-xs px-1.5 py-1 rounded border ${colF.version === '__empty__' ? 'bg-amber-100 border-amber-400 text-amber-700' : 'border-brand-200 text-slate-400 hover:border-amber-300'}`}>∅</button>
                      </div>
                    </td>
                    {/* P. Compra (rango mín–máx) */}
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 items-center">
                        <input type="number" value={colF.priceMin} onChange={e => setCol('priceMin', e.target.value)}
                          className="w-16 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Mín" />
                        <span className="text-brand-300 text-xs">–</span>
                        <input type="number" value={colF.priceMax} onChange={e => setCol('priceMax', e.target.value)}
                          className="w-16 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Máx" />
                      </div>
                    </td>
                    {/* P. Venta (rango mín–máx) */}
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 items-center">
                        <input type="number" value={colF.salePriceMin} onChange={e => setCol('salePriceMin', e.target.value)}
                          className="w-16 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Mín" />
                        <span className="text-brand-300 text-xs">–</span>
                        <input type="number" value={colF.salePriceMax} onChange={e => setCol('salePriceMax', e.target.value)}
                          className="w-16 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Máx" />
                      </div>
                    </td>
                    {/* Km */}
                    <td className="px-3 py-1.5"></td>
                    {/* Año */}
                    <td className="px-3 py-1.5">
                      <select value={colF.year} onChange={e => setCol('year', e.target.value)}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </td>
                    {/* Combustible */}
                    <td className="px-3 py-1.5">
                      <select value={colF.fuel} onChange={e => setCol('fuel', e.target.value)}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {fuelOptions.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                    {/* Cambio */}
                    <td className="px-3 py-1.5">
                      <select value={colF.transmission} onChange={e => setCol('transmission', e.target.value)}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        <option value="manual">Manual</option>
                        <option value="auto">Automático</option>
                      </select>
                    </td>
                    {/* Color */}
                    <td className="px-3 py-1.5">
                      <select value={colF.color} onChange={e => setCol('color', e.target.value)}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {colorOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    {/* Cilindrada */}
                    <td className="px-3 py-1.5">
                      <select value={colF.cc} onChange={e => setCol('cc', e.target.value)}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option>
                        <option value="__empty__">(Vacío)</option>
                        {[900,1200,1600,2000,3000].map(v => <option key={v} value={v}>≥ {v} cc</option>)}
                      </select>
                    </td>
                    {/* Modalidad */}
                    <td className="px-3 py-1.5">
                      <select value={colF.modality} onChange={e => setCol('modality', e.target.value)}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="compra">Solo compra</option>
                        <option value="renting">Solo renting</option>
                        <option value="both">Compra + Renting</option>
                      </select>
                    </td>
                    {/* Unidades */}
                    <td className="px-3 py-1.5">
                      <label className="flex items-center gap-1 text-xs text-brand-400 whitespace-nowrap cursor-pointer">
                        <input type="checkbox" checked={colF.units === 'stock'}
                          onChange={e => setCol('units', e.target.checked ? 'stock' : '')} />
                        Stock
                      </label>
                    </td>
                    {/* Vendedor */}
                    <td className="px-3 py-1.5">
                      <select value={colF.seller} onChange={e => setCol('seller', e.target.value)}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {sellerOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    {/* Estado */}
                    <td className="px-3 py-1.5">
                      <select value={colF.estado} onChange={e => setCol('estado', e.target.value)}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="active">Activa</option>
                        <option value="inactive">Inactiva</option>
                      </select>
                    </td>
                    <td></td>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item) => (
                    <Fragment key={item.id}>
                    <tr onClick={() => openEdit(item)}
                      className={`cursor-pointer hover:bg-acento-tenue transition-colors ${selectedIds.has(item.id) ? 'bg-acento-tenue' : ''}`}>
                      <td className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => setSelectedIds((prev) => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(item.id) : next.delete(item.id);
                            return next;
                          })}
                          className="rounded"
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          {(item.image_url || item.image_urls?.[0]) ? (
                            <img src={item.image_url || item.image_urls?.[0]} alt="" title={item.title} referrerPolicy="no-referrer" className="w-14 h-10 object-cover rounded-md bg-brand-100 shrink-0" />
                          ) : (
                            <div className="w-14 h-10 bg-brand-100 rounded-md shrink-0 flex items-center justify-center text-brand-300 text-lg"></div>
                          )}
                          <div>
                            {/* El titulo no se pinta: es marca + modelo + version,
                                que ya tienen columna propia y filtro. Repetirlo
                                partia cada fila en tres lineas. Va en el title de
                                la foto, para poder leerlo entero al pasar por encima. */}
                            <p className="text-[13px] text-brand-500">{item.location || '–'}</p>
                            {item.internal_location && (
                              <p className="text-[10px] font-mono text-brand-300 leading-tight">{item.internal_location}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-sm font-medium text-brand-500 whitespace-nowrap">{item.brand}</td>
                      <td className="text-sm text-brand-400">{item.model}</td>
                      <td className="text-sm text-brand-300">{item.version || '–'}</td>
                      <td className="font-semibold text-brand-600 text-sm">{fmtPrice(item.price)}</td>
                      <td className="font-semibold text-emerald-700 text-sm">{item.sale_price != null ? fmtPrice(item.sale_price) : '—'}</td>
                      <td className="text-sm text-brand-400">{fmtKm(item.mileage)}</td>
                      <td className="text-sm text-brand-400">{item.year}</td>
                      <td className="text-sm text-brand-400">{item.fuel || '–'}</td>
                      <td className="text-sm text-brand-400">{item.transmission || '–'}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.color || '–'}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{(item as any).displacement ? `${(item as any).displacement} cc` : '–'}</td>
                      {/* Modalidad — columna separada */}
                      <td>
                        <div className="flex gap-1 flex-wrap">
                          {item.available_for_purchase !== false && <Badge variant="blue">Compra</Badge>}
                          {item.renting_available && <Badge variant="purple">Renting</Badge>}
                        </div>
                      </td>
                      {/* Unidades */}
                      <td>
                        {item.has_stock_management ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={`text-xs font-semibold ${(item.units_available ?? 0) > 0 ? 'text-emerald-600' : 'text-red-400'}`}>
                              {item.units_available ?? 0} disp. / {item.total_units ?? 0}
                            </span>
                            {item.available_colors?.length ? (
                              <span className="text-[10px] text-brand-300 leading-tight">{item.available_colors.join(', ')}</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-brand-400">1</span>
                        )}
                      </td>
                      {/* Vendedor */}
                      <td>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-brand-400">{item.seller || '–'}</span>
                          {item.seller_type && (
                            <Badge variant={item.seller_type === 'professional' ? 'blue' : item.seller_type === 'concesionario' ? 'orange' : item.seller_type === 'importador' ? 'purple' : 'slate'}>
                              {item.seller_type === 'professional' ? 'Profesional' : item.seller_type === 'concesionario' ? 'Concesionario' : item.seller_type === 'importador' ? 'Importador' : 'Particular'}
                            </Badge>
                          )}
                          {item.id.startsWith('idcar-') && (
                            <Badge variant="orange">IDCar cliente</Badge>
                          )}
                        </div>
                      </td>
                      {/* Estado */}
                      <td>
                        <Badge variant={item.is_active ? 'green' : 'slate'}>
                          {item.is_active ? 'Publicado' : 'Despublicado'}
                        </Badge>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 items-center">
                          <button onClick={() => openEdit(item)}
                            className="text-xs text-acento-texto hover:text-brand-600 font-medium px-2 py-1 rounded hover:bg-acento-tenue">
                            Editar
                          </button>
                          <button
                            onClick={() => { setImageEditOffer(item); setImageUrls(item.image_urls?.length ? item.image_urls : ['']); }}
                            title="Editar imágenes"
                            className={`text-xs font-medium px-2 py-1 rounded ${!item.image_url && !(item.image_urls?.length) ? 'text-orange-500 hover:bg-orange-50' : 'text-brand-400 hover:bg-acento-tenue'}`}>
                            <Icono nombre="imagen" tam={14} />
                          </button>
                          <button onClick={() => toggleActive(item)}
                            className={`text-xs font-medium px-2 py-1 rounded ${item.is_active
                              ? 'text-amber-600 hover:bg-amber-50'
                              : 'text-emerald-600 hover:bg-emerald-50'}`}>
                            {item.is_active ? 'Despublicar' : 'Publicar'}
                          </button>
                          <button onClick={() => setDeleteTarget(item)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50">
                            Eliminar
                          </button>
                          <button onClick={() => openVisitsPanel(item.id)}
                            className={`text-xs font-medium px-2 py-1 rounded ${expandedVisits === item.id ? 'bg-brand-100 text-brand-500' : 'text-brand-400 hover:bg-brand-50'}`}>
                            {visitData[item.id] ? `(${visitData[item.id].bookings.length})` : 'Citas'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedVisits === item.id && (
                      <tr key={`${item.id}-visits`}>
                        <td colSpan={18} className="p-0">
                          <VisitsPanel
                            offerId={item.id}
                            data={visitData[item.id] || { slots: [], bookings: [], loading: true }}
                            slotForm={visitSlotForm}
                            onFormChange={setVisitSlotForm}
                            onAdd={() => doAddVisitSlot(item.id)}
                            adding={visitSlotAdding}
                            msg={visitSlotMsg}
                            onRemoveSlot={(sid) => doRemoveVisitSlot(item.id, sid)}
                            onCancelBooking={(b) => { setCancelarCita({ offerId: item.id, booking: b }); setMotivoCita(''); }}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              </div>
              {displayItems.length === 0 && (
                <div className="text-center py-8 text-brand-300 text-sm">Sin resultados con los filtros actuales</div>
              )}
            </>
          )
        ) : tab === 'renting' ? (
          rentingItems.length === 0 ? (
            <div className="text-center py-12 text-brand-300 text-sm">
              No hay ofertas de renting. Pulsa "+ Añadir oferta renting" para crear la primera.
            </div>
          ) : (
            <div className="overflow-auto max-h-[72vh]">
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>Vehículo</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Versión</th>
                    <th>Año</th>
                    <th>Km/año</th>
                    <th>12 meses</th>
                    <th>24 meses</th>
                    <th>36 meses</th>
                    <th>48 meses</th>
                    <th>60 meses</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                  <tr className="bg-brand-50 border-b border-brand-100">
                    {/* Vehículo (título) */}
                    <td className="px-3 py-1.5">
                      <input value={colFRenting.title} onChange={e => setColFRenting(f => ({...f, title: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Título…" />
                    </td>
                    {/* Marca */}
                    <td className="px-3 py-1.5">
                      <input value={colFRenting.brand} onChange={e => setColFRenting(f => ({...f, brand: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Marca…" />
                    </td>
                    {/* Modelo */}
                    <td className="px-3 py-1.5">
                      <input value={colFRenting.model} onChange={e => setColFRenting(f => ({...f, model: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Modelo…" />
                    </td>
                    {/* Versión */}
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 items-center">
                        <input value={colFRenting.version === '__empty__' ? '' : colFRenting.version} onChange={e => setColFRenting(f => ({...f, version: e.target.value}))}
                          disabled={colFRenting.version === '__empty__'}
                          className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 disabled:bg-slate-100 disabled:text-slate-400" placeholder="Versión…" />
                        <button onClick={() => setColFRenting(f => ({...f, version: f.version === '__empty__' ? '' : '__empty__'}))}
                          title="Filtrar sin versión"
                          className={`shrink-0 text-xs px-1.5 py-1 rounded border ${colFRenting.version === '__empty__' ? 'bg-amber-100 border-amber-400 text-amber-700' : 'border-brand-200 text-slate-400 hover:border-amber-300'}`}>∅</button>
                      </div>
                    </td>
                    {/* Año (rango) */}
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 items-center">
                        <input type="number" value={colFRenting.yearMin} onChange={e => setColFRenting(f => ({...f, yearMin: e.target.value}))}
                          className="w-14 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Desde" />
                        <input type="number" value={colFRenting.yearMax} onChange={e => setColFRenting(f => ({...f, yearMax: e.target.value}))}
                          className="w-14 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Hasta" />
                      </div>
                    </td>
                    {/* Km/año (rango) */}
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 items-center">
                        <input type="number" value={colFRenting.kmMin} onChange={e => setColFRenting(f => ({...f, kmMin: e.target.value}))}
                          className="w-14 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Mín" />
                        <input type="number" value={colFRenting.kmMax} onChange={e => setColFRenting(f => ({...f, kmMax: e.target.value}))}
                          className="w-14 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Máx" />
                      </div>
                    </td>
                    {/* 12 / 24 / 36 / 48 / 60 meses (rango €/mes) */}
                    {([['m12Min','m12Max'],['m24Min','m24Max'],['m36Min','m36Max'],['m48Min','m48Max'],['m60Min','m60Max']] as const).map(([kMin, kMax]) => (
                      <td key={kMin} className="px-3 py-1.5">
                        <div className="flex gap-1 items-center">
                          <input type="number" value={colFRenting[kMin]} onChange={e => setColFRenting(f => ({...f, [kMin]: e.target.value}))}
                            className="w-12 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Mín" />
                          <input type="number" value={colFRenting[kMax]} onChange={e => setColFRenting(f => ({...f, [kMax]: e.target.value}))}
                            className="w-12 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Máx" />
                        </div>
                      </td>
                    ))}
                    {/* Estado */}
                    <td className="px-3 py-1.5">
                      <select value={colFRenting.status} onChange={e => setColFRenting(f => ({...f, status: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="active">Publicado</option>
                        <option value="inactive">Despublicado</option>
                      </select>
                    </td>
                    <td></td>
                  </tr>
                </thead>
                <tbody>
                  {displayRentingItems.map((item) => (
                    <tr key={item.id} onClick={() => openEdit(item)}
                      className="cursor-pointer hover:bg-acento-tenue transition-colors">
                      <td>
                        <div className="flex items-center gap-3">
                          {(item.image_url || item.image_urls?.[0]) ? (
                            <img src={item.image_url || item.image_urls?.[0]} alt="" title={item.title} referrerPolicy="no-referrer" className="w-14 h-10 object-cover rounded-md bg-brand-100 shrink-0" />
                          ) : (
                            <div className="w-14 h-10 bg-brand-100 rounded-md shrink-0 flex items-center justify-center text-brand-300 text-lg"></div>
                          )}
                            {/* El titulo no se pinta: es marca + modelo + version,
                                que ya tienen columna propia y filtro. Repetirlo
                                partia cada fila en tres lineas. Va en el title de
                                la foto, para poder leerlo entero al pasar por encima. */}
                        </div>
                      </td>
                      <td className="text-sm text-brand-500 font-medium whitespace-nowrap">{item.brand || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.model || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 max-w-[200px] truncate" title={item.version || ''}>{item.version || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400">{item.year}</td>
                      <td className="text-sm text-brand-400">{item.renting_km_year ? `${(item.renting_km_year as number).toLocaleString('es-ES')} km` : '–'}</td>
                      <td className="text-sm text-brand-400">{fmtCuota(item.renting_12m as number | null)}</td>
                      <td className="text-sm text-brand-400">{fmtCuota(item.renting_24m as number | null)}</td>
                      <td className="text-sm font-semibold text-brand-500">{fmtCuota(item.renting_36m as number | null)}</td>
                      <td className="text-sm text-brand-400">{fmtCuota(item.renting_48m as number | null)}</td>
                      <td className="text-sm text-brand-400">{fmtCuota(item.renting_60m as number | null)}</td>
                      <td>
                        <Badge variant={item.is_active ? 'green' : 'slate'}>
                          {item.is_active ? 'Publicado' : 'Despublicado'}
                        </Badge>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 items-center">
                          <button onClick={() => openEdit(item)}
                            className="text-xs text-acento-texto hover:text-brand-600 font-medium px-2 py-1 rounded hover:bg-acento-tenue">
                            Editar
                          </button>
                          <button onClick={() => toggleActive(item)}
                            className={`text-xs font-medium px-2 py-1 rounded ${item.is_active
                              ? 'text-amber-600 hover:bg-amber-50'
                              : 'text-emerald-600 hover:bg-emerald-50'}`}>
                            {item.is_active ? 'Despublicar' : 'Publicar'}
                          </button>
                          <button onClick={() => setDeleteTarget(item)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50">
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'particulares' ? (
          particularsItems.length === 0 ? (
            <div className="text-center py-12 text-brand-300 text-sm">
              Ningún usuario ha publicado su vehículo todavía.<br />
              <span className="text-xs">Aparecerán aquí cuando marquen su IDCar como "En venta" desde su panel.</span>
            </div>
          ) : (
            <>
              <div className="overflow-auto max-h-[72vh]">
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>Vehículo</th><th>Marca</th><th>Modelo</th><th>Versión</th><th>Cliente</th><th>Precio</th><th>Km</th>
                    <th>Año</th><th>Combustible</th><th>Ubicación</th><th>Matrícula</th><th>Acciones</th>
                  </tr>
                  <tr className="bg-brand-50 border-b border-brand-100">
                    <td className="px-3 py-1.5">
                      <input value={colFPart.brand} onChange={e => setColFPart(f => ({...f, brand: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Buscar…" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={colFPart.marca} onChange={e => setColFPart(f => ({...f, marca: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Marca…" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={colFPart.modelo} onChange={e => setColFPart(f => ({...f, modelo: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Modelo…" />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 items-center">
                        <input value={colFPart.version === '__empty__' ? '' : colFPart.version} onChange={e => setColFPart(f => ({...f, version: e.target.value}))}
                          disabled={colFPart.version === '__empty__'}
                          className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 disabled:bg-slate-100 disabled:text-slate-400" placeholder="Versión…" />
                        <button onClick={() => setColFPart(f => ({...f, version: f.version === '__empty__' ? '' : '__empty__'}))}
                          title="Filtrar sin versión"
                          className={`shrink-0 text-xs px-1.5 py-1 rounded border ${colFPart.version === '__empty__' ? 'bg-amber-100 border-amber-400 text-amber-700' : 'border-brand-200 text-slate-400 hover:border-amber-300'}`}>∅</button>
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={colFPart.client} onChange={e => setColFPart(f => ({...f, client: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Cliente/email…" />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 items-center">
                        <input type="number" value={colFPart.priceMin} onChange={e => setColFPart(f => ({...f, priceMin: e.target.value}))}
                          className="w-16 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Mín" />
                        <span className="text-brand-300 text-xs">–</span>
                        <input type="number" value={colFPart.priceMax} onChange={e => setColFPart(f => ({...f, priceMax: e.target.value}))}
                          className="w-16 text-xs border border-brand-200 rounded px-1 py-1" placeholder="Máx" />
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFPart.kmMax} onChange={e => setColFPart(f => ({...f, kmMax: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {[500,1000,30000,50000,80000,120000,200000].map(k => <option key={k} value={k}>≤ {k.toLocaleString('es-ES')} km</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFPart.year} onChange={e => setColFPart(f => ({...f, year: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {partFilterOpts.years.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFPart.fuel} onChange={e => setColFPart(f => ({...f, fuel: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {partFilterOpts.fuels.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={colFPart.location} onChange={e => setColFPart(f => ({...f, location: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Ubicación…" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={colFPart.plate} onChange={e => setColFPart(f => ({...f, plate: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Matrícula…" />
                    </td>
                    <td></td>
                  </tr>
                </thead>
                <tbody>
                  {displayPartItems.map((item) => (
                    <Fragment key={item.id}>
                    <tr onClick={() => openPartEdit(item)}
                      className="cursor-pointer hover:bg-acento-tenue transition-colors">
                      <td>
                        <p className="font-medium text-brand-600 text-sm">{[item.brand, item.model, item.version].filter(Boolean).join(' ') || item.title}</p>
                        {item.year ? <p className="text-xs text-brand-300">{item.year}{item.fuel ? ` · ${item.fuel}` : ''}{item.cv ? ` · ${item.cv} CV` : ''}</p> : null}
                      </td>
                      <td className="text-sm text-brand-500 font-medium whitespace-nowrap">{item.brand || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.model || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 max-w-[200px] truncate" title={item.version || ''}>{item.version || <span className="text-brand-300">–</span>}</td>
                      <td>
                        <p className="text-sm font-medium text-brand-500">{item.owner_name || item.user_email}</p>
                        <p className="text-xs text-brand-300">{item.user_email}</p>
                        {item.owner_phone ? <p className="text-xs text-brand-300">{item.owner_phone}</p> : null}
                      </td>
                      <td className="font-semibold text-brand-600 text-sm">{fmtPrice(item.price)}</td>
                      <td className="text-sm text-brand-400">{fmtKm(item.mileage)}</td>
                      <td className="text-sm text-brand-400">{item.year || '–'}</td>
                      <td className="text-sm text-brand-400 capitalize">{item.fuel || '–'}</td>
                      <td className="text-sm text-brand-400">{item.vehicle_location || '–'}</td>
                      <td className="text-sm text-brand-400">{item.plate || '–'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1.5 items-center">
                          <button
                            onClick={() => openPartEdit(item)}
                            className="px-2 py-1 rounded text-xs font-semibold bg-acento-tenue text-acento-texto border border-acento hover:bg-acento-tenue"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => toggleParticular(item)}
                            className="px-2 py-1 rounded text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                          >
                            Despublicar
                          </button>
                          <button
                            onClick={() => openVisitsPanel(item.id)}
                            className={`px-2 py-1 rounded text-xs font-semibold border ${expandedVisits === item.id ? 'bg-brand-100 text-brand-500 border-brand-200' : 'bg-brand-50 text-brand-400 border-brand-200 hover:bg-brand-100'}`}
                          >
                            {visitData[item.id] ? `(${visitData[item.id].bookings.length})` : 'Citas'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedVisits === item.id && (
                      <tr key={`${item.id}-visits`}>
                        <td colSpan={12} className="p-0">
                          <VisitsPanel
                            offerId={item.id}
                            data={visitData[item.id] || { slots: [], bookings: [], loading: true }}
                            slotForm={visitSlotForm}
                            onFormChange={setVisitSlotForm}
                            onAdd={() => doAddVisitSlot(item.id)}
                            adding={visitSlotAdding}
                            msg={visitSlotMsg}
                            onRemoveSlot={(sid) => doRemoveVisitSlot(item.id, sid)}
                            onCancelBooking={(b) => { setCancelarCita({ offerId: item.id, booking: b }); setMotivoCita(''); }}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              </div>
              <Pagination page={page} total={total} limit={50} onChange={setPage} />
            </>
          )
        ) : (tab === 'offers' || tab === 'exportacion') ? (
          portalItems.length === 0 ? (
            <div className="text-center py-12 text-brand-300 text-sm">
              {tab === 'exportacion'
                ? 'Sin coches de importación (DE) todavía. Aparecerán aquí cuando corra el scraper AutoScout24-DE.'
                : 'Sin resultados'}
            </div>
          ) : (
            <>
              {Object.values(colFOffers).some(Boolean) && (
                <div className="px-4 py-2 border-b border-brand-100 flex items-center gap-2 bg-acento-tenue">
                  <span className="text-xs text-acento-texto font-medium">{total.toLocaleString('es-ES')} resultados (filtrado general)</span>
                  <button onClick={() => setColFOffers({ brand:'', marca:'', modelo:'', version:'', portal:'', sellerType:'', estado:'', priceMax:'', kmMax:'', year:'', fuel:'', color:'', body:'', trans:'', cvMin:'', doors:'', seats:'', ccMin:'', co2Max:'', etiq:'', trac:'', consMax:'', province:'', city:'' })}
                    className="text-xs text-acento-texto hover:text-brand-600 underline">Limpiar filtros</button>
                </div>
              )}
              <div className="overflow-auto max-h-[72vh]">
              <table className="erp-table w-full">
                <thead>
                  <tr><th>Vehículo</th>{tab === 'exportacion' && <><th>Publicar</th><th>Margen</th><th>P. mercado ES</th><th>Comps</th></>}<th>Marca</th><th>Modelo</th><th>Versión</th><th>Portal</th><th>Estado</th><th>Vendedor</th><th>Precio</th><th>Km</th><th>Año</th><th>Combustible</th><th>Color</th><th>Carrocería</th><th>Cambio</th><th>CV</th><th>Puertas</th><th>Plazas</th><th>Cilindrada</th><th>CO₂</th><th>Etiqueta</th><th>Tracción</th><th>Consumo</th><th>Provincia</th><th>Ciudad</th><th>Enlace</th></tr>
                  <tr className="bg-brand-50 border-b border-brand-100">
                    <td className="px-3 py-1.5">
                      <input value={colFOffers.brand} onChange={e => setColFOffers(f => ({...f, brand: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Buscar…" />
                    </td>
                    {tab === 'exportacion' && <><td className="px-3 py-1.5"></td><td className="px-3 py-1.5"></td><td className="px-3 py-1.5"></td><td className="px-3 py-1.5"></td></>}
                    <td className="px-3 py-1.5">
                      <input value={colFOffers.marca} onChange={e => setColFOffers(f => ({...f, marca: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Marca…" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={colFOffers.modelo} onChange={e => setColFOffers(f => ({...f, modelo: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Modelo…" />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 items-center">
                        <input value={colFOffers.version === '__empty__' ? '' : colFOffers.version} onChange={e => setColFOffers(f => ({...f, version: e.target.value}))}
                          disabled={colFOffers.version === '__empty__'}
                          className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 disabled:bg-slate-100 disabled:text-slate-400" placeholder="Versión…" />
                        <button onClick={() => setColFOffers(f => ({...f, version: f.version === '__empty__' ? '' : '__empty__'}))}
                          title="Filtrar sin versión"
                          className={`shrink-0 text-xs px-1.5 py-1 rounded border ${colFOffers.version === '__empty__' ? 'bg-amber-100 border-amber-400 text-amber-700' : 'border-brand-200 text-slate-400 hover:border-amber-300'}`}>∅</button>
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.portal} onChange={e => setColFOffers(f => ({...f, portal: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {portalFilterOpts.portals.map((p) => <option key={p} value={p}>{portalLabel(p)}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.estado} onChange={e => setColFOffers(f => ({...f, estado: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option>
                        <option value="active">Activas</option>
                        <option value="inactive">Inactivas</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.sellerType} onChange={e => setColFOffers(f => ({...f, sellerType: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        <option value="particular">Particular</option>
                        <option value="professional">Profesional</option>
                        <option value="concesionario">Concesionario</option>
                        <option value="importador">Importador</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.priceMax} onChange={e => setColFOffers(f => ({...f, priceMax: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Cualquier precio</option>
                        <option value="__empty__">(Vacío)</option>
                        {[500,1000,10000,15000,20000,30000,40000,60000,100000].map(p => <option key={p} value={p}>≤ {p.toLocaleString('es-ES')} €</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.kmMax} onChange={e => setColFOffers(f => ({...f, kmMax: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {[500,1000,10000,30000,50000,80000,120000,200000].map(k => <option key={k} value={k}>≤ {k.toLocaleString('es-ES')} km</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.year} onChange={e => setColFOffers(f => ({...f, year: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {portalFilterOpts.years.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.fuel} onChange={e => setColFOffers(f => ({...f, fuel: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {portalFilterOpts.fuels.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.color} onChange={e => setColFOffers(f => ({...f, color: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option><option value="__empty__">(Vacío)</option>
                        {portalFilterOpts.colors.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.body} onChange={e => setColFOffers(f => ({...f, body: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option><option value="__empty__">(Vacío)</option>
                        {portalFilterOpts.bodyTypes.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.trans} onChange={e => setColFOffers(f => ({...f, trans: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option><option value="__empty__">(Vacío)</option>
                        {portalFilterOpts.transmissions.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.cvMin} onChange={e => setColFOffers(f => ({...f, cvMin: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option><option value="__empty__">(Vacío)</option>
                        {[60,90,110,130,150,190,250,350].map(v => <option key={v} value={v}>≥ {v} CV</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.doors} onChange={e => setColFOffers(f => ({...f, doors: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option><option value="__empty__">(Vacío)</option>
                        {[2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.seats} onChange={e => setColFOffers(f => ({...f, seats: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option><option value="__empty__">(Vacío)</option>
                        {[2,4,5,6,7,9].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.ccMin} onChange={e => setColFOffers(f => ({...f, ccMin: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option><option value="__empty__">(Vacío)</option>
                        {[900,1200,1600,2000,3000].map(v => <option key={v} value={v}>≥ {v} cc</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.co2Max} onChange={e => setColFOffers(f => ({...f, co2Max: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option><option value="__empty__">(Vacío)</option>
                        {[90,100,120,140,160,200].map(v => <option key={v} value={v}>≤ {v} g/km</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.etiq} onChange={e => setColFOffers(f => ({...f, etiq: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option><option value="__empty__">(Vacío)</option>
                        {['0 Emisiones','ECO','C','B'].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.trac} onChange={e => setColFOffers(f => ({...f, trac: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option><option value="__empty__">(Vacío)</option>
                        {portalFilterOpts.tractions.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.consMax} onChange={e => setColFOffers(f => ({...f, consMax: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option><option value="__empty__">(Vacío)</option>
                        {[4,5,6,7,8,10].map(v => <option key={v} value={v}>≤ {v} l</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.province} onChange={e => setColFOffers(f => ({...f, province: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option>
                        <option value="__empty__">(Vacío)</option>
                        {portalFilterOpts.provinces.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFOffers.city} onChange={e => setColFOffers(f => ({...f, city: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option>
                        <option value="__empty__">(Vacío)</option>
                        {portalFilterOpts.cities.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td></td>
                  </tr>
                </thead>
                <tbody>
                  {displayPortalItems.map((item: any) => (
                    <tr key={item.id} onClick={() => openPortalEdit(item)} className="cursor-pointer hover:bg-acento-tenue transition-colors">
                      <td>
                        <div className="flex items-center gap-3">
                          {item.image_url && <img src={item.image_url} alt="" className="w-12 h-9 object-cover rounded-md bg-brand-100 shrink-0" />}
                          <div>
                            <p className="font-medium text-brand-600 text-sm">{item.title}</p>
                            <p className="text-xs text-brand-300">{item.brand} {item.model}</p>
                          </div>
                        </div>
                      </td>
                      {tab === 'exportacion' && <>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => toggleImportPublish(item)}
                            className={`text-xs font-semibold px-2 py-1 rounded whitespace-nowrap ${item.import_published
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-brand-100 text-brand-400 hover:bg-brand-200'}`}>
                            {item.import_published ? '✓ Publicado' : 'Publicar'}
                          </button>
                        </td>
                        <td className="text-sm font-semibold whitespace-nowrap">
                          {item.import_margin != null
                            ? <span className={item.import_margin >= 1500 ? 'text-emerald-700' : item.import_margin > 0 ? 'text-amber-600' : 'text-red-500'}>
                                {item.import_margin > 0 ? '+' : ''}{Number(item.import_margin).toLocaleString('es-ES')} €
                                {item.import_margin_pct != null && <span className="text-brand-300 font-normal"> ({Math.round(item.import_margin_pct * 100)}%)</span>}
                              </span>
                            : <span className="text-brand-300">–</span>}
                        </td>
                        <td className="text-sm text-brand-400 whitespace-nowrap">{item.market_price_es != null ? `${Number(item.market_price_es).toLocaleString('es-ES')} €` : '–'}</td>
                        <td className="text-sm text-brand-300">{item.import_comps ?? '–'}</td>
                      </>}
                      <td className="text-sm text-brand-500 font-medium whitespace-nowrap">{item.brand || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.model || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 max-w-[220px] truncate" title={item.version || ''}>{item.version || <span className="text-brand-300">–</span>}</td>
                      <td><Badge variant="blue">{item.portal}</Badge></td>
                      <td>
                        {item.is_active === false
                          ? <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 whitespace-nowrap">Inactiva</span>
                          : <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">Activa</span>}
                      </td>
                      <td>
                        {item.seller_type === 'particular'
                          ? <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">Particular</span>
                          : item.seller_type === 'professional'
                          ? <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-brand-100 text-brand-400">Profesional</span>
                          : item.seller_type === 'concesionario'
                          ? <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700">Concesionario</span>
                          : item.seller_type === 'importador'
                          ? <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-brand-100 text-brand-500">Importador</span>
                          : <span className="text-brand-300">–</span>}
                      </td>
                      <td className="font-semibold text-brand-600 text-sm">{fmtPrice(item.price)}</td>
                      <td className="text-sm text-brand-400">{fmtKm(item.mileage)}</td>
                      <td className="text-sm text-brand-400">{item.year}</td>
                      <td className="text-sm text-brand-400 capitalize">{item.fuel || '–'}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.color || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.body_type || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 capitalize whitespace-nowrap">{item.transmission || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.power_cv ? `${item.power_cv} CV` : <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 text-center">{item.doors || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 text-center">{item.seats || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.displacement ? `${item.displacement} cc` : <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.co2 ? `${item.co2} g` : <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.environmental_label || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.traction || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.consumption ? `${item.consumption} l` : <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.province || item.location || <span className="text-brand-300">–</span>}</td>
                      <td className="text-sm text-brand-400 whitespace-nowrap">{item.city || <span className="text-brand-300">–</span>}</td>
                      <td>
                        {(item as any).url
                          ? <a href={(item as any).url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-acento-texto hover:underline"
                              onClick={e => e.stopPropagation()}>Ver ↗</a>
                          : <span className="text-brand-300">–</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <Pagination page={page} total={total} limit={50} onChange={setPage} />
            </>
          )
        ) : tab === 'concesionarios' ? (
          items.length === 0 ? (
            <div className="text-center py-12 text-brand-300 text-sm">Sin vehículos de concesionarios</div>
          ) : (
            <>
              {Object.values(colFConc).some(Boolean) && (
                <div className="px-4 py-2 border-b border-brand-100 flex items-center gap-2 bg-acento-tenue">
                  <span className="text-xs text-acento-texto font-medium">{displayConcItems.length} de {items.length} resultados</span>
                  <button onClick={() => setColFConc({ brand:'', marca:'', modelo:'', version:'', sellerType:'', seller:'', priceMax:'', kmMax:'', year:'' })}
                    className="text-xs text-acento-texto hover:text-brand-600 underline">Limpiar filtros</button>
                </div>
              )}
              <div className="overflow-auto max-h-[72vh]">
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>Vehículo</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Versión</th>
                    <th>Tipo</th>
                    <th>Concesionario</th>
                    <th>Precio</th>
                    <th>Km</th>
                    <th>Año</th>
                    <th>Ubicación</th>
                    <th>Enlace</th>
                  </tr>
                  <tr className="bg-brand-50 border-b border-brand-100">
                    <td className="px-3 py-1.5">
                      <input value={colFConc.brand} onChange={e => setColFConc(f => ({...f, brand: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Buscar…" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={colFConc.marca} onChange={e => setColFConc(f => ({...f, marca: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Marca…" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={colFConc.modelo} onChange={e => setColFConc(f => ({...f, modelo: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Modelo…" />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 items-center">
                        <input value={colFConc.version === '__empty__' ? '' : colFConc.version} onChange={e => setColFConc(f => ({...f, version: e.target.value}))}
                          disabled={colFConc.version === '__empty__'}
                          className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 disabled:bg-slate-100 disabled:text-slate-400" placeholder="Versión…" />
                        <button onClick={() => setColFConc(f => ({...f, version: f.version === '__empty__' ? '' : '__empty__'}))}
                          title="Filtrar sin versión"
                          className={`shrink-0 text-xs px-1.5 py-1 rounded border ${colFConc.version === '__empty__' ? 'bg-amber-100 border-amber-400 text-amber-700' : 'border-brand-200 text-slate-400 hover:border-amber-300'}`}>∅</button>
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFConc.sellerType} onChange={e => setColFConc(f => ({...f, sellerType: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        <option value="concesionario">Concesionario</option>
                        <option value="importador">Importador</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={colFConc.seller} onChange={e => setColFConc(f => ({...f, seller: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1" placeholder="Concesionario…" />
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFConc.priceMax} onChange={e => setColFConc(f => ({...f, priceMax: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Cualquier precio</option>
                        <option value="__empty__">(Vacío)</option>
                        {[500,1000,10000,15000,20000,30000,40000,60000,100000].map(p => <option key={p} value={p}>≤ {p.toLocaleString('es-ES')} €</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFConc.kmMax} onChange={e => setColFConc(f => ({...f, kmMax: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {[500,1000,10000,30000,50000,80000,120000,200000].map(k => <option key={k} value={k}>≤ {k.toLocaleString('es-ES')} km</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={colFConc.year} onChange={e => setColFConc(f => ({...f, year: e.target.value}))}
                        className="w-full text-xs border border-brand-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="__empty__">(Vacío)</option>
                        {concYearOpts.map((y:any) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5"></td>
                  </tr>
                </thead>
                <tbody>
                  {displayConcItems.map((item) => (
                    <tr key={item.id} onClick={() => openEdit(item)}
                      className="cursor-pointer hover:bg-acento-tenue transition-colors">
                      <td>
                        <div className="flex items-center gap-3">
                          {item.image_url && <img src={item.image_url} alt="" className="w-12 h-9 object-cover rounded-md bg-brand-100 shrink-0" />}
                          <div>
                            <p className="font-medium text-brand-600 text-sm">{item.title}</p>
                            <p className="text-xs text-brand-300">{item.brand} {item.model}{item.version ? ` · ${item.version}` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-sm text-brand-400">{item.brand || '–'}</td>
                      <td className="text-sm text-brand-400">{item.model || '–'}</td>
                      <td className="text-sm text-brand-400 max-w-[180px] truncate" title={item.version || ''}>{item.version || '–'}</td>
                      <td>
                        {item.seller_type === 'concesionario'
                          ? <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700">Concesionario</span>
                          : item.seller_type === 'importador'
                          ? <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-brand-100 text-brand-500">Importador</span>
                          : <span className="text-brand-300">–</span>}
                      </td>
                      <td className="text-sm text-brand-400">{item.seller || '–'}</td>
                      <td className="font-semibold text-brand-600 text-sm">{fmtPrice(item.sale_price ?? item.price)}</td>
                      <td className="text-sm text-brand-400">{fmtKm(item.mileage)}</td>
                      <td className="text-sm text-brand-400">{item.year || '–'}</td>
                      <td className="text-sm text-brand-400">{item.location || '–'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {item.source_url
                          ? <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-acento-texto hover:underline">Ver</a>
                          : <span className="text-brand-300">–</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <Pagination page={page} total={total} limit={500} onChange={setPage} />
            </>
          )
        ) : null}
      </div>

      {/* ── Edit modal ──────────────────────────────────────────────────────── */}
      <Modal open={!!editOffer} onClose={() => setEditOffer(null)} title="Editar vehículo" size="lg">
        {editOffer && (
          <>
            <VehicleFormFields
              form={editForm}
              setForm={setEditForm}
              idPrefix="edit"
              onSetPrimary={async (newUrls) => {
                setPrimaryMsg('');
                const res = await api.patch(`/marketplace/vo/${editOffer.id}`, { image_urls: newUrls });
                setPrimaryMsg(res.ok ? '✓ Foto principal guardada' : '✗ Error al guardar');
                setTimeout(() => setPrimaryMsg(''), 3000);
              }}
            />
            {primaryMsg && (
              <p className={`text-xs mt-1 mb-2 ${primaryMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{primaryMsg}</p>
            )}

            {/* Units panel */}
            <div className="mt-6 border-t border-brand-100 pt-5">
              <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-3">
                Unidades en stock
                {units.length > 0 && (
                  <span className="ml-2 font-normal normal-case text-brand-300">
                    {units.filter(u => u.status === 'available').length} disponibles · {units.length} total
                  </span>
                )}
              </p>

              {loadingUnits ? (
                <p className="text-sm text-brand-300">Cargando unidades…</p>
              ) : (
                <>
                  {units.length > 0 && (
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-brand-50">
                            <th className="text-left p-2 font-medium text-brand-400">Color</th>
                            <th className="text-left p-2 font-medium text-brand-400">Km</th>
                            <th className="text-left p-2 font-medium text-brand-400">Estado</th>
                            <th className="p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {units.map((u) => {
                            const statusMap: Record<UnitStatus, { label: string; variant: 'green'|'blue'|'purple'|'slate' }> = {
                              available: { label: 'Disponible', variant: 'green' },
                              reserved:  { label: 'Reservada',  variant: 'blue'  },
                              rented:    { label: 'Rentada',    variant: 'purple'},
                              returned:  { label: 'Devuelta',   variant: 'slate' },
                            };
                            const s = statusMap[u.status] ?? statusMap.available;
                            return (
                              <tr key={u.id} className="border-t border-brand-100">
                                <td className="p-2 font-medium text-brand-500">{u.color || '—'}</td>
                                <td className="p-2 text-brand-400">{u.mileage.toLocaleString('es-ES')} km</td>
                                <td className="p-2"><Badge variant={s.variant}>{s.label}</Badge></td>
                                <td className="p-2">
                                  <div className="flex gap-1 flex-wrap justify-end">
                                    {u.status !== 'available' && (
                                      <button onClick={() => changeUnitStatus(u.id, 'available')}
                                        className="text-xs text-emerald-600 hover:bg-emerald-50 px-1.5 py-0.5 rounded">Liberar</button>
                                    )}
                                    {u.status === 'available' && (
                                      <button onClick={() => changeUnitStatus(u.id, 'reserved')}
                                        className="text-xs text-acento-texto hover:bg-acento-tenue px-1.5 py-0.5 rounded">Reservar</button>
                                    )}
                                    {u.status === 'reserved' && (
                                      <button onClick={() => changeUnitStatus(u.id, 'rented')}
                                        className="text-xs text-brand-500 hover:bg-brand-50 px-1.5 py-0.5 rounded">Rentar</button>
                                    )}
                                    {u.status === 'rented' && (
                                      <button onClick={() => changeUnitStatus(u.id, 'returned')}
                                        className="text-xs text-brand-400 hover:bg-brand-50 px-1.5 py-0.5 rounded">Devolver</button>
                                    )}
                                    <button onClick={() => deleteUnit(u.id)}
                                      className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded">✕</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Add unit row */}
                  <div className="flex gap-2 items-end">
                    <div>
                      <label className={LABEL_CLS}>Color</label>
                      <input className={INPUT_CLS} style={{ width: 130 }} value={newUnit.color}
                        onChange={(e) => setNewUnit((n) => ({ ...n, color: e.target.value }))}
                        placeholder="Blanco" />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Nº unidades</label>
                      <input type="number" className={INPUT_CLS} style={{ width: 90 }} value={newUnit.quantity}
                        onChange={(e) => setNewUnit((n) => ({ ...n, quantity: e.target.value }))}
                        placeholder="1" min={1} max={50} />
                    </div>
                    <button onClick={addUnit} disabled={addingUnit || !newUnit.color}
                      className="px-3 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 shrink-0">
                      {addingUnit ? '…' : '+ Añadir'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {saveError && (
              <pre className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg p-3 overflow-auto max-h-40">{saveError}</pre>
            )}
            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-brand-100">
              <button onClick={() => setEditOffer(null)} className="px-4 py-2 text-sm text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
                Cerrar
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Create modal ────────────────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Añadir vehículo" size="lg">
        <VehicleFormFields form={createForm} setForm={setCreateForm} idPrefix="create" />
        <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-brand-100">
          <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
            Cancelar
          </button>
          <button onClick={saveCreate} disabled={creating || !createForm.title || !createForm.brand || !createForm.model}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60">
            {creating ? 'Creando…' : 'Crear vehículo'}
          </button>
        </div>
      </Modal>

      {/* ── Delete confirm ──────────────────────────────────────────────────── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Eliminar vehículo" size="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-brand-400">
              ¿Seguro que quieres eliminar <strong>{deleteTarget.title}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
                Cancelar
              </button>
              <button onClick={doDelete} disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Cancelar una visita ─────────────────────────────────────────────── */}
      <Modal open={!!cancelarCita} onClose={() => setCancelarCita(null)} title="Cancelar la visita" size="sm">
        {cancelarCita && (
          <div className="space-y-4">
            <p className="text-sm text-brand-400">
              Se le escribe a <strong>{cancelarCita.booking.buyer_name || cancelarCita.booking.buyer_email}</strong> para
              decírselo, con el motivo que pongas y un enlace para pedir otra hora.
            </p>
            <label className="block text-xs font-medium text-brand-500">
              Motivo
              <input value={motivoCita} onChange={(e) => setMotivoCita(e.target.value)} maxLength={300}
                     placeholder="El coche ya no está disponible, el vendedor cierra…"
                     className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
            </label>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCancelarCita(null)} className="px-4 py-2 text-sm text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
                Volver
              </button>
              <button onClick={doCancelVisitBooking} disabled={cancelandoCita}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                {cancelandoCita ? 'Cancelando…' : 'Cancelar la visita'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Image edit modal ────────────────────────────────────────────────── */}
      <Modal open={!!imageEditOffer} onClose={() => setImageEditOffer(null)} title="Editar imágenes" size="md">
        {imageEditOffer && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-brand-500">{imageEditOffer.title}</p>

            {/* Thumbnail grid */}
            {imageUrls.filter(u => u.trim()).length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {imageUrls.filter(u => u.trim()).map((url, idx) => (
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
                        onClick={() => setImageUrls(prev => [url, ...prev.filter(u => u !== url)])}
                        className="absolute top-1 left-1 bg-white/90 text-brand-400 text-[9px] font-medium px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-50 hover:text-amber-700 whitespace-nowrap"
                      >
                        Hacer principal
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { const next = imageUrls.filter(u => u !== url); setImageUrls(next.length ? next : ['']); }}
                      className="absolute top-1 right-1 bg-white/90 text-red-500 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* URL inputs */}
            <div className="space-y-2">
              {imageUrls.map((url, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <span className="text-xs text-brand-300 w-4 shrink-0">{idx + 1}</span>
                  <input
                    className={INPUT_CLS}
                    value={url}
                    onChange={(e) => { const next = [...imageUrls]; next[idx] = e.target.value; setImageUrls(next); }}
                    placeholder={idx === 0 ? 'https://... (foto principal)' : `https://... (foto ${idx + 1})`}
                  />
                  {imageUrls.length > 1 && (
                    <button type="button" onClick={() => { const next = imageUrls.filter((_, i) => i !== idx); setImageUrls(next.length ? next : ['']); }}
                      className="text-red-400 hover:text-red-600 text-lg font-bold shrink-0 leading-none">✕</button>
                  )}
                </div>
              ))}
            </div>

            {imageUrls.length < 10 && (
              <button type="button" onClick={() => setImageUrls([...imageUrls, ''])}
                className="text-xs text-acento-texto hover:text-brand-600 font-medium">
                + Añadir foto
              </button>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t border-brand-100">
              <button onClick={() => setImageEditOffer(null)} className="px-4 py-2 text-sm text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
                Cancelar
              </button>
              <button onClick={saveImages} disabled={savingImages}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60">
                {savingImages ? 'Guardando…' : 'Guardar imágenes'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Portal offer edit modal ─────────────────────────────────────────── */}
      <Modal open={!!portalEditOffer} onClose={() => setPortalEditOffer(null)} title="Editar oferta de portal" size="lg">
        {portalEditOffer && (
          <div className="space-y-5">
            {/* Preview strip */}
            <div className="flex items-center gap-3 p-3 bg-brand-50 rounded-lg">
              {portalEditOffer.image_url && (
                <img src={portalEditOffer.image_url} alt="" className="w-16 h-12 object-cover rounded-md shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-medium text-brand-600 text-sm truncate">{portalEditOffer.title}</p>
                <p className="text-xs text-brand-300">{portalEditOffer.portal} · {portalEditOffer.id}{portalDetailLoading ? ' · cargando ficha…' : ''}</p>
              </div>
              {portalEditOffer.url && (
                <a href={portalEditOffer.url} target="_blank" rel="noopener noreferrer"
                  className="ml-auto text-xs text-acento-texto hover:underline shrink-0">Ver original ↗</a>
              )}
            </div>

            {/* Fields grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {/* Row 1 */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-brand-400 mb-1">Título</label>
                <input value={portalEditForm.title ?? ''} onChange={e => setPortalEditForm(f => ({...f, title: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* Brand / Model / Version */}
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Marca</label>
                <input value={portalEditForm.brand ?? ''} onChange={e => setPortalEditForm(f => ({...f, brand: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Modelo</label>
                <input value={portalEditForm.model ?? ''} onChange={e => setPortalEditForm(f => ({...f, model: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-brand-400 mb-1">Versión</label>
                <input value={portalEditForm.version ?? ''} onChange={e => setPortalEditForm(f => ({...f, version: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" placeholder="Ej: 1.5 TDI 115 CV DSG" />
              </div>
              {/* Numeric row */}
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Año</label>
                <input type="number" value={portalEditForm.year ?? ''} onChange={e => setPortalEditForm(f => ({...f, year: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Precio (€)</label>
                <input type="number" value={portalEditForm.price ?? ''} onChange={e => setPortalEditForm(f => ({...f, price: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Kilómetros</label>
                <input type="number" value={portalEditForm.mileage ?? ''} onChange={e => setPortalEditForm(f => ({...f, mileage: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">CV</label>
                <input type="number" value={portalEditForm.power_cv ?? ''} onChange={e => setPortalEditForm(f => ({...f, power_cv: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* Fuel / Transmission */}
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Combustible</label>
                <select value={portalEditForm.fuel ?? ''} onChange={e => setPortalEditForm(f => ({...f, fuel: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">–</option>
                  {['Gasolina','Diesel','Eléctrico','Híbrido','Híbrido enchufable','Gas'].map(v =>
                    <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Cambio</label>
                <select value={portalEditForm.transmission ?? ''} onChange={e => setPortalEditForm(f => ({...f, transmission: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">–</option>
                  <option value="Manual">Manual</option>
                  <option value="Automatica">Automática</option>
                </select>
              </div>
              {/* Body / Color / Doors / Seats */}
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Carrocería</label>
                <select value={portalEditForm.body_type ?? ''} onChange={e => setPortalEditForm(f => ({...f, body_type: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">–</option>
                  {['SUV','Berlina','Compacto','Familiar','Monovolumen','Coupé','Cabrio','Furgoneta','Pick Up'].map(v =>
                    <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Color</label>
                <input value={portalEditForm.color ?? ''} onChange={e => setPortalEditForm(f => ({...f, color: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" placeholder="Blanco" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Puertas</label>
                <input type="number" value={portalEditForm.doors ?? ''} onChange={e => setPortalEditForm(f => ({...f, doors: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Plazas</label>
                <input type="number" value={portalEditForm.seats ?? ''} onChange={e => setPortalEditForm(f => ({...f, seats: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* CO2 / Warranty */}
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">CO₂ (g/km)</label>
                <input type="number" value={portalEditForm.co2 ?? ''} onChange={e => setPortalEditForm(f => ({...f, co2: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Garantía (meses)</label>
                <input type="number" value={portalEditForm.warranty_months ?? ''} onChange={e => setPortalEditForm(f => ({...f, warranty_months: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* Potencia kW / Etiqueta DGT / Tracción */}
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Potencia (kW)</label>
                <input type="number" value={portalEditForm.power_kw ?? ''} onChange={e => setPortalEditForm(f => ({...f, power_kw: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Etiqueta DGT</label>
                <select value={portalEditForm.environmental_label ?? ''} onChange={e => setPortalEditForm(f => ({...f, environmental_label: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">–</option>
                  {['0 Emisiones','ECO','C','B'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Tracción</label>
                <select value={portalEditForm.traction ?? ''} onChange={e => setPortalEditForm(f => ({...f, traction: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">–</option>
                  {['Delantera','Trasera','4x4'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Cilindrada (cc)</label>
                <input type="number" value={portalEditForm.displacement ?? ''} onChange={e => setPortalEditForm(f => ({...f, displacement: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" placeholder="1968" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Consumo (l/100 km)</label>
                <input type="number" step="0.1" value={portalEditForm.consumption ?? ''} onChange={e => setPortalEditForm(f => ({...f, consumption: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" placeholder="5.2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Próxima ITV</label>
                <input value={portalEditForm.next_itv ?? ''} onChange={e => setPortalEditForm(f => ({...f, next_itv: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" placeholder="MM/AAAA" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Cuota mensual (€)</label>
                <input type="number" value={portalEditForm.monthly_price ?? ''} onChange={e => setPortalEditForm(f => ({...f, monthly_price: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Precio financiado (€)</label>
                <input type="number" value={portalEditForm.finance_price ?? ''} onChange={e => setPortalEditForm(f => ({...f, finance_price: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* Seller */}
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Tipo vendedor</label>
                <select value={portalEditForm.seller_type ?? ''} onChange={e => setPortalEditForm(f => ({...f, seller_type: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">–</option>
                  <option value="particular">Particular</option>
                  <option value="professional">Profesional</option>
                  <option value="concesionario">Concesionario</option>
                  <option value="importador">Importador</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Vendedor / Concesionario</label>
                <input value={portalEditForm.dealer_name ?? ''} onChange={e => setPortalEditForm(f => ({...f, dealer_name: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* Location */}
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Provincia</label>
                <input value={portalEditForm.province ?? ''} onChange={e => setPortalEditForm(f => ({...f, province: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" placeholder="Madrid" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Ciudad</label>
                <input value={portalEditForm.city ?? ''} onChange={e => setPortalEditForm(f => ({...f, city: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-brand-400 mb-1">Ubicación (texto libre)</label>
                <input value={portalEditForm.location ?? ''} onChange={e => setPortalEditForm(f => ({...f, location: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* Portal / Source URL */}
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Portal</label>
                <select value={portalEditForm.portal ?? ''} onChange={e => setPortalEditForm(f => ({...f, portal: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">–</option>
                  {['autohero','autoscout24','cochescom','cochesnet','flexicar','milanuncios','wallapop'].map(v =>
                    <option key={v} value={v}>{portalLabel(v)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">URL anuncio</label>
                <input value={portalEditForm.url ?? ''} onChange={e => setPortalEditForm(f => ({...f, url: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" placeholder="https://…" />
              </div>
              {/* Galería de fotos */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-brand-400 mb-1">Fotos (galería) — la 1ª es la principal</label>
                {(portalEditForm.image_urls?.length ? portalEditForm.image_urls : ['']).map((url: string, idx: number) => (
                  <div key={idx} className="flex gap-2 mb-2 items-center">
                    <span className="text-xs text-brand-300 w-4 shrink-0">{idx + 1}</span>
                    {url ? <img src={url} alt="" className="w-10 h-7 object-cover rounded bg-brand-100 shrink-0" /> : <span className="w-10 h-7 shrink-0" />}
                    <input value={url}
                      onChange={e => setPortalEditForm(f => { const next = [...(f.image_urls ?? [''])]; next[idx] = e.target.value; return {...f, image_urls: next, image_url: next[0] ?? ''}; })}
                      className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm"
                      placeholder={idx === 0 ? 'https://… (principal)' : `https://… (foto ${idx + 1})`} />
                    {(portalEditForm.image_urls?.length ?? 0) > 1 && (
                      <button type="button" onClick={() => setPortalEditForm(f => { const next = (f.image_urls ?? []).filter((_: string, i: number) => i !== idx); return {...f, image_urls: next, image_url: next[0] ?? ''}; })}
                        className="text-red-400 hover:text-red-600 text-lg font-bold shrink-0 leading-none">✕</button>
                    )}
                  </div>
                ))}
                {(portalEditForm.image_urls?.length ?? 0) < 15 && (
                  <button type="button" onClick={() => setPortalEditForm(f => ({...f, image_urls: [...(f.image_urls ?? ['']), '']}))}
                    className="text-xs text-acento-texto hover:text-brand-600 font-medium">+ Añadir foto</button>
                )}
              </div>
              {/* Estado / Tipo de listado */}
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Estado</label>
                <select
                  value={portalEditForm.is_active === true ? 'true' : portalEditForm.is_active === false ? 'false' : ''}
                  onChange={e => setPortalEditForm(f => ({...f, is_active: e.target.value === '' ? null : e.target.value === 'true'}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">–</option>
                  <option value="true">Activa</option>
                  <option value="false">Inactiva</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Tipo de listado</label>
                <select value={portalEditForm.listing_type ?? ''} onChange={e => setPortalEditForm(f => ({...f, listing_type: e.target.value}))}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">–</option>
                  {['compra','renting'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {savePortalError && (
              <pre className="text-xs text-red-600 bg-red-50 rounded-lg p-3 overflow-auto max-h-32">{savePortalError}</pre>
            )}
            {savePortalOk && (
              <p className="text-xs text-green-600 font-medium">✓ Guardado correctamente</p>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t border-brand-100">
              <button onClick={() => setPortalEditOffer(null)}
                className="px-4 py-2 text-sm text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
                Cerrar
              </button>
              <button onClick={savePortalEdit} disabled={savingPortal}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60">
                {savingPortal ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Editar vehículo particular ──────────────────────────────────────── */}
      <Modal open={!!particEditOffer} onClose={() => setParticEditOffer(null)} title="Editar vehículo (particular)" size="lg">
        {particEditOffer && (
          <div className="space-y-5">
            <div className="p-3 bg-brand-50 rounded-lg">
              <p className="font-medium text-brand-600 text-sm">{[particEditOffer.brand, particEditOffer.model, particEditOffer.version].filter(Boolean).join(' ') || particEditOffer.title}</p>
              <p className="text-xs text-brand-300">{particEditOffer.owner_name || particEditOffer.user_email} · {particEditOffer.id}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-brand-400 mb-1">Título</label>
                <input value={particEditForm.title ?? ''} onChange={e => setParticEditForm(f => ({...f, title: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Marca</label>
                <input value={particEditForm.brand ?? ''} onChange={e => setParticEditForm(f => ({...f, brand: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Modelo</label>
                <input value={particEditForm.model ?? ''} onChange={e => setParticEditForm(f => ({...f, model: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-brand-400 mb-1">Versión</label>
                <input value={particEditForm.version ?? ''} onChange={e => setParticEditForm(f => ({...f, version: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Año</label>
                <input value={particEditForm.year ?? ''} onChange={e => setParticEditForm(f => ({...f, year: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Kilómetros</label>
                <input value={particEditForm.mileage ?? ''} onChange={e => setParticEditForm(f => ({...f, mileage: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Precio (€)</label>
                <input value={particEditForm.price ?? ''} onChange={e => setParticEditForm(f => ({...f, price: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">CV</label>
                <input value={particEditForm.cv ?? ''} onChange={e => setParticEditForm(f => ({...f, cv: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Combustible</label>
                <select value={particEditForm.fuel ?? ''} onChange={e => setParticEditForm(f => ({...f, fuel: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">–</option>
                  {['Gasolina','Diesel','Eléctrico','Híbrido','Híbrido enchufable','Gas'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Cambio</label>
                <input value={particEditForm.transmission_type ?? ''} onChange={e => setParticEditForm(f => ({...f, transmission_type: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" placeholder="Manual / Automático" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Color</label>
                <input value={particEditForm.color ?? ''} onChange={e => setParticEditForm(f => ({...f, color: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-400 mb-1">Matrícula</label>
                <input value={particEditForm.plate ?? ''} onChange={e => setParticEditForm(f => ({...f, plate: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-brand-400 mb-1">Ubicación</label>
                <input value={particEditForm.vehicle_location ?? ''} onChange={e => setParticEditForm(f => ({...f, vehicle_location: e.target.value}))} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-brand-400 mb-1">Notas</label>
                <textarea value={particEditForm.notes ?? ''} onChange={e => setParticEditForm(f => ({...f, notes: e.target.value}))} rows={2} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {savePartError && <pre className="text-xs text-red-600 bg-red-50 rounded-lg p-3 overflow-auto max-h-32">{savePartError}</pre>}
            {savePartOk && <p className="text-xs text-green-600 font-medium">✓ Guardado correctamente</p>}
            <div className="flex justify-end gap-3 pt-4 border-t border-brand-100">
              <button onClick={() => setParticEditOffer(null)} className="px-4 py-2 text-sm text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">Cerrar</button>
              <button onClick={savePartEdit} disabled={savingPartic} className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60">{savingPartic ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Import CSV modal ────────────────────────────────────────────────── */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importar vehículos desde Excel" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-brand-400">
            Descarga la plantilla, rellena los datos en Excel y sube el fichero .xlsx. Máximo 500 filas.
          </p>
          <button onClick={downloadTemplate}
            className="text-sm text-acento-texto hover:text-brand-600 font-medium">
            Descargar plantilla Excel
          </button>

          <div className="border-2 border-dashed border-brand-200 rounded-xl p-6 text-center">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" id="xlsx-upload" />
            <label htmlFor="xlsx-upload" className="cursor-pointer block">
              <div className="flex justify-center mb-2 text-brand-300"><Icono nombre="descargar" tam={30} /></div>
              <p className="text-sm font-medium text-brand-500">
                {importFileName || 'Haz clic para seleccionar el fichero Excel'}
              </p>
              <p className="text-xs text-brand-300 mt-1">Archivos .xlsx o .xls</p>
            </label>
          </div>

          {importRows.length > 0 && (
            <div className="bg-brand-50 rounded-lg p-3">
              <p className="text-sm font-medium text-brand-500 mb-2">{importRows.length} filas detectadas — vista previa:</p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-brand-400">
                      {Object.keys(importRows[0]).slice(0, 6).map((h) => <th key={h} className="text-left px-2 py-1">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-t border-brand-100">
                        {Object.values(row).slice(0, 6).map((v, j) => (
                          <td key={j} className="px-2 py-1 text-brand-400 max-w-[120px] truncate">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importRows.length > 3 && <p className="text-xs text-brand-300 mt-1">…y {importRows.length - 3} filas más</p>}
            </div>
          )}

          {importResult && (() => {
            const fuera = (importResult.rechazadas?.length ?? 0) + (importResult.repetidas?.length ?? 0) + (importResult.errors ?? 0);
            const bien = fuera === 0;
            return (
              <div className={`rounded-lg px-4 py-3 text-sm border ${bien ? 'bg-emerald-50 border-emerald-200' : 'bg-acento-tenue border-acento'}`}>
                <p className={`font-medium ${bien ? 'text-emerald-700' : 'text-brand-600'}`}>
                  {bien ? 'Importación completada' : 'Importación completada, con filas fuera'}
                </p>
                <p className={bien ? 'text-emerald-600' : 'text-brand-500'}>
                  {importResult.offers_created !== undefined ? (
                    <>
                      {importResult.filas_recibidas} filas leídas · {importResult.offers_created} anuncios creados
                      {' · '}{importResult.offers_updated} actualizados · {importResult.units_added} unidades añadidas
                    </>
                  ) : (
                    <>{importResult.inserted} importados</>
                  )}
                </p>
          
                {/* Lo que no entró, con el número de fila del Excel para poder ir a buscarlo. */}
                {[
                  ['No se pudieron leer', importResult.rechazadas],
                  ['Repetidas: describen un coche ya descrito', importResult.repetidas],
                ].map(([titulo, filas]) => {
                  const lista = filas as { numero: number; motivo: string }[] | undefined;
                  if (!lista?.length) return null;
                  return (
                    <details key={titulo as string} className="mt-2">
                      <summary className="cursor-pointer font-medium text-brand-600">
                        {lista.length} {titulo as string}
                      </summary>
                      <ul className="mt-1 ml-4 list-disc text-xs text-brand-500 max-h-40 overflow-y-auto">
                        {lista.slice(0, 60).map((d) => (
                          <li key={d.numero}>Fila {d.numero} · {d.motivo}</li>
                        ))}
                        {lista.length > 60 && <li>…y {lista.length - 60} más</li>}
                      </ul>
                    </details>
                  );
                })}
          
                {!!importResult.errorDetails?.length && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-medium text-red-700">
                      {importResult.errors} filas con error al guardar
                    </summary>
                    <ul className="mt-1 ml-4 list-disc text-xs text-brand-500 max-h-40 overflow-y-auto">
                      {importResult.errorDetails.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            );
          })()}

          <div className="flex justify-end gap-3">
            <button onClick={() => setShowImport(false)} className="px-4 py-2 text-sm text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
              Cerrar
            </button>
            <button onClick={doImport} disabled={importing || importRows.length === 0}
              className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60">
              {importing ? 'Importando…' : `Importar ${importRows.length} vehículos`}
            </button>
          </div>
        </div>
      </Modal>

      {/* Lo que ha pasado con la última acción en bloque. */}
      {bulkAviso && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-white border border-brand-200 shadow-lg rounded-lg px-4 py-2 text-sm text-brand-600 flex items-center gap-3">
          {bulkAviso}
          <button onClick={() => setBulkAviso(null)} aria-label="Cerrar aviso" className="text-brand-300 hover:text-brand-600">
            <Icono nombre="salir" tam={14} />
          </button>
        </div>
      )}

      {/* ── Bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-600 text-white rounded-xl px-5 py-3 flex items-center gap-4 shadow-2xl">
          <span className="text-sm font-medium">{selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}</span>
          <button onClick={() => bulkAction('activate')} disabled={bulking}
            className="px-3 py-1.5 text-xs bg-green-500 hover:bg-green-400 rounded-lg font-medium disabled:opacity-60">
            Activar
          </button>
          <button onClick={() => bulkAction('deactivate')} disabled={bulking}
            className="px-3 py-1.5 text-xs bg-brand-400 hover:bg-brand-400 rounded-lg font-medium disabled:opacity-60">
            Desactivar
          </button>
          <button onClick={() => setSelectedIds(new Set())} aria-label="Quitar la selección" title="Quitar la selección" className="text-brand-300 hover:text-white text-xs ml-1">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
