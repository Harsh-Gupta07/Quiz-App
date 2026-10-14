import { describe, expect, it } from 'vitest';
import { computeStandings, fastestCorrect, type ScoringResponse } from '../src/game/standings';

const people = [
  { id: 'p1', name: 'Aarav', joinedAt: 1 },
  { id: 'p2', name: 'Diya', joinedAt: 2 },
  { id: 'p3', name: 'Kabir', joinedAt: 3 },
  { id: 'p4', name: 'Meera', joinedAt: 4 },
];

const r = (participantId: string, questionIndex: number, isCorrect: boolean, points: number, responseTimeMs: number): ScoringResponse => ({
  participantId,
  questionIndex,
  isCorrect,
  points,
  responseTimeMs,
});

describe('leaderboard ordering', () => {
  it('orders by total points first', () => {
    const standings = computeStandings(people, [r('p1', 0, true, 700, 6000), r('p2', 0, true, 900, 2000)], 0);
    expect(standings.map((s) => s.name)).toEqual(['Diya', 'Aarav', 'Kabir', 'Meera']);
    expect(standings[0]).toMatchObject({ rank: 1, totalPoints: 900, correctCount: 1, accuracy: 100 });
  });

  it('breaks point ties by number of correct answers', () => {
    // Both on 1000 points: Meera (joined last, faster) has 1 correct, Aarav has 2 correct.
    const responses = [
      r('p1', 0, true, 500, 10000),
      r('p1', 1, true, 500, 10000),
      r('p4', 0, true, 1000, 0),
      r('p4', 1, false, 0, 1000),
    ];
    const standings = computeStandings(people, responses, 1);
    expect(standings[0]).toMatchObject({ name: 'Aarav', totalPoints: 1000, correctCount: 2 });
    expect(standings[1]).toMatchObject({ name: 'Meera', totalPoints: 1000, correctCount: 1 });
  });

  it('breaks remaining ties by lower cumulative correct-answer time', () => {
    const standings = computeStandings(
      people,
      [r('p1', 0, true, 800, 4000), r('p2', 0, true, 800, 3999)],
      0,
    );
    expect(standings[0].name).toBe('Diya');
    expect(standings[1].name).toBe('Aarav');
  });

  it('falls back to join order for complete ties (deterministic)', () => {
    const a = computeStandings(people, [], 0).map((s) => s.name);
    const b = computeStandings([...people].reverse(), [], 0).map((s) => s.name);
    expect(a).toEqual(['Aarav', 'Diya', 'Kabir', 'Meera']);
    expect(b).toEqual(a);
  });

  it('ignores responses for questions not yet revealed', () => {
    const standings = computeStandings(people, [r('p3', 0, true, 900, 2000), r('p4', 1, true, 1000, 0)], 0);
    expect(standings[0].name).toBe('Kabir');
    expect(standings.find((s) => s.name === 'Meera')!.totalPoints).toBe(0);
  });

  it('reports position change since the previous question', () => {
    const responses = [
      r('p1', 0, true, 950, 1000),
      r('p2', 0, true, 550, 9000),
      r('p2', 1, true, 1000, 0),
      r('p1', 1, false, 0, 1000),
    ];
    const after1 = computeStandings(people, responses, 1);
    const diya = after1.find((s) => s.name === 'Diya')!;
    const aarav = after1.find((s) => s.name === 'Aarav')!;
    expect(diya.rank).toBe(1);
    expect(diya.rankChange).toBe(1); // moved up from 2nd
    expect(aarav.rankChange).toBe(-1); // moved down from 1st
    expect(computeStandings(people, responses, 0)[0].rankChange).toBeNull();
  });

  it('computes accuracy over questions played', () => {
    const standings = computeStandings(people, [r('p1', 0, true, 900, 2000), r('p1', 2, true, 900, 2000)], 3);
    expect(standings[0].accuracy).toBe(50);
  });
});

describe('fastest finger', () => {
  it('picks the fastest CORRECT responder', () => {
    const responses = [r('p1', 0, false, 0, 500), r('p2', 0, true, 900, 2000), r('p3', 0, true, 950, 1000)];
    expect(fastestCorrect(people, responses, 0)).toEqual({ participantId: 'p3', name: 'Kabir', responseTimeMs: 1000 });
  });

  it('returns null when nobody answered correctly', () => {
    expect(fastestCorrect(people, [r('p1', 0, false, 0, 500)], 0)).toBeNull();
  });

  it('breaks exact time ties by earlier join', () => {
    const responses = [r('p4', 0, true, 900, 1500), r('p2', 0, true, 900, 1500)];
    expect(fastestCorrect(people, responses, 0)?.name).toBe('Diya');
  });
});
