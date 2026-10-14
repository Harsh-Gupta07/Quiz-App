import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { api } from '../../lib/api';
import { Brand, ErrorNote, Spinner } from '../../components/ui';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { method: 'POST', json: { password } });
      const next = params.get('next');
      navigate(next && next.startsWith('/admin') ? next : '/admin', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-dots flex min-h-screen items-center justify-center p-5">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5 p-8">
        <Brand size="md" subtitle="Instructor Console" />
        <div>
          <h1 className="text-2xl font-extrabold">Welcome back</h1>
          <p className="mt-1 text-sm text-navy/55">Enter the admin password to manage quizzes.</p>
        </div>
        <div>
          <label className="label" htmlFor="pw">
            Password
          </label>
          <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" required />
        </div>
        <ErrorNote>{error}</ErrorNote>
        <button className="btn btn-primary w-full" disabled={busy || !password}>
          {busy ? <Spinner /> : <LogIn className="size-5" />} Log in
        </button>
      </form>
    </div>
  );
}
