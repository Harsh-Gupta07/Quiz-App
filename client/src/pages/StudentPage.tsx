import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Hourglass,
  PartyPopper,
  Trophy,
  Zap,
} from 'lucide-react';
import { OPTION_KEYS, type JoinResult, type MeState, type OptionKey, type PublicState } from '@shared/protocol';
import { useSocket } from '../hooks/useSocket';
import { useCountdown } from '../hooks/useCountdown';
import { hintServerTime, request } from '../lib/socket';
import { api, ApiError } from '../lib/api';
import { celebrate, smallBurst } from '../lib/confetti';
import { Brand, ConnectionPill, ErrorNote, OPTION_STYLE, OptionIcon, Spinner, formatSeconds } from '../components/ui';

interface Saved {
  token: string;
  name: string;
}
const storageKey = (code: string) => `scalive:participant:${code}`;
const loadSaved = (code: string): Saved | null => {
  try {
    const raw = localStorage.getItem(storageKey(code));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
};
const save = (code: string, v: Saved) => {
  try {
    localStorage.setItem(storageKey(code), JSON.stringify(v));
  } catch {
    /* private mode — reconnect just won't survive a refresh */
  }
};
const clearSaved = (code: string) => {
  try {
    localStorage.removeItem(storageKey(code));
  } catch {
    /* ignore */
  }
};

type Phase = 'loading' | 'form' | 'playing' | 'fatal';

export function StudentPage() {
  const params = useParams();
  const code = (params.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return <Navigate to="/" replace />;
  return <StudentApp key={code} code={code} />;
}

function StudentApp({ code }: { code: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [info, setInfo] = useState<{ title: string; joinLocked: boolean } | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [me, setMe] = useState<MeState | null>(null);
  const [fatal, setFatal] = useState<string>('');

  const fail = (message: string) => {
    setFatal(message);
    setPhase('fatal');
  };

  const { socket, connected } = useSocket(async (s) => {
    const saved = loadSaved(code);
    if (saved) {
      const res = await request<Omit<JoinResult, 'token'>>(s, 'student:resume', { code, token: saved.token });
      if (res.ok) {
        hintServerTime(res.state.serverNow);
        setState(res.state);
        setMe(res.me);
        setPhase('playing');
        return;
      }
      if (res.code === 'INVALID_CODE') return fail(res.error);
      if (res.code === 'UNKNOWN_PARTICIPANT') clearSaved(code);
      else if (phaseRef.current === 'playing') return; // transient error — keep showing the game
    }
    if (phaseRef.current === 'playing') return;
    try {
      const data = await api<{ title: string; joinLocked: boolean; status: string }>(`/api/public/join/${code}`);
      if (data.status === 'FINISHED') return fail('This quiz has already ended. Thanks for playing!');
      setInfo(data);
      setPhase('form');
    } catch (err) {
      fail(err instanceof ApiError && err.status === 404 ? 'No quiz found with this code. Please check the code on the screen.' : 'Could not reach the quiz server. Check your internet connection and try again.');
    }
  });

  useEffect(() => {
    const onState = (st: PublicState) => {
      hintServerTime(st.serverNow);
      setState(st);
    };
    const onKicked = ({ message }: { message: string }) => {
      clearSaved(code);
      fail(message);
    };
    socket.on('state', onState);
    socket.on('me', setMe);
    socket.on('kicked', onKicked);
    return () => {
      socket.off('state', onState);
      socket.off('me', setMe);
      socket.off('kicked', onKicked);
    };
  }, [socket, code]);

  const onJoined = (res: JoinResult) => {
    save(code, { token: res.token, name: res.me.name });
    hintServerTime(res.state.serverNow);
    setState(res.state);
    setMe(res.me);
    setPhase('playing');
  };

  return (
    <div className="bg-dots flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-20 border-b border-navy/5 bg-ivory/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <Brand size="sm" />
          <div className="flex items-center gap-2">
            {me && phase === 'playing' && (
              <span className="chip max-w-[9rem] bg-white text-navy ring-1 ring-navy/10">
                <span className="truncate">{me.name}</span>
              </span>
            )}
            {phase !== 'fatal' && <ConnectionPill connected={connected} />}
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-5">
        {phase === 'loading' && (
          <div className="flex flex-1 items-center justify-center text-navy/50">
            <Spinner className="size-8" />
          </div>
        )}
        {phase === 'fatal' && <FatalCard message={fatal} />}
        {phase === 'form' && info && <JoinForm code={code} title={info.title} locked={info.joinLocked} socketRequest={(p) => request<JoinResult>(socket, 'student:join', p)} onJoined={onJoined} />}
        {phase === 'playing' && state && me && <Playing state={state} me={me} setMe={setMe} answer={(p) => request<{ me: MeState }>(socket, 'student:answer', p)} />}
      </main>
    </div>
  );
}

function FatalCard({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="card w-full p-8 text-center">
        <CircleAlert className="mx-auto size-12 text-orange" />
        <p className="mt-4 text-lg font-semibold">{message}</p>
        <Link to="/" className="btn btn-navy mt-6">
          Enter another code
        </Link>
      </div>
    </div>
  );
}

function JoinForm({
  code,
  title,
  locked,
  socketRequest,
  onJoined,
}: {
  code: string;
  title: string;
  locked: boolean;
  socketRequest: (p: object) => ReturnType<typeof request<JoinResult>>;
  onJoined: (r: JoinResult) => void;
}) {
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (name.trim().length < 2) return setError('Please enter your full name.');
    setBusy(true);
    setError('');
    const res = await socketRequest({ code, name, rollNo });
    setBusy(false);
    if (res.ok) onJoined(res);
    else setError(res.error);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="my-auto">
      <div className="text-center">
        <span className="chip bg-navy text-white">
          Code <span className="font-mono tracking-widest">{code}</span>
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-navy/60">Enter your details to join the live quiz.</p>
      </div>
      {locked ? (
        <div className="card mt-6 p-6 text-center">
          <Hourglass className="mx-auto size-10 text-orange" />
          <p className="mt-3 font-semibold">This quiz has already started and is closed for new players.</p>
          <p className="mt-1 text-sm text-navy/60">If you joined earlier, open the quiz on the same phone and browser you used.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="card mt-6 space-y-4 p-5">
          <div>
            <label className="label" htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              className="input text-lg"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              maxLength={40}
              autoComplete="name"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="roll">
              Roll number <span className="font-normal text-navy/40">(optional)</span>
            </label>
            <input id="roll" className="input" value={rollNo} onChange={(e) => setRollNo(e.target.value)} placeholder="e.g. SCA-2026-042" maxLength={30} autoComplete="off" />
          </div>
          <ErrorNote>{error}</ErrorNote>
          <button className="btn btn-primary w-full py-4 text-lg" disabled={busy}>
            {busy ? <Spinner /> : null} {busy ? 'Joining…' : 'Join Quiz'}
          </button>
        </form>
      )}
    </motion.div>
  );
}

// ───────────────────────── In-game views ─────────────────────────

function Playing({
  state,
  me,
  setMe,
  answer,
}: {
  state: PublicState;
  me: MeState;
  setMe: (m: MeState) => void;
  answer: (p: object) => ReturnType<typeof request<{ me: MeState }>>;
}) {
  const view = (() => {
    switch (state.status) {
      case 'LOBBY':
        return <Lobby state={state} me={me} />;
      case 'NEXT_QUESTION':
        return <GetReady state={state} />;
      case 'QUESTION_ACTIVE':
        return <QuestionView state={state} me={me} setMe={setMe} answer={answer} />;
      case 'TIME_UP':
        return <TimeUp state={state} me={me} />;
      case 'ANSWER_REVEAL':
      case 'LEADERBOARD':
        return <Result state={state} me={me} />;
      case 'FINISHED':
        return <Final state={state} me={me} />;
    }
  })();
  const key = `${state.status}-${state.questionIndex}`;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="flex flex-1 flex-col">
        {view}
      </motion.div>
    </AnimatePresence>
  );
}

function Lobby({ state, me }: { state: PublicState; me: MeState }) {
  return (
    <div className="my-auto text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} className="mx-auto flex size-24 items-center justify-center rounded-full bg-green text-white shadow-lift">
        <Check className="size-12" strokeWidth={3} />
      </motion.div>
      <h1 className="mt-6 text-4xl font-extrabold tracking-tight">You’re In!</h1>
      <p className="mt-2 text-lg text-navy/60">Waiting for the Quiz to Begin.</p>
      <div className="card mx-auto mt-8 max-w-sm p-5">
        <div className="text-sm font-semibold text-navy/50">Joined as</div>
        <div className="mt-1 text-2xl font-extrabold break-words">{me.name}</div>
        {me.rollNo && <div className="text-sm text-navy/50">Roll no. {me.rollNo}</div>}
        <div className="mt-4 border-t border-navy/5 pt-4 text-sm text-navy/60">
          <span className="font-bold text-navy">{state.title}</span> · {state.totalQuestions} questions · {state.timerSeconds}s each
        </div>
      </div>
      <div className="mt-8 flex items-center justify-center gap-2 text-navy/50">
        <WaitingDots /> {state.participantCount} {state.participantCount === 1 ? 'player' : 'players'} joined
      </div>
      <p className="mx-auto mt-6 max-w-xs text-sm text-navy/45">Keep this page open. Faster correct answers earn more points!</p>
    </div>
  );
}

export function WaitingDots() {
  return (
    <span className="inline-flex gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="size-2 rounded-full bg-orange" animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
      ))}
    </span>
  );
}

function GetReady({ state }: { state: PublicState }) {
  const remaining = useCountdown(state.nextQuestionAt);
  return (
    <div className="my-auto text-center">
      <div className="text-sm font-bold tracking-[0.2em] text-orange uppercase">Get ready</div>
      <h1 className="mt-2 text-4xl font-extrabold">
        Question {state.questionIndex + 1}
        <span className="text-navy/35"> / {state.totalQuestions}</span>
      </h1>
      <motion.div key={Math.ceil(remaining / 1000)} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto mt-10 flex size-32 items-center justify-center rounded-full bg-navy text-6xl font-extrabold text-white shadow-lift">
        {Math.max(1, Math.ceil(remaining / 1000))}
      </motion.div>
      <p className="mt-8 text-navy/55">Eyes on the screen — tap fast but carefully!</p>
    </div>
  );
}

function TimerBar({ state }: { state: PublicState }) {
  const remaining = useCountdown(state.questionEndsAt);
  const total = state.timerSeconds * 1000;
  const urgent = remaining <= 3000;
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-navy/8">
        <div className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgent ? 'bg-danger' : 'bg-navy'}`} style={{ width: `${(remaining / total) * 100}%` }} />
      </div>
      <span className={`w-12 text-right text-2xl font-extrabold tabular-nums ${urgent ? 'text-danger' : 'text-navy'}`}>{Math.ceil(remaining / 1000)}</span>
    </div>
  );
}

function QuestionView({
  state,
  me,
  setMe,
  answer,
}: {
  state: PublicState;
  me: MeState;
  setMe: (m: MeState) => void;
  answer: (p: object) => ReturnType<typeof request<{ me: MeState }>>;
}) {
  const remaining = useCountdown(state.questionEndsAt);
  const [pending, setPending] = useState<OptionKey | null>(null);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const answered = me.currentAnswer?.questionIndex === state.questionIndex ? me.currentAnswer.choice : null;
  const expired = remaining <= 0;
  const q = state.question;

  const choose = useCallback(
    async (choice: OptionKey) => {
      if (sending.current || answered || expired) return;
      sending.current = true;
      setPending(choice);
      setError('');
      navigator.vibrate?.(20);
      const res = await answer({ questionIndex: state.questionIndex, choice });
      sending.current = false;
      setPending(null);
      if (res.ok) setMe(res.me);
      else setError(res.error);
    },
    [answer, answered, expired, setMe, state.questionIndex],
  );

  if (!q) return null;

  if (answered) {
    const s = OPTION_STYLE[answered];
    return (
      <div className="flex flex-1 flex-col">
        <TimerBar state={state} />
        <div className="my-auto text-center">
          <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }} className={`mx-auto flex size-28 items-center justify-center rounded-3xl text-white shadow-lift ${s.bg}`}>
            <OptionIcon option={answered} className="size-12" />
          </motion.div>
          <h2 className="mt-6 text-3xl font-extrabold">Answer locked in!</h2>
          <p className="mt-2 text-lg text-navy/60">
            You chose <b className={s.text}>{answered}</b>. Results appear after the timer.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 text-navy/45">
            <WaitingDots /> {state.answeredCount} of {state.participantCount} answered
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between text-sm font-bold text-navy/50">
        <span>
          Question {state.questionIndex + 1} of {state.totalQuestions}
        </span>
        <span>{state.answeredCount} answered</span>
      </div>
      <TimerBar state={state} />
      <h2 className="text-xl leading-snug font-bold sm:text-2xl">{q.text}</h2>
      {expired && <div className="rounded-2xl bg-danger/10 px-4 py-3 text-center font-bold text-danger">Time’s Up!</div>}
      <ErrorNote>{error}</ErrorNote>
      <div className="mt-auto grid gap-3 pb-2 sm:grid-cols-2">
        {OPTION_KEYS.map((key, i) => {
          const s = OPTION_STYLE[key];
          const isPending = pending === key;
          return (
            <motion.button
              key={key}
              whileTap={{ scale: 0.97 }}
              onClick={() => choose(key)}
              disabled={!!pending || expired}
              className={`${s.bg} flex min-h-[4.5rem] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-bold text-white shadow-soft transition disabled:opacity-60 ${isPending ? 'ring-4 ring-navy/30' : ''}`}
              aria-label={`Option ${key}: ${q.options[i]}`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                {isPending ? <Spinner className="size-5" /> : <OptionIcon option={key} className="size-5" />}
              </span>
              <span className="text-[17px] leading-snug">
                <span className="mr-1 opacity-70">{key}.</span>
                {q.options[i]}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function TimeUp({ state, me }: { state: PublicState; me: MeState }) {
  const answered = me.currentAnswer?.questionIndex === state.questionIndex ? me.currentAnswer.choice : null;
  return (
    <div className="my-auto text-center">
      <motion.div initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} className="mx-auto flex size-24 items-center justify-center rounded-full bg-orange text-white shadow-lift">
        <Hourglass className="size-11" />
      </motion.div>
      <h1 className="mt-6 text-4xl font-extrabold">Time’s Up!</h1>
      <p className="mt-3 text-lg text-navy/60">
        {answered ? (
          <>
            You answered <b className={OPTION_STYLE[answered].text}>{answered}</b>. Waiting for the reveal…
          </>
        ) : (
          'No answer submitted for this question.'
        )}
      </p>
      <div className="mt-6 flex justify-center">
        <WaitingDots />
      </div>
    </div>
  );
}

function RankLine({ me }: { me: MeState }) {
  if (me.rank === null) return null;
  return (
    <div className="flex items-center justify-center gap-2 text-lg font-bold">
      Rank #{me.rank} <span className="font-medium text-navy/45">of {me.totalParticipants}</span>
      {me.rankChange !== null && me.rankChange !== 0 && (
        <span className={`chip ${me.rankChange > 0 ? 'bg-green-soft text-green-deep' : 'bg-danger/10 text-danger'}`}>
          {me.rankChange > 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
          {Math.abs(me.rankChange)}
        </span>
      )}
    </div>
  );
}

function Result({ state, me }: { state: PublicState; me: MeState }) {
  const r = me.lastResult;
  useEffect(() => {
    if (r?.correct && state.status === 'ANSWER_REVEAL') smallBurst();
  }, [r?.correct, state.status]);
  const correctKey = state.reveal?.correct ?? r?.correctOption;
  const correctIdx = correctKey ? OPTION_KEYS.indexOf(correctKey) : -1;

  return (
    <div className="my-auto space-y-5 text-center">
      {r?.correct ? (
        <>
          <motion.div initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 13 }} className="mx-auto flex size-24 items-center justify-center rounded-full bg-green text-white shadow-lift">
            <CircleCheck className="size-12" />
          </motion.div>
          <h1 className="text-4xl font-extrabold text-green-deep">Correct!</h1>
          <div className="text-5xl font-extrabold text-orange tabular-nums">+{r.points}</div>
          <p className="text-navy/55">Answered in {formatSeconds(r.responseTimeMs)}</p>
          {r.isFastest && (
            <div className="chip mx-auto bg-navy px-4 py-2 text-sm text-white">
              <Zap className="size-4 fill-orange text-orange" /> You were the Fastest Finger!
            </div>
          )}
        </>
      ) : (
        <>
          <motion.div initial={{ scale: 0.4 }} animate={{ scale: 1 }} className="mx-auto flex size-24 items-center justify-center rounded-full bg-navy/80 text-white shadow-lift">
            <CircleX className="size-12" />
          </motion.div>
          <h1 className="text-4xl font-extrabold">{r?.choice ? 'Not quite!' : 'No answer'}</h1>
          <p className="text-navy/60">{r?.choice ? 'Wrong answers score 0 points. Keep going!' : 'You didn’t answer in time — 0 points.'}</p>
        </>
      )}
      {correctKey && correctIdx >= 0 && state.reveal && (
        <div className="card p-4 text-left">
          <div className="text-xs font-bold tracking-wider text-navy/45 uppercase">Correct answer</div>
          <div className="mt-1 flex items-start gap-2 font-bold">
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-sm text-white ${OPTION_STYLE[correctKey].bg}`}>{correctKey}</span>
            <span className="pt-0.5">{state.reveal.correctText}</span>
          </div>
          {state.reveal.explanation && <p className="mt-2 text-sm text-navy/60">{state.reveal.explanation}</p>}
        </div>
      )}
      <div className="card p-5">
        <div className="text-sm font-semibold text-navy/50">Your total</div>
        <div className="text-4xl font-extrabold tabular-nums">{me.totalPoints.toLocaleString('en-IN')}</div>
        <div className="mt-2">
          <RankLine me={me} />
        </div>
      </div>
      <p className="text-sm text-navy/40">Next question coming up soon…</p>
    </div>
  );
}

function Final({ state, me }: { state: PublicState; me: MeState }) {
  const top3 = (state.leaderboard ?? []).slice(0, 3);
  const isWinner = me.rank !== null && me.rank <= 3;
  useEffect(() => (isWinner ? celebrate(3500) : undefined), [isWinner]);
  return (
    <div className="my-auto space-y-5 text-center">
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mx-auto flex size-24 items-center justify-center rounded-full bg-gold text-white shadow-lift">
        {isWinner ? <Trophy className="size-12" /> : <PartyPopper className="size-12" />}
      </motion.div>
      <div>
        <div className="text-sm font-bold tracking-[0.2em] text-orange uppercase">Quiz complete</div>
        <h1 className="mt-1 text-4xl font-extrabold">{isWinner ? 'You’re a Champion!' : 'Well played!'}</h1>
      </div>
      <div className="card grid grid-cols-3 divide-x divide-navy/5 p-5">
        <div>
          <div className="text-3xl font-extrabold">#{me.rank ?? '—'}</div>
          <div className="text-xs font-semibold text-navy/50">of {me.totalParticipants}</div>
        </div>
        <div>
          <div className="text-3xl font-extrabold text-orange tabular-nums">{me.totalPoints.toLocaleString('en-IN')}</div>
          <div className="text-xs font-semibold text-navy/50">points</div>
        </div>
        <div>
          <div className="text-3xl font-extrabold">{Math.round(me.accuracy)}%</div>
          <div className="text-xs font-semibold text-navy/50">accuracy</div>
        </div>
      </div>
      {top3.length > 0 && (
        <div className="card p-5 text-left">
          <div className="mb-3 text-center text-sm font-bold text-navy/50">SCALive Quiz Champions</div>
          {top3.map((e, i) => (
            <div key={e.participantId} className="flex items-center gap-3 py-1.5">
              <span className="text-2xl">{['🥇', '🥈', '🥉'][i]}</span>
              <span className="flex-1 truncate font-bold">{e.name}</span>
              <span className="font-extrabold tabular-nums">{e.totalPoints.toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm text-navy/45">Thank you for playing with SCALive — Sharma Computer Academy.</p>
    </div>
  );
}
