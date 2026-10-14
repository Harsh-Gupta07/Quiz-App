import { Prisma, type Participant, type QuizSession, type Response as DbResponse } from '@prisma/client';
import { prisma } from '../lib/db';
import { config } from '../lib/config';
import { hashToken, newParticipantToken } from '../lib/auth';
import { cleanName, cleanRollNo, nameKey } from '../lib/validation';
import {
  OPTION_KEYS,
  type AdminAction,
  type AdminState,
  type MeState,
  type OptionKey,
  type PublicState,
  type QuestionSnapshot,
  type RevealInfo,
  type SessionStatus,
  type StandingEntry,
} from '../shared/protocol';
import { scoreAnswer } from './scoring';
import { computeStandings, fastestCorrect, type ScoringParticipant } from './standings';
import {
  primaryAction,
  resolveAction,
  revealsAnswer,
  showsQuestion,
  transition,
  TransitionError,
  type Command,
  type InternalCommand,
  type MachineState,
} from './stateMachine';

export class GameError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export type NotifyKind = 'transition' | 'progress' | 'roster';
export type Notify = (rt: SessionRuntime, kind: NotifyKind) => void;

interface RuntimeParticipant extends ScoringParticipant {
  nameKey: string;
  rollNo: string | null;
  tokenHash: string;
  sockets: Set<string>;
}

interface RuntimeResponse {
  participantId: string;
  questionIndex: number;
  questionId: string;
  choice: OptionKey;
  isCorrect: boolean;
  responseTimeMs: number;
  points: number;
  receivedAt: number;
}

/** Serialises async work (state transitions) so they never interleave. */
class Mutex {
  private chain: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const result = this.chain.then(fn);
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function parseQuestionSnapshot(json: Prisma.JsonValue): QuestionSnapshot[] {
  if (!Array.isArray(json)) return [];
  const out: QuestionSnapshot[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const q = raw as Record<string, unknown>;
    const options = Array.isArray(q.options) ? q.options.map(String) : [];
    if (typeof q.text !== 'string' || options.length !== 4) continue;
    if (!OPTION_KEYS.includes(q.correct as OptionKey)) continue;
    out.push({
      id: String(q.id ?? ''),
      text: q.text,
      options: options as QuestionSnapshot['options'],
      correct: q.correct as OptionKey,
      explanation: typeof q.explanation === 'string' ? q.explanation : null,
    });
  }
  return out;
}

export async function loadQuizSnapshot(quizId: string): Promise<QuestionSnapshot[]> {
  const questions = await prisma.question.findMany({ where: { quizId }, orderBy: { position: 'asc' } });
  return questions.map((q) => ({
    id: q.id,
    text: q.text,
    options: [q.optionA, q.optionB, q.optionC, q.optionD],
    correct: q.correct as OptionKey,
    explanation: q.explanation,
  }));
}

const emptyCounts = (): Record<OptionKey, number> => ({ A: 0, B: 0, C: 0, D: 0 });

type SessionRow = QuizSession & { participants: Participant[]; responses: DbResponse[] };

export class SessionRuntime {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly quizId: string | null;
  status: SessionStatus;
  stateVersion: number;
  currentIndex: number;
  revealedIndex: number;
  timerSeconds: number;
  lockJoinOnStart: boolean;
  questions: QuestionSnapshot[];
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  nextQuestionAt: number | null = null;

  notify: Notify = () => {};

  private participants = new Map<string, RuntimeParticipant>();
  private tokenIndex = new Map<string, string>();
  private nameKeys = new Set<string>();
  /** key = `${participantId}:${questionIndex}` */
  private responses = new Map<string, RuntimeResponse>();
  private timer: NodeJS.Timeout | null = null;
  private mutex = new Mutex();
  private pendingWrites = new Set<Promise<unknown>>();
  private persistChain: Promise<unknown> = Promise.resolve();
  private dataVersion = 0;
  private standingsCache: { key: string; value: StandingEntry[] } | null = null;
  private disposed = false;

  constructor(row: SessionRow) {
    this.id = row.id;
    this.code = row.code;
    this.title = row.title;
    this.quizId = row.quizId;
    this.status = row.status;
    this.stateVersion = row.stateVersion;
    this.currentIndex = row.currentIndex;
    this.revealedIndex = row.revealedIndex;
    this.timerSeconds = row.timerSeconds;
    this.lockJoinOnStart = row.lockJoinOnStart;
    this.questions = parseQuestionSnapshot(row.questions);
    this.questionStartedAt = row.questionStartedAt?.getTime() ?? null;
    this.questionEndsAt = row.questionEndsAt?.getTime() ?? null;

    for (const p of row.participants) this.addParticipant(p);
    for (const r of row.responses) {
      if (!this.participants.has(r.participantId)) continue;
      this.responses.set(`${r.participantId}:${r.questionIndex}`, {
        participantId: r.participantId,
        questionIndex: r.questionIndex,
        questionId: r.questionId,
        choice: r.choice as OptionKey,
        isCorrect: r.isCorrect,
        responseTimeMs: r.responseTimeMs,
        points: r.points,
        receivedAt: r.receivedAt.getTime(),
      });
    }
  }

  get machine(): MachineState {
    return { status: this.status, currentIndex: this.currentIndex, totalQuestions: this.questions.length };
  }

  get joinLocked(): boolean {
    return this.status === 'FINISHED' || (this.status !== 'LOBBY' && this.lockJoinOnStart);
  }

  /** Re-arms timers after a server restart. */
  hydrateTimers() {
    const now = Date.now();
    if (this.status === 'NEXT_QUESTION') {
      this.nextQuestionAt = now + config.getReadyMs;
      this.schedule(config.getReadyMs, 'beginQuestion');
    } else if (this.status === 'QUESTION_ACTIVE') {
      if (this.questionEndsAt === null || this.questionStartedAt === null) {
        this.questionStartedAt = now;
        this.questionEndsAt = now + this.timerSeconds * 1000;
      }
      this.schedule(this.questionEndsAt - now, 'timeUp');
    }
  }

  dispose() {
    this.disposed = true;
    this.clearTimer();
  }

  // ───────────────────────── participants ─────────────────────────

  private addParticipant(p: Participant): RuntimeParticipant {
    const rp: RuntimeParticipant = {
      id: p.id,
      name: p.name,
      nameKey: p.nameKey,
      rollNo: p.rollNo,
      tokenHash: p.tokenHash,
      joinedAt: p.joinedAt.getTime(),
      sockets: new Set(),
    };
    this.participants.set(rp.id, rp);
    this.tokenIndex.set(rp.tokenHash, rp.id);
    this.nameKeys.add(rp.nameKey);
    this.invalidate();
    return rp;
  }

  get participantCount() {
    return this.participants.size;
  }

  get onlineCount() {
    let n = 0;
    for (const p of this.participants.values()) if (p.sockets.size > 0) n++;
    return n;
  }

  hasParticipant(id: string) {
    return this.participants.has(id);
  }

  onlineParticipantIds(): string[] {
    return [...this.participants.values()].filter((p) => p.sockets.size > 0).map((p) => p.id);
  }

  async join(rawName: unknown, rawRollNo: unknown): Promise<{ token: string; participantId: string }> {
    if (this.status === 'FINISHED') throw new GameError('SESSION_ENDED', 'This quiz has already ended.');
    if (this.joinLocked) {
      throw new GameError(
        'JOIN_LOCKED',
        'This quiz has already started, so new players cannot join. Please ask your instructor.',
      );
    }
    const name = cleanName(rawName);
    if (!name) throw new GameError('INVALID_NAME', 'Please enter your full name (2–40 characters).');
    const rollNo = cleanRollNo(rawRollNo);
    if (this.participants.size >= config.maxParticipants) {
      throw new GameError('SESSION_FULL', 'This quiz is full. Please ask your instructor.');
    }
    const key = nameKey(name);
    if (this.nameKeys.has(key)) {
      throw new GameError(
        'NAME_TAKEN',
        `"${name}" has already joined. Add your surname or initial to make your name unique.`,
      );
    }
    // Reserve the name synchronously so simultaneous joins cannot both claim it.
    this.nameKeys.add(key);
    const token = newParticipantToken();
    try {
      const row = await prisma.participant.create({
        data: { sessionId: this.id, name, nameKey: key, rollNo, tokenHash: hashToken(token) },
      });
      const p = this.addParticipant(row);
      this.notify(this, 'roster');
      return { token, participantId: p.id };
    } catch (err) {
      this.nameKeys.delete(key);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new GameError('NAME_TAKEN', `"${name}" has already joined. Add your surname or initial.`);
      }
      throw err;
    }
  }

  /** Returns the participant id for a reconnect token, or null. */
  resume(token: unknown): string | null {
    if (typeof token !== 'string' || token.length < 10 || token.length > 100) return null;
    return this.tokenIndex.get(hashToken(token)) ?? null;
  }

  attachSocket(participantId: string, socketId: string) {
    const p = this.participants.get(participantId);
    if (!p) return;
    const wasOffline = p.sockets.size === 0;
    p.sockets.add(socketId);
    if (wasOffline) this.notify(this, 'roster');
  }

  detachSocket(participantId: string, socketId: string) {
    const p = this.participants.get(participantId);
    if (!p || !p.sockets.delete(socketId)) return;
    if (p.sockets.size === 0) {
      this.notify(this, 'roster');
      prisma.participant
        .updateMany({ where: { id: p.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }
  }

  async removeParticipant(participantId: string): Promise<boolean> {
    return this.mutex.run(async () => {
      const p = this.participants.get(participantId);
      if (!p) return false;
      await prisma.participant.delete({ where: { id: participantId } }).catch((err) => {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) throw err;
      });
      this.participants.delete(participantId);
      this.tokenIndex.delete(p.tokenHash);
      this.nameKeys.delete(p.nameKey);
      for (const [key, r] of this.responses) if (r.participantId === participantId) this.responses.delete(key);
      this.invalidate();
      this.notify(this, 'transition');
      return true;
    });
  }

  // ───────────────────────── answers ─────────────────────────

  async answer(participantId: string, questionIndex: unknown, choice: unknown): Promise<void> {
    // The server clock is the only clock that matters.
    const receivedAt = Date.now();
    if (!this.participants.has(participantId)) {
      throw new GameError('NOT_JOINED', 'You are not part of this quiz. Please join again.');
    }
    if (this.status !== 'QUESTION_ACTIVE' || this.questionStartedAt === null || this.questionEndsAt === null) {
      throw new GameError('NOT_ACCEPTING', "Time's up! Answers are closed for this question.");
    }
    if (questionIndex !== this.currentIndex) {
      throw new GameError('WRONG_QUESTION', 'That question is no longer active.');
    }
    if (receivedAt > this.questionEndsAt) {
      throw new GameError('TOO_LATE', "Time's up! Your answer arrived too late and was not counted.");
    }
    if (typeof choice !== 'string' || !OPTION_KEYS.includes(choice as OptionKey)) {
      throw new GameError('INVALID_CHOICE', 'Invalid answer option.');
    }
    const key = `${participantId}:${questionIndex}`;
    if (this.responses.has(key)) {
      throw new GameError('ALREADY_ANSWERED', 'You have already answered this question.');
    }

    const question = this.questions[questionIndex];
    const responseTimeMs = Math.max(0, receivedAt - this.questionStartedAt);
    const isCorrect = choice === question.correct;
    const points = scoreAnswer(isCorrect, responseTimeMs, this.timerSeconds * 1000);
    const response: RuntimeResponse = {
      participantId,
      questionIndex,
      questionId: question.id,
      choice: choice as OptionKey,
      isCorrect,
      responseTimeMs,
      points,
      receivedAt,
    };
    // Recorded synchronously: a second answer racing this one sees it immediately.
    this.responses.set(key, response);
    this.invalidate();

    const write = prisma.response.create({
      data: {
        sessionId: this.id,
        participantId,
        questionIndex,
        questionId: question.id,
        choice: response.choice,
        isCorrect,
        responseTimeMs,
        points,
        receivedAt: new Date(receivedAt),
      },
    });
    this.pendingWrites.add(write);
    try {
      await write;
    } catch (err) {
      const duplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!duplicate) {
        this.responses.delete(key);
        this.invalidate();
        console.error('[answer] failed to persist response', err);
        throw new GameError('SAVE_FAILED', 'Could not save your answer. Please tap again.');
      }
    } finally {
      this.pendingWrites.delete(write);
    }
    this.notify(this, 'progress');
  }

  answeredCount(questionIndex: number): number {
    if (questionIndex < 0) return 0;
    let n = 0;
    for (const r of this.responses.values()) if (r.questionIndex === questionIndex) n++;
    return n;
  }

  private optionCounts(questionIndex: number): Record<OptionKey, number> {
    const counts = emptyCounts();
    for (const r of this.responses.values()) if (r.questionIndex === questionIndex) counts[r.choice]++;
    return counts;
  }

  private responseList(): RuntimeResponse[] {
    return [...this.responses.values()];
  }

  // ───────────────────────── transitions ─────────────────────────

  command(action: AdminAction, expectedVersion?: number): Promise<void> {
    return this.mutex.run(async () => {
      if (expectedVersion !== undefined && expectedVersion !== this.stateVersion) {
        throw new GameError('STALE', 'The quiz has already moved on. Duplicate command ignored.');
      }
      const cmd = resolveAction(this.machine, action);
      if (!cmd || cmd === 'beginQuestion' || cmd === 'timeUp') {
        throw new GameError(
          'NOT_PERMITTED',
          this.status === 'QUESTION_ACTIVE'
            ? 'The timer is still running. Wait for it to finish, or use "End Question Now".'
            : this.status === 'NEXT_QUESTION'
              ? 'The next question is about to start.'
              : 'Nothing to advance right now.',
        );
      }
      await this.apply(cmd);
    });
  }

  setLockJoin(lock: boolean): Promise<void> {
    return this.mutex.run(async () => {
      this.lockJoinOnStart = lock;
      await this.persist({ lockJoinOnStart: lock });
      this.notify(this, 'transition');
    });
  }

  private async apply(cmd: Command) {
    if (cmd === 'start' && this.quizId) {
      // Freeze the latest version of the quiz at start time.
      const fresh = await loadQuizSnapshot(this.quizId);
      if (fresh.length > 0) this.questions = fresh;
    }

    let next: MachineState;
    try {
      next = transition(this.machine, cmd);
    } catch (err) {
      if (err instanceof TransitionError) throw new GameError('INVALID_TRANSITION', err.message);
      throw err;
    }

    if (cmd === 'reveal' || cmd === 'finish') {
      // Make sure every accepted answer is safely stored before scores are published.
      await Promise.allSettled([...this.pendingWrites]);
    }

    const prevStatus = this.status;
    const now = Date.now();
    this.clearTimer();
    this.status = next.status;
    this.currentIndex = next.currentIndex;
    this.stateVersion += 1;

    const patch: Prisma.QuizSessionUpdateInput = {
      status: this.status,
      currentIndex: this.currentIndex,
      stateVersion: this.stateVersion,
    };

    switch (next.status) {
      case 'NEXT_QUESTION':
        if (cmd === 'start') {
          patch.startedAt = new Date(now);
          patch.questions = this.questions as unknown as Prisma.InputJsonValue;
        }
        this.questionStartedAt = null;
        this.questionEndsAt = null;
        patch.questionStartedAt = null;
        patch.questionEndsAt = null;
        this.nextQuestionAt = now + config.getReadyMs;
        this.schedule(config.getReadyMs, 'beginQuestion');
        break;

      case 'QUESTION_ACTIVE':
        this.nextQuestionAt = null;
        this.questionStartedAt = now;
        this.questionEndsAt = now + this.timerSeconds * 1000;
        patch.questionStartedAt = new Date(this.questionStartedAt);
        patch.questionEndsAt = new Date(this.questionEndsAt);
        this.schedule(this.questionEndsAt - now, 'timeUp');
        break;

      case 'TIME_UP':
        if (this.questionEndsAt === null || now < this.questionEndsAt) {
          this.questionEndsAt = now; // closed early by the instructor
          patch.questionEndsAt = new Date(now);
        }
        break;

      case 'ANSWER_REVEAL':
        this.revealedIndex = this.currentIndex;
        patch.revealedIndex = this.revealedIndex;
        break;

      case 'FINISHED': {
        this.nextQuestionAt = null;
        if (prevStatus === 'QUESTION_ACTIVE' && this.questionEndsAt !== null && now < this.questionEndsAt) {
          this.questionEndsAt = now;
          patch.questionEndsAt = new Date(now);
        }
        // Count every question that was actually played.
        const playedUpTo = prevStatus === 'NEXT_QUESTION' ? this.currentIndex - 1 : this.currentIndex;
        this.revealedIndex = Math.max(this.revealedIndex, playedUpTo);
        patch.revealedIndex = this.revealedIndex;
        patch.endedAt = new Date(now);
        break;
      }
    }

    this.invalidate();
    await this.persist(patch);
    this.notify(this, 'transition');
  }

  private schedule(delayMs: number, cmd: InternalCommand) {
    this.clearTimer();
    const version = this.stateVersion;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.mutex
          .run(async () => {
            if (this.disposed || this.stateVersion !== version) return;
            await this.apply(cmd);
          })
          .catch((err) => console.error(`[session ${this.code}] ${cmd} failed`, err));
      },
      Math.max(0, delayMs),
    );
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private persist(patch: Prisma.QuizSessionUpdateInput): Promise<unknown> {
    this.persistChain = this.persistChain
      .then(() => prisma.quizSession.update({ where: { id: this.id }, data: patch }))
      .catch((err) => console.error(`[session ${this.code}] failed to persist state`, err));
    return this.persistChain;
  }

  private invalidate() {
    this.dataVersion += 1;
  }

  // ───────────────────────── views ─────────────────────────

  standings(upToIndex = this.revealedIndex): StandingEntry[] {
    const key = `${upToIndex}:${this.dataVersion}`;
    if (this.standingsCache?.key === key) return this.standingsCache.value;
    const value = computeStandings([...this.participants.values()], this.responseList(), upToIndex);
    if (upToIndex === this.revealedIndex) this.standingsCache = { key, value };
    return value;
  }

  private revealInfo(questionIndex: number): RevealInfo | null {
    const q = this.questions[questionIndex];
    if (!q) return null;
    const counts = this.optionCounts(questionIndex);
    return {
      questionIndex,
      correct: q.correct,
      correctText: q.options[OPTION_KEYS.indexOf(q.correct)],
      counts,
      totalAnswers: counts.A + counts.B + counts.C + counts.D,
      explanation: q.explanation,
      fastest: fastestCorrect([...this.participants.values()], this.responseList(), questionIndex),
    };
  }

  publicState(): PublicState {
    const q = this.currentIndex >= 0 ? this.questions[this.currentIndex] : undefined;
    const showQuestion = showsQuestion(this.status) && !!q;
    const reveal = revealsAnswer(this.status) ? this.revealInfo(this.currentIndex) : null;
    const showBoard =
      this.status === 'ANSWER_REVEAL' || this.status === 'LEADERBOARD' || this.status === 'FINISHED';
    const lobbyNames =
      this.status === 'LOBBY'
        ? [...this.participants.values()]
            .sort((a, b) => b.joinedAt - a.joinedAt)
            .slice(0, 60)
            .map((p) => p.name)
        : [];

    return {
      sessionId: this.id,
      code: this.code,
      title: this.title,
      status: this.status,
      stateVersion: this.stateVersion,
      questionIndex: this.currentIndex,
      totalQuestions: this.questions.length,
      timerSeconds: this.timerSeconds,
      joinLocked: this.joinLocked,
      question: showQuestion ? { index: this.currentIndex, text: q!.text, options: q!.options } : null,
      questionStartedAt: showQuestion ? this.questionStartedAt : null,
      questionEndsAt: showQuestion ? this.questionEndsAt : null,
      nextQuestionAt: this.status === 'NEXT_QUESTION' ? this.nextQuestionAt : null,
      serverNow: Date.now(),
      participantCount: this.participantCount,
      onlineCount: this.onlineCount,
      answeredCount: this.answeredCount(this.currentIndex),
      lobbyNames,
      reveal,
      leaderboard: showBoard ? this.standings().slice(0, 10) : null,
      fastest: reveal?.fastest ?? null,
    };
  }

  meState(participantId: string): MeState | null {
    const p = this.participants.get(participantId);
    if (!p) return null;
    const standings = this.standings();
    const entry = standings.find((s) => s.participantId === participantId);
    const current =
      this.currentIndex >= 0 ? this.responses.get(`${participantId}:${this.currentIndex}`) : undefined;

    let lastResult: MeState['lastResult'] = null;
    if (revealsAnswer(this.status) && this.revealedIndex === this.currentIndex && this.currentIndex >= 0) {
      const q = this.questions[this.currentIndex];
      const fastest = fastestCorrect([...this.participants.values()], this.responseList(), this.currentIndex);
      lastResult = {
        questionIndex: this.currentIndex,
        choice: current?.choice ?? null,
        correct: current?.isCorrect ?? false,
        points: current?.points ?? 0,
        responseTimeMs: current?.responseTimeMs ?? null,
        isFastest: fastest?.participantId === participantId,
        correctOption: q.correct,
      };
    }

    return {
      participantId,
      name: p.name,
      rollNo: p.rollNo,
      totalPoints: entry?.totalPoints ?? 0,
      correctCount: entry?.correctCount ?? 0,
      rank: this.revealedIndex >= 0 && entry ? entry.rank : null,
      rankChange: entry?.rankChange ?? null,
      totalParticipants: this.participants.size,
      accuracy: entry?.accuracy ?? 0,
      currentAnswer: current ? { questionIndex: current.questionIndex, choice: current.choice } : null,
      lastResult,
    };
  }

  adminState(): AdminState {
    const q = this.currentIndex >= 0 ? this.questions[this.currentIndex] : undefined;
    const live = this.standings(Math.max(this.currentIndex, this.revealedIndex));
    const liveById = new Map(live.map((s) => [s.participantId, s]));
    const participants = [...this.participants.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => {
        const s = liveById.get(p.id);
        return {
          id: p.id,
          name: p.name,
          rollNo: p.rollNo,
          online: p.sockets.size > 0,
          joinedAt: p.joinedAt,
          answeredCurrent: this.currentIndex >= 0 && this.responses.has(`${p.id}:${this.currentIndex}`),
          totalPoints: s?.totalPoints ?? 0,
          correctCount: s?.correctCount ?? 0,
        };
      });
    return {
      public: this.publicState(),
      lockJoinOnStart: this.lockJoinOnStart,
      currentCorrect: q?.correct ?? null,
      currentExplanation: q?.explanation ?? null,
      liveCounts: this.currentIndex >= 0 ? this.optionCounts(this.currentIndex) : null,
      participants,
      primaryAction: primaryAction(this.machine),
      questions: this.questions.map((x) => ({ text: x.text, options: x.options, correct: x.correct })),
    };
  }
}

export class GameManager {
  private runtimes = new Map<string, SessionRuntime>();
  private loading = new Map<string, Promise<SessionRuntime | null>>();
  private codeIndex = new Map<string, string>();
  private notify: Notify = () => {};

  setNotify(notify: Notify) {
    this.notify = notify;
    for (const rt of this.runtimes.values()) rt.notify = notify;
  }

  async get(id: unknown): Promise<SessionRuntime | null> {
    if (typeof id !== 'string' || id.length < 5 || id.length > 64) return null;
    const existing = this.runtimes.get(id);
    if (existing) return existing;
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.load(id);
      this.loading.set(id, pending);
      pending.catch(() => undefined).then(() => this.loading.delete(id));
    }
    return pending;
  }

  async getByCode(code: string): Promise<SessionRuntime | null> {
    let id = this.codeIndex.get(code);
    if (!id) {
      const row = await prisma.quizSession.findUnique({ where: { code }, select: { id: true } });
      id = row?.id;
    }
    return id ? this.get(id) : null;
  }

  private async load(id: string): Promise<SessionRuntime | null> {
    const row = await prisma.quizSession.findUnique({
      where: { id },
      include: { participants: true, responses: true },
    });
    if (!row) return null;
    const rt = new SessionRuntime(row);
    rt.notify = this.notify;
    rt.hydrateTimers();
    this.runtimes.set(id, rt);
    this.codeIndex.set(rt.code, id);
    return rt;
  }

  /** After a restart, reload any session that was mid-game so its timers keep running. */
  async resumeActive() {
    const active = await prisma.quizSession.findMany({
      where: { status: { in: ['NEXT_QUESTION', 'QUESTION_ACTIVE', 'TIME_UP', 'ANSWER_REVEAL', 'LEADERBOARD'] } },
      select: { id: true },
    });
    for (const { id } of active) await this.get(id);
    return active.length;
  }

  evict(id: string) {
    const rt = this.runtimes.get(id);
    if (!rt) return;
    rt.dispose();
    this.runtimes.delete(id);
    this.codeIndex.delete(rt.code);
  }
}
