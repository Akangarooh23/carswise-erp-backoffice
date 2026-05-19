import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../store/auth.js';
import Sidebar from './Sidebar.js';

export default function AppLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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
    </div>
  );
}
