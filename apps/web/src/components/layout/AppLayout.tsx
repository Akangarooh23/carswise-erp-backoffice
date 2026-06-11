import { useState, useEffect, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../store/auth.js';
import { api } from '../../api/client.js';
import Sidebar from './Sidebar.js';

interface LeadStats { pending: number; }

export default function AppLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [pendingLeads, setPendingLeads] = useState(0);
  const [toast, setToast]               = useState<string | null>(null);
  const prevPendingRef = useRef<number | null>(null);
  const toastTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    async function poll() {
      const r = await api.get<LeadStats>('/leads/stats');
      if (!r.ok) return;
      const current = r.data.pending ?? 0;
      setPendingLeads(current);
      if (prevPendingRef.current !== null && current > prevPendingRef.current) {
        const delta = current - prevPendingRef.current;
        showToast(`📩 ${delta} nuevo${delta > 1 ? 's' : ''} lead${delta > 1 ? 's' : ''} pendiente${delta > 1 ? 's' : ''}`);
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
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingLeads={pendingLeads} />

      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Abrir menú"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect x="2" y="4" width="16" height="2" rx="1" />
              <rect x="2" y="9" width="16" height="2" rx="1" />
              <rect x="2" y="14" width="16" height="2" rx="1" />
            </svg>
          </button>
          <span className="text-sm font-bold text-slate-800">🚗 CarsWise</span>
        </div>

        <div className="max-w-[1400px] mx-auto p-4 md:p-6 fade-in">
          <Outlet />
        </div>
      </main>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-white border border-slate-200 shadow-xl rounded-xl px-4 py-3 text-sm font-medium text-slate-800">
          <span>{toast}</span>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-600 text-base leading-none"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
