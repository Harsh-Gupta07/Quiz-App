import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  ChartColumn,
  Check,
  CircleStop,
  Copy,
  Eye,
  EyeOff,
  Flag,
  Keyboard,
  Lock,
  LockOpen,
  Monitor,
  SkipForward,
  UserX,
  Users,
  Zap,
} from 'lucide-react';
import { OPTION_KEYS, type AdminAction, type AdminState } from '@shared/protocol';
import { useSocket } from '../../hooks/useSocket';
import { useCountdown } from '../../hooks/useCountdown';
import { useHotkeys } from '../../hooks/useHotkeys';
import { hintServerTime, request } from '../../lib/socket';
import { getJoinBase } from '../../lib/api';
import { ConnectionPill, ErrorNote, OPTION_STYLE, OptionIcon, Spinner, TimerRing, formatSeconds } from '../../components/ui';
import { Leaderboard } from '../../components/Leaderboard';
import { StatusChip } from './Dashboard';

const PHASE_TEXT: Record<string, string> = {
  LOBBY: 'Lobby — students are scanning the QR code and joining.',
  NEXT_QUESTION: 'Get ready — the question starts in a moment.',
  QUESTION_ACTIVE: 'Question is live — the server timer is running.',
  TIME_UP: 'Time’s up! Answers are closed. Reveal the results when ready.',
  ANSWER_REVEAL: 'Correct answer revealed with the answer distribution.',
  LEADERBOARD: 'Leaderboard on screen. Continue when the class is ready.',
  FINISHED: 'Quiz finished — the champions podium is on screen.',
};

export default function SessionControl() {
  const { id = '' } = useParams();
  const [admin, setAdmin] = useState<AdminState | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [hideAnswers, setHideAnswers] = useState(false);
  const [join, setJoin] = useState<{ base: string; warning: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const busyRef = useRef(false);

  const { socket, connected } = useSocket(async (s) => {
    const res = await request<{ state: AdminState }>(s, 'admin:watch', { sessionId: id });
    if (res.ok) {
      hintServerTime(res.state.public.serverNow);
      setAdmin(res.state);
      setError('');
    } else if (res.code === 'UNAUTHORIZED') {
      window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
    } else setError(res.error);
  });

  useEffect(() => {
    const onState = (st: AdminState) => {
      hintServerTime(st.public.serverNow);
      setAdmin(st);
    };
    socket.on('admin:state', onState);
    return () => {
      socket.off('admin:state', onState);
    };
  }, [socket]);

  useEffect(() => {
    void getJoinBase().then(setJoin);
  }, []);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((n) => (n === text ? '' : n)), 3000);
  };

  const command = async (action: AdminAction) => {
    if (!admin || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const res = await request(socket, 'admin:command', { sessionId: id, action, expectedVersion: admin.public.stateVersion });
    // Short cooldown so a double-tapped Enter can never skip a stage.
    window.setTimeout(() => {
      busyRef.current = false;
      setBusy(false);
    }, 450);
    if (!res.ok && res.code !== 'STALE') flash(res.error);
  };

  const openPresentation = () => window.open(`/present/${id}`, `scalive-present-${id}`);

  const endQuiz = () => {
    if (confirm('End the quiz now and show the final winners?')) void command('finish');
  };

  useHotkeys(
    {
      Enter: () => (admin?.primaryAction ? void command('advance') : admin?.public.status === 'QUESTION_ACTIVE' && flash('Timer is running — press E to end the question early.')),
      p: openPresentation,
      h: () => setHideAnswers((h) => !h),
      e: () => admin?.public.status === 'QUESTION_ACTIVE' && void command('endQuestion'),
    },
    !!admin,
  );

  const toggleLock = async () => {
    if (!admin) return;
    const res = await request(socket, 'admin:setLock', { sessionId: id, lock: !admin.lockJoinOnStart });
    if (!res.ok) flash(res.error);
  };

  const kick = async (participantId: string, name: string) => {
    if (!confirm(`Remove "${name}" from this quiz? Their answers will be deleted.`)) return;
    const res = await request(socket, 'admin:kick', { sessionId: id, participantId });
    if (!res.ok) flash(res.error);
  };

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-5 py-20 text-center">
        <ErrorNote>{error}</ErrorNote>
        <Link to="/admin" className="btn btn-ghost mt-6">
          Back to dashboard
        </Link>
      </main>
    );
  }
  if (!admin) {
    return (
      <div className="flex justify-center py-20 text-navy/40">
        <Spinner className="size-8" />
      </div>
    );
  }

  const st = admin.public;
  const joinUrl = join ? `${join.base}/join/${st.code}` : '';
  const copyLink = async () => {
    await navigator.clipboard?.writeText(joinUrl).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="mx-auto max-w-7xl px-5 py-6">
      <Link to="/admin" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-navy/55 hover:text-navy">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>

      {/* Header */}
      <section className="card flex flex-wrap items-center justify-between gap-5 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={st.status} />
            <ConnectionPill connected={connected} />
            <span className="chip bg-ivory-deep text-navy/70">{st.timerSeconds}s per question</span>
          </div>
          <h1 className="mt-2 truncate text-2xl font-extrabold">{st.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-navy px-5 py-2 text-center text-white">
            <div className="text-[10px] font-bold tracking-widest text-white/50 uppercase">Join code</div>
            <div className="font-mono text-2xl font-extrabold tracking-[0.2em]">{st.code}</div>
          </div>
          <button className="btn btn-ghost" onClick={copyLink} title="Copy student join link">
            {copied ? <Check className="size-4 text-green" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy link'}
          </button>
          <button className="btn btn-navy" onClick={openPresentation}>
            <Monitor className="size-4" /> Presentation <span className="kbd">P</span>
          </button>
          <Link to={`/admin/session/${id}/results`} className="btn btn-ghost">
            <ChartColumn className="size-4" /> Results
          </Link>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Stage control */}
        <section className="space-y-6">
          <div className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold tracking-widest text-orange uppercase">
                  {st.questionIndex >= 0 ? `Question ${st.questionIndex + 1} of ${st.totalQuestions}` : `${st.totalQuestions} questions ready`}
                </div>
                <p className="mt-1 font-semibold text-navy/70">{PHASE_TEXT[st.status]}</p>
              </div>
              <button className="btn btn-ghost px-3 py-2 text-sm" onClick={() => setHideAnswers((h) => !h)} title="Hide answers if this screen is visible to students (H)">
                {hideAnswers ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {hideAnswers ? 'Answers hidden' : 'Answers visible'}
              </button>
            </div>

            <StagePreview admin={admin} hideAnswers={hideAnswers} />

            {/* Controls */}
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-navy/5 pt-5">
              {admin.primaryAction ? (
                <button className="btn btn-primary min-w-64 flex-1 py-4 text-lg" onClick={() => void command('advance')} disabled={busy || !connected}>
                  {busy ? <Spinner /> : <SkipForward className="size-5" />} {admin.primaryAction.label}
                  <span className="kbd ml-2 bg-white/25 text-white shadow-none">Enter ⏎</span>
                </button>
              ) : st.status === 'QUESTION_ACTIVE' ? (
                <>
                  <div className="btn flex-1 cursor-default bg-ivory-deep py-4 text-lg text-navy/50">Timer running…</div>
                  <button className="btn btn-ghost py-4" onClick={() => void command('endQuestion')} disabled={busy}>
                    <CircleStop className="size-5" /> End question now <span className="kbd">E</span>
                  </button>
                </>
              ) : st.status === 'NEXT_QUESTION' ? (
                <div className="btn flex-1 cursor-default bg-ivory-deep py-4 text-lg text-navy/50">
                  <Spinner /> Starting question…
                </div>
              ) : (
                <div className="btn flex-1 cursor-default bg-green-soft py-4 text-lg text-green-deep">
                  <Flag className="size-5" /> Quiz complete
                </div>
              )}
              {st.status !== 'FINISHED' && st.status !== 'LOBBY' && (
                <button className="btn btn-danger py-4" onClick={endQuiz} disabled={busy}>
                  End quiz
                </button>
              )}
            </div>
            {notice && <div className="mt-3 rounded-xl bg-orange-soft px-4 py-2 text-sm font-semibold text-orange-deep">{notice}</div>}
          </div>

          {st.leaderboard && st.leaderboard.length > 0 && (
            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-extrabold">Top 10</h2>
                {st.fastest && (
                  <span className="chip bg-navy text-white">
                    <Zap className="size-3.5 fill-orange text-orange" /> {st.fastest.name} · {formatSeconds(st.fastest.responseTimeMs)}
                  </span>
                )}
              </div>
              <Leaderboard key={`${st.questionIndex}-${st.status === 'FINISHED'}`} entries={st.leaderboard} animateFromPrevious={false} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-navy/50">
            <Keyboard className="size-4" />
            <span>
              <span className="kbd">Enter</span> next step
            </span>
            <span>
              <span className="kbd">E</span> end question early
            </span>
            <span>
              <span className="kbd">P</span> open presentation
            </span>
            <span>
              <span className="kbd">H</span> hide answers
            </span>
          </div>
        </section>

        {/* Sidebar */}
        <aside className="space-y-6">
          {st.status === 'LOBBY' && (
            <div className="card p-5 text-center">
              {joinUrl && (
                <div className="mx-auto w-fit rounded-2xl bg-white p-3 ring-1 ring-navy/5">
                  <QRCodeSVG value={joinUrl} size={180} fgColor="#14213D" />
                </div>
              )}
              <div className="mt-3 text-xs font-medium break-all text-navy/55">{joinUrl}</div>
              {join?.warning && <div className="mt-3 rounded-xl bg-orange-soft p-3 text-left text-xs font-semibold text-orange-deep">{join.warning}</div>}
            </div>
          )}

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-extrabold">
                <Users className="size-5 text-orange" /> {st.participantCount} <span className="font-semibold text-navy/45">players</span>
              </h2>
              <span className="text-sm font-semibold text-green-deep">{st.onlineCount} online</span>
            </div>
            {st.questionIndex >= 0 && st.status !== 'FINISHED' && (
              <div className="mt-3">
                <div className="flex justify-between text-xs font-semibold text-navy/55">
                  <span>Answered this question</span>
                  <span>
                    {st.answeredCount}/{st.participantCount}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-navy/8">
                  <div className="h-full rounded-full bg-green transition-all" style={{ width: `${st.participantCount ? (st.answeredCount / st.participantCount) * 100 : 0}%` }} />
                </div>
              </div>
            )}
            <button onClick={toggleLock} className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-ivory p-3 text-left text-sm transition hover:bg-ivory-deep">
              {st.joinLocked ? <Lock className="size-5 text-orange" /> : <LockOpen className="size-5 text-green" />}
              <span className="flex-1">
                <span className="block font-semibold">{st.joinLocked ? 'New registrations locked' : 'Registrations open'}</span>
                <span className="text-xs text-navy/55">{admin.lockJoinOnStart ? 'Locks when the quiz starts (click to keep open)' : 'Late joiners allowed (click to lock after start)'}</span>
              </span>
            </button>
            <ul className="mt-4 max-h-[520px] space-y-1 overflow-y-auto pr-1">
              {admin.participants.length === 0 && <li className="py-6 text-center text-sm text-navy/45">Waiting for students to join…</li>}
              {[...admin.participants].reverse().map((p) => (
                <li key={p.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ivory">
                  <span className={`size-2.5 shrink-0 rounded-full ${p.online ? 'bg-green' : 'bg-navy/20'}`} title={p.online ? 'Online' : 'Offline'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.name}</span>
                    {p.rollNo && <span className="block truncate text-xs text-navy/45">{p.rollNo}</span>}
                  </span>
                  {st.status === 'QUESTION_ACTIVE' || st.status === 'TIME_UP' ? (
                    p.answeredCurrent ? <Check className="size-4 text-green" aria-label="Answered" /> : <span className="text-xs text-navy/30">…</span>
                  ) : (
                    <span className="text-sm font-bold tabular-nums">{p.totalPoints}</span>
                  )}
                  <button className="rounded-lg p-1 text-navy/30 opacity-0 transition group-hover:opacity-100 hover:bg-danger/10 hover:text-danger focus:opacity-100" onClick={() => kick(p.id, p.name)} title="Remove participant" aria-label={`Remove ${p.name}`}>
                    <UserX className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}

function StagePreview({ admin, hideAnswers }: { admin: AdminState; hideAnswers: boolean }) {
  const st = admin.public;
  const remaining = useCountdown(st.status === 'QUESTION_ACTIVE' ? st.questionEndsAt : null);
  const nextIn = useCountdown(st.status === 'NEXT_QUESTION' ? st.nextQuestionAt : null);
  const q = st.questionIndex >= 0 ? admin.questions[st.questionIndex] : null;
  const showCorrect = !hideAnswers || st.status === 'ANSWER_REVEAL' || st.status === 'LEADERBOARD';
  const counts = admin.liveCounts;
  const total = counts ? Math.max(1, counts.A + counts.B + counts.C + counts.D) : 1;

  if (st.status === 'LOBBY') {
    return (
      <div className="mt-5 rounded-2xl bg-ivory p-6 text-center">
        <div className="text-5xl font-extrabold tabular-nums">{st.participantCount}</div>
        <div className="font-semibold text-navy/55">students joined</div>
        <p className="mx-auto mt-3 max-w-md text-sm text-navy/50">Open the presentation on the projector, let students scan the QR code, then press Enter to start.</p>
      </div>
    );
  }
  if (st.status === 'FINISHED' || !q) {
    return null;
  }
  const options = q.options;

  return (
    <div className="mt-5 flex flex-col gap-5 md:flex-row">
      <div className="min-w-0 flex-1">
        <h3 className="text-xl leading-snug font-bold">{q.text}</h3>
        <div className="mt-4 space-y-2">
          {OPTION_KEYS.map((key, i) => {
            const s = OPTION_STYLE[key];
            const isCorrect = showCorrect && admin.currentCorrect === key;
            const c = counts?.[key] ?? 0;
            return (
              <div key={key} className={`relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 ring-1 ${isCorrect ? 'bg-green-soft ring-green' : 'bg-ivory ring-navy/5'}`}>
                <div className={`absolute inset-y-0 left-0 opacity-15 ${s.bg}`} style={{ width: `${(c / total) * 100}%` }} />
                <span className={`relative flex size-8 shrink-0 items-center justify-center rounded-lg text-white ${s.bg}`}>
                  <OptionIcon option={key} className="size-3.5" />
                </span>
                <span className="relative flex-1 text-sm font-semibold">
                  <span className="text-navy/40">{key}.</span> {options[i]}
                </span>
                {isCorrect && <Check className="relative size-5 text-green-deep" strokeWidth={3} />}
                <span className="relative w-8 text-right text-sm font-extrabold tabular-nums">{c}</span>
              </div>
            );
          })}
        </div>
        {showCorrect && admin.currentExplanation && <p className="mt-3 text-sm text-navy/55">💡 {admin.currentExplanation}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-center justify-center gap-2 md:w-44">
        {st.status === 'QUESTION_ACTIVE' ? (
          <TimerRing remainingMs={remaining} totalMs={st.timerSeconds * 1000} size={140} />
        ) : st.status === 'NEXT_QUESTION' ? (
          <div className="flex size-[140px] items-center justify-center rounded-full bg-navy text-5xl font-extrabold text-white">{Math.max(1, Math.ceil(nextIn / 1000))}</div>
        ) : (
          <div className="rounded-2xl bg-ivory px-4 py-3 text-center text-sm font-bold text-navy/60">{st.status === 'TIME_UP' ? 'Time’s up' : 'Revealed'}</div>
        )}
        <div className="text-center text-sm font-semibold text-navy/55">
          {st.answeredCount}/{st.participantCount} answered
        </div>
      </div>
    </div>
  );
}
