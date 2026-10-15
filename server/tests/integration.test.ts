/**
 * End-to-end flow against a real server + PostgreSQL:
 * 1 admin, 1 presentation screen and 5 simulated students on separate sockets.
 *
 *   npm run test:integration      (needs DATABASE_URL, e.g. `npm run db:local` running)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { AdminState, MeState, PublicState } from '../src/shared/protocol';

process.env.GET_READY_MS = '300';
process.env.ADMIN_PASSWORD = 'integration-test-pw';
process.env.SESSION_SECRET = 'integration-test-secret-0123456789';

type AnyAck = { ok: boolean; error?: string; code?: string; [k: string]: unknown };

let baseUrl = '';
let cookie = '';
let shutdown: () => Promise<void>;
let prisma: typeof import('../src/lib/db').prisma;
const sockets: Socket[] = [];

function socketFor(withAdminCookie = false): Socket {
  const s = connect(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: withAdminCookie ? { cookie } : undefined,
  });
  sockets.push(s);
  return s;
}

function emit<T = AnyAck>(s: Socket, event: string, payload: unknown = {}): Promise<T & AnyAck> {
  return new Promise((resolve) => s.emit(event, payload, (res: T & AnyAck) => resolve(res)));
}

/** Resolves with the latest state once `predicate` matches (checks the last-seen value first). */
function tracker<T>(s: Socket, event: string) {
  let latest: T | null = null;
  const waiters: { pred: (v: T) => boolean; resolve: (v: T) => void }[] = [];
  s.on(event, (v: T) => {
    latest = v;
    for (const w of [...waiters]) if (w.pred(v)) {
      waiters.splice(waiters.indexOf(w), 1);
      w.resolve(v);
    }
  });
  return {
    get latest() {
      return latest;
    },
    set(v: T) {
      latest = v;
    },
    waitFor(pred: (v: T) => boolean, timeoutMs = 15_000): Promise<T> {
      if (latest && pred(latest)) return Promise.resolve(latest);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
        waiters.push({ pred, resolve: (v) => (clearTimeout(timer), resolve(v)) });
      });
    },
  };
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', cookie, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, body: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  const { createApp } = await import('../src/app');
  ({ prisma } = await import('../src/lib/db'));
  const { server, io } = createApp();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  shutdown = async () => {
    io.close();
    await new Promise((r) => server.close(r));
  };
}, 30_000);

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await shutdown?.();
  await prisma?.$disconnect();
});

describe('live quiz end-to-end', () => {
  let quizId = '';
  let sessionId = '';
  let code = '';

  it('rejects admin APIs without login and accepts the correct password', async () => {
    expect((await api('/api/quizzes')).status).toBe(401);
    expect((await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: 'nope' }) })).status).toBe(401);
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'integration-test-pw' }),
    });
    expect(res.status).toBe(200);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
    expect(cookie).toMatch(/^scalive_admin=/);
  });

  it('creates a quiz and a session with a 6-character join code', async () => {
    const quiz = await api('/api/quizzes', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Integration Test Quiz',
        timerSeconds: 15,
        questions: [
          { text: 'Q1: pick B', options: ['a', 'b', 'c', 'd'], correct: 'B' },
          { text: 'Q2: pick A', options: ['a', 'b', 'c', 'd'], correct: 'A' },
          { text: 'Q3: pick D', options: ['a', 'b', 'c', 'd'], correct: 'D', explanation: 'D is right' },
        ],
      }),
    });
    expect(quiz.status).toBe(201);
    quizId = quiz.body.id;
    const session = await api(`/api/quizzes/${quizId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ timerSeconds: 15, lockJoinOnStart: true }),
    });
    expect(session.status).toBe(201);
    ({ id: sessionId, code } = session.body);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const lookup = await api(`/api/public/join/${code.toLowerCase()}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body).toMatchObject({ sessionId, status: 'LOBBY', joinLocked: false });
    expect((await api('/api/public/join/ZZZZZZ')).status).toBe(404);
  });

  it('runs the full game with 5 students', { timeout: 90_000 }, async () => {
    // ── Admin + presentation ──
    const admin = socketFor(true);
    const adminState = tracker<AdminState>(admin, 'admin:state');
    const watch = await emit<{ state: AdminState }>(admin, 'admin:watch', { sessionId });
    expect(watch.ok).toBe(true);
    adminState.set(watch.state);

    // A non-admin socket must not be able to control the quiz.
    const intruder = socketFor(false);
    expect((await emit(intruder, 'admin:command', { sessionId, action: 'advance' })).code).toBe('UNAUTHORIZED');

    const present = socketFor(false);
    const presentState = tracker<PublicState>(present, 'state');
    const pw = await emit<{ state: PublicState }>(present, 'present:watch', { sessionId });
    expect(pw.ok).toBe(true);
    presentState.set(pw.state);

    // ── 5 students join ──
    const names = ['Aarav Mehta', 'Diya Patel', 'Kabir Singh', 'Meera Joshi', 'Rohan Verma'];
    const students = names.map((name) => {
      const s = socketFor(false);
      return { name, socket: s, state: tracker<PublicState>(s, 'state'), me: tracker<MeState>(s, 'me'), token: '' };
    });
    for (const st of students) {
      const res = await emit<{ token: string; me: MeState }>(st.socket, 'student:join', { code, name: st.name, rollNo: 'R1' });
      expect(res.ok, res.error).toBe(true);
      st.token = res.token;
      st.me.set(res.me);
    }
    // participant count updates live on admin and presentation
    await adminState.waitFor((s) => s.public.participantCount === 5);
    await presentState.waitFor((s) => s.participantCount === 5 && s.lobbyNames.length === 5);

    // duplicate name is rejected
    const dup = await emit(socketFor(false), 'student:join', { code, name: '  aarav   MEHTA ' });
    expect(dup.code).toBe('NAME_TAKEN');
    const badCode = await emit(socketFor(false), 'student:join', { code: 'ZZZZZZ', name: 'Nobody' });
    expect(badCode.code).toBe('INVALID_CODE');

    const [s1, s2, s3, s4, s5] = students;

    // ── Question 1 ──
    let version = adminState.latest!.public.stateVersion;
    expect((await emit(admin, 'admin:command', { sessionId, action: 'advance', expectedVersion: version })).ok).toBe(true);
    const active = await presentState.waitFor((s) => s.status === 'QUESTION_ACTIVE');
    for (const st of students) await st.state.waitFor((s) => s.status === 'QUESTION_ACTIVE' && s.questionIndex === 0);
    expect(active.question?.text).toBe('Q1: pick B');
    expect(active.questionEndsAt! - active.questionStartedAt!).toBe(10_000);
    // correct answer must never be sent to students / presentation before reveal
    expect(JSON.stringify(s1.state.latest)).not.toMatch(/"correct"/);
    expect(active.reveal).toBeNull();

    // Enter during the timer is not permitted
    expect((await emit(admin, 'admin:command', { sessionId, action: 'advance' })).code).toBe('NOT_PERMITTED');

    const a1 = await emit(s1.socket, 'student:answer', { questionIndex: 0, choice: 'B' });
    expect(a1.ok).toBe(true);
    const again = await emit(s1.socket, 'student:answer', { questionIndex: 0, choice: 'C' });
    expect(again.code).toBe('ALREADY_ANSWERED');
    // simultaneous double-tap: exactly one wins
    const [d1, d2] = await Promise.all([
      emit(s3.socket, 'student:answer', { questionIndex: 0, choice: 'A' }),
      emit(s3.socket, 'student:answer', { questionIndex: 0, choice: 'C' }),
    ]);
    expect([d1.ok, d2.ok].filter(Boolean)).toHaveLength(1);
    await sleep(600);
    expect((await emit(s5.socket, 'student:answer', { questionIndex: 0, choice: 'B' })).ok).toBe(true);
    await sleep(1200);
    expect((await emit(s2.socket, 'student:answer', { questionIndex: 0, choice: 'B' })).ok).toBe(true);
    await adminState.waitFor((s) => s.public.answeredCount === 4);
    await presentState.waitFor((s) => s.answeredCount === 4);

    // wait for the server timer to expire on its own
    const timeUp = await presentState.waitFor((s) => s.status === 'TIME_UP', 12_000);
    expect(timeUp.reveal).toBeNull();
    const late = await emit(s4.socket, 'student:answer', { questionIndex: 0, choice: 'B' });
    expect(late.ok).toBe(false);

    // double Enter: only one advance happens
    version = (await adminState.waitFor((s) => s.public.status === 'TIME_UP')).public.stateVersion;
    const [e1, e2] = await Promise.all([
      emit(admin, 'admin:command', { sessionId, action: 'advance', expectedVersion: version }),
      emit(admin, 'admin:command', { sessionId, action: 'advance', expectedVersion: version }),
    ]);
    expect([e1.ok, e2.ok].sort()).toEqual([false, true]);
    expect([e1.code, e2.code]).toContain('STALE');

    const reveal = await presentState.waitFor((s) => s.status === 'ANSWER_REVEAL');
    expect(reveal.reveal).toMatchObject({ correct: 'B', totalAnswers: 4 });
    expect(reveal.reveal!.counts.B).toBe(3);
    expect(reveal.fastest?.name).toBe('Aarav Mehta');

    const me1 = await s1.me.waitFor((m) => m.lastResult?.questionIndex === 0);
    const me2 = await s2.me.waitFor((m) => m.lastResult?.questionIndex === 0);
    const me3 = await s3.me.waitFor((m) => m.lastResult?.questionIndex === 0);
    const me4 = await s4.me.waitFor((m) => m.lastResult?.questionIndex === 0);
    const me5 = await s5.me.waitFor((m) => m.lastResult?.questionIndex === 0);
    expect(me1.lastResult).toMatchObject({ correct: true, isFastest: true });
    expect(me3.lastResult).toMatchObject({ correct: false, points: 0 });
    expect(me4.lastResult).toMatchObject({ choice: null, points: 0 });
    expect(me1.totalPoints).toBeGreaterThan(me5.totalPoints);
    expect(me5.totalPoints).toBeGreaterThan(me2.totalPoints);
    expect(me2.totalPoints).toBeGreaterThanOrEqual(500);
    expect(me1.rank).toBe(1);

    version = adminState.latest!.public.stateVersion;
    await emit(admin, 'admin:command', { sessionId, action: 'advance', expectedVersion: version });
    const board = await presentState.waitFor((s) => s.status === 'LEADERBOARD');
    expect(board.leaderboard!.slice(0, 3).map((e) => e.name)).toEqual(['Aarav Mehta', 'Rohan Verma', 'Diya Patel']);

    // ── Refresh: Diya reconnects with her token and keeps her score ──
    const pointsBefore = me2.totalPoints;
    s2.socket.disconnect();
    const s2b = socketFor(false);
    const resumed = await emit<{ me: MeState }>(s2b, 'student:resume', { code, token: s2.token });
    expect(resumed.ok).toBe(true);
    expect(resumed.me.totalPoints).toBe(pointsBefore);
    expect(resumed.me.name).toBe('Diya Patel');
    s2.socket = s2b;
    s2.state = tracker<PublicState>(s2b, 'state');
    s2.me = tracker<MeState>(s2b, 'me');
    expect((await emit(socketFor(false), 'student:resume', { code, token: 'not-a-real-token-123' })).code).toBe('UNKNOWN_PARTICIPANT');

    // New registrations are locked once the quiz started
    expect((await emit(socketFor(false), 'student:join', { code, name: 'Late Comer' })).code).toBe('JOIN_LOCKED');

    // ── Question 2: everyone except Kabir answers, instructor ends early ──
    await emit(admin, 'admin:command', { sessionId, action: 'advance', expectedVersion: board.stateVersion });
    await s2.state.waitFor((s) => s.status === 'QUESTION_ACTIVE' && s.questionIndex === 1);
    expect((await emit(s2.socket, 'student:answer', { questionIndex: 1, choice: 'A' })).ok).toBe(true);
    expect((await emit(s4.socket, 'student:answer', { questionIndex: 1, choice: 'A' })).ok).toBe(true);
    expect((await emit(s1.socket, 'student:answer', { questionIndex: 1, choice: 'C' })).ok).toBe(true);
    expect((await emit(s5.socket, 'student:answer', { questionIndex: 0, choice: 'A' })).code).toBe('WRONG_QUESTION');
    expect((await emit(admin, 'admin:command', { sessionId, action: 'endQuestion' })).ok).toBe(true);
    await presentState.waitFor((s) => s.status === 'TIME_UP' && s.questionIndex === 1);
    await emit(admin, 'admin:command', { sessionId, action: 'advance' }); // reveal
    const r2 = await presentState.waitFor((s) => s.status === 'ANSWER_REVEAL' && s.questionIndex === 1);
    expect(r2.fastest?.name).toBe('Diya Patel');
    await emit(admin, 'admin:command', { sessionId, action: 'advance' }); // leaderboard
    await presentState.waitFor((s) => s.status === 'LEADERBOARD' && s.questionIndex === 1);

    // ── Question 3 (last) ──
    await emit(admin, 'admin:command', { sessionId, action: 'advance' });
    await presentState.waitFor((s) => s.status === 'QUESTION_ACTIVE' && s.questionIndex === 2);
    await Promise.all(
      [s1, s2, s3, s4, s5].map((st, i) =>
        emit(st.socket, 'student:answer', { questionIndex: 2, choice: i % 2 === 0 ? 'D' : 'B' }),
      ),
    );
    await adminState.waitFor((s) => s.public.answeredCount === 5);
    await emit(admin, 'admin:command', { sessionId, action: 'endQuestion' });
    await presentState.waitFor((s) => s.status === 'TIME_UP' && s.questionIndex === 2);
    await emit(admin, 'admin:command', { sessionId, action: 'advance' });
    await emit(admin, 'admin:command', { sessionId, action: 'advance' });
    const lastBoard = await adminState.waitFor((s) => s.public.status === 'LEADERBOARD' && s.public.questionIndex === 2);
    expect(lastBoard.primaryAction?.label).toBe('Show Final Winners');
    await emit(admin, 'admin:command', { sessionId, action: 'advance' });
    const final = await presentState.waitFor((s) => s.status === 'FINISHED');
    expect((await emit(admin, 'admin:command', { sessionId, action: 'advance' })).code).toBe('NOT_PERMITTED');

    // ── Final winners match the stored results ──
    const results = await api(`/api/sessions/${sessionId}/results`);
    expect(results.status).toBe(200);
    expect(results.body.session.questionsPlayed).toBe(3);
    const stored = results.body.standings as { name: string; totalPoints: number; rank: number }[];
    expect(final.leaderboard!.slice(0, 3).map((e) => [e.name, e.totalPoints])).toEqual(
      stored.slice(0, 3).map((e) => [e.name, e.totalPoints]),
    );
    const dbResponses = await prisma.response.findMany({ where: { sessionId } });
    expect(dbResponses).toHaveLength(4 + 3 + 5);
    for (const st of stored) {
      const sum = dbResponses
        .filter((r) => r.participantId === (results.body.standings as { participantId: string; name: string }[]).find((x) => x.name === st.name)!.participantId)
        .reduce((acc, r) => acc + r.points, 0);
      expect(sum).toBe(st.totalPoints);
    }
    // the per-student final screen agrees with the stored rank
    const finalMe = await s1.me.waitFor((m) => m.rank !== null && m.totalPoints === stored.find((x) => x.name === 'Aarav Mehta')!.totalPoints);
    expect(finalMe.rank).toBe(stored.find((x) => x.name === 'Aarav Mehta')!.rank);

    const csv = await fetch(`${baseUrl}/api/sessions/${sessionId}/results.csv`, { headers: { cookie } });
    expect(csv.status).toBe(200);
    const csvText = await csv.text();
    expect(csvText).toContain('Rank,Name,Roll No,Total Points');
    expect(csvText.split('\r\n').filter(Boolean)).toHaveLength(6);
  });

  afterAll(async () => {
    if (quizId) await prisma.quiz.delete({ where: { id: quizId } }).catch(() => undefined);
    if (sessionId) await prisma.quizSession.delete({ where: { id: sessionId } }).catch(() => undefined);
  });
});
