import { PrismaClient } from '@prisma/client';
import { seedDemoQuiz } from '../src/seed/seedDemoQuiz';

const prisma = new PrismaClient();

seedDemoQuiz(prisma)
  .then((message) => console.log(message))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
