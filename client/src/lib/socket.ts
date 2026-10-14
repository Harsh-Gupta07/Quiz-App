import { io, type Socket } from 'socket.io-client';
import type { Ack } from '@shared/protocol';

export function createSocket(): Socket {
  return io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 10_000,
  });
}

/** emit with acknowledgement + timeout, resolved as an `Ack` union. */
export function request<T extends object = Record<string, never>>(
  socket: Socket,
  event: string,
  payload: unknown = {},
  timeoutMs = 8000,
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: Ack<T>) => {
      if (err) resolve({ ok: false, error: 'No response from server. Check your connection.', code: 'TIMEOUT' });
      else resolve(res);
    });
  });
}

// ───── Server clock synchronisation ─────
// offset = serverTime − clientTime. Timers display `endsAt − (Date.now() + offset)`.
let clockOffset = 0;
let bestRtt = Infinity;

export function serverNow() {
  return Date.now() + clockOffset;
}

/** Cheap fallback from any state payload, used until a proper ping sample arrives. */
export function hintServerTime(serverTime: number) {
  if (bestRtt === Infinity) clockOffset = serverTime - Date.now();
}

export async function syncClock(socket: Socket, samples = 5) {
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const res = await request<{ serverNow: number }>(socket, 'time:sync', {}, 3000);
    const t1 = Date.now();
    if (res.ok) {
      const rtt = t1 - t0;
      if (rtt <= bestRtt) {
        bestRtt = rtt;
        clockOffset = res.serverNow + rtt / 2 - t1;
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }
}
