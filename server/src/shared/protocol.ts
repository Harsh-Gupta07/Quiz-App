/**
 * Shared protocol types between the server and the React client.
 * The client imports this file (type-only) through the `@shared` alias.
 */

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

export const SESSION_STATUSES = [
  'LOBBY',
  'NEXT_QUESTION',
  'QUESTION_ACTIVE',
  'TIME_UP',
  'ANSWER_REVEAL',
  'LEADERBOARD',
  'FINISHED',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Commands the instructor can send. `advance` maps to whatever the next permitted step is. */
export type AdminAction =
  | 'advance'
  | 'start'
  | 'endQuestion'
  | 'reveal'
  | 'leaderboard'
  | 'next'
  | 'finish';

export interface QuestionSnapshot {
  id: string;
  text: string;
  options: [string, string, string, string];
  correct: OptionKey;
  explanation: string | null;
}

/** Question as seen by students / presentation — never contains the correct answer. */
export interface PublicQuestion {
  index: number;
  text: string;
  options: [string, string, string, string];
}

export interface FastestFinger {
  participantId: string;
  name: string;
  responseTimeMs: number;
}

export interface StandingEntry {
  participantId: string;
  name: string;
  rank: number;
  /** Positive = moved up, negative = moved down, null = new to the board / first question. */
  rankChange: number | null;
  totalPoints: number;
  correctCount: number;
  answeredCount: number;
  correctTimeMs: number;
  /** 0–100, correct answers ÷ questions played */
  accuracy: number;
}

export interface RevealInfo {
  questionIndex: number;
  correct: OptionKey;
  correctText: string;
  counts: Record<OptionKey, number>;
  totalAnswers: number;
  explanation: string | null;
  fastest: FastestFinger | null;
}

export interface PublicState {
  sessionId: string;
  code: string;
  title: string;
  status: SessionStatus;
  stateVersion: number;
  /** 0-based index of the current question (-1 in lobby) */
  questionIndex: number;
  totalQuestions: number;
  timerSeconds: number;
  joinLocked: boolean;
  question: PublicQuestion | null;
  /** Server epoch ms */
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  nextQuestionAt: number | null;
  serverNow: number;
  participantCount: number;
  onlineCount: number;
  answeredCount: number;
  /** Most recent joiners (for the lobby wall) */
  lobbyNames: string[];
  reveal: RevealInfo | null;
  leaderboard: StandingEntry[] | null;
  /** Fastest finger of the most recently revealed question */
  fastest: FastestFinger | null;
}

export interface MyAnswer {
  questionIndex: number;
  choice: OptionKey;
}

export interface MyResult {
  questionIndex: number;
  choice: OptionKey | null;
  correct: boolean;
  points: number;
  responseTimeMs: number | null;
  isFastest: boolean;
  correctOption: OptionKey;
}

export interface MeState {
  participantId: string;
  name: string;
  rollNo: string | null;
  /** Totals only include revealed questions */
  totalPoints: number;
  correctCount: number;
  rank: number | null;
  rankChange: number | null;
  totalParticipants: number;
  accuracy: number;
  currentAnswer: MyAnswer | null;
  lastResult: MyResult | null;
}

export interface AdminParticipant {
  id: string;
  name: string;
  rollNo: string | null;
  online: boolean;
  joinedAt: number;
  answeredCurrent: boolean;
  totalPoints: number;
  correctCount: number;
}

export interface AdminState {
  public: PublicState;
  lockJoinOnStart: boolean;
  currentCorrect: OptionKey | null;
  currentExplanation: string | null;
  liveCounts: Record<OptionKey, number> | null;
  participants: AdminParticipant[];
  primaryAction: { action: AdminAction; label: string } | null;
  questions: { text: string; options: string[]; correct: OptionKey }[];
}

export type Ack<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string };

export interface JoinPayload {
  code: string;
  name: string;
  rollNo?: string;
}

export interface JoinResult {
  token: string;
  sessionId: string;
  participantId: string;
  state: PublicState;
  me: MeState;
}
