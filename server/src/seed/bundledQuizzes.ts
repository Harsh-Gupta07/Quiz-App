import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { quizInputSchema } from '../lib/validation';

/** Repo-root `quizzes/` folder (same relative path from src/seed and dist/seed). */
export const QUIZZES_DIR = path.resolve(__dirname, '../../../quizzes');

/**
 * Adds every quiz file in `quizzes/*.json` to the database once.
 * - Already added (recorded in SeedRecord) → skipped, even if the quiz was later deleted.
 * - A quiz with the same title already exists (e.g. imported by hand) → just recorded, no duplicate.
 * Disable with SEED_BUNDLED_QUIZZES=false.
 */
export async function seedBundledQuizzes(prisma: PrismaClient, dir = QUIZZES_DIR): Promise<string[]> {
  if (process.env.SEED_BUNDLED_QUIZZES === 'false' || !fs.existsSync(dir)) return [];
  const added: string[] = [];
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json')).sort();

  for (const file of files) {
    const key = `quiz-file:${file}`;
    if (await prisma.seedRecord.findUnique({ where: { key } })) continue;

    let parsed;
    try {
      parsed = quizInputSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
    } catch (err) {
      console.error(`  Skipping quizzes/${file}: invalid JSON (${(err as Error).message})`);
      continue;
    }
    if (!parsed.success) {
      console.error(`  Skipping quizzes/${file}: ${parsed.error.issues[0]?.message ?? 'invalid quiz'}`);
      continue;
    }

    const { questions, ...fields } = parsed.data;
    await prisma.$transaction(async (tx) => {
      const exists = await tx.quiz.findFirst({ where: { title: fields.title } });
      if (!exists) {
        await tx.quiz.create({
          data: {
            ...fields,
            questions: {
              create: questions.map((q, i) => ({
                position: i,
                text: q.text,
                optionA: q.options[0],
                optionB: q.options[1],
                optionC: q.options[2],
                optionD: q.options[3],
                correct: q.correct,
                explanation: q.explanation ?? null,
              })),
            },
          },
        });
        added.push(`${fields.title} (${questions.length} questions)`);
      }
      await tx.seedRecord.create({ data: { key } });
    });
  }
  return added;
}
