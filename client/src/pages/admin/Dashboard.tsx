import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChartColumn, CopyPlus, Pencil, Play, Plus, Presentation, Trash2, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { ErrorNote, Modal, Spinner } from '../../components/ui';

interface QuizSummary {
  id: string;
  title: string;
  description: string | null;
  timerSeconds: number;
  updatedAt: string;
  questionCount: number;
  sessionCount: number;
}
interface SessionSummary {
  id: string;
  code: string;
  title: string;
  status: string;
  createdAt: string;
  participantCount: number;
  totalQuestions: number;
}

const STATUS_LABEL: Record<string, [string, string]> = {
  LOBBY: ['Waiting in lobby', 'bg-blue-soft text-blue-deep'],
  NEXT_QUESTION: ['In progress', 'bg-orange-soft text-orange-deep'],
  QUESTION_ACTIVE: ['In progress', 'bg-orange-soft text-orange-deep'],
  TIME_UP: ['In progress', 'bg-orange-soft text-orange-deep'],
  ANSWER_REVEAL: ['In progress', 'bg-orange-soft text-orange-deep'],
  LEADERBOARD: ['In progress', 'bg-orange-soft text-orange-deep'],
  FINISHED: ['Finished', 'bg-green-soft text-green-deep'],
};

export function StatusChip({ status }: { status: string }) {
  const [label, cls] = STATUS_LABEL[status] ?? [status, 'bg-navy/5'];
  return <span className={`chip ${cls}`}>{label}</span>;
}

export default function Dashboard() {
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [launch, setLaunch] = useState<QuizSummary | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => {
    api<QuizSummary[]>('/api/quizzes').then(setQuizzes).catch((e) => setError(e.message));
    api<SessionSummary[]>('/api/sessions').then(setSessions).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const createQuiz = async () => {
    const quiz = await api<{ id: string }>('/api/quizzes', { method: 'POST', json: { title: 'Untitled quiz', timerSeconds: 15, questions: [] } });
    navigate(`/admin/quiz/${quiz.id}`);
  };
  const duplicate = async (id: string) => {
    await api(`/api/quizzes/${id}/duplicate`, { method: 'POST' });
    load();
  };
  const removeQuiz = async (q: QuizSummary) => {
    if (!confirm(`Delete "${q.title}" and its ${q.questionCount} questions? Past session results are kept.`)) return;
    await api(`/api/quizzes/${q.id}`, { method: 'DELETE' });
    load();
  };
  const removeSession = async (s: SessionSummary) => {
    if (!confirm(`Delete session ${s.code} and all of its results? This cannot be undone.`)) return;
    await api(`/api/sessions/${s.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <main className="mx-auto max-w-7xl space-y-10 px-5 py-8">
      <ErrorNote>{error}</ErrorNote>
      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Quizzes</h1>
            <p className="text-navy/55">Your question banks. Start a live session from any quiz.</p>
          </div>
          <button className="btn btn-navy" onClick={createQuiz}>
            <Plus className="size-5" /> New quiz
          </button>
        </div>
        {!quizzes ? (
          <Spinner className="size-6 text-navy/40" />
        ) : quizzes.length === 0 ? (
          <div className="card p-10 text-center text-navy/55">No quizzes yet — create your first one.</div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {quizzes.map((q) => (
              <article key={q.id} className="card flex flex-col p-6">
                <div className="flex-1">
                  <h2 className="text-xl font-bold">{q.title}</h2>
                  {q.description && <p className="mt-1 line-clamp-2 text-sm text-navy/55">{q.description}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="chip bg-ivory-deep text-navy/70">{q.questionCount} questions</span>
                    <span className="chip bg-ivory-deep text-navy/70">{q.timerSeconds}s timer</span>
                    {q.sessionCount > 0 && <span className="chip bg-ivory-deep text-navy/70">{q.sessionCount} sessions</span>}
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <button className="btn btn-primary flex-1" onClick={() => setLaunch(q)} disabled={q.questionCount === 0}>
                    <Play className="size-4 fill-current" /> Start live session
                  </button>
                  <Link to={`/admin/quiz/${q.id}`} className="btn btn-ghost px-3" title="Edit questions">
                    <Pencil className="size-4" />
                  </Link>
                  <button className="btn btn-ghost px-3" onClick={() => duplicate(q.id)} title="Duplicate">
                    <CopyPlus className="size-4" />
                  </button>
                  <button className="btn btn-danger px-3" onClick={() => removeQuiz(q)} title="Delete">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-extrabold tracking-tight">Recent sessions</h2>
        {!sessions ? (
          <Spinner className="size-6 text-navy/40" />
        ) : sessions.length === 0 ? (
          <div className="card p-8 text-center text-navy/55">Sessions you run will appear here with their results.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-navy/5 text-xs tracking-wider text-navy/45 uppercase">
                <tr>
                  <th className="px-5 py-3">Quiz</th>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Players</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-navy/5 last:border-0">
                    <td className="px-5 py-3 font-semibold">{s.title}</td>
                    <td className="px-5 py-3 font-mono font-bold tracking-wider">{s.code}</td>
                    <td className="px-5 py-3">
                      <StatusChip status={s.status} />
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-4 text-navy/40" /> {s.participantCount}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-navy/55">{new Date(s.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {s.status !== 'FINISHED' && (
                          <Link to={`/admin/session/${s.id}`} className="btn btn-primary px-3 py-2 text-sm">
                            <Presentation className="size-4" /> Control
                          </Link>
                        )}
                        <Link to={`/admin/session/${s.id}/results`} className="btn btn-ghost px-3 py-2 text-sm">
                          <ChartColumn className="size-4" /> Results
                        </Link>
                        <button className="btn btn-danger px-3 py-2 text-sm" onClick={() => removeSession(s)} title="Delete session">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <LaunchDialog quiz={launch} onClose={() => setLaunch(null)} />
    </main>
  );
}

function LaunchDialog({ quiz, onClose }: { quiz: QuizSummary | null; onClose: () => void }) {
  const [timer, setTimer] = useState<10 | 15>(15);
  const [lock, setLock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (quiz) setTimer(quiz.timerSeconds === 10 ? 10 : 15);
  }, [quiz]);

  const start = async () => {
    if (!quiz) return;
    setBusy(true);
    setError('');
    try {
      const s = await api<{ id: string }>(`/api/quizzes/${quiz.id}/sessions`, { method: 'POST', json: { timerSeconds: timer, lockJoinOnStart: lock } });
      navigate(`/admin/session/${s.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!quiz} onClose={onClose} title="Start a live session">
      {quiz && (
        <div className="space-y-5">
          <p className="text-navy/60">
            <b className="text-navy">{quiz.title}</b> · {quiz.questionCount} questions
          </p>
          <div>
            <div className="label">Time per question</div>
            <div className="grid grid-cols-2 gap-2">
              {([10, 15] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTimer(t)} className={`btn ${timer === t ? 'btn-navy' : 'btn-ghost'}`}>
                  {t} seconds
                </button>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-ivory p-4">
            <input type="checkbox" className="mt-1 size-4 accent-orange" checked={lock} onChange={(e) => setLock(e.target.checked)} />
            <span>
              <span className="font-semibold">Lock new registrations when the quiz starts</span>
              <span className="block text-sm text-navy/55">Students who already joined can always reconnect. You can change this during the session.</span>
            </span>
          </label>
          <ErrorNote>{error}</ErrorNote>
          <button className="btn btn-primary w-full py-4 text-lg" onClick={start} disabled={busy}>
            {busy ? <Spinner /> : <Play className="size-5 fill-current" />} Create session & show QR code
          </button>
        </div>
      )}
    </Modal>
  );
}
