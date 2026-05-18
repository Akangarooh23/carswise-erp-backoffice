import { useState, FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';

export default function ResetPasswordPage() {
  const [params]                  = useSearchParams();
  const navigate                  = useNavigate();
  const token                     = params.get('token') ?? '';
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.error === 'invalid_or_expired_token') {
          setError('Este enlace ya no es válido o ha expirado. Solicita uno nuevo.');
        } else {
          setError('Error al cambiar la contraseña. Inténtalo de nuevo.');
        }
        return;
      }
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 shadow-2xl text-center max-w-sm w-full space-y-4">
          <div className="text-4xl">⚠️</div>
          <p className="text-slate-700 font-semibold">Enlace inválido</p>
          <p className="text-slate-500 text-sm">El enlace de recuperación no es válido.</p>
          <Link to="/forgot-password" className="block text-sm text-blue-600 hover:underline">
            Solicitar un nuevo enlace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white text-2xl mb-4 shadow-lg">
            🔑
          </div>
          <h1 className="text-white text-xl font-bold">Nueva contraseña</h1>
          <p className="text-slate-400 text-sm mt-1">CarsWise ERP</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          {done ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">✅</div>
              <p className="text-slate-700 font-semibold">Contraseña actualizada</p>
              <p className="text-slate-500 text-sm">
                Tu contraseña ha sido cambiada correctamente. Redirigiendo al inicio de sesión…
              </p>
              <Link to="/login" className="block text-sm text-blue-600 hover:underline">
                Ir al inicio de sesión ahora
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {loading ? 'Guardando…' : 'Establecer nueva contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
