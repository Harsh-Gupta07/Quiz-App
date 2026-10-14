import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { api } from '../../lib/api';
import { Brand, Spinner } from '../../components/ui';

export default function AdminShell() {
  const [status, setStatus] = useState<'checking' | 'in' | 'out'>('checking');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    api<{ authenticated: boolean }>('/api/auth/me')
      .then((r) => setStatus(r.authenticated ? 'in' : 'out'))
      .catch(() => setStatus('out'));
  }, []);

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center text-navy/40">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (status === 'out') return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />;

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-navy/5 bg-ivory/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <Link to="/admin" aria-label="Dashboard">
            <Brand size="sm" subtitle="Instructor Console" />
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/admin" className="btn btn-ghost px-4 py-2 text-sm">
              Dashboard
            </Link>
            <button onClick={logout} className="btn btn-ghost px-3 py-2 text-sm" title="Log out">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
