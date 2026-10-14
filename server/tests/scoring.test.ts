import { describe, expect, it } from 'vitest';
import { pointsForCorrect, scoreAnswer } from '../src/game/scoring';

describe('Fastest Finger First scoring', () => {
  const T = 10_000;

  it.each([
    [1000, 950],
    [3000, 850],
    [5000, 750],
    [9000, 550],
  ])('correct in %ims of a 10s question → %i points', (ms, expected) => {
    expect(scoreAnswer(true, ms, T)).toBe(expected);
  });

  it('wrong answers score zero regardless of speed', () => {
    expect(scoreAnswer(false, 100, T)).toBe(0);
    expect(scoreAnswer(false, 9_999, T)).toBe(0);
  });

  it('an instant answer earns the maximum 1000 points', () => {
    expect(pointsForCorrect(0, T)).toBe(1000);
  });

  it('an answer exactly at the deadline still earns the 500 base points', () => {
    expect(pointsForCorrect(T, T)).toBe(500);
  });

  it('clamps out-of-range times', () => {
    expect(pointsForCorrect(-500, T)).toBe(1000);
    expect(pointsForCorrect(T + 5000, T)).toBe(500);
  });

  it('uses floor on millisecond-precise timings', () => {
    // remaining 8766ms of 10000 → 438.3 → 438
    expect(pointsForCorrect(1234, T)).toBe(938);
  });

  it('works for 15 second questions', () => {
    expect(pointsForCorrect(3000, 15_000)).toBe(500 + 400);
    expect(pointsForCorrect(7500, 15_000)).toBe(750);
  });

  it('faster correct answers always earn at least as many points', () => {
    let prev = Infinity;
    for (let ms = 0; ms <= T; ms += 37) {
      const pts = pointsForCorrect(ms, T);
      expect(pts).toBeLessThanOrEqual(prev);
      prev = pts;
    }
  });
});
