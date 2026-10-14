import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config, lanAddresses } from '../lib/config';
import { normalizeJoinCode } from '../lib/codes';
import type { GameManager } from '../game/engine';

export function publicRouter(manager: GameManager) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, time: Date.now() });
  });

  router.get('/config', (_req, res) => {
    res.json({ publicUrl: config.publicUrl, lanAddresses: lanAddresses(), production: config.isProduction });
  });

  const lookupLimiter = rateLimit({ windowMs: 60_000, limit: 1200, standardHeaders: 'draft-7', legacyHeaders: false });

  router.get('/public/join/:code', lookupLimiter, async (req, res) => {
    const code = normalizeJoinCode(req.params.code);
    const rt = code ? await manager.getByCode(code) : null;
    if (!rt) {
      res.status(404).json({ error: 'No quiz found with that code. Please check and try again.' });
      return;
    }
    res.json({
      sessionId: rt.id,
      code: rt.code,
      title: rt.title,
      status: rt.status,
      joinLocked: rt.joinLocked,
      participantCount: rt.participantCount,
    });
  });

  return router;
}
