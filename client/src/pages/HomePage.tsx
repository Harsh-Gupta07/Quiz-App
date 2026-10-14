import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import { Brand } from '../components/ui';

export function HomePage() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (clean.length === 6) navigate(`/join/${clean}`);
  };

  return (
    <div className="bg-dots flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Brand size="md" />
        <Link to="/admin" className="btn btn-ghost px-4 py-2 text-sm">
          <Lock className="size-4" /> Instructor
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-md text-center">
          <p className="chip mx-auto mb-5 bg-orange-soft text-orange-deep">Sharma Computer Academy · Bhopal</p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Join the <span className="text-orange">live quiz</span>
          </h1>
          <p className="mt-3 text-lg text-navy/60">Enter the 6-character code shown on the screen.</p>
          <form onSubmit={submit} className="card mt-8 space-y-4 p-5">
            <input
              className="input text-center font-mono text-3xl font-extrabold tracking-[0.35em] uppercase"
              placeholder="ABC123"
              value={clean}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              aria-label="Quiz code"
              autoFocus
            />
            <button className="btn btn-primary w-full py-4 text-lg" disabled={clean.length !== 6}>
              Continue <ArrowRight className="size-5" />
            </button>
          </form>
        </div>
      </main>
      <footer className="pb-6 text-center text-sm text-navy/40">SCALive Quiz Arena</footer>
    </div>
  );
}
