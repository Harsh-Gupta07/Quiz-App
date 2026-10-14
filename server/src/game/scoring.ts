/**
 * Fastest Finger First scoring.
 *
 *   Correct answer points = 500 + floor(500 × remainingTime / totalTime)
 *
 * Response time is always measured with the SERVER's clock:
 *   responseTimeMs = (server receive time) − (server question start time)
 */
export const BASE_POINTS = 500;
export const SPEED_BONUS_POINTS = 500;

export function pointsForCorrect(responseTimeMs: number, totalMs: number): number {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return BASE_POINTS;
  const elapsed = Math.min(Math.max(Math.round(responseTimeMs), 0), totalMs);
  const remaining = totalMs - elapsed;
  return BASE_POINTS + Math.floor((SPEED_BONUS_POINTS * remaining) / totalMs);
}

export function scoreAnswer(isCorrect: boolean, responseTimeMs: number, totalMs: number): number {
  return isCorrect ? pointsForCorrect(responseTimeMs, totalMs) : 0;
}
