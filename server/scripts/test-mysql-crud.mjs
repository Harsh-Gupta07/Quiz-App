/** Rollback-only smoke test for the live MySQL schema. Leaves no test rows behind. */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const rollback = new Error('ROLLBACK_CRUD_SMOKE_TEST');

try {
  await prisma.$connect();
  await prisma.$transaction(async (tx) => {
    const quiz = await tx.quiz.create({
      data: {
        title: 'CRUD smoke test',
        description: 'This transaction is always rolled back.',
        timerSeconds: 15,
        questions: { create: { position: 0, text: 'Smoke-test question?', optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D', correct: 'A' } },
      },
      include: { questions: true },
    });
    const readQuiz = await tx.quiz.findUnique({ where: { id: quiz.id }, include: { questions: true } });
    if (!readQuiz || readQuiz.questions.length !== 1) throw new Error('Quiz create/read verification failed.');

    const updated = await tx.quiz.update({ where: { id: quiz.id }, data: { title: 'CRUD smoke test updated' } });
    if (updated.title !== 'CRUD smoke test updated') throw new Error('Quiz update verification failed.');

    const session = await tx.quizSession.create({
      data: {
        code: `T${Date.now().toString(36).slice(-5)}`.toUpperCase(), quizId: quiz.id,
        title: updated.title, timerSeconds: 15,
        questions: [{ id: quiz.questions[0].id, text: 'Smoke-test question?' }],
      },
    });
    const participant = await tx.participant.create({
      data: {
        sessionId: session.id, name: 'CRUD Test Participant', nameKey: `crud-test-${Date.now()}`,
        tokenHash: `crud-test-${crypto.randomUUID()}`,
      },
    });
    const response = await tx.response.create({
      data: {
        sessionId: session.id, participantId: participant.id, questionIndex: 0,
        questionId: quiz.questions[0].id, choice: 'A', isCorrect: true,
        responseTimeMs: 100, points: 999, receivedAt: new Date(),
      },
    });
    if (!(await tx.response.findUnique({ where: { id: response.id } }))) throw new Error('Response read verification failed.');

    await tx.response.delete({ where: { id: response.id } });
    await tx.participant.delete({ where: { id: participant.id } });
    await tx.quizSession.delete({ where: { id: session.id } });
    await tx.quiz.delete({ where: { id: quiz.id } });
    if (await tx.quiz.findUnique({ where: { id: quiz.id } })) throw new Error('Delete verification failed.');
    throw rollback;
  }, { maxWait: 10_000, timeout: 30_000 });
} catch (error) {
  if (error !== rollback) {
    console.error('MySQL CRUD smoke test failed:', error?.name ?? 'DatabaseError');
    process.exitCode = 1;
  } else {
    console.log('MySQL connection and transactional CRUD checks passed; test data was rolled back.');
  }
} finally {
  await prisma.$disconnect();
}
