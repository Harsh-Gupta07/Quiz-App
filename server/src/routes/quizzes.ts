import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { requireAdmin } from '../lib/auth';
import { createSessionSchema, quizInputSchema, type QuestionInput } from '../lib/validation';
import { parseQuestions } from '../lib/importer';
import { generateJoinCode } from '../lib/codes';
import { loadQuizSnapshot } from '../game/engine';
import { TIMER_OPTIONS } from '../shared/protocol';

export const quizRouter = Router();
quizRouter.use(requireAdmin);

const questionRows = (quizId: string, questions: QuestionInput[], offset = 0) =>
  questions.map((q, i) => ({
    quizId,
    position: offset + i,
    text: q.text,
    optionA: q.options[0],
    optionB: q.options[1],
    optionC: q.options[2],
    optionD: q.options[3],
    correct: q.correct,
    explanation: q.explanation ?? null,
  }));

async function getQuiz(id: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { position: 'asc' } } },
  });
  if (!quiz) return null;
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    timerSeconds: quiz.timerSeconds,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      text: q.text,
      options: [q.optionA, q.optionB, q.optionC, q.optionD],
      correct: q.correct,
      explanation: q.explanation,
    })),
  };
}

quizRouter.get('/', async (_req, res) => {
  const quizzes = await prisma.quiz.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { questions: true, sessions: true } } },
  });
  res.json(
    quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      timerSeconds: q.timerSeconds,
      updatedAt: q.updatedAt,
      questionCount: q._count.questions,
      sessionCount: q._count.sessions,
    })),
  );
});

quizRouter.post('/', async (req, res) => {
  const parsed = quizInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid quiz', details: parsed.error.flatten() });
    return;
  }
  const { questions, ...fields } = parsed.data;
  const quiz = await prisma.$transaction(async (tx) => {
    const created = await tx.quiz.create({ data: fields });
    if (questions.length) await tx.question.createMany({ data: questionRows(created.id, questions) });
    return created;
  });
  res.status(201).json(await getQuiz(quiz.id));
});

quizRouter.get('/:id', async (req, res) => {
  const quiz = await getQuiz(req.params.id);
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }
  res.json(quiz);
});

/** Saves the whole quiz (fields + ordered question list) in one transaction. */
quizRouter.put('/:id', async (req, res) => {
  const parsed = quizInputSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const qIndex = issue.path[0] === 'questions' ? Number(issue.path[1]) + 1 : null;
    res.status(400).json({
      error: qIndex ? `Question ${qIndex}: ${issue.path.slice(2).join(' ') || 'field'} — ${issue.message}` : issue.message,
    });
    return;
  }
  const { questions, ...fields } = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.quiz.update({ where: { id: req.params.id }, data: fields });
      await tx.question.deleteMany({ where: { quizId: req.params.id } });
      if (questions.length) await tx.question.createMany({ data: questionRows(req.params.id, questions) });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }
    throw err;
  }
  res.json(await getQuiz(req.params.id));
});

quizRouter.delete('/:id', async (req, res) => {
  await prisma.quiz.delete({ where: { id: req.params.id } }).catch(() => undefined);
  res.json({ ok: true });
});

quizRouter.post('/:id/duplicate', async (req, res) => {
  const source = await getQuiz(req.params.id);
  if (!source) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }
  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.quiz.create({
      data: { title: `${source.title} (copy)`.slice(0, 120), description: source.description, timerSeconds: source.timerSeconds },
    });
    await tx.question.createMany({
      data: questionRows(
        created.id,
        source.questions.map((q) => ({ ...q, options: q.options as [string, string, string, string], correct: q.correct as 'A' })),
      ),
    });
    return created;
  });
  res.status(201).json(await getQuiz(copy.id));
});

const importSchema = z.object({
  format: z.enum(['json', 'csv']),
  content: z.string().min(1).max(2_000_000),
  mode: z.enum(['append', 'replace']).default('append'),
});

quizRouter.post('/:id/import', async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Provide a format (json/csv) and file content.' });
    return;
  }
  const { format, content, mode } = parsed.data;
  const result = parseQuestions(content, format);
  if (result.questions.length === 0) {
    res.status(400).json({ error: 'No valid questions found.', errors: result.errors });
    return;
  }
  const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id }, include: { _count: { select: { questions: true } } } });
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }
  await prisma.$transaction(async (tx) => {
    let offset = quiz._count.questions;
    if (mode === 'replace') {
      await tx.question.deleteMany({ where: { quizId: quiz.id } });
      offset = 0;
    }
    await tx.question.createMany({ data: questionRows(quiz.id, result.questions, offset) });
    await tx.quiz.update({ where: { id: quiz.id }, data: { updatedAt: new Date() } });
  });
  res.json({ imported: result.questions.length, errors: result.errors, quiz: await getQuiz(quiz.id) });
});

quizRouter.get('/:id/export', async (req, res) => {
  const quiz = await getQuiz(req.params.id);
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }
  const filename = quiz.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'quiz';
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
  res.json({
    title: quiz.title,
    description: quiz.description,
    timerSeconds: quiz.timerSeconds,
    questions: quiz.questions.map(({ text, options, correct, explanation }) => ({ text, options, correct, explanation })),
  });
});

quizRouter.post('/:id/sessions', async (req, res) => {
  const parsed = createSessionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: `Timer must be ${TIMER_OPTIONS.join(', ')} seconds.` });
    return;
  }
  const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id } });
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }
  const snapshot = await loadQuizSnapshot(quiz.id);
  if (snapshot.length === 0) {
    res.status(400).json({ error: 'Add at least one question before starting a session.' });
    return;
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const session = await prisma.quizSession.create({
        data: {
          code: generateJoinCode(),
          quizId: quiz.id,
          title: quiz.title,
          timerSeconds: parsed.data.timerSeconds ?? quiz.timerSeconds,
          lockJoinOnStart: parsed.data.lockJoinOnStart,
          questions: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      res.status(201).json({ id: session.id, code: session.code });
      return;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue; // code collision
      throw err;
    }
  }
  res.status(500).json({ error: 'Could not allocate a join code. Please try again.' });
});
