import { describe, expect, it } from 'vitest';
import {
  primaryAction,
  resolveAction,
  transition,
  TransitionError,
  type Command,
  type MachineState,
} from '../src/game/stateMachine';

const s = (status: MachineState['status'], currentIndex = 0, totalQuestions = 3): MachineState => ({
  status,
  currentIndex,
  totalQuestions,
});

describe('session state machine', () => {
  it('walks the full happy path for a 2-question quiz', () => {
    let state = s('LOBBY', -1, 2);
    const steps: [Command, MachineState['status'], number][] = [
      ['start', 'NEXT_QUESTION', 0],
      ['beginQuestion', 'QUESTION_ACTIVE', 0],
      ['timeUp', 'TIME_UP', 0],
      ['reveal', 'ANSWER_REVEAL', 0],
      ['leaderboard', 'LEADERBOARD', 0],
      ['next', 'NEXT_QUESTION', 1],
      ['beginQuestion', 'QUESTION_ACTIVE', 1],
      ['endQuestion', 'TIME_UP', 1],
      ['reveal', 'ANSWER_REVEAL', 1],
      ['leaderboard', 'LEADERBOARD', 1],
      ['next', 'FINISHED', 1],
    ];
    for (const [cmd, status, index] of steps) {
      state = transition(state, cmd);
      expect(state.status).toBe(status);
      expect(state.currentIndex).toBe(index);
    }
  });

  it('cannot start a quiz with no questions', () => {
    expect(() => transition(s('LOBBY', -1, 0), 'start')).toThrow(TransitionError);
  });

  it('cannot reveal while the question timer is running', () => {
    expect(() => transition(s('QUESTION_ACTIVE'), 'reveal')).toThrow(TransitionError);
  });

  it('cannot skip from TIME_UP straight to the next question', () => {
    expect(() => transition(s('TIME_UP'), 'next')).toThrow(TransitionError);
  });

  it('cannot start twice', () => {
    expect(() => transition(s('NEXT_QUESTION'), 'start')).toThrow(TransitionError);
  });

  it('allows skipping the leaderboard from ANSWER_REVEAL', () => {
    expect(transition(s('ANSWER_REVEAL', 0), 'next')).toEqual(s('NEXT_QUESTION', 1));
  });

  it('can finish from any state except FINISHED', () => {
    for (const status of ['LOBBY', 'NEXT_QUESTION', 'QUESTION_ACTIVE', 'TIME_UP', 'ANSWER_REVEAL', 'LEADERBOARD'] as const) {
      expect(transition(s(status), 'finish').status).toBe('FINISHED');
    }
    expect(() => transition(s('FINISHED'), 'finish')).toThrow(TransitionError);
  });

  describe('Enter key (advance) mapping', () => {
    it('maps each state to the right step', () => {
      expect(resolveAction(s('LOBBY', -1), 'advance')).toBe('start');
      expect(resolveAction(s('TIME_UP'), 'advance')).toBe('reveal');
      expect(resolveAction(s('ANSWER_REVEAL'), 'advance')).toBe('leaderboard');
      expect(resolveAction(s('LEADERBOARD'), 'advance')).toBe('next');
    });

    it('does nothing while a question is running, counting down, or finished', () => {
      expect(resolveAction(s('QUESTION_ACTIVE'), 'advance')).toBeNull();
      expect(resolveAction(s('NEXT_QUESTION'), 'advance')).toBeNull();
      expect(resolveAction(s('FINISHED'), 'advance')).toBeNull();
    });

    it('labels the last leaderboard as "Show Final Winners"', () => {
      expect(primaryAction(s('LEADERBOARD', 2, 3))?.label).toBe('Show Final Winners');
      expect(primaryAction(s('LEADERBOARD', 0, 3))?.label).toBe('Next Question');
    });
  });
});
