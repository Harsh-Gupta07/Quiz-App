import { z } from 'zod';
import { DEFAULT_TIMER, OPTION_KEYS, TIMER_OPTIONS } from '../shared/protocol';

const text = (max: number) => z.string().trim().min(1, 'Required').max(max);

export const timerSchema = z.union([z.literal(TIMER_OPTIONS[0]), z.literal(TIMER_OPTIONS[1]), z.literal(TIMER_OPTIONS[2])]);

export const questionInputSchema = z.object({
  id: z.string().optional(),
  text: text(500),
  options: z.tuple([text(200), text(200), text(200), text(200)]),
  correct: z.enum(OPTION_KEYS),
  explanation: z
    .string()
    .trim()
    .max(600)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const quizInputSchema = z.object({
  title: text(120),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  timerSeconds: timerSchema.default(DEFAULT_TIMER),
  questions: z.array(questionInputSchema).max(200).default([]),
});
export type QuizInput = z.infer<typeof quizInputSchema>;

export const createSessionSchema = z.object({
  timerSeconds: timerSchema.optional(),
  lockJoinOnStart: z.boolean().default(true),
});

/** Cleans a display name: strips control chars, collapses whitespace. */
export function cleanName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .normalize('NFKC')
    // Strip control, invisible formatting (zero-width, bidi overrides) and line-separator characters.
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 2 || cleaned.length > 40) return null;
  return cleaned;
}

export function cleanRollNo(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 30);
  return cleaned || null;
}

export function nameKey(name: string): string {
  return name.toLocaleLowerCase('en-IN').replace(/\s+/g, ' ').trim();
}
