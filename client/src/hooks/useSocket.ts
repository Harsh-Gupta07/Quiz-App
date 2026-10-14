import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createSocket, syncClock } from '../lib/socket';

/**
 * Creates one socket for the lifetime of the component.
 * `onConnect` runs on the first connect AND after every reconnect, so pages re-subscribe automatically.
 */
export function useSocket(onConnect: (socket: Socket) => void) {
  const [socket] = useState(createSocket);
  const [connected, setConnected] = useState(socket.connected);
  const handler = useRef(onConnect);
  handler.current = onConnect;

  useEffect(() => {
    const connect = () => {
      setConnected(true);
      handler.current(socket);
      void syncClock(socket);
    };
    const disconnect = () => setConnected(false);
    socket.on('connect', connect);
    socket.on('disconnect', disconnect);
    if (!socket.connected) socket.connect();
    else connect();
    return () => {
      socket.off('connect', connect);
      socket.off('disconnect', disconnect);
      socket.disconnect();
    };
  }, [socket]);

  return { socket, connected };
}
