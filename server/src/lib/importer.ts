import Papa from 'papaparse';
import { questionInputSchema, type QuestionInput } from './validation';
import { OPTION_KEYS, type OptionKey } from '../shared/protocol';

export interface ImportResult {
  questions: QuestionInput[];
  errors: string[];
}

/**
 * Normalises the "correct answer" field. Accepts A–D, a–d, 1–4, or the exact option text.
 */
function parseCorrect(raw: unknown, options: string[]): OptionKey | null {
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  const upper = value.toUpperCase().replace(/^OPTION\s*/, '');
  if ((OPTION_KEYS as readonly string[]).includes(upper)) return upper as OptionKey;
  if (/^[1-4]$/.test(upper)) return OPTION_KEYS[Number(upper) - 1];
  const byText = options.findIndex((o) => o.trim().toLowerCase() === value.toLowerCase());
  return byText >= 0 ? OPTION_KEYS[byText] : null;
}

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    for (const actual of Object.keys(row)) {
      if (actual.trim().toLowerCase().replace(/[\s_-]+/g, '') === key) return row[actual];
    }
  }
  return undefined;
}

function toQuestion(row: Record<string, unknown>, label: string, errors: string[]): QuestionInput | null {
  let options: unknown[] | undefined;
  const rawOptions = pick(row, 'options', 'choices');
  if (Array.isArray(rawOptions)) {
    options = rawOptions;
  } else if (rawOptions && typeof rawOptions === 'object') {
    const o = rawOptions as Record<string, unknown>;
    options = [o.A ?? o.a, o.B ?? o.b, o.C ?? o.c, o.D ?? o.d];
  } else {
    options = [
      pick(row, 'a', 'optiona', 'option1'),
      pick(row, 'b', 'optionb', 'option2'),
      pick(row, 'c', 'optionc', 'option3'),
      pick(row, 'd', 'optiond', 'option4'),
    ];
  }
  const optionStrings = options.map((o) => (o === undefined || o === null ? '' : String(o)));
  const candidate = {
    text: String(pick(row, 'question', 'text', 'questiontext') ?? ''),
    options: optionStrings,
    correct: parseCorrect(pick(row, 'correct', 'answer', 'correctanswer', 'correctoption'), optionStrings),
    explanation: (pick(row, 'explanation', 'reason', 'notes') as string | undefined) ?? null,
  };
  const parsed = questionInputSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.join('.') || 'row';
    const msg =
      issue.path[0] === 'correct'
        ? 'correct answer must be A, B, C or D'
        : issue.path[0] === 'options'
          ? 'all four options (A–D) are required'
          : `${where}: ${issue.message}`;
    errors.push(`${label}: ${msg}`);
    return null;
  }
  return parsed.data;
}

export function parseQuestionsJson(content: string): ImportResult {
  const errors: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    return { questions: [], errors: [`Invalid JSON: ${(e as Error).message}`] };
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { questions?: unknown }).questions)
      ? (data as { questions: unknown[] }).questions
      : null;
  if (!list) return { questions: [], errors: ['JSON must be an array of questions or { "questions": [...] }.'] };
  const questions: QuestionInput[] = [];
  list.forEach((row, i) => {
    if (!row || typeof row !== 'object') {
      errors.push(`Question ${i + 1}: not an object`);
      return;
    }
    const q = toQuestion(row as Record<string, unknown>, `Question ${i + 1}`, errors);
    if (q) questions.push(q);
  });
  return { questions, errors };
}

export function parseQuestionsCsv(content: string): ImportResult {
  const errors: string[] = [];
  const parsed = Papa.parse<Record<string, string>>(content.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
  });
  for (const err of parsed.errors.slice(0, 5)) errors.push(`CSV row ${(err.row ?? 0) + 2}: ${err.message}`);
  const questions: QuestionInput[] = [];
  parsed.data.forEach((row, i) => {
    const q = toQuestion(row, `CSV row ${i + 2}`, errors);
    if (q) questions.push(q);
  });
  return { questions, errors };
}

export function parseQuestions(content: string, format: 'json' | 'csv'): ImportResult {
  return format === 'json' ? parseQuestionsJson(content) : parseQuestionsCsv(content);
}
