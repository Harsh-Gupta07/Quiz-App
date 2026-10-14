import { PrismaClient } from '@prisma/client';
import { CLAUDE_QUESTIONS } from './seed-questions';

const prisma = new PrismaClient();
const TITLE = 'Mastering Claude AI — Workshop Quiz';

async function main() {
  const existing = await prisma.quiz.findFirst({ where: { title: TITLE } });
  if (existing) {
    console.log(`Seed quiz already exists (${existing.id}) — skipping. Delete it in the admin panel to re-seed.`);
    return;
  }
  const quiz = await prisma.quiz.create({
    data: {
      title: TITLE,
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
  console.log(`Seeded "${quiz.title}" with ${CLAUDE_QUESTIONS.length} questions.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
