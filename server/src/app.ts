import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { config } from './lib/config';
import { GameManager } from './game/engine';
import { attachRealtime } from './realtime';
import { authRouter } from './routes/auth';
import { quizRouter } from './routes/quizzes';
import { sessionRouter } from './routes/sessions';
import { publicRouter } from './routes/public';

export function createApp() {
  const app = express();
  const manager = new GameManager();

  const trust = config.trustProxy;
  app.set('trust proxy', /^\d+$/.test(trust) ? Number(trust) : trust);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'"],
          // canvas-confetti renders in an OffscreenCanvas worker created from a blob URL.
          'worker-src': ["'self'", 'blob:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
          // Allow plain-HTTP LAN deployments in classrooms.
          'upgrade-insecure-requests': null,
        },
      },
      strictTransportSecurity: config.isProduction,
      crossOriginOpenerPolicy: false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.use('/api', publicRouter(manager));
  app.use('/api/auth', authRouter);
  app.use('/api/quizzes', quizRouter);
  app.use('/api/sessions', sessionRouter(manager));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Serve the built React app (single-origin deployment).
  if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/socket.io')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[http] error', err);
    if (res.headersSent) return;
    const status = (err as { status?: number })?.status;
    if (status && status >= 400 && status < 500) {
      res.status(status).json({ error: (err as Error).message || 'Bad request' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    pingInterval: 10_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 64 * 1024,
    serveClient: false,
  });
  attachRealtime(io, manager);

  return { app, server, io, manager };
}
