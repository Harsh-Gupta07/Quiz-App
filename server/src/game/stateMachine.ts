import type { AdminAction, SessionStatus } from '../shared/protocol';

/**
 * Session lifecycle:
 *
 *   LOBBY ─start→ NEXT_QUESTION ─(3s get-ready)→ QUESTION_ACTIVE ─(timer / endQuestion)→ TIME_UP
 *     ─reveal→ ANSWER_REVEAL ─leaderboard→ LEADERBOARD ─next→ NEXT_QUESTION … or FINISHED
 *
 * `finish` can end the quiz from any non-finished state.
 * Every transition goes through `transition()`, which throws on anything not permitted.
 */

export type InternalCommand = 'beginQuestion' | 'timeUp';
export type Command = Exclude<AdminAction, 'advance'> | InternalCommand;

export interface MachineState {
  status: SessionStatus;
  currentIndex: number;
  totalQuestions: number;
}

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransitionError';
  }
}

export function transition(state: MachineState, command: Command): MachineState {
  const { status, currentIndex, totalQuestions } = state;
  const fail = (msg: string): never => {
    throw new TransitionError(msg);
  };

  switch (command) {
    case 'start':
      if (status !== 'LOBBY') fail('The quiz has already started.');
      if (totalQuestions < 1) fail('This quiz has no questions yet.');
      return { status: 'NEXT_QUESTION', currentIndex: 0, totalQuestions };

    case 'beginQuestion':
      if (status !== 'NEXT_QUESTION') fail('No question is queued.');
      return { status: 'QUESTION_ACTIVE', currentIndex, totalQuestions };

    case 'timeUp':
    case 'endQuestion':
      if (status !== 'QUESTION_ACTIVE') fail('No question is currently running.');
      return { status: 'TIME_UP', currentIndex, totalQuestions };

    case 'reveal':
      if (status !== 'TIME_UP') fail('Answers can only be revealed after time is up.');
      return { status: 'ANSWER_REVEAL', currentIndex, totalQuestions };

    case 'leaderboard':
      if (status !== 'ANSWER_REVEAL') fail('Reveal the answer before showing the leaderboard.');
      return { status: 'LEADERBOARD', currentIndex, totalQuestions };

    case 'next':
      if (status !== 'LEADERBOARD' && status !== 'ANSWER_REVEAL') {
        fail('Finish revealing the current question first.');
      }
      if (currentIndex + 1 >= totalQuestions) {
        return { status: 'FINISHED', currentIndex, totalQuestions };
      }
      return { status: 'NEXT_QUESTION', currentIndex: currentIndex + 1, totalQuestions };

    case 'finish':
      if (status === 'FINISHED') fail('The quiz has already finished.');
      return { status: 'FINISHED', currentIndex, totalQuestions };

    default:
      return fail(`Unknown command: ${String(command)}`);
  }
}

/** What the Enter key / primary button does in each state (null = nothing permitted right now). */
export function primaryAction(state: MachineState): { action: Exclude<AdminAction, 'advance'>; label: string } | null {
  switch (state.status) {
    case 'LOBBY':
      return state.totalQuestions > 0 ? { action: 'start', label: 'Start Quiz' } : null;
    case 'TIME_UP':
      return { action: 'reveal', label: 'Reveal Results' };
    case 'ANSWER_REVEAL':
      return { action: 'leaderboard', label: 'Show Leaderboard' };
    case 'LEADERBOARD':
      return state.currentIndex + 1 >= state.totalQuestions
        ? { action: 'next', label: 'Show Final Winners' }
        : { action: 'next', label: 'Next Question' };
    default:
      return null;
  }
}

export function resolveAction(state: MachineState, action: AdminAction): Command | null {
  if (action === 'advance') return primaryAction(state)?.action ?? null;
  return action;
}

/** States in which the current question's text/options are shown. */
export function showsQuestion(status: SessionStatus): boolean {
  return status === 'QUESTION_ACTIVE' || status === 'TIME_UP' || status === 'ANSWER_REVEAL';
}

/** States in which the current question's correct answer may be shown publicly. */
export function revealsAnswer(status: SessionStatus): boolean {
  return status === 'ANSWER_REVEAL' || status === 'LEADERBOARD';
}
