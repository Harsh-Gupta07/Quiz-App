import { prisma } from '../lib/db';
import type { OptionKey, StandingEntry } from '../shared/protocol';
import { parseQuestionSnapshot } from './engine';
import { computeStandings, fastestCorrect } from './standings';

export interface SessionResults {
  session: {
    id: string;
    code: string;
    title: string;
    status: string;
    timerSeconds: number;
    createdAt: Date;
    startedAt: Date | null;
    endedAt: Date | null;
    questionsPlayed: number;
    totalQuestions: number;
  };
  standings: (StandingEntry & { rollNo: string | null; avgCorrectTimeMs: number | null })[];
  questions: {
    index: number;
    text: string;
    options: string[];
    correct: OptionKey;
    counts: Record<OptionKey, number>;
    answered: number;
    correctCount: number;
    fastest: { name: string; responseTimeMs: number } | null;
  }[];
  responses: {
    participantId: string;
    name: string;
    questionIndex: number;
    choice: string;
    isCorrect: boolean;
    responseTimeMs: number;
    points: number;
  }[];
}

/** Computes results straight from the stored database rows (the source of truth). */
export async function loadResults(sessionId: string): Promise<SessionResults | null> {
  const session = await prisma.quizSession.findUnique({
    where: { id: sessionId },
    include: { participants: true, responses: true },
  });
  if (!session) return null;
  const questions = parseQuestionSnapshot(session.questions);
  const participants = session.participants.map((p) => ({ id: p.id, name: p.name, joinedAt: p.joinedAt.getTime() }));
  const responses = session.responses.map((r) => ({
    participantId: r.participantId,
    questionIndex: r.questionIndex,
    isCorrect: r.isCorrect,
    points: r.points,
    responseTimeMs: r.responseTimeMs,
  }));
  const upTo = session.revealedIndex;
  const byId = new Map(session.participants.map((p) => [p.id, p]));
  const standings = computeStandings(participants, responses, upTo).map((s) => ({
    ...s,
    rollNo: byId.get(s.participantId)?.rollNo ?? null,
    avgCorrectTimeMs: s.correctCount ? Math.round(s.correctTimeMs / s.correctCount) : null,
  }));

  const played = Math.max(upTo + 1, 0);
  const questionStats = questions.slice(0, played).map((q, index) => {
    const counts: Record<OptionKey, number> = { A: 0, B: 0, C: 0, D: 0 };
    let correctCount = 0;
    for (const r of session.responses) {
      if (r.questionIndex !== index) continue;
      counts[r.choice as OptionKey]++;
      if (r.isCorrect) correctCount++;
    }
    const fastest = fastestCorrect(participants, responses, index);
    return {
      index,
      text: q.text,
      options: q.options,
      correct: q.correct,
      counts,
      answered: counts.A + counts.B + counts.C + counts.D,
      correctCount,
      fastest: fastest ? { name: fastest.name, responseTimeMs: fastest.responseTimeMs } : null,
    };
  });

  return {
    session: {
      id: session.id,
      code: session.code,
      title: session.title,
      status: session.status,
      timerSeconds: session.timerSeconds,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      questionsPlayed: played,
      totalQuestions: questions.length,
    },
    standings,
    questions: questionStats,
    responses: session.responses
      .filter((r) => r.questionIndex <= upTo)
      .sort((a, b) => a.questionIndex - b.questionIndex || a.responseTimeMs - b.responseTimeMs)
      .map((r) => ({
        participantId: r.participantId,
        name: byId.get(r.participantId)?.name ?? '',
        questionIndex: r.questionIndex,
        choice: r.choice,
        isCorrect: r.isCorrect,
        responseTimeMs: r.responseTimeMs,
        points: r.points,
      })),
  };
}

/** CSV cell with protection against spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function rankingsCsv(results: SessionResults): string {
  const header = [
    'Rank',
    'Name',
    'Roll No',
    'Total Points',
    'Correct Answers',
    'Questions Played',
    'Accuracy %',
    'Avg Correct Response (s)',
    ...results.questions.map((q) => `Q${q.index + 1} Points`),
  ];
  const pointsBy = new Map<string, number>();
  for (const r of results.responses) pointsBy.set(`${r.participantId}:${r.questionIndex}`, r.points);
  const rows = results.standings.map((s) => [
    s.rank,
    s.name,
    s.rollNo ?? '',
    s.totalPoints,
    s.correctCount,
    results.session.questionsPlayed,
    s.accuracy,
    s.avgCorrectTimeMs === null ? '' : (s.avgCorrectTimeMs / 1000).toFixed(2),
    ...results.questions.map((q) => pointsBy.get(`${s.participantId}:${q.index}`) ?? 0),
  ]);
  return toCsv([header, ...rows]);
}

export function responsesCsv(results: SessionResults): string {
  const header = ['Question #', 'Question', 'Name', 'Choice', 'Correct Answer', 'Is Correct', 'Response Time (s)', 'Points'];
  const rows = results.responses.map((r) => {
    const q = results.questions[r.questionIndex];
    return [
      r.questionIndex + 1,
      q?.text ?? '',
      r.name,
      r.choice,
      q?.correct ?? '',
      r.isCorrect ? 'Yes' : 'No',
      (r.responseTimeMs / 1000).toFixed(3),
      r.points,
    ];
  });
  return toCsv([header, ...rows]);
}
