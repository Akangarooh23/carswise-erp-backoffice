import { useState, useEffect, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../store/auth.js';
import { api } from '../../api/client.js';
import Sidebar from './Sidebar.js';
import PaletaComandos from '../ui/PaletaComandos.js';
import AyudaAtajos from '../ui/AyudaAtajos.js';
import { useAtajos } from '../../hooks/useAtajos.js';

interface LeadStats { pending: number; }

export default function AppLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [pendingLeads, setPendingLeads] = useState(0);
  const [visitasPorConfirmar, setVisitasPorConfirmar] = useState(0);
  const [toast, setToast]               = useState<string | null>(null);

  // Los atajos. El hook se llama siempre, tambien sin sesion: React exige que
  // el orden de los hooks no cambie entre renders.
  const atajos = useAtajos(user?.role ?? 'support');
  const prevPendingRef = useRef<number | null>(null);
  const toastTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    async function poll() {
      // Las visitas por confirmar, en el mismo sondeo. Sin esto solo se veían
      // entrando en la Agenda, y una visita que nadie confirma deja al cliente
      // esperando sin que salte nada en ninguna parte.
      api.get<{ bookings?: unknown[] }>('/all-bookings?status=pending')
        .then((v) => {
          if (!v.ok) return;
          const lista = v.data?.bookings ?? [];
          setVisitasPorConfirmar(lista.length);
        })
        .catch(() => {});

      const r = await api.get<LeadStats>('/leads/stats');
      if (!r.ok) return;
      const current = r.data.pending ?? 0;
      setPendingLeads(current);
      if (prevPendingRef.current !== null && current > prevPendingRef.current) {
        const delta = current - prevPendingRef.current;
        showToast(`${delta} nuevo${delta > 1 ? 's' : ''} lead${delta > 1 ? 's' : ''} pendiente${delta > 1 ? 's' : ''}`);
        window.dispatchEvent(new CustomEvent('cw:new-leads', { detail: { count: delta } }));
      }
      prevPendingRef.current = current;
    }

    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [user]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-brand-50">
      <PaletaComandos abierta={atajos.paleta} cerrar={atajos.cerrarPaleta} rol={user.role} />
      <AyudaAtajos abierta={atajos.ayuda} cerrar={atajos.cerrarAyuda} rol={user.role} />
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingLeads={pendingLeads} visitasPorConfirmar={visitasPorConfirmar} />

      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-200 bg-white md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-brand-400 hover:bg-brand-100 transition-colors"
            aria-label="Abrir menú"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect x="2" y="4" width="16" height="2" rx="1" />
              <rect x="2" y="9" width="16" height="2" rx="1" />
              <rect x="2" y="14" width="16" height="2" rx="1" />
            </svg>
          </button>
          <span className="text-sm font-bold text-brand-600"><span className="text-acento-texto">Pop</span>Car</span>
        </div>

        <div className="max-w-[1400px] mx-auto p-4 md:p-6 fade-in">
          <Outlet />
        </div>
      </main>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-white border border-brand-200 shadow-xl rounded-xl px-4 py-3 text-sm font-medium text-brand-600">
          <span>{toast}</span>
          <button
            onClick={() => setToast(null)}
            className="text-brand-300 hover:text-brand-400 text-base leading-none"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
