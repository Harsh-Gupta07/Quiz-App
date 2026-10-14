import type { PrismaClient } from '@prisma/client';
import { CLAUDE_QUESTIONS } from './claudeQuestions';

export const DEMO_QUIZ_TITLE = 'Mastering Claude AI — Workshop Quiz';

async function createDemoQuiz(prisma: PrismaClient) {
  return prisma.quiz.create({
    data: {
      title: DEMO_QUIZ_TITLE,
      description: 'Prompting techniques, Projects, Skills, Artifacts, Connectors, MCP and safe use of connected apps.',
      timerSeconds: 15,
      questions: {
        create: CLAUDE_QUESTIONS.map((q, i) => ({
          position: i,
          text: q.text,
          optionA: q.options[0],
          optionB: q.options[1],
          optionC: q.options[2],
          optionD: q.options[3],
          correct: q.correct,
          explanation: q.explanation,
        })),
      },
    },
  });
}

/** `npm run db:seed`: adds the demo quiz unless one with the same title already exists. */
export async function seedDemoQuiz(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.quiz.findFirst({ where: { title: DEMO_QUIZ_TITLE } });
  if (existing) return `Seed quiz already exists (${existing.id}) — skipping.`;
  await createDemoQuiz(prisma);
  return `Seeded "${DEMO_QUIZ_TITLE}" with ${CLAUDE_QUESTIONS.length} questions.`;
}

/**
 * On server start: seed only a brand-new database (no quizzes and no sessions ever created),
 * so hosts without a shell (e.g. Render free plan) get the questions automatically, while
 * deleting quizzes later never brings them back. Disable with SEED_DEMO_QUIZ=false.
 */
export async function seedIfEmpty(prisma: PrismaClient): Promise<boolean> {
  if (process.env.SEED_DEMO_QUIZ === 'false') return false;
  const [quizzes, sessions] = await Promise.all([prisma.quiz.count(), prisma.quizSession.count()]);
  if (quizzes > 0 || sessions > 0) return false;
  await createDemoQuiz(prisma);
  return true;
}
