import { describe, expect, it } from 'vitest';
import { parseQuestionsCsv, parseQuestionsJson } from '../src/lib/importer';
import { csvCell } from '../src/game/results';
import { cleanName } from '../src/lib/validation';
import { normalizeJoinCode } from '../src/lib/codes';

describe('question import', () => {
  it('parses JSON arrays with options arrays', () => {
    const { questions, errors } = parseQuestionsJson(
      JSON.stringify([{ text: 'What is 2+2?', options: ['3', '4', '5', '6'], correct: 'B', explanation: 'Basic maths' }]),
    );
    expect(errors).toEqual([]);
    expect(questions[0]).toMatchObject({ text: 'What is 2+2?', correct: 'B', explanation: 'Basic maths' });
  });

  it('accepts { questions: [...] } with lettered option fields and numeric answers', () => {
    const { questions } = parseQuestionsJson(
      JSON.stringify({ questions: [{ question: 'Q?', A: 'a', B: 'b', C: 'c', D: 'd', answer: 3 }] }),
    );
    expect(questions[0].correct).toBe('C');
  });

  it('parses CSV with common headers and quoted commas', () => {
    const csv = [
      'question,option_a,option_b,option_c,option_d,correct,explanation',
      '"Which, of these?",One,Two,Three,Four,d,"Because, reasons"',
      'Second?,W,X,Y,Z,X,',
    ].join('\n');
    const { questions, errors } = parseQuestionsCsv(csv);
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ text: 'Which, of these?', correct: 'D', explanation: 'Because, reasons' });
    expect(questions[1].correct).toBe('B'); // matched by option text
  });

  it('reports invalid rows without dropping valid ones', () => {
    const csv = 'question,a,b,c,d,correct\nGood?,1,2,3,4,A\nBad?,1,2,,4,A\nAlso bad?,1,2,3,4,E';
    const { questions, errors } = parseQuestionsCsv(csv);
    expect(questions).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });
});

describe('safety helpers', () => {
  it('neutralises spreadsheet formula injection in CSV exports', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 98765')).toBe("'+91 98765");
    expect(csvCell('Ravi')).toBe('Ravi');
  });

  it('cleans participant names', () => {
    expect(cleanName('  Priya    Sharma ')).toBe('Priya Sharma');
    expect(cleanName('A')).toBeNull();
    expect(cleanName('Ra​vi\u0007')).toBe('Ravi');
    expect(cleanName('x'.repeat(41))).toBeNull();
  });

  it('normalises join codes', () => {
    expect(normalizeJoinCode(' ab3-k7m ')).toBe('AB3K7M'); // spaces/dashes stripped, upper-cased
    expect(normalizeJoinCode('ab3k7m')).toBe('AB3K7M');
    expect(normalizeJoinCode('AB0K7M')).toBeNull(); // 0 is excluded
    expect(normalizeJoinCode('ABC')).toBeNull();
  });
});
