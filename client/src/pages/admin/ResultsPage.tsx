import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Monitor, Presentation, Zap } from 'lucide-react';
import type { OptionKey, StandingEntry } from '@shared/protocol';
import { OPTION_KEYS } from '@shared/protocol';
import { api } from '../../lib/api';
import { ErrorNote, OPTION_STYLE, Spinner, formatSeconds } from '../../components/ui';
import { Podium } from '../../components/Podium';
import { StatusChip } from './Dashboard';

interface Results {
  session: { id: string; code: string; title: string; status: string; timerSeconds: number; createdAt: string; endedAt: string | null; questionsPlayed: number; totalQuestions: number };
  standings: (StandingEntry & { rollNo: string | null; avgCorrectTimeMs: number | null })[];
  questions: { index: number; text: string; options: string[]; correct: OptionKey; counts: Record<OptionKey, number>; answered: number; correctCount: number; fastest: { name: string; responseTimeMs: number } | null }[];
}

export default function ResultsPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Results>(`/api/sessions/${id}/results`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <main className="mx-auto max-w-xl px-5 py-16"><ErrorNote>{error}</ErrorNote></main>;
  if (!data) {
    return (
      <div className="flex justify-center py-20 text-navy/40">
        <Spinner className="size-8" />
      </div>
    );
  }

  const { session, standings, questions } = data;
  const avgAccuracy = standings.length ? Math.round(standings.reduce((a, s) => a + s.accuracy, 0) / standings.length) : 0;

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-5 py-6">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-navy/55 hover:text-navy">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>

      <section className="card flex flex-wrap items-center justify-between gap-5 p-6">
        <div>
          <div className="flex items-center gap-2">
            <StatusChip status={session.status} />
            <span className="chip bg-ivory-deep font-mono tracking-wider text-navy/70">{session.code}</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{session.title}</h1>
          <p className="text-sm text-navy/55">
            {new Date(session.createdAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })} · {session.questionsPlayed} of {session.totalQuestions} questions played · {session.timerSeconds}s timer
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-primary" href={`/api/sessions/${id}/results.csv`} download>
            <Download className="size-4" /> Final rankings CSV
          </a>
          <a className="btn btn-ghost" href={`/api/sessions/${id}/responses.csv`} download>
            <Download className="size-4" /> All responses CSV
          </a>
          {session.status !== 'FINISHED' ? (
            <Link to={`/admin/session/${id}`} className="btn btn-navy">
              <Presentation className="size-4" /> Live control
            </Link>
          ) : (
            <button className="btn btn-navy" onClick={() => window.open(`/present/${id}`, `scalive-present-${id}`)}>
              <Monitor className="size-4" /> Show winners screen
            </button>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Participants" value={standings.length} />
        <Stat label="Questions played" value={session.questionsPlayed} />
        <Stat label="Average accuracy" value={`${avgAccuracy}%`} />
      </section>

      {standings.length > 0 && session.questionsPlayed > 0 && (
        <section className="card overflow-hidden px-4 pt-8">
          <h2 className="mb-2 text-center text-2xl font-extrabold">
            SCALive Quiz <span className="text-orange">Champions</span>
          </h2>
          <div className="origin-bottom scale-[0.85] sm:scale-100">
            <Podium entries={standings.slice(0, 3)} scale={0.62} />
          </div>
        </section>
      )}

      <section className="card overflow-x-auto">
        <div className="p-5 pb-2">
          <h2 className="text-xl font-extrabold">Final rankings</h2>
          <p className="text-sm text-navy/50">Ties: points → correct answers → lower total time on correct answers.</p>
        </div>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-navy/5 text-xs tracking-wider text-navy/45 uppercase">
            <tr>
              <th className="px-5 py-3">Rank</th>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Roll no.</th>
              <th className="px-5 py-3 text-right">Points</th>
              <th className="px-5 py-3 text-right">Correct</th>
              <th className="px-5 py-3 text-right">Accuracy</th>
              <th className="px-5 py-3 text-right">Avg. correct time</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.participantId} className="border-b border-navy/5 last:border-0">
                <td className="px-5 py-2.5 font-extrabold">{s.rank <= 3 ? ['🥇', '🥈', '🥉'][s.rank - 1] : s.rank}</td>
                <td className="px-5 py-2.5 font-semibold">{s.name}</td>
                <td className="px-5 py-2.5 text-navy/55">{s.rollNo ?? '—'}</td>
                <td className="px-5 py-2.5 text-right font-extrabold tabular-nums">{s.totalPoints.toLocaleString('en-IN')}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  {s.correctCount}/{session.questionsPlayed}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">{s.accuracy}%</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{formatSeconds(s.avgCorrectTimeMs)}</td>
              </tr>
            ))}
            {standings.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-navy/45">
                  No participants.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {questions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold">Question breakdown</h2>
          {questions.map((q) => {
            const pct = q.answered ? Math.round((q.correctCount / Math.max(1, standings.length)) * 100) : 0;
            return (
              <article key={q.index} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="max-w-3xl font-bold">
                    <span className="text-navy/40">Q{q.index + 1}.</span> {q.text}
                  </h3>
                  <span className={`chip ${pct >= 60 ? 'bg-green-soft text-green-deep' : pct >= 30 ? 'bg-orange-soft text-orange-deep' : 'bg-danger/10 text-danger'}`}>{pct}% correct</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {OPTION_KEYS.map((key, i) => (
                    <div key={key} className={`rounded-xl px-3 py-2 text-sm ring-1 ${q.correct === key ? 'bg-green-soft ring-green' : 'bg-ivory ring-navy/5'}`}>
                      <div className="flex items-center justify-between font-bold">
                        <span className={OPTION_STYLE[key].text}>{key}</span>
                        <span className="tabular-nums">{q.counts[key]}</span>
                      </div>
                      <div className="truncate text-navy/60" title={q.options[i]}>
                        {q.options[i]}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-navy/55">
                  <span>
                    {q.answered}/{standings.length} answered
                  </span>
                  {q.fastest && (
                    <span className="inline-flex items-center gap-1">
                      <Zap className="size-4 fill-orange text-orange" /> Fastest: <b className="text-navy">{q.fastest.name}</b> ({formatSeconds(q.fastest.responseTimeMs)})
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-5">
      <div className="text-sm font-semibold text-navy/50">{label}</div>
      <div className="mt-1 text-3xl font-extrabold tabular-nums">{value}</div>
    </div>
  );
}
