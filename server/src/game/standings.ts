import type { FastestFinger, StandingEntry } from '../shared/protocol';

export interface ScoringParticipant {
  id: string;
  name: string;
  /** epoch ms — used only as a final deterministic tie-breaker */
  joinedAt: number;
}

export interface ScoringResponse {
  participantId: string;
  questionIndex: number;
  isCorrect: boolean;
  points: number;
  responseTimeMs: number;
}

type Totals = Omit<StandingEntry, 'rank' | 'rankChange' | 'accuracy'> & { joinedAt: number };

/**
 * Tie-breaking order:
 *   1. Highest total points
 *   2. More correct answers
 *   3. Lower cumulative response time on correct answers
 *   4. (deterministic fallback) earlier join time, then participant id
 */
export function compareTotals(a: Totals, b: Totals): number {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
  if (a.correctTimeMs !== b.correctTimeMs) return a.correctTimeMs - b.correctTimeMs;
  if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
  return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
}

function rankAt(
  participants: ScoringParticipant[],
  responses: ScoringResponse[],
  upToIndex: number,
): Totals[] {
  const totals = new Map<string, Totals>();
  for (const p of participants) {
    totals.set(p.id, {
      participantId: p.id,
      name: p.name,
      joinedAt: p.joinedAt,
      totalPoints: 0,
      correctCount: 0,
      answeredCount: 0,
      correctTimeMs: 0,
    });
  }
  for (const r of responses) {
    if (r.questionIndex > upToIndex) continue;
    const t = totals.get(r.participantId);
    if (!t) continue;
    t.answeredCount += 1;
    t.totalPoints += r.points;
    if (r.isCorrect) {
      t.correctCount += 1;
      t.correctTimeMs += r.responseTimeMs;
    }
  }
  return [...totals.values()].sort(compareTotals);
}

/**
 * Computes the full ordered standings including scores up to (and including) `upToIndex`.
 * `rankChange` compares against the standings after the previous question.
 */
export function computeStandings(
  participants: ScoringParticipant[],
  responses: ScoringResponse[],
  upToIndex: number,
): StandingEntry[] {
  const current = rankAt(participants, responses, upToIndex);
  const previousRank = new Map<string, number>();
  if (upToIndex >= 1) {
    rankAt(participants, responses, upToIndex - 1).forEach((t, i) => previousRank.set(t.participantId, i + 1));
  }
  const played = Math.max(upToIndex + 1, 0);
  return current.map((t, i) => {
    const rank = i + 1;
    const prev = previousRank.get(t.participantId);
    return {
      participantId: t.participantId,
      name: t.name,
      rank,
      rankChange: prev === undefined ? null : prev - rank,
      totalPoints: t.totalPoints,
      correctCount: t.correctCount,
      answeredCount: t.answeredCount,
      correctTimeMs: t.correctTimeMs,
      accuracy: played === 0 ? 0 : Math.round((t.correctCount / played) * 1000) / 10,
    };
  });
}

/** Fastest correct responder for one question. Ties → earlier join → participant id. */
export function fastestCorrect(
  participants: ScoringParticipant[],
  responses: ScoringResponse[],
  questionIndex: number,
): FastestFinger | null {
  const byId = new Map(participants.map((p) => [p.id, p]));
  let best: { r: ScoringResponse; p: ScoringParticipant } | null = null;
  for (const r of responses) {
    if (r.questionIndex !== questionIndex || !r.isCorrect) continue;
    const p = byId.get(r.participantId);
    if (!p) continue;
    if (
      !best ||
      r.responseTimeMs < best.r.responseTimeMs ||
      (r.responseTimeMs === best.r.responseTimeMs &&
        (p.joinedAt < best.p.joinedAt || (p.joinedAt === best.p.joinedAt && p.id < best.p.id)))
    ) {
      best = { r, p };
    }
  }
  return best ? { participantId: best.p.id, name: best.p.name, responseTimeMs: best.r.responseTimeMs } : null;
}
