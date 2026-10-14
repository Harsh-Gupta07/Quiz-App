import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { CircleCheck, Hourglass, Maximize, Trophy, Users, WifiOff, Zap } from 'lucide-react';
import { OPTION_KEYS, type PublicState } from '@shared/protocol';
import { Stage } from '../components/Stage';
import { Brand, OPTION_STYLE, OptionIcon, TimerRing, formatSeconds } from '../components/ui';
import { Leaderboard } from '../components/Leaderboard';
import { Podium } from '../components/Podium';
import { useSocket } from '../hooks/useSocket';
import { useCountdown } from '../hooks/useCountdown';
import { useHotkeys } from '../hooks/useHotkeys';
import { hintServerTime, request } from '../lib/socket';
import { getJoinBase } from '../lib/api';
import { celebrate } from '../lib/confetti';

export default function PresentPage() {
  const { sessionId = '' } = useParams();
  const [state, setState] = useState<PublicState | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [join, setJoin] = useState<{ base: string; warning: string | null } | null>(null);

  const { socket, connected } = useSocket(async (s) => {
    const res = await request<{ state: PublicState; isAdmin: boolean }>(s, 'present:watch', { sessionId });
    if (res.ok) {
      hintServerTime(res.state.serverNow);
      setState(res.state);
      setIsAdmin(res.isAdmin);
      setError('');
    } else setError(res.error);
  });

  useEffect(() => {
    const onState = (st: PublicState) => {
      hintServerTime(st.serverNow);
      setState(st);
    };
    socket.on('state', onState);
    return () => {
      socket.off('state', onState);
    };
  }, [socket]);

  useEffect(() => {
    void getJoinBase().then(setJoin);
  }, []);

  useEffect(() => {
    if (state) document.title = `${state.title} · SCALive Quiz Arena`;
  }, [state?.title]);

  // Instructor convenience: if this browser is logged in as admin, Enter advances (no visible controls).
  const busy = useRef(false);
  const advance = async () => {
    if (!isAdmin || !state || busy.current) return;
    busy.current = true;
    const res = await request(socket, 'admin:command', { sessionId, action: 'advance', expectedVersion: state.stateVersion });
    window.setTimeout(() => (busy.current = false), 500);
    if (!res.ok && res.code !== 'STALE') {
      setToast(res.error);
      window.setTimeout(() => setToast(''), 2500);
    }
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };
  useHotkeys({ Enter: advance, f: toggleFullscreen });

  const joinUrl = join && state ? `${join.base}/join/${state.code}` : '';

  return (
    <Stage>
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-6">
          <Brand size="xl" />
          <p className="text-4xl font-bold text-navy/70">{error}</p>
        </div>
      ) : !state ? (
        <div className="flex h-full items-center justify-center">
          <Brand size="xl" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${state.status === 'TIME_UP' || state.status === 'QUESTION_ACTIVE' ? 'Q' : state.status}-${state.questionIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0"
          >
            {state.status === 'LOBBY' && <LobbyView state={state} joinUrl={joinUrl} warning={join?.warning ?? null} />}
            {state.status === 'NEXT_QUESTION' && <GetReadyView state={state} />}
            {(state.status === 'QUESTION_ACTIVE' || state.status === 'TIME_UP' || state.status === 'ANSWER_REVEAL') && <QuestionStage state={state} />}
            {state.status === 'LEADERBOARD' && <LeaderboardView state={state} />}
            {state.status === 'FINISHED' && <FinalView state={state} />}
          </motion.div>
        </AnimatePresence>
      )}

      {!connected && (
        <div className="absolute top-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-danger px-6 py-3 text-xl font-bold text-white shadow-lift">
          <WifiOff className="size-6" /> Reconnecting…
        </div>
      )}
      {toast && <div className="absolute bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-full bg-navy px-6 py-3 text-xl font-semibold text-white shadow-lift">{toast}</div>}
      {!document.fullscreenElement && (
        <button onClick={toggleFullscreen} className="absolute right-6 bottom-6 z-30 flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-base font-semibold text-navy/40 opacity-0 transition hover:opacity-100" title="Full screen (F)">
          <Maximize className="size-5" /> Full screen (F)
        </button>
      )}
    </Stage>
  );
}

// ───────────────────────── Header shared by in-game views ─────────────────────────

function GameHeader({ state, right }: { state: PublicState; right?: React.ReactNode }) {
  const progress = state.totalQuestions ? ((state.questionIndex + 1) / state.totalQuestions) * 100 : 0;
  return (
    <div className="absolute inset-x-0 top-0 px-16 pt-10">
      <div className="flex items-center justify-between">
        <Brand size="md" subtitle={state.title} />
        <div className="flex items-center gap-6">
          {right}
          <div className="rounded-full bg-navy px-7 py-3 text-2xl font-bold text-white">
            Question {state.questionIndex + 1} <span className="text-white/50">of {state.totalQuestions}</span>
          </div>
        </div>
      </div>
      <div className="mt-6 h-3 overflow-hidden rounded-full bg-navy/8">
        <motion.div className="h-full rounded-full bg-orange" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.6 }} />
      </div>
    </div>
  );
}

// ───────────────────────── Lobby ─────────────────────────

function LobbyView({ state, joinUrl, warning }: { state: PublicState; joinUrl: string; warning: string | null }) {
  const displayUrl = joinUrl.replace(/^https?:\/\//, '');
  return (
    <div className="flex h-full flex-col px-20 py-14">
      <div className="flex items-center justify-between">
        <Brand size="lg" subtitle="Sharma Computer Academy" />
        <div className="rounded-full bg-white px-6 py-3 text-xl font-semibold text-navy/60 shadow-soft ring-1 ring-navy/5">{state.title}</div>
      </div>

      <div className="mt-10 flex flex-1 items-center gap-20">
        <div className="flex-1">
          <div className="text-2xl font-bold tracking-[0.25em] text-orange uppercase">SCALive Quiz Arena</div>
          <h1 className="mt-4 text-[96px] leading-[1.02] font-extrabold tracking-tight">
            Scan the QR Code
            <br />
            to Join!
          </h1>
          <div className="mt-10 text-3xl text-navy/60">or open</div>
          <div className="mt-2 text-[40px] font-bold break-all text-navy">{displayUrl.replace(/\/join\/.*/, '')}</div>
          <div className="mt-8 flex items-center gap-6">
            <span className="text-3xl text-navy/60">and enter code</span>
            <span className="rounded-3xl bg-navy px-8 py-3 font-mono text-[72px] leading-none font-extrabold tracking-[0.18em] text-white shadow-lift">{state.code}</span>
          </div>
          {warning && <div className="mt-8 max-w-3xl rounded-2xl bg-orange-soft px-6 py-4 text-xl font-semibold text-orange-deep">{warning}</div>}
        </div>

        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }} className="card animate-float p-10 shadow-lift">
          {joinUrl ? <QRCodeSVG value={joinUrl} size={500} level="M" fgColor="#14213D" bgColor="#FFFFFF" /> : <div className="size-[500px]" />}
        </motion.div>
      </div>

      <div className="mt-8 flex items-end justify-between gap-10">
        <div className="flex items-center gap-6">
          <div className="flex size-24 items-center justify-center rounded-3xl bg-orange text-white shadow-soft">
            <Users className="size-12" />
          </div>
          <div>
            <motion.div key={state.participantCount} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="text-[72px] leading-none font-extrabold tabular-nums">
              {state.participantCount}
            </motion.div>
            <div className="text-2xl font-semibold text-navy/55">{state.participantCount === 1 ? 'student joined' : 'students joined'}</div>
          </div>
        </div>
        <div className="flex max-h-[132px] flex-1 flex-wrap-reverse justify-end gap-3 overflow-hidden">
          <AnimatePresence>
            {state.lobbyNames.slice(0, 24).map((name) => (
              <motion.span key={name} layout initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="rounded-full bg-white px-6 py-3 text-2xl font-bold shadow-soft ring-1 ring-navy/5">
                {name}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-center gap-4 rounded-full bg-navy py-5 text-3xl font-bold text-white">
        <span className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="size-3.5 rounded-full bg-orange" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
          ))}
        </span>
        Waiting for Instructor to Start
      </div>
    </div>
  );
}

// ───────────────────────── Get ready ─────────────────────────

function GetReadyView({ state }: { state: PublicState }) {
  const remaining = useCountdown(state.nextQuestionAt);
  const n = Math.max(1, Math.ceil(remaining / 1000));
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="text-3xl font-bold tracking-[0.3em] text-orange uppercase">Get ready</div>
      <h1 className="mt-4 text-[120px] font-extrabold tracking-tight">
        Question {state.questionIndex + 1}
        <span className="text-navy/30"> / {state.totalQuestions}</span>
      </h1>
      <motion.div key={n} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="mt-10 flex size-56 items-center justify-center rounded-full bg-navy text-[120px] font-extrabold text-white shadow-lift">
        {n}
      </motion.div>
      <div className="mt-12 text-3xl font-semibold text-navy/50">{state.timerSeconds} seconds · faster correct answers score more</div>
    </div>
  );
}

// ───────────────────────── Question / Time up / Reveal ─────────────────────────

function QuestionStage({ state }: { state: PublicState }) {
  const remaining = useCountdown(state.status === 'QUESTION_ACTIVE' ? state.questionEndsAt : null);
  const q = state.question;
  const reveal = state.status === 'ANSWER_REVEAL' ? state.reveal : null;
  const timeUp = state.status === 'TIME_UP';
  if (!q) return null;
  const maxCount = reveal ? Math.max(1, ...OPTION_KEYS.map((k) => reveal.counts[k])) : 1;

  return (
    <div className="h-full">
      <GameHeader
        state={state}
        right={
          <div className="flex items-center gap-3 rounded-full bg-white px-6 py-3 text-2xl font-bold shadow-soft ring-1 ring-navy/5">
            <CircleCheck className="size-7 text-green" />
            <span className="tabular-nums">{state.answeredCount}</span>
            <span className="text-navy/45">/ {state.participantCount} answered</span>
          </div>
        }
      />

      <div className="absolute inset-x-16 top-[170px] flex items-start gap-12">
        <h2 className="flex-1 text-[54px] leading-[1.15] font-extrabold tracking-tight">{q.text}</h2>
        <div className="flex w-[340px] shrink-0 justify-end">
          {state.status === 'QUESTION_ACTIVE' ? (
            <TimerRing remainingMs={remaining} totalMs={state.timerSeconds * 1000} size={220} stroke={16} />
          ) : reveal?.fastest ? (
            <FastestCard name={reveal.fastest.name} ms={reveal.fastest.responseTimeMs} compact />
          ) : timeUp ? (
            <div className="flex size-[220px] items-center justify-center rounded-full bg-danger/10 text-danger">
              <Hourglass className="size-24" />
            </div>
          ) : null}
        </div>
      </div>

      <div className="absolute inset-x-16 bottom-14 grid grid-cols-2 gap-6">
        {OPTION_KEYS.map((key, i) => {
          const s = OPTION_STYLE[key];
          const isCorrect = reveal?.correct === key;
          const faded = reveal && !isCorrect;
          const count = reveal?.counts[key] ?? 0;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: faded ? 0.35 : 1, y: 0, scale: isCorrect ? 1.02 : 1 }}
              transition={{ delay: reveal ? 0 : i * 0.08, type: 'spring', stiffness: 200, damping: 22 }}
              className={`relative flex h-[176px] items-center gap-7 overflow-hidden rounded-[28px] px-9 text-white shadow-lift ${s.bg} ${isCorrect ? 'ring-[10px] ring-green/60' : ''}`}
            >
              {reveal && (
                <motion.div className="absolute inset-y-0 left-0 bg-white/14" initial={{ width: 0 }} animate={{ width: `${(count / maxCount) * 100}%` }} transition={{ duration: 0.9, ease: 'easeOut' }} />
              )}
              <span className="relative flex size-[92px] shrink-0 items-center justify-center rounded-3xl bg-white/18">
                <OptionIcon option={key} className="size-12" />
              </span>
              <span className="relative flex-1 text-[36px] leading-tight font-bold">
                <span className="mr-2 opacity-60">{key}</span>
                {q.options[i]}
              </span>
              {reveal && (
                <span className="relative flex items-center gap-3 text-[52px] font-extrabold tabular-nums">
                  {isCorrect && <CircleCheck className="size-14" strokeWidth={2.5} />}
                  {count}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {timeUp && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }} className="absolute inset-0 z-20 flex items-center justify-center bg-ivory/70 backdrop-blur-[2px]">
            <div className="flex items-center gap-8 rounded-[40px] bg-navy px-20 py-12 text-white shadow-lift">
              <Hourglass className="size-24 text-orange" />
              <div>
                <div className="text-[110px] leading-none font-extrabold">Time’s Up!</div>
                <div className="mt-3 text-3xl font-semibold text-white/60">
                  {state.answeredCount} of {state.participantCount} students answered
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {reveal?.explanation && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="absolute inset-x-16 bottom-[440px] text-[26px] font-medium text-navy/60">
          💡 {reveal.explanation}
        </motion.div>
      )}
    </div>
  );
}

function FastestCard({ name, ms, compact = false }: { name: string; ms: number; compact?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.8, rotate: -3 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.4, type: 'spring', stiffness: 220, damping: 15 }} className={`rounded-[28px] bg-navy text-white shadow-lift ${compact ? 'w-[340px] p-7' : 'p-9'}`}>
      <div className={`flex items-center gap-2 font-extrabold tracking-widest text-orange ${compact ? 'text-lg' : 'text-2xl'}`}>
        FASTEST FINGER <Zap className={`fill-orange ${compact ? 'size-5' : 'size-7'}`} />
      </div>
      <div className={`mt-3 truncate font-extrabold ${compact ? 'text-3xl' : 'text-5xl'}`}>{name}</div>
      <div className={`mt-1 font-semibold text-white/65 ${compact ? 'text-xl' : 'text-2xl'}`}>Fastest correct answer — {formatSeconds(ms)}</div>
    </motion.div>
  );
}

// ───────────────────────── Leaderboard ─────────────────────────

function LeaderboardView({ state }: { state: PublicState }) {
  return (
    <div className="h-full">
      <GameHeader state={state} />
      <div className="absolute inset-x-16 top-[150px] bottom-12 flex gap-12">
        <div className="flex-1">
          <div className="mb-6 flex items-baseline gap-5">
            <h1 className="text-[64px] font-extrabold tracking-tight">Leaderboard</h1>
            <span className="text-3xl font-semibold text-navy/45">Top 10 after question {state.questionIndex + 1}</span>
          </div>
          <Leaderboard key={state.questionIndex} entries={state.leaderboard ?? []} size="lg" />
        </div>
        <div className="flex w-[440px] shrink-0 flex-col gap-6 pt-28">
          {state.fastest ? (
            <FastestCard name={state.fastest.name} ms={state.fastest.responseTimeMs} />
          ) : (
            <div className="rounded-[28px] bg-white p-9 text-2xl font-semibold text-navy/50 shadow-soft ring-1 ring-navy/5">
              <Zap className="mb-3 size-8 text-orange" />
              No correct answers on this question.
            </div>
          )}
          <div className="rounded-[28px] bg-white p-9 shadow-soft ring-1 ring-navy/5">
            <div className="text-2xl font-semibold text-navy/50">Players</div>
            <div className="text-6xl font-extrabold tabular-nums">{state.participantCount}</div>
            <div className="mt-5 text-2xl font-semibold text-navy/50">Questions left</div>
            <div className="text-6xl font-extrabold tabular-nums">{state.totalQuestions - state.questionIndex - 1}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Final winners ─────────────────────────

function FinalView({ state }: { state: PublicState }) {
  const board = state.leaderboard ?? [];
  useEffect(() => celebrate(6000), []);
  return (
    <div className="flex h-full flex-col items-center px-16 pt-12">
      <div className="flex w-full items-center justify-between">
        <Brand size="md" subtitle="Sharma Computer Academy" />
        <div className="rounded-full bg-white px-6 py-3 text-xl font-semibold text-navy/60 shadow-soft ring-1 ring-navy/5">{state.title}</div>
      </div>
      <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-4 flex items-center gap-6">
        <Trophy className="size-20 text-gold" />
        <h1 className="text-[96px] font-extrabold tracking-tight">
          SCALive Quiz <span className="text-orange">Champions!</span>
        </h1>
        <Trophy className="size-20 text-gold" />
      </motion.div>
      <div className="mt-6 flex-1">
        {board.length ? <Podium entries={board.slice(0, 3)} /> : <p className="mt-20 text-4xl text-navy/50">No players took part.</p>}
      </div>
      {board.length > 3 && (
        <div className="mb-4 flex gap-4">
          {board.slice(3, 8).map((e) => (
            <div key={e.participantId} className="rounded-full bg-white px-6 py-2.5 text-xl font-semibold shadow-soft ring-1 ring-navy/5">
              <span className="text-navy/40">#{e.rank}</span> {e.name} · <span className="font-extrabold">{e.totalPoints.toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
      )}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.4 }} className="w-full rounded-t-[36px] bg-navy py-7 text-center text-[42px] font-extrabold text-white">
        Congratulations to Our Top Performers! 🎉
      </motion.div>
    </div>
  );
}
