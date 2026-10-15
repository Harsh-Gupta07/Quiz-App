import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Circle, Diamond, LoaderCircle, Square, Triangle, Wifi, WifiOff, X } from 'lucide-react';
import type { OptionKey } from '@shared/protocol';

// ───────────────────────── Brand ─────────────────────────

export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return <img src="/scalive-logo.png" alt="SCALive — Sharma Computer Academy" height={size} style={{ height: size }} className={`w-auto ${className}`} />;
}

export function Brand({
  size = 'md',
  tone = 'dark',
  subtitle = 'Quiz Arena',
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'dark' | 'light';
  subtitle?: string | null;
}) {
  const dims = { sm: [32, 'text-base', 'text-[10px]'], md: [44, 'text-xl', 'text-xs'], lg: [64, 'text-3xl', 'text-sm'], xl: [96, 'text-5xl', 'text-xl'] }[size] as [
    number,
    string,
    string,
  ];
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={dims[0]} />
      {subtitle && (
        <div className={`border-l pl-3 leading-none ${tone === 'dark' ? 'border-navy/15' : 'border-white/20'}`}>
          <div className={`${dims[2]} font-semibold uppercase tracking-[0.18em] ${tone === 'dark' ? 'text-navy/50' : 'text-white/60'}`}>{subtitle}</div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Options ─────────────────────────

export const OPTION_STYLE: Record<
  OptionKey,
  { bg: string; soft: string; text: string; ring: string; hex: string; Icon: typeof Triangle; name: string }
> = {
  A: { bg: 'bg-orange', soft: 'bg-orange-soft', text: 'text-orange-deep', ring: 'ring-orange', hex: '#D97757', Icon: Triangle, name: 'Triangle' },
  B: { bg: 'bg-blue-deep', soft: 'bg-blue-soft', text: 'text-blue-deep', ring: 'ring-blue', hex: '#4B7FB3', Icon: Diamond, name: 'Diamond' },
  C: { bg: 'bg-green', soft: 'bg-green-soft', text: 'text-green-deep', ring: 'ring-green', hex: '#788C5D', Icon: Circle, name: 'Circle' },
  D: { bg: 'bg-navy', soft: 'bg-navy/10', text: 'text-navy', ring: 'ring-navy', hex: '#14213D', Icon: Square, name: 'Square' },
};

/** Letter badge with the option's shape — colour is never the only cue. */
export function OptionBadge({ option, size = 40 }: { option: OptionKey; size?: number }) {
  const { Icon } = OPTION_STYLE[option];
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-xl bg-white/18 font-extrabold text-white ring-1 ring-white/25"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      <Icon className="absolute fill-white/15 text-white/0" style={{ width: size * 0.8, height: size * 0.8 }} strokeWidth={0} aria-hidden />
      <span className="relative">{option}</span>
    </span>
  );
}

export function OptionIcon({ option, className = 'size-5' }: { option: OptionKey; className?: string }) {
  const { Icon } = OPTION_STYLE[option];
  return <Icon className={`${className} fill-current`} strokeWidth={0} aria-hidden />;
}

// ───────────────────────── Timer ─────────────────────────

export function TimerRing({ remainingMs, totalMs, size = 120, stroke = 10 }: { remainingMs: number; totalMs: number; size?: number; stroke?: number }) {
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const urgent = remainingMs > 0 && remainingMs <= 3000;
  const done = remainingMs <= 0;
  const color = done ? '#C2412D' : urgent ? (seconds <= 1 ? '#C2412D' : '#D97757') : '#14213D';
  return (
    <div
      className={`relative inline-flex items-center justify-center ${urgent ? 'animate-pulse-soft' : ''}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`${seconds} seconds remaining`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="white" stroke="rgb(20 33 61 / 0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
        />
      </svg>
      <span className="absolute font-extrabold tabular-nums" style={{ color, fontSize: size * 0.38 }}>
        {seconds}
      </span>
    </div>
  );
}

// ───────────────────────── Misc ─────────────────────────

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return <LoaderCircle className={`${className} animate-spin`} aria-hidden />;
}

export function ConnectionPill({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="chip bg-green-soft text-green-deep">
      <Wifi className="size-3.5" /> Live
    </span>
  ) : (
    <span className="chip bg-danger/10 text-danger">
      <WifiOff className="size-3.5" /> Reconnecting…
    </span>
  );
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-4 backdrop-blur-sm sm:items-center" onMouseDown={onClose}>
      <div role="dialog" aria-modal aria-label={title} className={`card w-full ${width} max-h-[90vh] overflow-y-auto p-6`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button className="rounded-full p-2 text-navy/50 hover:bg-ivory-deep" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Animated number that counts from its previous value to the new one. */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const initial = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(initial + (value - initial) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);
  return <>{display.toLocaleString('en-IN')}</>;
}

export function formatSeconds(ms: number | null | undefined, digits = 2) {
  if (ms === null || ms === undefined) return '—';
  return `${(ms / 1000).toFixed(digits)}s`;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="rounded-2xl bg-danger/8 px-4 py-3 text-sm font-medium text-danger ring-1 ring-danger/15">{children}</div>;
}
