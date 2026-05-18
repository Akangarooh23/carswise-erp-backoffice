import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../store/auth.js';
import Sidebar from './Sidebar.js';

export default function AppLayout() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto p-6 fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
