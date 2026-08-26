import { useState, FormEvent } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../store/auth.js';
import { api } from '../api/client.js';
import Icono from '../components/ui/Icono.js';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // Redirigir se declara, no se ejecuta pintando: llamar aqui a navigate()
  // cambia el enrutador en mitad del pintado de esta misma pantalla.
  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(email, password);
      if (!res.ok) {
        setError(res.error === 'invalid_credentials' ? 'Email o contraseña incorrectos' : 'Error al iniciar sesión');
        return;
      }
      login(res.token, res.user, res.refresh_token);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-600 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-acento text-brand-700 mb-4 shadow-lg">
            <Icono nombre="coche" tam={30} />
          </div>
          <h1 className="text-white text-xl font-bold"><span className="text-acento">Pop</span>Car ERP</h1>
          <p className="text-brand-300 text-sm mt-1">Backoffice interno</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-2xl space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-500 mb-1.5">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu correo de trabajo"
              className="w-full px-3 py-2.5 border border-brand-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-acento focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-500 mb-1.5">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-brand-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-acento focus:border-transparent"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Entrando…' : 'Iniciar sesión'}
          </button>

          <div className="text-center">
            <Link to="/forgot-password" className="text-xs text-brand-300 hover:text-brand-600 transition-colors">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </form>

        <p className="text-center text-brand-400 text-xs mt-6">
          Solo acceso para personal interno de PopCar
        </p>
      </div>
    </div>
  );
}
