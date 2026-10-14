import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, CopyPlus, Download, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import { OPTION_KEYS, type OptionKey } from '@shared/protocol';
import { api, ApiError } from '../../lib/api';
import { ErrorNote, Modal, OPTION_STYLE, OptionIcon, Spinner } from '../../components/ui';

interface EditQuestion {
  key: string;
  text: string;
  options: [string, string, string, string];
  correct: OptionKey;
  explanation: string;
}
interface QuizData {
  id: string;
  title: string;
  description: string | null;
  timerSeconds: number;
  questions: { id: string; text: string; options: string[]; correct: OptionKey; explanation: string | null }[];
}

let keySeq = 0;
const newKey = () => `q${++keySeq}`;
const blank = (): EditQuestion => ({ key: newKey(), text: '', options: ['', '', '', ''], correct: 'A', explanation: '' });
const fromServer = (q: QuizData['questions'][number]): EditQuestion => ({
  key: newKey(),
  text: q.text,
  options: [q.options[0] ?? '', q.options[1] ?? '', q.options[2] ?? '', q.options[3] ?? ''],
  correct: q.correct,
  explanation: q.explanation ?? '',
});

const CSV_TEMPLATE =
  'question,option_a,option_b,option_c,option_d,correct,explanation\n' +
  '"Which prompting technique gives Claude worked examples?",Zero-shot,Few-shot,Role prompting,Chaining,B,"Few-shot = examples in the prompt"\n';

export default function QuizEditor() {
  const { id = '' } = useParams();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timer, setTimer] = useState<10 | 15>(15);
  const [questions, setQuestions] = useState<EditQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const apply = (q: QuizData) => {
    setTitle(q.title);
    setDescription(q.description ?? '');
    setTimer(q.timerSeconds === 10 ? 10 : 15);
    setQuestions(q.questions.map(fromServer));
    setDirty(false);
  };

  useEffect(() => {
    api<QuizData>(`/api/quizzes/${id}`)
      .then(apply)
      .catch((e) => setMessage({ kind: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const touch = () => {
    setDirty(true);
    setMessage(null);
  };

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api<QuizData>(`/api/quizzes/${id}`, {
        method: 'PUT',
        json: {
          title,
          description,
          timerSeconds: timer,
          questions: questions.map((q) => ({ text: q.text, options: q.options, correct: q.correct, explanation: q.explanation })),
        },
      });
      apply(saved);
      setMessage({ kind: 'ok', text: `Saved ${saved.questions.length} questions.` });
      return true;
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, title, description, timer, questions]);

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const update = (index: number, patch: Partial<EditQuestion>) => {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
    touch();
  };
  const move = (index: number, delta: number) => {
    setQuestions((qs) => {
      const next = [...qs];
      const target = index + delta;
      if (target < 0 || target >= next.length) return qs;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    touch();
  };
  const remove = (index: number) => {
    if (questions[index].text && !confirm(`Delete question ${index + 1}?`)) return;
    setQuestions((qs) => qs.filter((_, i) => i !== index));
    touch();
  };
  const duplicateQ = (index: number) => {
    setQuestions((qs) => [...qs.slice(0, index + 1), { ...qs[index], key: newKey(), options: [...qs[index].options] as EditQuestion['options'] }, ...qs.slice(index + 1)]);
    touch();
  };
  const add = () => {
    setQuestions((qs) => [...qs, blank()]);
    touch();
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-navy/40">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 pb-32">
      <Link to="/admin" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-navy/55 hover:text-navy">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>

      <section className="card space-y-4 p-6">
        <div>
          <label className="label" htmlFor="title">
            Quiz title
          </label>
          <input id="title" className="input text-xl font-bold" value={title} maxLength={120} onChange={(e) => (setTitle(e.target.value), touch())} />
        </div>
        <div>
          <label className="label" htmlFor="desc">
            Description <span className="font-normal text-navy/40">(optional)</span>
          </label>
          <input id="desc" className="input" value={description} maxLength={500} onChange={(e) => (setDescription(e.target.value), touch())} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label">Default timer</div>
            <div className="flex gap-2">
              {([10, 15] as const).map((t) => (
                <button key={t} type="button" className={`btn px-4 py-2 ${timer === t ? 'btn-navy' : 'btn-ghost'}`} onClick={() => (setTimer(t), touch())}>
                  {t}s
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>
              <FileUp className="size-4" /> Import JSON / CSV
            </button>
            <a className="btn btn-ghost" href={`/api/quizzes/${id}/export`} download>
              <Download className="size-4" /> Export JSON
            </a>
          </div>
        </div>
      </section>

      <div className="mt-8 mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-extrabold">
          Questions <span className="text-navy/35">({questions.length})</span>
        </h2>
      </div>

      <div className="space-y-5">
        {questions.map((q, i) => (
          <article key={q.key} className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="chip bg-navy text-white">Question {i + 1}</span>
              <div className="flex gap-1">
                <IconBtn title="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ChevronUp className="size-4" />
                </IconBtn>
                <IconBtn title="Move down" onClick={() => move(i, 1)} disabled={i === questions.length - 1}>
                  <ChevronDown className="size-4" />
                </IconBtn>
                <IconBtn title="Duplicate" onClick={() => duplicateQ(i)}>
                  <CopyPlus className="size-4" />
                </IconBtn>
                <IconBtn title="Delete" onClick={() => remove(i)} danger>
                  <Trash2 className="size-4" />
                </IconBtn>
              </div>
            </div>
            <textarea
              className={`input min-h-[84px] resize-y text-[17px] font-semibold ${!q.text.trim() ? 'ring-orange/60' : ''}`}
              placeholder="Type the question…"
              value={q.text}
              maxLength={500}
              onChange={(e) => update(i, { text: e.target.value })}
              aria-label={`Question ${i + 1} text`}
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {OPTION_KEYS.map((key, oi) => {
                const s = OPTION_STYLE[key];
                const isCorrect = q.correct === key;
                return (
                  <div key={key} className={`flex items-center gap-2 rounded-2xl p-1.5 pr-2 ring-2 transition ${isCorrect ? 'bg-green-soft ring-green' : 'bg-ivory ring-transparent'}`}>
                    <button
                      type="button"
                      onClick={() => update(i, { correct: key })}
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-white ${s.bg}`}
                      title={isCorrect ? 'Correct answer' : 'Mark as correct'}
                      aria-pressed={isCorrect}
                      aria-label={`Mark option ${key} correct`}
                    >
                      <OptionIcon option={key} className="size-4" />
                    </button>
                    <input
                      className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[15px] outline-none placeholder:text-navy/30"
                      placeholder={`Option ${key}`}
                      value={q.options[oi]}
                      maxLength={200}
                      onChange={(e) => {
                        const options = [...q.options] as EditQuestion['options'];
                        options[oi] = e.target.value;
                        update(i, { options });
                      }}
                      aria-label={`Question ${i + 1} option ${key}`}
                    />
                    <label className="flex cursor-pointer items-center gap-1 text-xs font-bold text-navy/50">
                      <input type="radio" name={`correct-${q.key}`} className="accent-green" checked={isCorrect} onChange={() => update(i, { correct: key })} />
                      {isCorrect ? <span className="text-green-deep">Correct</span> : 'Correct?'}
                    </label>
                  </div>
                );
              })}
            </div>
            <input className="input mt-3 text-sm" placeholder="Short explanation shown after the reveal (optional)" value={q.explanation} maxLength={600} onChange={(e) => update(i, { explanation: e.target.value })} />
          </article>
        ))}
      </div>

      <button className="btn btn-ghost mt-5 w-full border-2 border-dashed border-navy/15 py-5" onClick={add}>
        <Plus className="size-5" /> Add question
      </button>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-navy/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0 text-sm">
            {message ? (
              <span className={message.kind === 'ok' ? 'font-semibold text-green-deep' : 'font-semibold text-danger'}>{message.text}</span>
            ) : dirty ? (
              <span className="font-semibold text-orange-deep">Unsaved changes</span>
            ) : (
              <span className="text-navy/45">All changes saved</span>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <Spinner /> : <Save className="size-4" />} Save <span className="kbd ml-1 hidden bg-white/20 text-white shadow-none sm:inline-flex">Ctrl S</span>
          </button>
        </div>
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        quizId={id}
        beforeImport={async () => (dirty ? save() : true)}
        onImported={(q, text) => {
          apply(q);
          setMessage({ kind: 'ok', text });
          setImportOpen(false);
        }}
      />
    </main>
  );
}

function IconBtn({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className={`rounded-xl p-2 transition disabled:opacity-25 ${danger ? 'text-danger hover:bg-danger/10' : 'text-navy/55 hover:bg-ivory-deep'}`}>
      {children}
    </button>
  );
}

function ImportDialog({
  open,
  onClose,
  quizId,
  beforeImport,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  quizId: string;
  beforeImport: () => Promise<boolean>;
  onImported: (q: QuizData, message: string) => void;
}) {
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'json' | 'csv'>('csv');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setContent(text);
    setFormat(file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('[') || text.trim().startsWith('{') ? 'json' : 'csv');
  };

  const run = async () => {
    setBusy(true);
    setErrors([]);
    try {
      if (!(await beforeImport())) return;
      const res = await api<{ imported: number; errors: string[]; quiz: QuizData }>(`/api/quizzes/${quizId}/import`, { method: 'POST', json: { format, content, mode } });
      const skipped = res.errors.length ? ` ${res.errors.length} row(s) skipped.` : '';
      onImported(res.quiz, `Imported ${res.imported} questions.${skipped}`);
      setContent('');
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { errors?: string[] } | undefined)?.errors : undefined;
      setErrors([(e as Error).message, ...(details ?? [])]);
    } finally {
      setBusy(false);
    }
  };

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

  return (
    <Modal open={open} onClose={onClose} title="Import questions" width="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-navy/60">
          CSV columns: <code className="rounded bg-ivory-deep px-1">question, option_a, option_b, option_c, option_d, correct, explanation</code>. JSON: an array of{' '}
          <code className="rounded bg-ivory-deep px-1">{'{ text, options: [4], correct: "A"–"D", explanation }'}</code>.{' '}
          <a href={templateHref} download="scalive-questions-template.csv" className="font-semibold text-orange-deep underline">
            Download CSV template
          </a>
        </p>
        <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-navy file:px-4 file:py-2 file:font-semibold file:text-white" />
        <textarea className="input min-h-40 font-mono text-xs" placeholder="…or paste CSV / JSON here" value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="flex flex-wrap gap-4">
          <div className="flex gap-2">
            {(['csv', 'json'] as const).map((f) => (
              <button key={f} type="button" className={`btn px-4 py-2 text-sm ${format === f ? 'btn-navy' : 'btn-ghost'}`} onClick={() => setFormat(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(['append', 'replace'] as const).map((m) => (
              <button key={m} type="button" className={`btn px-4 py-2 text-sm ${mode === m ? 'btn-navy' : 'btn-ghost'}`} onClick={() => setMode(m)}>
                {m === 'append' ? 'Add to existing' : 'Replace all'}
              </button>
            ))}
          </div>
        </div>
        {errors.length > 0 && (
          <ErrorNote>
            <ul className="list-inside list-disc space-y-0.5">
              {errors.slice(0, 8).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </ErrorNote>
        )}
        <button className="btn btn-primary w-full" disabled={busy || !content.trim()} onClick={run}>
          {busy ? <Spinner /> : <FileUp className="size-4" />} Import
        </button>
      </div>
    </Modal>
  );
}
