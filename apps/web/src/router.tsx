import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import AppLayout from './components/layout/AppLayout.js';
import LoginPage from './pages/LoginPage.js';
import ForgotPasswordPage from './pages/ForgotPasswordPage.js';
import ResetPasswordPage from './pages/ResetPasswordPage.js';

const DashboardPage     = lazy(() => import('./pages/DashboardPage.js'));
const UsersPage         = lazy(() => import('./pages/UsersPage.js'));
const UserDetailPage    = lazy(() => import('./pages/UserDetailPage.js'));
const MarketplacePage   = lazy(() => import('./pages/MarketplacePage.js'));
const AppointmentsPage  = lazy(() => import('./pages/AppointmentsPage.js'));
const TicketsPage       = lazy(() => import('./pages/TicketsPage.js'));
const TicketDetailPage  = lazy(() => import('./pages/TicketDetailPage.js'));
const WorkshopsPage     = lazy(() => import('./pages/WorkshopsPage.js'));
const IdCarsPage        = lazy(() => import('./pages/IdCarsPage.js'));
const IdCarDetailPage   = lazy(() => import('./pages/IdCarDetailPage.js'));
const BillingPage       = lazy(() => import('./pages/BillingPage.js'));
const LeadsPage         = lazy(() => import('./pages/LeadsPage.js'));
const FunnelPage            = lazy(() => import('./pages/FunnelPage.js'));
const ConsentimientosPage       = lazy(() => import('./pages/ConsentimientosPage.js'));
const MarketingAnalyticsPage    = lazy(() => import('./pages/MarketingAnalyticsPage.js'));
const ContractsPage             = lazy(() => import('./pages/ContractsPage.js'));
const ProviderBillingPage       = lazy(() => import('./pages/ProviderBillingPage.js'));

const Loader = () => (
  <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
    Cargando…
  </div>
);

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',         element: <Suspense fallback={<Loader />}><DashboardPage /></Suspense> },
      { path: 'users',             element: <Suspense fallback={<Loader />}><UsersPage /></Suspense> },
      { path: 'users/:id',         element: <Suspense fallback={<Loader />}><UserDetailPage /></Suspense> },
      { path: 'marketplace',       element: <Suspense fallback={<Loader />}><MarketplacePage /></Suspense> },
      { path: 'appointments',      element: <Suspense fallback={<Loader />}><AppointmentsPage /></Suspense> },
      { path: 'tickets',           element: <Suspense fallback={<Loader />}><TicketsPage /></Suspense> },
      { path: 'tickets/:id',       element: <Suspense fallback={<Loader />}><TicketDetailPage /></Suspense> },
      { path: 'workshops',         element: <Suspense fallback={<Loader />}><WorkshopsPage /></Suspense> },
      { path: 'idcars',            element: <Suspense fallback={<Loader />}><IdCarsPage /></Suspense> },
      { path: 'idcars/:id',        element: <Suspense fallback={<Loader />}><IdCarDetailPage /></Suspense> },
      { path: 'billing',           element: <Suspense fallback={<Loader />}><BillingPage /></Suspense> },
      { path: 'leads',             element: <Suspense fallback={<Loader />}><LeadsPage /></Suspense> },
      { path: 'funnel',             element: <Suspense fallback={<Loader />}><FunnelPage /></Suspense> },
      { path: 'consentimientos',      element: <Suspense fallback={<Loader />}><ConsentimientosPage /></Suspense> },
      { path: 'marketing-analytics', element: <Suspense fallback={<Loader />}><MarketingAnalyticsPage /></Suspense> },
      { path: 'contracts',          element: <Suspense fallback={<Loader />}><ContractsPage /></Suspense> },
      { path: 'provider-billing',   element: <Suspense fallback={<Loader />}><ProviderBillingPage /></Suspense> },
      { path: '*',                 element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
