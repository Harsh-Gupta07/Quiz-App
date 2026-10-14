import type { Server, Socket } from 'socket.io';
import { ADMIN_COOKIE, parseCookieHeader, verifyAdminToken } from './lib/auth';
import { normalizeJoinCode } from './lib/codes';
import { RateLimiter } from './lib/rateLimit';
import { GameError, type GameManager, type NotifyKind, type SessionRuntime } from './game/engine';
import type { AdminAction } from './shared/protocol';

const publicRoom = (sessionId: string) => `s:${sessionId}`;
const adminRoom = (sessionId: string) => `a:${sessionId}`;
const participantRoom = (participantId: string) => `p:${participantId}`;

const ADMIN_ACTIONS: AdminAction[] = ['advance', 'start', 'endQuestion', 'reveal', 'leaderboard', 'next', 'finish'];

interface SocketData {
  participantId: string | null;
  sessionId: string | null;
}

/** Coalesces frequent updates (joins, answers) so 100 students tapping at once don't flood clients. */
class Broadcaster {
  private pending = new Map<string, NodeJS.Timeout>();

  constructor(private readonly io: Server) {}

  schedule(rt: SessionRuntime, kind: NotifyKind) {
    if (kind === 'transition') {
      const t = this.pending.get(rt.id);
      if (t) clearTimeout(t);
      this.pending.delete(rt.id);
      this.flush(rt, true);
      return;
    }
    if (this.pending.has(rt.id)) return;
    this.pending.set(
      rt.id,
      setTimeout(() => {
        this.pending.delete(rt.id);
        this.flush(rt, false);
      }, 150),
    );
  }

  flush(rt: SessionRuntime, includeParticipants: boolean) {
    this.io.to(publicRoom(rt.id)).emit('state', rt.publicState());
    this.io.to(adminRoom(rt.id)).emit('admin:state', rt.adminState());
    if (includeParticipants) {
      for (const pid of rt.onlineParticipantIds()) {
        const me = rt.meState(pid);
        if (me) this.io.to(participantRoom(pid)).emit('me', me);
      }
    }
  }
}

function toAck(err: unknown) {
  if (err instanceof GameError) return { ok: false as const, error: err.message, code: err.code };
  console.error('[socket] unexpected error', err);
  return { ok: false as const, error: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' };
}

function clientIp(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return socket.handshake.address;
}

export function attachRealtime(io: Server, manager: GameManager) {
  const broadcaster = new Broadcaster(io);
  manager.setNotify((rt, kind) => broadcaster.schedule(rt, kind));

  const joinLimiter = new RateLimiter(Number(process.env.JOIN_RATE_LIMIT) || 300, 60_000); // per IP (classrooms share NAT)
  const eventLimiter = new RateLimiter(60, 10_000); // per socket

  io.on('connection', (socket) => {
    const data = socket.data as SocketData;
    data.participantId = null;
    data.sessionId = null;
    const ip = clientIp(socket);
    const isAdmin = () =>
      verifyAdminToken(parseCookieHeader(socket.handshake.headers.cookie)[ADMIN_COOKIE]);

    const on = (event: string, handler: (payload: Record<string, unknown>) => Promise<object> | object) => {
      socket.on(event, async (payload: unknown, ack?: unknown) => {
        const reply = typeof ack === 'function' ? (ack as (res: object) => void) : () => undefined;
        if (!eventLimiter.take(socket.id)) {
          reply({ ok: false, error: 'Too many requests — please slow down.', code: 'RATE_LIMITED' });
          return;
        }
        try {
          const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
          reply({ ok: true, ...(await handler(body)) });
        } catch (err) {
          reply(toAck(err));
        }
      });
    };

    const requireRuntime = async (sessionId: unknown) => {
      const rt = await manager.get(sessionId);
      if (!rt) throw new GameError('NOT_FOUND', 'This quiz session no longer exists.');
      return rt;
    };

    const unbindParticipant = async () => {
      if (data.participantId && data.sessionId) {
        const rt = await manager.get(data.sessionId);
        rt?.detachSocket(data.participantId, socket.id);
        socket.leave(participantRoom(data.participantId));
        socket.leave(publicRoom(data.sessionId));
      }
      data.participantId = null;
      data.sessionId = null;
    };

    const bindParticipant = async (rt: SessionRuntime, participantId: string) => {
      if (data.participantId !== participantId) await unbindParticipant();
      data.participantId = participantId;
      data.sessionId = rt.id;
      await socket.join([publicRoom(rt.id), participantRoom(participantId)]);
      rt.attachSocket(participantId, socket.id);
    };

    on('time:sync', () => ({ serverNow: Date.now() }));

    // ───── students ─────
    on('student:join', async (body) => {
      if (!joinLimiter.take(ip)) {
        throw new GameError('RATE_LIMITED', 'Too many join attempts from this network. Please wait a minute.');
      }
      const code = normalizeJoinCode(body.code);
      if (!code) throw new GameError('INVALID_CODE', 'Please enter a valid 6-character quiz code.');
      const rt = await manager.getByCode(code);
      if (!rt) throw new GameError('INVALID_CODE', 'No quiz found with that code. Please check and try again.');
      const { token, participantId } = await rt.join(body.name, body.rollNo);
      await bindParticipant(rt, participantId);
      return { token, sessionId: rt.id, participantId, state: rt.publicState(), me: rt.meState(participantId) };
    });

    on('student:resume', async (body) => {
      const code = normalizeJoinCode(body.code);
      const rt = code ? await manager.getByCode(code) : await manager.get(body.sessionId);
      if (!rt) throw new GameError('INVALID_CODE', 'This quiz session no longer exists.');
      const participantId = rt.resume(body.token);
      if (!participantId) {
        throw new GameError('UNKNOWN_PARTICIPANT', 'We could not find your previous entry. Please join again.');
      }
      await bindParticipant(rt, participantId);
      return { sessionId: rt.id, participantId, state: rt.publicState(), me: rt.meState(participantId) };
    });

    on('student:answer', async (body) => {
      if (!data.participantId || !data.sessionId) {
        throw new GameError('NOT_JOINED', 'You are not connected to a quiz. Please refresh the page.');
      }
      const rt = await requireRuntime(data.sessionId);
      await rt.answer(data.participantId, body.questionIndex, body.choice);
      return { me: rt.meState(data.participantId) };
    });

    on('student:leave', async () => {
      await unbindParticipant();
      return {};
    });

    // ───── presentation (public, read-only) ─────
    on('present:watch', async (body) => {
      const rt = await requireRuntime(body.sessionId);
      await socket.join(publicRoom(rt.id));
      return { state: rt.publicState(), isAdmin: isAdmin() };
    });

    // ───── admin ─────
    const requireAdmin = () => {
      if (!isAdmin()) throw new GameError('UNAUTHORIZED', 'Your admin login has expired. Please log in again.');
    };

    on('admin:watch', async (body) => {
      requireAdmin();
      const rt = await requireRuntime(body.sessionId);
      await socket.join(adminRoom(rt.id));
      return { state: rt.adminState() };
    });

    on('admin:command', async (body) => {
      requireAdmin();
      const action = body.action as AdminAction;
      if (!ADMIN_ACTIONS.includes(action)) throw new GameError('INVALID_ACTION', 'Unknown command.');
      const expected = typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined;
      const rt = await requireRuntime(body.sessionId);
      await rt.command(action, expected);
      return { stateVersion: rt.stateVersion };
    });

    on('admin:setLock', async (body) => {
      requireAdmin();
      const rt = await requireRuntime(body.sessionId);
      await rt.setLockJoin(Boolean(body.lock));
      return {};
    });

    on('admin:kick', async (body) => {
      requireAdmin();
      const rt = await requireRuntime(body.sessionId);
      const pid = typeof body.participantId === 'string' ? body.participantId : '';
      if (!rt.hasParticipant(pid)) throw new GameError('NOT_FOUND', 'Participant not found.');
      io.to(participantRoom(pid)).emit('kicked', { message: 'You were removed from this quiz by the instructor.' });
      await rt.removeParticipant(pid);
      io.in(participantRoom(pid)).socketsLeave([participantRoom(pid), publicRoom(rt.id)]);
      return {};
    });

    socket.on('disconnect', () => {
      void unbindParticipant();
    });
  });
}
