/**
 * La agenda de un taller: qué tiene cogido y qué está cerrado.
 *
 * El cliente pide hora desde PopCar y eso funciona. Lo que no existía era el
 * reverso —**decir que un día no se abre**—: las cuatro acciones estaban
 * escritas en el servidor y no las llamaba ninguna pantalla, así que un taller
 * que cierra por vacaciones seguía ofreciendo sus horas.
 *
 * Las citas ya dadas se enseñan al lado de los cierres a propósito. Cerrar un
 * día **no las anula** —no existe tal cosa, y no se inventa aquí—, así que lo
 * menos que se puede hacer es tenerlas delante antes de cerrar, y decirlo
 * cuando se cierra encima de una.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

interface Cierre { id: string; dia: string; hora: string; motivo: string }
interface Cita { id: string; dia: string; hora: string; cliente: string }
interface DiaDelMes { dia: string; horas: string[] }
interface Agenda { dias: DiaDelMes[]; cierres: Cierre[]; citas: Cita[] }

const DIAS_DE_LA_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** `YYYY-MM` de un `Date`. */
function elMesDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function comoSeLee(mes: string): string {
  const [anio, m] = mes.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(anio, m - 1, 1));
}

/** Cuántos huecos en blanco van antes del día 1, con la semana empezando en lunes. */
function loQueSobraDelante(mes: string): number {
  const [anio, m] = mes.split('-').map(Number);
  return (new Date(anio, m - 1, 1).getDay() + 6) % 7;
}

export function AgendaDelTaller({ tallerId }: { tallerId: string | number }) {
  const [mes, setMes] = useState(() => elMesDe(new Date()));
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');
  const [elegido, setElegido] = useState('');
  /** Cuando cerrar el día pisaría citas, se pregunta antes. */
  const [preguntaDelDia, setPreguntaDelDia] = useState('');
  const [guardando, setGuardando] = useState(false);

  const carga = useCallback(async () => {
    setCargando(true);
    setFallo('');
    const res = await api.get<Agenda>(`/workshop-locations/${tallerId}/agenda?mes=${mes}`);
    /*
     * Si no se ha podido leer, no se pinta un mes vacío: un calendario en
     * blanco se lee como «no hay nada cerrado», que es justo lo contrario de
     * «no lo sé».
     */
    if (res.ok && res.data) setAgenda(res.data);
    else { setAgenda(null); setFallo('No se ha podido leer la agenda de este taller.'); }
    setCargando(false);
  }, [tallerId, mes]);

  useEffect(() => { void carga(); }, [carga]);
  useEffect(() => { setElegido(''); setPreguntaDelDia(''); }, [mes]);

  const cierreDelDia = (dia: string) => agenda?.cierres.find((c) => c.dia === dia && !c.hora);
  const cierreDeLaHora = (dia: string, hora: string) =>
    agenda?.cierres.find((c) => c.dia === dia && c.hora === hora);
  const citasDe = (dia: string) => (agenda?.citas ?? []).filter((c) => c.dia === dia);
  const citaEn = (dia: string, hora: string) =>
    (agenda?.citas ?? []).find((c) => c.dia === dia && c.hora === hora);

  async function cierra(dia: string, hora: string, motivo = '') {
    setGuardando(true);
    const res = await api.post(`/workshop-locations/${tallerId}/agenda/cierre`, { dia, hora, motivo });
    setGuardando(false);
    setPreguntaDelDia('');
    if (res.ok) await carga();
    else setFallo('No se ha podido cerrar.');
  }

  async function abre(dia: string, hora: string) {
    setGuardando(true);
    const q = new URLSearchParams({ dia, ...(hora ? { hora } : {}) });
    const res = await api.delete(`/workshop-locations/${tallerId}/agenda/cierre?${q}`);
    setGuardando(false);
    if (res.ok) await carga();
    else setFallo('No se ha podido abrir.');
  }

  const diaElegido = agenda?.dias.find((d) => d.dia === elegido);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setMes((m) => { const [a, n] = m.split('-').map(Number); return elMesDe(new Date(a, n - 2, 1)); })}
          className="px-2.5 py-1.5 text-xs border border-brand-200 rounded-lg text-brand-400 hover:bg-brand-50"
        >
          ← Mes anterior
        </button>
        <div className="text-sm font-semibold text-brand-600 capitalize">{comoSeLee(mes)}</div>
        <button
          onClick={() => setMes((m) => { const [a, n] = m.split('-').map(Number); return elMesDe(new Date(a, n, 1)); })}
          className="px-2.5 py-1.5 text-xs border border-brand-200 rounded-lg text-brand-400 hover:bg-brand-50"
        >
          Mes siguiente →
        </button>
      </div>

      {fallo ? (
        <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {fallo}{' '}
          <button onClick={() => void carga()} className="underline font-semibold">Reintentar</button>
        </div>
      ) : null}

      {cargando && !agenda ? (
        <div className="text-center py-10 text-brand-300 text-sm">Cargando…</div>
      ) : !agenda ? null : (
        <>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_DE_LA_SEMANA.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-brand-300">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: loQueSobraDelante(mes) }).map((_, i) => <div key={`hueco-${i}`} />)}

            {agenda.dias.map((d) => {
              const cerrado = Boolean(cierreDelDia(d.dia));
              const citas = citasDe(d.dia).length;
              const horasCerradas = agenda.cierres.filter((c) => c.dia === d.dia && c.hora).length;
              const domingo = d.horas.length === 0;
              const esElElegido = elegido === d.dia;

              return (
                <button
                  key={d.dia}
                  onClick={() => { setElegido(esElElegido ? '' : d.dia); setPreguntaDelDia(''); }}
                  className={[
                    'h-14 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-0.5',
                    esElElegido ? 'border-brand-500 bg-brand-100' : 'border-brand-200 hover:bg-brand-50',
                    cerrado ? 'bg-red-50 text-red-700' : domingo ? 'bg-brand-50 text-brand-300' : 'text-brand-600',
                  ].join(' ')}
                >
                  <span>{Number(d.dia.slice(-2))}</span>
                  <span className="text-[9px] font-medium leading-none">
                    {domingo ? 'dom.' : cerrado ? 'cerrado' : citas ? `${citas} ${citas === 1 ? 'cita' : 'citas'}` : horasCerradas ? `${horasCerradas} h. cerr.` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 border-t border-brand-100 pt-3">
            {!diaElegido ? (
              <p className="text-xs text-brand-300">Elige un día para cerrarlo o para cerrar horas sueltas.</p>
            ) : diaElegido.horas.length === 0 ? (
              <p className="text-xs text-brand-300">Los domingos no se dan citas.</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-brand-600">
                    {new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: '2-digit', month: 'long' })
                      .format(new Date(`${diaElegido.dia}T00:00:00`))}
                  </div>
                  {cierreDelDia(diaElegido.dia) ? (
                    <button
                      disabled={guardando}
                      onClick={() => void abre(diaElegido.dia, '')}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-200 text-brand-500 hover:bg-brand-50 disabled:opacity-50"
                    >
                      Volver a abrir el día
                    </button>
                  ) : (
                    <button
                      disabled={guardando}
                      onClick={() => {
                        const citas = citasDe(diaElegido.dia).length;
                        if (citas > 0) setPreguntaDelDia(diaElegido.dia);
                        else void cierra(diaElegido.dia, '');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Cerrar el día entero
                    </button>
                  )}
                </div>

                {preguntaDelDia === diaElegido.dia ? (
                  <div className="mb-3 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-900">
                    {/* Cerrar no anula nada: quien cierra tiene que saber a quién deja plantado. */}
                    Ese día tiene {citasDe(diaElegido.dia).length}{' '}
                    {citasDe(diaElegido.dia).length === 1 ? 'cita dada' : 'citas dadas'}. Cerrarlo no las anula
                    ni avisa a nadie: solo deja de ofrecer horas nuevas.
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={guardando}
                        onClick={() => void cierra(diaElegido.dia, '')}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50"
                      >
                        Cerrarlo igualmente
                      </button>
                      <button
                        onClick={() => setPreguntaDelDia('')}
                        className="px-3 py-1.5 rounded-lg border border-brand-200 text-brand-500 font-semibold"
                      >
                        Dejarlo como está
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {diaElegido.horas.map((hora) => {
                    const cita = citaEn(diaElegido.dia, hora);
                    const cerrada = Boolean(cierreDeLaHora(diaElegido.dia, hora)) || Boolean(cierreDelDia(diaElegido.dia));
                    const soloLaHora = Boolean(cierreDeLaHora(diaElegido.dia, hora));

                    return (
                      <button
                        key={hora}
                        disabled={guardando || Boolean(cierreDelDia(diaElegido.dia))}
                        title={cita ? `Cita de ${cita.cliente || 'un cliente'}` : undefined}
                        onClick={() => (soloLaHora ? void abre(diaElegido.dia, hora) : void cierra(diaElegido.dia, hora))}
                        className={[
                          'px-2 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50',
                          cita ? 'border-brand-300 bg-brand-100 text-brand-600'
                            : cerrada ? 'border-red-200 bg-red-50 text-red-700'
                              : 'border-brand-200 text-brand-500 hover:bg-brand-50',
                        ].join(' ')}
                      >
                        {hora}
                        <span className="block text-[9px] font-medium">
                          {cita ? 'con cita' : cerrada ? 'cerrada' : 'libre'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="text-[11px] text-brand-300 mt-2">
                  Pulsa una hora libre para cerrarla, y una cerrada para volver a abrirla. Las que tienen cita
                  se cierran igual, pero la cita sigue en pie.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
