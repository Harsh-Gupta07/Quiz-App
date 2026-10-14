import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAdmin } from '../lib/auth';
import type { GameManager } from '../game/engine';
import { loadResults, rankingsCsv, responsesCsv } from '../game/results';

export function sessionRouter(manager: GameManager) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', async (_req, res) => {
    const sessions = await prisma.quizSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { participants: true } } },
    });
    res.json(
      sessions.map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        status: s.status,
        quizId: s.quizId,
        timerSeconds: s.timerSeconds,
        createdAt: s.createdAt,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        participantCount: s._count.participants,
        totalQuestions: Array.isArray(s.questions) ? s.questions.length : 0,
      })),
    );
  });

  router.get('/:id', async (req, res) => {
    const s = await prisma.quizSession.findUnique({ where: { id: req.params.id } });
    if (!s) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    res.json({ id: s.id, code: s.code, title: s.title, status: s.status, quizId: s.quizId, timerSeconds: s.timerSeconds });
  });

  router.delete('/:id', async (req, res) => {
    manager.evict(req.params.id);
    await prisma.quizSession.delete({ where: { id: req.params.id } }).catch(() => undefined);
    res.json({ ok: true });
  });

  router.get('/:id/results', async (req, res) => {
    const results = await loadResults(req.params.id);
    if (!results) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    res.json(results);
  });

  const fileBase = (title: string, code: string) =>
    `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '') || 'quiz'}-${code}`;

  router.get('/:id/results.csv', async (req, res) => {
    const results = await loadResults(req.params.id);
    if (!results) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileBase(results.session.title, results.session.code)}-rankings.csv"`,
    );
    res.send(rankingsCsv(results));
  });

  router.get('/:id/responses.csv', async (req, res) => {
    const results = await loadResults(req.params.id);
    if (!results) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileBase(results.session.title, results.session.code)}-responses.csv"`,
    );
    res.send(responsesCsv(results));
  });

  return router;
}
